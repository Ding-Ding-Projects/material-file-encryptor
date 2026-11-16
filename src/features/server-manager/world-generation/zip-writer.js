import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';

/**
 * A small streaming ZIP writer: deflate, UTF-8 names, no ZIP64. A world that would need ZIP64 is refused with a clear message
 * rather than written wrongly. Output goes to a temporary file that is renamed on success, and it is never written over a file.
 */
const LIMIT = 0xffffffff;

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()};
}

function localHeader(name, {time, date}) {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0808, 6); header.writeUInt16LE(8, 8);
  header.writeUInt16LE(time, 10); header.writeUInt16LE(date, 12); header.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(header, 30);
  return header;
}

function centralHeader(entry) {
  const nameBytes = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(46 + nameBytes.length);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0808, 8); header.writeUInt16LE(8, 10);
  header.writeUInt16LE(entry.time, 12); header.writeUInt16LE(entry.date, 14); header.writeUInt32LE(entry.crc, 16); header.writeUInt32LE(entry.compressed, 20);
  header.writeUInt32LE(entry.size, 24); header.writeUInt16LE(nameBytes.length, 28); header.writeUInt32LE(entry.offset, 42);
  nameBytes.copy(header, 46);
  return header;
}

const descriptor = entry => { const out = Buffer.alloc(16); out.writeUInt32LE(0x08074b50, 0); out.writeUInt32LE(entry.crc, 4); out.writeUInt32LE(entry.compressed, 8); out.writeUInt32LE(entry.size, 12); return out; };

/** entries: [{name: 'level/region/r.0.0.mca', file: absolute path}]. Resolves to the central directory summary. */
export async function writeZip(destination, entries, {signal, onProgress = () => {}} = {}) {
  if (entries.length > 0xffff) throw new Error('This world has more than 65,535 files, which a plain ZIP cannot hold. Choose folder output.');
  try { await fsp.access(destination); throw new Error('The ZIP file already exists. Choose a new name.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = destination + '.part';
  const out = fs.createWriteStream(temporary, {flags: 'wx'});
  const written = {offset: 0};
  const write = chunk => new Promise((resolve, reject) => { written.offset += chunk.length; out.write(chunk, error => error ? reject(error) : resolve()); });
  const central = [];
  try {
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (/^[\\/]|\.\.|[\\]/.test(entry.name)) throw new Error('A ZIP entry name is unsafe.');
      const stat = await fsp.stat(entry.file);
      const when = dosDateTime(stat.mtime);
      const info = {name: entry.name, offset: written.offset, ...when, crc: 0, compressed: 0, size: 0};
      if (info.offset > LIMIT) throw new Error('This world is larger than a plain ZIP can hold (4 GB). Choose folder output.');
      await write(localHeader(entry.name, when));
      let crc = 0;
      const counter = new Transform({transform(chunk, encoding, callback) { crc = zlib.crc32(chunk, crc); info.size += chunk.length; callback(null, chunk); }});
      const compressedCounter = new Transform({transform(chunk, encoding, callback) { info.compressed += chunk.length; callback(null, chunk); }});
      const sink = new Transform({transform(chunk, encoding, callback) { write(chunk).then(() => callback(), callback); }});
      await pipeline(fs.createReadStream(entry.file), counter, zlib.createDeflateRaw({level: 6}), compressedCounter, sink, {signal});
      info.crc = crc >>> 0;
      if (info.size > LIMIT || info.compressed > LIMIT) throw new Error('A file in this world is larger than a plain ZIP can hold. Choose folder output.');
      await write(descriptor(info));
      central.push(info);
      onProgress({files: central.length, total: entries.length});
    }
    const directoryOffset = written.offset;
    for (const info of central) await write(centralHeader(info));
    const directorySize = written.offset - directoryOffset;
    if (written.offset > LIMIT) throw new Error('This world is larger than a plain ZIP can hold (4 GB). Choose folder output.');
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(directoryOffset, 16);
    await write(end);
    await new Promise((resolve, reject) => out.end(error => error ? reject(error) : resolve()));
    await fsp.rename(temporary, destination);
    return central.map(({name, size, crc, compressed}) => ({name, size, crc, compressed}));
  } catch (error) {
    out.destroy();
    await fsp.rm(temporary, {force: true}).catch(() => {});
    throw error;
  }
}

/** Read a ZIP's central directory back: [{name, size, crc}]. Used to verify what was written. */
export async function readZipDirectory(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const {size} = await handle.stat();
    const tailLength = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    const endAt = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (endAt < 0) throw new Error('The ZIP end record is missing.');
    const count = tail.readUInt16LE(endAt + 10), directorySize = tail.readUInt32LE(endAt + 12), directoryOffset = tail.readUInt32LE(endAt + 16);
    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);
    const entries = [];
    let at = 0;
    for (let index = 0; index < count; index++) {
      if (directory.readUInt32LE(at) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
      const nameLength = directory.readUInt16LE(at + 28), extraLength = directory.readUInt16LE(at + 30), commentLength = directory.readUInt16LE(at + 32);
      entries.push({name: directory.toString('utf8', at + 46, at + 46 + nameLength), size: directory.readUInt32LE(at + 24), crc: directory.readUInt32LE(at + 16)});
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally { await handle.close(); }
}

/** Every file of a directory tree as ZIP entries, sorted for a stable order. Symlinks are never followed. */
export async function listTree(root, prefix = '') {
  const out = [];
  const walk = async (directory, relative) => {
    for (const entry of (await fsp.readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name), name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('A linked file was found in the world, so it was not copied.');
      if (entry.isDirectory()) await walk(full, name);
      else if (entry.isFile()) out.push({name: prefix ? prefix + '/' + name : name, file: full});
    }
  };
  await walk(root, '');
  return out;
}
