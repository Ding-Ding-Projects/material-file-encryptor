import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { Transform } from 'node:stream';

const MAX_REQUEST_LENGTH = 1048576;
const MAX_REQUEST_DEPTH = 32;
const MAX_RESPONSE_LENGTH = 8 * 1024 * 1024;
const invalidResponse = () => new Error('Native helper returned an invalid response.');
const connectionClosed = () => new Error('Native helper connection closed.');
const helperStopped = () => new Error('Native helper stopped. The drive is unavailable.');

function serializeRequest(id, method, params) {
  let line;
  try { line = JSON.stringify({ id, method, params }); }
  catch { throw new Error('Native request could not be serialized.'); }
  // Match Program.cs: .NET string.Length and JavaScript length both count UTF-16
  // code units. The host checks size and JSON depth before extracting the reply ID.
  if (line.length > MAX_REQUEST_LENGTH) throw new Error('Native request exceeded its limit.');
  let depth = 0, quoted = false, escaped = false;
  for (const character of line) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > MAX_REQUEST_DEPTH) throw new Error('Native request exceeded its nesting limit.');
    } else if (character === '}' || character === ']') depth--;
  }
  return line + '\n';
}

function boundedResponses() {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let length = 0;
  function decode(chunk, stream) {
    let text;
    try { text = decoder.decode(chunk, { stream }); } catch { throw invalidResponse(); }
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\r' || text[i] === '\n') length = 0;
      else if (++length > MAX_RESPONSE_LENGTH) throw new Error('Native helper response exceeded its limit.');
    }
    return text;
  }
  return new Transform({
    transform(chunk, _encoding, callback) {
      let text;
      try { text = decode(chunk, true); } catch (error) { callback(error); return; }
      callback(null, text);
    },
    flush(callback) {
      let text;
      try { text = decode(undefined, false); } catch (error) { callback(error); return; }
      callback(null, text);
    },
  });
}

/** Private child-process pipe. Credentials are never put in arguments, environment or logs. */
export class NativeClient extends EventEmitter {
  constructor(executable, { spawnProcess = spawn, slowAfterMs = 120000, managedDataRoot = null } = {}) {
    super();
    this.executable = executable; this.spawnProcess = spawnProcess;
    this.slowAfterMs = slowAfterMs; this.managedDataRoot = managedDataRoot;
    this.pending = new Map(); this.nextId = 1; this.disposed = false;
  }
  start() {
    if (this.disposed) throw new Error('Native client is disposed.');
    if (this.child) {
      if (this.failure) throw this.failure;
      if (this.exiting) throw helperStopped();
      if (this.child.stdin.destroyed || this.child.stdin.writableEnded) throw connectionClosed();
      return;
    }
    const args = this.managedDataRoot === null ? [] : ['--managed-data-root', this.managedDataRoot];
    let child;
    try { child = this.spawnProcess(this.executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
    catch { throw new Error('Native helper could not start. Reinstall the Windows application.'); }
    this.child = child; this.failure = null; this.exiting = false;
    const current = () => this.child === child;
    const failed = error => { if (current()) this.fail(error); };
    child.on('error', () => failed(new Error('Native helper could not start. Reinstall the Windows application.')));
    // A write callback does not consume a stream's separate error event.
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => failed(connectionClosed()));
    const responses = boundedResponses();
    responses.on('error', error => {
      failed(error);
      reader.close();
      // Drain diagnostics/output without killing a helper that may own a busy drive.
      child.stdout.unpipe(responses); child.stdout.resume();
    });
    const reader = this.reader = createInterface({ input: responses, crlfDelay: Infinity });
    reader.on('error', error => failed(error));
    reader.on('close', () => failed(connectionClosed()));
    reader.on('line', line => {
      if (!current() || this.failure) return;
      let message;
      try { message = JSON.parse(line); } catch { failed(invalidResponse()); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { failed(invalidResponse()); return; }
      if (Object.hasOwn(message, 'event')) {
        if (message.event !== 'status' || !Object.hasOwn(message, 'data') && !Object.hasOwn(message, 'status')) { failed(invalidResponse()); return; }
        this.emit('status', message.data ?? message.status); return;
      }
      const hasResult = Object.hasOwn(message, 'result'), hasError = Object.hasOwn(message, 'error');
      const errorMessage = typeof message.error === 'string' ? message.error : message.error?.message;
      if (!Number.isSafeInteger(message.id) || message.id < 1 || hasResult === hasError || hasError && typeof errorMessage !== 'string') { failed(invalidResponse()); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (hasError) request.reject(new Error(errorMessage || 'Native operation failed.'));
      else request.resolve(message.result);
    });
    // exit may precede buffered stdout. close also covers spawn errors without exit.
    child.on('exit', () => { if (current()) this.exiting = true; });
    child.on('close', () => {
      if (!current()) return;
      this.fail(helperStopped()); this.child = null;
      reader.close(); child.stdout.unpipe(responses); responses.destroy();
      this.emit('exit');
    });
    child.stdout.pipe(responses);
    // Backend diagnostics must never cross into a log containing sensitive paths or credentials.
    child.stderr.resume();
  }
  fail(error) {
    this.failure ??= error;
    // The outcome of submitted mutations is unknown. Reject callers, but keep this
    // child owned and reject new admission until its exact close event. Never replay.
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(this.failure); }
    this.pending.clear();
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.disposed) { reject(new Error('Native client is disposed.')); return; }
      const id = this.nextId++;
      // Validate before spawning or registering a pending request. Serialization
      // failures cannot leave stale mutation identities or warning timers behind.
      const line = serializeRequest(id, method, params);
      this.start();
      const child = this.child;
      // A warning is not cancellation. Keep the identity and promise until the helper
      // reports a terminal result or its pipe closes, so mutations cannot overlap.
      const timer = setTimeout(() => this.emit('slow', { id, method, message: 'The drive operation is still running. Keep the application open and wait for completion.' }), this.slowAfterMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      const failed = () => { if (this.child === child) this.fail(connectionClosed()); };
      try { child.stdin.write(line, error => { if (error) failed(); }); }
      catch { failed(); }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // EOF is graceful: existing requests can still receive their terminal replies.
    try { this.child?.stdin.end(); } catch { this.fail(connectionClosed()); }
  }
}
