// Local model server access for the workspace. This module is DOM-free and talks only to the loopback
// address 127.0.0.1; the rules mirror the desktop client (route list, size limits, model tag checks,
// parameter bounds) so the browser cannot send anything the desktop would refuse.

export const DEFAULT_PORT = 11434;
export const ORIGIN_PATTERN = 'http://127.0.0.1/*';
export const LIMITS = Object.freeze({request: 6 * 1024 * 1024, response: 16 * 1024 * 1024, line: 1024 * 1024, messages: 128, prompt: 65536});
const ROUTES = Object.freeze({version: ['GET', '/api/version'], installed: ['GET', '/api/tags'], running: ['GET', '/api/ps'], pull: ['POST', '/api/pull'], delete: ['DELETE', '/api/delete'], chat: ['POST', '/api/chat']});
const STREAMED = new Set(['pull', 'chat']);
const encoder = new TextEncoder();
const byteLength = text => encoder.encode(text).length;

function failure(kind, message) { const error = new Error(message); error.kind = kind; return error; }

/** Builds the only address the workspace talks to: loopback, with a port from 1024 to 65535. */
export function localEndpoint(port = DEFAULT_PORT) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw failure('invalid', 'Use a port from 1024 to 65535.');
  return Object.freeze({port, host: `127.0.0.1:${port}`, url: `http://127.0.0.1:${port}`});
}

/** Reads a typed port: digits only, empty means the default. Returns an integer or throws. */
export function parsePort(value) {
  const text = String(value ?? '').trim();
  if (!text) return DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(text)) throw failure('invalid', 'Use a port from 1024 to 65535.');
  return localEndpoint(Number(text)).port;
}

/** A local model tag. Cloud models and malformed tags are refused. */
export function modelName(value) {
  if (typeof value !== 'string' || value.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value) || value.includes('..') || value.includes('//') || /(?:^|[-:])cloud(?:$|-)/i.test(value)) throw failure('invalid', 'Select a valid local model tag. Cloud models are not supported.');
  return value;
}

export function options(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid', 'Invalid model parameters.');
  const bounds = {temperature: [0, 2], top_p: [0, 1], top_k: [1, 100], num_ctx: [512, 131072], num_predict: [1, 16384], seed: [0, 2147483647], repeat_penalty: [0, 2]};
  for (const [key, n] of Object.entries(value)) {
    if (!bounds[key] || typeof n !== 'number' || !Number.isFinite(n) || n < bounds[key][0] || n > bounds[key][1] || (!['temperature', 'top_p', 'repeat_penalty'].includes(key) && !Number.isInteger(n))) throw failure('invalid', `Invalid parameter: ${key}`);
  }
  return value;
}

/** Checks a request body for one action and returns the body to send. Unknown fields are refused. */
export function validatePayload(action, body) {
  const keys = {version: [], installed: [], running: [], pull: ['model'], delete: ['model'], chat: ['model', 'messages', 'options', 'keep_alive']};
  if (!Object.hasOwn(keys, action)) throw failure('invalid', 'Unsupported local API operation.');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys[action].includes(key))) throw failure('invalid', 'Unexpected request field.');
  const out = {...body};
  if ('model' in out) modelName(out.model);
  if (['pull', 'delete', 'chat'].includes(action) && !out.model) throw failure('invalid', 'Select a model first.');
  if (out.options) out.options = options(out.options);
  if ('keep_alive' in out && ![0, '5m', '10m'].includes(out.keep_alive)) throw failure('invalid', 'Invalid keep-alive value.');
  if (action === 'chat') {
    if (!Array.isArray(out.messages) || !out.messages.length || out.messages.length > LIMITS.messages) throw failure('invalid', 'Chat history exceeds the supported limit.');
    for (const message of out.messages) {
      if (!message || typeof message !== 'object' || Object.keys(message).some(key => !['role', 'content'].includes(key)) || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > LIMITS.prompt) throw failure('invalid', 'Invalid chat message.');
    }
  }
  if (STREAMED.has(action)) out.stream = true;
  if (byteLength(JSON.stringify(out)) > LIMITS.request) throw failure('invalid', 'Request exceeds the supported limit.');
  return out;
}

/**
 * Calls one action on the local server. Streamed actions (pull, chat) deliver each parsed line to onChunk
 * and must finish with a completion line. Errors carry a plain message and a kind:
 * invalid, unreachable, timeout, cancelled, http, protocol, server or incomplete.
 */
