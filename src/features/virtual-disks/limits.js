/** Format limits and request validation for the virtual disk manager. Pure functions: nothing here touches the host. */
export const MIB = 1024 ** 2;
export const GIB = 1024 ** 3;
export const TIB = 1024 ** 4;
export const MIN_SIZE = 3 * MIB;
export const VHD_MAX = 2040 * GIB;
export const VHDX_MAX = 64 * TIB;
export const VHDX_BLOCK_SIZES = Object.freeze([1, 2, 4, 8, 16, 32, 64, 128, 256].map(value => value * MIB));
export const SECTOR_SIZES = Object.freeze([512, 4096]);
export const DISK_FORMATS = Object.freeze(['vhd', 'vhdx']);
export const DISK_TYPES = Object.freeze(['dynamic', 'fixed']);
export const COMPACT_MODES = Object.freeze(['Full', 'Quick', 'Retrim', 'Pretrimmed', 'Prezeroed']);
export const FILE_SYSTEMS = Object.freeze(['NTFS', 'ReFS', 'exFAT', 'FAT32']);
export const DISK_EXTENSIONS = Object.freeze(['.vhd', '.vhdx', '.avhd', '.avhdx']);

const UNITS = {b: 1, kb: 1024, k: 1024, mb: MIB, m: MIB, gb: GIB, g: GIB, tb: TIB, t: TIB};

/** Parse "40 GB", "512MB", "1.5 TB" or a plain byte count. Returns an integer or throws. */
export function parseSize(text) {
  if (typeof text === 'number' && Number.isSafeInteger(text) && text > 0) return text;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]{0,10})\s*$/i.exec(String(text ?? ''));
  if (!match) throw new Error('Enter a size such as 40 GB.');
  const unit = match[2].toLowerCase() || 'b';
  if (!Object.hasOwn(UNITS, unit)) throw new Error('Unknown size unit. Use KB, MB, GB or TB.');
  const bytes = Math.round(Number(match[1]) * UNITS[unit]);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('The size is out of range.');
  return bytes;
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const steps = [[TIB, 'TB'], [GIB, 'GB'], [MIB, 'MB'], [1024, 'KB']];
  for (const [size, label] of steps) if (bytes >= size) return (Math.round(bytes / size * 100) / 100) + ' ' + label;
  return bytes + ' B';
}

export function extensionOf(path) {
  const match = /\.[A-Za-z0-9]+$/.exec(String(path));
  return match ? match[0].toLowerCase() : '';
}

