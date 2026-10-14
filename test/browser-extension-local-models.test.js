import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PORT, LIMITS, localEndpoint, parsePort, modelName, validatePayload, callLocal, formatSize, installedModels, runningNames, pullProgress, chatDelta} from '../browser-extension/local-models.js';

const encoder = new TextEncoder();
// A response whose body delivers the given strings as separate chunks; with open set, the stream never finishes by itself.
const reply = (chunks, {open = false, ok = true, status = 200} = {}) => ({ok, status, body: new ReadableStream({start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); if (!open) controller.close(); }})});
const fakeFetch = (...responses) => { const calls = []; const fn = async (url, init) => { calls.push({url, init}); const next = responses.length > 1 ? responses.shift() : responses[0]; if (next instanceof Error) throw next; return next; }; fn.calls = calls; return fn; };
const rejects = async (promise, kind, pattern) => assert.rejects(promise, error => { assert.equal(error.kind, kind); if (pattern) assert.match(error.message, pattern); return true; });

test('the endpoint is loopback only and the port must be an integer from 1024 to 65535', () => {
  assert.equal(localEndpoint().url, 'http://127.0.0.1:11434');
  assert.equal(localEndpoint(1024).port, 1024);
  assert.equal(localEndpoint(65535).host, '127.0.0.1:65535');
  for (const bad of [0, 80, 1023, 65536, 11434.5, '11434', NaN, Infinity, null]) assert.throws(() => localEndpoint(bad), /1024 to 65535/);
  assert.equal(parsePort(''), DEFAULT_PORT);
  assert.equal(parsePort('  8080 '), 8080);
  for (const bad of ['abc', '80', '70000', '1e4', '-1', '8080.5', '12345678']) assert.throws(() => parsePort(bad), /1024 to 65535/);
});

test('model names follow the desktop rules and refuse cloud models and malformed tags', () => {
  for (const good of ['llama3.2:3b', 'library/llama3.2:latest', 'qwen2.5-coder:7b', 'mistral']) assert.equal(modelName(good), good);
  for (const bad of ['gpt-oss:120b-cloud', 'llama3:cloud', 'qwen3-coder:480b-cloud', 'cloud-model', 'a'.repeat(201), '../etc/passwd', 'a//b', '', ' llama3', 'llama 3', 'a:b:c', ':latest', 5, null, {}]) assert.throws(() => modelName(bad), /valid local model tag/, String(bad));
});

test('request bodies allow only the fields of their action and bound every value', () => {
  assert.deepEqual(validatePayload('version', {}), {});
  assert.deepEqual(validatePayload('pull', {model: 'llama3.2:3b'}), {model: 'llama3.2:3b', stream: true});
  assert.deepEqual(validatePayload('delete', {model: 'llama3.2:3b'}), {model: 'llama3.2:3b'});
  const chat = validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'hi'}], options: {temperature: 0.5, num_predict: 100}, keep_alive: '5m'});
  assert.equal(chat.stream, true);
  for (const action of ['version', 'installed', 'running']) assert.throws(() => validatePayload(action, {model: 'mistral'}), /Unexpected request field/);
  assert.throws(() => validatePayload('pull', {model: 'mistral', insecure: true}), /Unexpected request field/);
  assert.throws(() => validatePayload('delete', {model: 'mistral', extra: 1}), /Unexpected request field/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}], stream: false}), /Unexpected request field/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x', images: ['AAAA']}]}), /Invalid chat message/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'tool', content: 'x'}]}), /Invalid chat message/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'.repeat(LIMITS.prompt + 1)}]}), /Invalid chat message/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: []}), /Chat history/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: Array.from({length: LIMITS.messages + 1}, () => ({role: 'user', content: 'x'}))}), /Chat history/);
  assert.throws(() => validatePayload('chat', {messages: [{role: 'user', content: 'x'}]}), /Select a model first/);
  assert.throws(() => validatePayload('chat', {model: 'x-cloud', messages: [{role: 'user', content: 'x'}]}), /Cloud models/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}], options: {temperature: 3}}), /Invalid parameter: temperature/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}], options: {top_k: 1.5}}), /Invalid parameter: top_k/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}], options: {unknown: 1}}), /Invalid parameter: unknown/);
  assert.throws(() => validatePayload('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}], keep_alive: '1h'}), /keep-alive/);
  for (const action of ['generate', 'show', 'copy', 'constructor', '__proto__']) assert.throws(() => validatePayload(action, {}), /Unsupported local API operation/);
  assert.throws(() => validatePayload('pull', null), /Unexpected request field/);
  assert.throws(() => validatePayload('pull', [] ), /Unexpected request field/);
});

