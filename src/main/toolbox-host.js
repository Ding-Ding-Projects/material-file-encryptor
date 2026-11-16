// Main-process side of the toolbox: native file pickers, bounded streaming Base64 conversion, a chunked save writer
// (used by screen recording and exports) and screen-source selection. Nothing here touches the network.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createStreamEncoder, createStreamDecoder, normalizeOptions, originalNameFrom, base64NameFor, sniffType } from '../shared/toolbox/base64-codec.js';

export const TOOLBOX_ACTIONS = Object.freeze(['pickInput', 'encodeFile', 'decodeFile', 'cancel', 'beginSave', 'finishSave', 'abortSave', 'recordingSources', 'recordingArm', 'recordingDisarm']);
const MAX_INPUT_BYTES = 4 * 1024 ** 3;
const MAX_WRITE_BYTES = 8 * 1024 ** 3;
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const READ_CHUNK = 192 * 1024; // multiple of 3 so encoder carry stays tiny
const SAFE_NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,200}$/;

const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

async function uniquePath(directory, name) {
  const extension = path.extname(name), stem = name.slice(0, name.length - extension.length);
  for (let n = 0; n < 1000; n++) {
    const candidate = path.join(directory, n ? `${stem} (${n})${extension}` : name);
    try { await fs.access(candidate); } catch { return candidate; }
  }
  throw new Error('Could not find an unused file name.');
}

