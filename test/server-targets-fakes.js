import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

/** Shared fakes for the server target tests. Nothing here starts a process or opens a network connection. */
export const sha = (algorithm, value) => createHash(algorithm).update(value).digest('hex');
export const JAR = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake jar bytes')]);

/** `routes` maps an exact URL to a body (object -> JSON, Buffer/string -> bytes) or to {status, headers, body}. */
export function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (!Object.hasOwn(routes, url)) return new Response('missing', {status: 404});
    let route = routes[url];
    if (typeof route === 'function') route = route();
    const detail = route !== null && typeof route === 'object' && !Buffer.isBuffer(route) && Object.hasOwn(route, 'body') ? route : {body: route};
    const body = Buffer.isBuffer(detail.body) || typeof detail.body === 'string' ? detail.body : JSON.stringify(detail.body);
    return new Response(body, {status: detail.status ?? 200, headers: detail.headers ?? {}});
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/** Records every execFile call; `answer(file, args)` supplies stdout/stderr or throws. */
export function fakeExec(answer = () => ({stdout: '', stderr: ''})) {
  const calls = [];
  const execFile = async (file, args, options = {}) => {
    calls.push({file, args: [...args], options});
    options.signal?.throwIfAborted();
    return answer(file, args, options);
  };
  execFile.calls = calls;
  return execFile;
}

/** A child process that records stdin and exits when told to. */
export function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.written = [];
  child.stdin.on('data', chunk => child.written.push(String(chunk)));
  child.exitCode = null; child.pid = 4242;
  child.kill = () => child.finish(null, 'SIGTERM');
  child.finish = (code = 0, signal = null) => { child.exitCode = code; child.emit('exit', code, signal); };
  return child;
}

export function fakeSpawn({autoExitOnStop = true} = {}) {
  const calls = [];
  const spawn = (file, args, options = {}) => {
    const child = fakeChild();
    calls.push({file, args: [...args], options, child});
    child.stdin.on('data', chunk => { if (autoExitOnStop && String(chunk).trim() === 'stop') setImmediate(() => child.finish(0)); });
    // An upload through ssh exits once its stdin ends.
    if (file === 'ssh') child.stdin.on('finish', () => setImmediate(() => child.finish(0)));
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

export const JAVA_21 = {stdout: '', stderr: 'openjdk version "21.0.4" 2024-07-16'};