export async function callLocal(action, body = {}, {port = DEFAULT_PORT, fetchImpl = globalThis.fetch, timeout = 120000, signal, onChunk} = {}) {
  if (!Object.hasOwn(ROUTES, action)) throw failure('invalid', 'Unsupported local API operation.');
  const endpoint = localEndpoint(port), data = validatePayload(action, body), [method, route] = ROUTES[action];
  const control = new AbortController();
  let reason = null, reader = null;
  const stop = why => { if (!reason) { reason = why; control.abort(); reader?.cancel().catch(() => {}); } };
  const timer = setTimeout(() => stop('timeout'), timeout);
  const onAbort = () => stop('cancelled');
  if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, {once: true}); }
  const interrupted = () => reason === 'timeout' ? failure('timeout', 'The local model server did not answer in time.') : reason === 'cancelled' ? failure('cancelled', 'The request was cancelled.') : failure('unreachable', `The local model server is not running or cannot be reached on port ${endpoint.port}.`);
  try {
    let response;
    try {
      response = await fetchImpl(endpoint.url + route, {method, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: control.signal, ...(method === 'GET' ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})});
    } catch { throw interrupted(); }
    if (!response.ok) throw failure('http', `The local model server answered with HTTP ${response.status}.`);
    if (!response.body) throw failure('protocol', 'The local model server sent an empty response.');
    reader = response.body.getReader();
    if (reason) throw interrupted();
    const decoder = new TextDecoder(), streamed = STREAMED.has(action);
    let text = '', bytes = 0, last = {}, count = 0;
    const accept = line => {
      if (byteLength(line) > LIMITS.line) throw failure('protocol', 'A line from the local model server is too large.');
      let value;
      try { value = JSON.parse(line); } catch { throw failure('protocol', 'The local model server sent malformed data.'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('protocol', 'The local model server sent data in an unexpected shape.');
      if (value.error) throw failure('server', 'The local model server could not complete this operation. Check that the model is installed and the server is healthy.');
      last = value; count++;
      onChunk?.(value);
    };
    while (true) {
      let part;
      try { part = await reader.read(); } catch { throw interrupted(); }
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > LIMITS.response) throw failure('protocol', 'The local model server sent more data than is supported.');
      text += decoder.decode(part.value, {stream: true});
      if (streamed) {
        let newline;
        while ((newline = text.indexOf('\n')) >= 0) { const line = text.slice(0, newline).trim(); text = text.slice(newline + 1); if (line) accept(line); }
        if (byteLength(text) > LIMITS.line) throw failure('protocol', 'A line from the local model server is too large.');
      }
    }
    if (reason) throw interrupted();
    text += decoder.decode();
    if (text.trim()) accept(text.trim());
    if (!count && action !== 'delete') throw failure('protocol', 'The local model server sent no data.');
    if (streamed && !(last.done === true || last.status === 'success')) throw failure('incomplete', 'The model stream ended before it finished.');
    return last;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
    if (reader) await reader.cancel().catch(() => {});
  }
}

/** Bytes as a short size such as 1.9 GB. */
export function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n, unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  return (unit === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) + ' ' + units[unit];
}

/** Installed models from a tags reply: valid local tags only, with their sizes, sorted by name. */
export function installedModels(json) {
  const rows = [];
  for (const item of Array.isArray(json?.models) ? json.models.slice(0, 500) : []) {
    const name = item?.name ?? item?.model;
    try { modelName(name); } catch { continue; }
    rows.push({name, size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0});
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** The set of model tags the server reports as loaded in memory. */
export function runningNames(json) {
  const names = new Set();
  for (const item of Array.isArray(json?.models) ? json.models.slice(0, 500) : []) { const name = item?.name ?? item?.model; try { names.add(modelName(name)); } catch {} }
  return names;
}

/** Progress for a pull line: a status text and a 0..1 fraction, or null fraction when no total is known. */
export function pullProgress(chunk) {
  const status = typeof chunk?.status === 'string' ? chunk.status.slice(0, 120) : '';
  const total = Number(chunk?.total), completed = Number(chunk?.completed);
  const fraction = Number.isFinite(total) && total > 0 && Number.isFinite(completed) && completed >= 0 ? Math.min(1, completed / total) : null;
  return {status, completed: fraction === null ? 0 : completed, total: fraction === null ? 0 : total, fraction};
}

/** The text a chat line adds to the reply. */
export function chatDelta(chunk) { return typeof chunk?.message?.content === 'string' ? chunk.message.content : ''; }
