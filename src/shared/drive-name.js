// Rules for the mounted drive's volume label. The native controller repeats these checks.
export const DEFAULT_DRIVE_NAME = 'Material Files';
// The NTFS and WinFsp volume label limit, counted in UTF-16 code units like the native check.
export const DRIVE_NAME_MAX_LENGTH = 32;
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/;

// Returns the trimmed name when it is valid, or null when it is not.
export function normalizeDriveName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= DRIVE_NAME_MAX_LENGTH && !FORBIDDEN.test(name) ? name : null;
}