test('requests go only to the loopback address and never follow redirects or send credentials', async () => {
  const fetchImpl = fakeFetch(reply(['{"version":"0.5.1"}']));
  assert.deepEqual(await callLocal('version', {}, {port: 8080, fetchImpl}), {version: '0.5.1'});
  assert.equal(fetchImpl.calls[0].url, 'http://127.0.0.1:8080/api/version');
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.calls[0].init.redirect, 'error');
  assert.equal(fetchImpl.calls[0].init.credentials, 'omit');
  assert.equal(fetchImpl.calls[0].init.body, undefined);
  const refused = fakeFetch(reply(['{}']));
  await rejects(callLocal('version', {}, {port: '8080', fetchImpl: refused}), 'invalid');
  await rejects(callLocal('version', {}, {port: 22, fetchImpl: refused}), 'invalid');
  await rejects(callLocal('generate', {}, {fetchImpl: refused}), 'invalid', /Unsupported/);
  await rejects(callLocal('chat', {model: 'x-cloud', messages: [{role: 'user', content: 'x'}]}, {fetchImpl: refused}), 'invalid');
  assert.equal(refused.calls.length, 0);
});

test('a streamed pull is parsed across chunk boundaries, one line at a time', async () => {
  const fetchImpl = fakeFetch(reply(['{"status":"pulling manifest"}\n{"status":"pulling abc","tot', 'al":100,"completed":40}\n{"status":"su', 'ccess"}\n']));
  const seen = [];
  const last = await callLocal('pull', {model: 'llama3.2:3b'}, {fetchImpl, onChunk: chunk => seen.push(chunk.status)});
  assert.deepEqual(seen, ['pulling manifest', 'pulling abc', 'success']);
  assert.equal(last.status, 'success');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {model: 'llama3.2:3b', stream: true});
  assert.equal(fetchImpl.calls[0].init.headers['Content-Type'], 'application/json');
});

test('a streamed chat delivers each piece and finishes on the done line, even without a final newline', async () => {
  const fetchImpl = fakeFetch(reply(['{"message":{"role":"assistant","content":"Hel"},"done":false}\n{"message":{"content":"lo"},"done":false}\n', '{"message":{"content":""},"done":true}']));
  let text = '';
  await callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'hi'}]}, {fetchImpl, onChunk: chunk => { text += chatDelta(chunk); }});
  assert.equal(text, 'Hello');
});

test('a line over the size limit is refused, whether or not it ever ends', async () => {
  const huge = '{"message":{"content":"' + 'a'.repeat(LIMITS.line) + '"},"done":false}\n';
  await rejects(callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}]}, {fetchImpl: fakeFetch(reply([huge]))}), 'protocol', /too large/);
  await rejects(callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}]}, {fetchImpl: fakeFetch(reply(['a'.repeat(LIMITS.line + 10)], {open: true}))}), 'protocol', /too large/);
});

test('malformed lines, odd shapes and server error lines end the request with a readable message', async () => {
  const body = {model: 'mistral', messages: [{role: 'user', content: 'x'}]};
  await rejects(callLocal('chat', body, {fetchImpl: fakeFetch(reply(['not json\n']))}), 'protocol', /malformed/);
  await rejects(callLocal('chat', body, {fetchImpl: fakeFetch(reply(['[1,2]\n']))}), 'protocol', /unexpected shape/);
  await rejects(callLocal('chat', body, {fetchImpl: fakeFetch(reply(['{"error":"model requires more system memory"}\n']))}), 'server');
  await assert.rejects(callLocal('chat', body, {fetchImpl: fakeFetch(reply(['{"error":"secret detail"}\n']))}), error => !error.message.includes('secret detail'));
  await rejects(callLocal('chat', body, {fetchImpl: fakeFetch(reply([]))}), 'protocol', /no data/);
});