/** A usable local absolute Windows path. Network and device paths are refused because the host cannot host a disk there. */
export function validateWindowsPath(path, {purpose = 'disk'} = {}) {
  if (typeof path !== 'string' || !path || path.length > 259) throw new Error('A full file path of at most 259 characters is required.');
  if (/[\x00-\x1f<>"|?*]/.test(path)) throw new Error('The path contains characters Windows does not allow.');
  if (/^\\\\/.test(path)) throw new Error('A network or device path cannot hold a virtual disk. Choose a local drive.');
  if (!/^[A-Za-z]:\\/.test(path)) throw new Error('Use an absolute path that starts with a drive letter.');
  if (/(^|\\)\.\.?(\\|$)/.test(path)) throw new Error('The path must not contain dot segments.');
  const extension = extensionOf(path);
  if (purpose === 'disk' && !DISK_EXTENSIONS.includes(extension)) throw new Error('A virtual disk file ends in .vhd or .vhdx.');
  if (purpose === 'iso' && extension !== '.iso') throw new Error('An image file ends in .iso.');
  return path;
}

export function formatForPath(path) {
  return extensionOf(path) === '.vhd' || extensionOf(path) === '.avhd' ? 'vhd' : 'vhdx';
}

export function maxSizeFor(format) { return format === 'vhd' ? VHD_MAX : VHDX_MAX; }

/** Validate and normalize a create request. Returns the normalized request or throws with the first problem. */
export function validateCreate(request) {
  if (request === null || typeof request !== 'object') throw new Error('A create request is required.');
  const path = validateWindowsPath(request.path);
  const format = formatForPath(path);
  if (request.format !== undefined && request.format !== format) throw new Error('The file extension must match the chosen format.');
  const type = request.type ?? 'dynamic';
  if (!DISK_TYPES.includes(type)) throw new Error('Choose a fixed or dynamic disk.');
  const sizeBytes = parseSize(request.sizeBytes ?? request.size);
  if (sizeBytes < MIN_SIZE) throw new Error('A virtual disk must be at least 3 MB.');
  if (sizeBytes > maxSizeFor(format)) throw new Error(format === 'vhd' ? 'A VHD holds at most 2,040 GB. Use VHDX for larger disks.' : 'A VHDX holds at most 64 TB.');
  if (sizeBytes % MIB !== 0) throw new Error('Use a size that is a whole number of megabytes.');
  const result = {path, format, type, sizeBytes};
  if (request.blockSizeBytes !== undefined) {
    if (format !== 'vhdx') throw new Error('Block size applies to VHDX only.');
    if (!VHDX_BLOCK_SIZES.includes(request.blockSizeBytes)) throw new Error('The VHDX block size is a power of two from 1 MB to 256 MB.');
    result.blockSizeBytes = request.blockSizeBytes;
  }
  for (const key of ['logicalSectorSize', 'physicalSectorSize']) {
    if (request[key] !== undefined) {
      if (format !== 'vhdx') throw new Error('Sector sizes apply to VHDX only.');
      if (!SECTOR_SIZES.includes(request[key])) throw new Error('Sector size is 512 or 4096.');
      result[key] = request[key];
    }
  }
  if (request.format_volume !== undefined || request.initialize !== undefined) {
    const spec = request.initialize ?? {};
    if (!['GPT', 'MBR'].includes(spec.partitionStyle ?? 'GPT')) throw new Error('Partition style is GPT or MBR.');
    if (!FILE_SYSTEMS.includes(spec.fileSystem ?? 'NTFS')) throw new Error('Choose NTFS, ReFS, exFAT or FAT32.');
    const label = String(spec.label ?? '');
    if (label.length > 32 || /[\x00-\x1f"\\/:*?<>|]/.test(label)) throw new Error('The volume label is too long or has characters Windows does not allow.');
    result.initialize = {partitionStyle: spec.partitionStyle ?? 'GPT', fileSystem: spec.fileSystem ?? 'NTFS', label};
  }
  return result;
}

/** Resize rules: shrinking needs the disk's minimum size, and a VHD can never pass its limit. */
export function validateResize({path, sizeBytes, currentBytes, minimumBytes}) {
  validateWindowsPath(path);
  const target = parseSize(sizeBytes);
  const format = formatForPath(path);
  if (target < MIN_SIZE) throw new Error('A virtual disk must be at least 3 MB.');
  if (target > maxSizeFor(format)) throw new Error('That size is beyond the limit of this format.');
  if (target % MIB !== 0) throw new Error('Use a size that is a whole number of megabytes.');
  if (Number.isFinite(currentBytes) && target === currentBytes) throw new Error('The disk already has that size.');
  const shrinking = Number.isFinite(currentBytes) && target < currentBytes;
  if (shrinking) {
    if (format !== 'vhdx') throw new Error('Only a VHDX can shrink.');
    if (!Number.isFinite(minimumBytes)) throw new Error('The smallest safe size is unknown. Inspect the disk first.');
    if (target < minimumBytes) throw new Error('The disk cannot shrink below ' + formatSize(minimumBytes) + '.');
  }
  return {path, sizeBytes: target, shrinking};
}

/** Convert rules: the target must hold the source. */
export function validateConvert({path, destination, type = 'dynamic', sizeBytes}) {
  validateWindowsPath(path);
  validateWindowsPath(destination);
  if (path.toLowerCase() === destination.toLowerCase()) throw new Error('Choose a different destination file.');
  if (!DISK_TYPES.includes(type)) throw new Error('Choose a fixed or dynamic disk.');
  const target = formatForPath(destination);
  if (Number.isFinite(sizeBytes) && sizeBytes > maxSizeFor(target)) throw new Error('The destination format cannot hold a disk of ' + formatSize(sizeBytes) + '.');
  return {path, destination, type, format: target};
}
