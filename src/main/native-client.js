import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

/** Private child-process pipe. Credentials are never put in arguments, environment or logs. */
export class NativeClient extends EventEmitter {
  constructor(executable, { spawnProcess = spawn, slowAfterMs = 120000 } = {}) { super(); this.executable = executable; this.spawnProcess = spawnProcess; this.slowAfterMs = slowAfterMs; this.pending = new Map(); this.nextId = 1; }
  start() {
    if (this.child) return;
    this.child = this.spawnProcess(this.executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    // Backend diagnostics must never cross into a log containing sensitive paths or credentials.
    this.child.stderr.resume();
    this.reader = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.reader.on('line', line => {
      if (line.length > 8 * 1024 * 1024) return this.fail(new Error('Native helper response exceeded its limit.'));
      let message;
      try { message = JSON.parse(line); } catch { return this.fail(new Error('Native helper returned an invalid response.')); }
      if (message.event === 'status') { this.emit('status', message.data ?? message.status); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(typeof message.error === 'string' ? message.error : message.error.message || 'Native operation failed.'));
      else request.resolve(message.result);
    });
    this.child.on('error', () => this.fail(new Error('Native helper could not start. Reinstall the Windows application.')));
    this.child.on('exit', () => { this.child = null; this.fail(new Error('Native helper stopped. The drive is unavailable.')); this.emit('exit'); });
  }
  fail(error) { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); }
  request(method, params = {}) {
    this.start();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      // A warning is not cancellation. Keep the identity and promise until the helper
      // reports a terminal result or its pipe exits, so mutations cannot overlap.
      const timer = setTimeout(() => this.emit('slow', { id, method, message: 'The drive operation is still running. Keep the application open and wait for completion.' }), this.slowAfterMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error('Native helper connection closed.')); }
      });
    });
  }
  dispose() { this.child?.stdin.end(); }
}