export function createToolboxHost({ dialog, getWindow, desktopCapturer, emit = () => {} } = {}) {
  const grants = new Map(), writers = new Map(), jobs = new Map();
  let armedSource = null, micUntil = 0;

  const grant = async filename => {
    const stat = await fs.stat(filename);
    if (!stat.isFile()) throw new Error('Choose a file.');
    const id = randomUUID(); grants.set(id, { filename, size: stat.size });
    return { id, name: path.basename(filename), size: stat.size };
  };
  const resolve = id => { if (!uuid(id) || !grants.has(id)) throw new Error('Choose the file again using the picker.'); return grants.get(id); };

  async function streamEncode(source, destination, options, signal, progress) {
    const input = await fs.open(source.filename, 'r'), output = await fs.open(destination, 'wx', 0o600);
    const hash = createHash('sha256'), encoder = createStreamEncoder(options), buffer = Buffer.allocUnsafe(READ_CHUNK);
    let done = 0, ok = false;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { bytesRead } = await input.read(buffer, 0, READ_CHUNK, null); if (!bytesRead) break;
        const chunk = buffer.subarray(0, bytesRead); hash.update(chunk);
        const text = encoder.write(chunk); if (text) await output.write(text, null, 'ascii');
        done += bytesRead; progress(done, source.size);
      }
      const tail = encoder.finish(); if (tail) await output.write(tail, null, 'ascii');
      await output.sync(); ok = true;
    } finally { await input.close(); await output.close(); if (!ok) await fs.rm(destination, { force: true }); }
    return hash.digest('hex');
  }

  async function streamDecode(source, destination, options, signal, progress) {
    const input = await fs.open(source.filename, 'r'), output = await fs.open(destination, 'wx', 0o600);
    const hash = createHash('sha256'), decoder = createStreamDecoder(options), buffer = Buffer.allocUnsafe(READ_CHUNK);
    let done = 0, ok = false, head = null;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { bytesRead } = await input.read(buffer, 0, READ_CHUNK, null); if (!bytesRead) break;
        const bytes = decoder.write(buffer.toString('ascii', 0, bytesRead));
        if (bytes.length) { head ??= bytes.slice(0, 16); hash.update(bytes); await output.write(bytes); }
        done += bytesRead; progress(done, source.size);
      }
      const tail = decoder.finish(); if (tail.length) { head ??= tail.slice(0, 16); hash.update(tail); await output.write(tail); }
      await output.sync(); ok = true;
    } finally { await input.close(); await output.close(); if (!ok) await fs.rm(destination, { force: true }); }
    return { sha256: hash.digest('hex'), head: head || new Uint8Array(0) };
  }

  async function sha256Of(filename) {
    const hash = createHash('sha256'), handle = await fs.open(filename, 'r');
    try { for await (const chunk of handle.createReadStream()) hash.update(chunk); } finally { await handle.close(); }
    return hash.digest('hex');
  }

  async function runConversion(action, payload) {
    const source = resolve(payload.id);
    if (source.size > MAX_INPUT_BYTES) throw new Error('This file is larger than the 4 GiB conversion limit.');
    const jobId = randomUUID(), controller = new AbortController(); jobs.set(jobId, controller);
    const progress = (done, total) => emit('toolbox', { type: 'progress', jobId, done, total });
    try {
      const options = normalizeOptions(payload.options || {});
      const decoding = action === 'decodeFile';
      const baseName = path.basename(source.filename);
      let destination;
      if (payload.destination === 'choose') {
        const suggested = decoding ? (originalNameFrom(baseName) || `${baseName}.decoded`) : base64NameFor(baseName);
        const result = await dialog.showSaveDialog(getWindow(), { title: decoding ? 'Save decoded file · 儲存解碼檔案' : 'Save Base64 text · 儲存 Base64 文字', defaultPath: path.join(path.dirname(source.filename), suggested) });
        if (result.canceled) return { cancelled: true };
        destination = result.filePath;
      } else {
        const suggested = decoding ? (originalNameFrom(baseName) || `${baseName}.decoded`) : base64NameFor(baseName);
        destination = await uniquePath(path.dirname(source.filename), suggested);
      }
      emit('toolbox', { type: 'started', jobId });
      if (!decoding) {
        const sourceHash = await streamEncode(source, destination, options, controller.signal, progress);
        // Round trip: decode what was just written and compare the hash.
        const echo = await runRoundTrip(destination, controller.signal, options.variant);
        return { jobId, name: path.basename(destination), destinationId: (await grant(destination)).id, sourceSha256: sourceHash, verified: echo === sourceHash, bytes: (await fs.stat(destination)).size };
      }
      const result = await streamDecode(source, destination, { variant: options.variant }, controller.signal, progress);
      const type = sniffType(result.head);
      return { jobId, name: path.basename(destination), destinationId: (await grant(destination)).id, sha256: result.sha256, type, bytes: (await fs.stat(destination)).size, verified: result.sha256 === await sha256Of(destination) };
    } finally { jobs.delete(jobId); }
  }

  async function runRoundTrip(encodedPath, signal, variant) {
    const input = await fs.open(encodedPath, 'r'), hash = createHash('sha256'), decoder = createStreamDecoder({ variant }), buffer = Buffer.allocUnsafe(READ_CHUNK);
    try {
      for (;;) { signal.throwIfAborted(); const { bytesRead } = await input.read(buffer, 0, READ_CHUNK, null); if (!bytesRead) break; hash.update(decoder.write(buffer.toString('ascii', 0, bytesRead))); }
      hash.update(decoder.finish());
    } finally { await input.close(); }
    return hash.digest('hex');
  }

  async function dispatch(action, payload = {}) {
    if (!TOOLBOX_ACTIONS.includes(action)) throw new Error('Unsupported toolbox action.');
    switch (action) {
      case 'pickInput': {
        const result = await dialog.showOpenDialog(getWindow(), { title: 'Choose a file · 選擇檔案', properties: ['openFile'] });
        return result.canceled || !result.filePaths[0] ? null : grant(result.filePaths[0]);
      }
      case 'encodeFile': case 'decodeFile': return runConversion(action, payload);
      case 'cancel': jobs.get(payload.jobId)?.abort(); return true;
      case 'beginSave': {
        const name = typeof payload.name === 'string' && SAFE_NAME.test(payload.name) ? payload.name : 'untitled';
        const filters = Array.isArray(payload.filters) ? payload.filters.slice(0, 4).filter(f => typeof f?.name === 'string' && Array.isArray(f.extensions) && f.extensions.every(e => /^[a-z0-9]{1,8}$/i.test(e))).map(f => ({ name: f.name.slice(0, 40), extensions: f.extensions })) : undefined;
        const directory = typeof payload.driveLetter === 'string' && /^[A-Za-z]$/.test(payload.driveLetter) ? `${payload.driveLetter.toUpperCase()}:\\` : undefined;
        const result = await dialog.showSaveDialog(getWindow(), { title: 'Save · 儲存', defaultPath: directory ? path.join(directory, name) : name, filters });
        if (result.canceled || !result.filePath) return null;
        const id = randomUUID(); const handle = await fs.open(result.filePath, 'w', 0o600);
        writers.set(id, { handle, filename: result.filePath, bytes: 0 });
        return { id, name: path.basename(result.filePath) };
      }
      case 'finishSave': case 'abortSave': {
        const writer = writers.get(payload.id); if (!writer) throw new Error('This save is no longer open.');
        writers.delete(payload.id);
        try { if (action === 'finishSave') await writer.handle.sync(); } finally { await writer.handle.close(); if (action === 'abortSave') await fs.rm(writer.filename, { force: true }); }
        return { name: path.basename(writer.filename), bytes: writer.bytes };
      }
      case 'recordingSources': {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 }, fetchWindowIcons: false });
        return sources.slice(0, 40).map(s => ({ id: s.id, name: String(s.name).slice(0, 120), kind: s.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }));
      }
      case 'recordingArm': {
        if (typeof payload.sourceId !== 'string' || !/^(screen|window):\d+:\d+$/.test(payload.sourceId)) throw new Error('Choose a screen or window first.');
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const source = sources.find(s => s.id === payload.sourceId); if (!source) throw new Error('That screen or window is no longer available.');
        armedSource = { source, until: Date.now() + 30000 }; micUntil = payload.microphone === true ? Date.now() + 30000 : 0; return true;
      }
      case 'recordingDisarm': armedSource = null; return true;
      default: throw new Error('Unsupported toolbox action.');
    }
  }

  return {
    dispatch,
    /** Called from the ipc 'toolbox:write' channel after the frame is trusted. */
    async write(id, data) {
      const writer = writers.get(id); if (!writer) throw new Error('This save is no longer open.');
      const buffer = ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data);
      if (!buffer.length || buffer.length > MAX_CHUNK_BYTES) throw new Error('Chunk size is not allowed.');
      if (writer.bytes + buffer.length > MAX_WRITE_BYTES) throw new Error('The file would exceed the size limit.');
      await writer.handle.write(buffer); writer.bytes += buffer.length; return writer.bytes;
    },
    /** Installed as the session display media handler. Grants only the source the user armed, only once, only briefly. */
    displayMediaHandler(request, callback) {
      const armed = armedSource; armedSource = null;
      if (!armed || Date.now() > armed.until) { callback({}); return; }
      callback({ video: armed.source });
    },
    /** Microphone is allowed only for the application window and only while the user has explicitly asked for it. */
    permissionHandler(_contents, permission, callback, details) {
      const audioOnly = details?.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
      callback(permission === 'media' && audioOnly && Date.now() < micUntil);
    },
    async close() { for (const c of jobs.values()) c.abort(); for (const [id, w] of writers) { writers.delete(id); await w.handle.close().catch(() => {}); } grants.clear(); },
  };
}