test('a stream that stops before the done line is reported as incomplete', async () => {
  await rejects(callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}]}, {fetchImpl: fakeFetch(reply(['{"message":{"content":"par"},"done":false}\n']))}), 'incomplete', /ended before it finished/);
  await rejects(callLocal('pull', {model: 'mistral'}, {fetchImpl: fakeFetch(reply(['{"status":"pulling abc","total":10,"completed":5}\n']))}), 'incomplete');
});

test('an HTTP failure, an unreachable server and an empty body each give a plain message', async () => {
  await rejects(callLocal('installed', {}, {fetchImpl: fakeFetch(reply(['{}'], {ok: false, status: 500}))}), 'http', /HTTP 500/);
  await rejects(callLocal('installed', {}, {port: 9999, fetchImpl: fakeFetch(new TypeError('Failed to fetch'))}), 'unreachable', /not running or cannot be reached on port 9999/);
  await rejects(callLocal('installed', {}, {fetchImpl: fakeFetch({ok: true, status: 200, body: null})}), 'protocol', /empty/);
});

test('cancelling stops a stream that is still open and keeps what arrived', async () => {
  const controller = new AbortController();
  let text = '';
  const fetchImpl = fakeFetch(reply(['{"message":{"content":"one"},"done":false}\n'], {open: true}));
  const pending = callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}]}, {fetchImpl, signal: controller.signal, onChunk: chunk => { text += chatDelta(chunk); controller.abort(); }});
  await rejects(pending, 'cancelled', /cancelled/);
  assert.equal(text, 'one');
  const already = new AbortController(); already.abort();
  const later = fakeFetch(reply(['{}']));
  await rejects(callLocal('version', {}, {fetchImpl: later, signal: already.signal}), 'cancelled');
});

test('a server that never finishes is stopped by the timeout', async () => {
  await rejects(callLocal('chat', {model: 'mistral', messages: [{role: 'user', content: 'x'}]}, {timeout: 20, fetchImpl: fakeFetch(reply([], {open: true}))}), 'timeout', /did not answer in time/);
});

test('delete may reply with an empty body, but other plain replies must carry data', async () => {
  const fetchImpl = fakeFetch(reply([]));
  assert.deepEqual(await callLocal('delete', {model: 'mistral'}, {fetchImpl}), {});
  assert.equal(fetchImpl.calls[0].init.method, 'DELETE');
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {model: 'mistral'});
  await rejects(callLocal('version', {}, {fetchImpl: fakeFetch(reply([]))}), 'protocol');
});

test('reply helpers keep valid local models, sizes, running names and bounded progress', () => {
  const tags = {models: [{name: 'zeta:1b', size: 1500000000}, {name: 'alpha:latest', size: 4200000000}, {name: 'big-cloud', size: 1}, {name: '../bad', size: 1}, null, {name: 'beta:2b', size: 'oops'}]};
  assert.deepEqual(installedModels(tags).map(item => item.name), ['alpha:latest', 'beta:2b', 'zeta:1b']);
  assert.equal(installedModels(tags)[1].size, 0);
  assert.deepEqual(installedModels({models: 'x'}), []);
  assert.deepEqual([...runningNames({models: [{name: 'alpha:latest'}, {model: 'evil-cloud'}, {name: 5}]})], ['alpha:latest']);
  assert.equal(formatSize(4200000000), '4.2 GB');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(-1), '');
  assert.equal(formatSize('x'), '');
  assert.deepEqual(pullProgress({status: 'pulling abc', total: 200, completed: 50}), {status: 'pulling abc', completed: 50, total: 200, fraction: 0.25});
  assert.equal(pullProgress({status: 'verifying', completed: 10}).fraction, null);
  assert.equal(pullProgress({total: 10, completed: 99}).fraction, 1);
  assert.equal(pullProgress(null).status, '');
  assert.equal(chatDelta({message: {content: 'x'}}), 'x');
  assert.equal(chatDelta({message: {content: 5}}), '');
});
