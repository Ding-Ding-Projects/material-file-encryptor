import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

class Node {
  constructor(name = 'div') { this.localName = name; this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.hidden = false; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  attachShadow() { return (this.shadowRoot = new Node()); }
}
Object.defineProperty(Node.prototype, 'translate', { get() { return this.attributes.translate !== 'no'; }, set(value) { this.attributes.translate = value ? 'yes' : 'no'; } });
globalThis.HTMLElement = Node;
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { items: new Map(), get(name) { return this.items.get(name); }, define(name, type) { this.items.set(name, type); } };
globalThis.document = { createElement: name => { const Type = customElements.get(name) || Node; return new Type(name); }, createElementNS: (namespace, name) => new Node(name) };
const { mountBrowserPairing } = await import('../src/renderer/features/browser-pairing/index.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const walk = node => [node, ...node.children.flatMap(walk)];
const find = (root, text) => walk(root).find(node => node.textContent === text);

function fixture({ issue = { code: 'ABCD2345', expiresAt: 130000, expiresInSeconds: 120 }, fail = null } = {}) {
  const host = new Node();
  const calls = [];
  const clock = { at: 10000 };
  const timers = [];
  const view = mountBrowserPairing(host, {
    translate: value => value,
    now: () => clock.at,
    setInterval: fn => { timers.push(fn); return timers.length; },
    clearInterval: id => { timers[id - 1] = null; },
    request: async action => { calls.push(action); if (fail && action === 'issue') throw new Error(fail); return action === 'issue' ? issue : { cleared: true }; },
  });
  return { host, view, calls, clock, timers };
}

test('nothing is requested until Show pairing code is pressed', async () => {
  const f = fixture();
  await tick();
  assert.deepEqual(f.calls, []);
  assert.equal(walk(f.host).some(node => node.attributes.role === 'img'), false);
});

test('showing the code displays the text, a QR image labelled for assistive technology and the time left', async () => {
  const f = fixture();
  await find(f.host, 'Show pairing code').listeners.click();
  const nodes = walk(f.host);
  assert.deepEqual(f.calls, ['issue']);
  assert.ok(nodes.some(node => node.textContent === 'ABCD 2345'));
  const text = nodes.find(node => node.textContent === 'ABCD 2345');
  assert.equal(text.attributes['aria-label'], 'A B C D 2 3 4 5');
  const svg = nodes.find(node => node.attributes.role === 'img');
  assert.equal(svg.attributes['aria-label'], 'Browser pairing QR code');
  assert.ok(nodes.some(node => /^Valid for 120 seconds$/.test(node.textContent)));
  assert.equal(nodes.some(node => node.localName === 'innerHTML'), false);
});

test('the countdown ends by clearing the code and saying it expired', async () => {
  const f = fixture();
  await find(f.host, 'Show pairing code').listeners.click();
  f.clock.at = 130000;
  f.timers[0]();
  const nodes = walk(f.host);
  assert.equal(nodes.some(node => node.textContent === 'ABCD 2345'), false);
  assert.equal(nodes.some(node => node.attributes.role === 'img'), false);
  assert.ok(nodes.some(node => node.textContent === 'The code expired. Show a new one.'));
});

test('hiding clears the display and asks the desktop to forget the code', async () => {
  const f = fixture();
  await find(f.host, 'Show pairing code').listeners.click();
  find(f.host, 'Hide pairing code').listeners.click();
  assert.deepEqual(f.calls, ['issue', 'clear']);
  assert.equal(walk(f.host).some(node => node.textContent === 'ABCD 2345'), false);
});

test('destroying the view clears a shown code and leaves nothing in the host', async () => {
  const f = fixture();
  await find(f.host, 'Show pairing code').listeners.click();
  f.view.destroy();
  await tick();
  assert.deepEqual(f.calls, ['issue', 'clear']);
  assert.equal(f.host.children.length, 0);
});

test('a refusal from the desktop is shown plainly and no code appears', async () => {
  const f = fixture({ fail: 'Unlock the drive before pairing a browser.' });
  await find(f.host, 'Show pairing code').listeners.click();
  assert.ok(walk(f.host).some(node => node.textContent === 'Pairing code unavailable: Unlock the drive before pairing a browser.'));
  assert.equal(walk(f.host).some(node => node.attributes.role === 'img'), false);
});

test('a malformed response is refused rather than drawn', async () => {
  const f = fixture({ issue: { code: 'ABC<script>', expiresAt: 130000 } });
  await find(f.host, 'Show pairing code').listeners.click();
  assert.equal(walk(f.host).some(node => node.attributes.role === 'img'), false);
});

test('the QR payload is exactly the code and nothing else', async () => {
  const { textQrMatrix } = await import('../src/renderer/features/access/qr.js');
  const { default: jsQR } = await import('../src/renderer/features/access/vendor/jsqr.js');
  const matrix = textQrMatrix('ABCD2345'), scale = 6, quiet = 4, width = (matrix.length + quiet * 2) * scale, data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++) if (matrix[y][x]) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const at = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4; data[at] = data[at + 1] = data[at + 2] = 0; }
  assert.equal(jsQR(data, width, width).data, 'ABCD2345');
  for (const bad of ['https://example.com/ABCD2345', 'otpauth://totp/x?secret=A', 'abcd2345', 'ABCD 2345', '', 'A'.repeat(33)]) assert.throws(() => textQrMatrix(bad), /short pairing code/);
});

test('the view source never writes markup, storage or logs and holds the code only in memory', async () => {
  const source = await fs.readFile(new URL('../src/renderer/features/browser-pairing/index.js', import.meta.url), 'utf8');
  assert.equal(/innerHTML|insertAdjacentHTML|localStorage|sessionStorage|indexedDB|console\.|clipboard/.test(source), false);
});

test('the pairing page follows the selected interface language and re-renders when it changes', async () => {
  const host = new Node();
  const language = { value: 'en' };
  const yue = { 'Pair a browser': '配對瀏覽器', 'Show pairing code': '顯示配對代碼', 'Hide pairing code': '隱藏配對代碼', 'Pairing code hidden and cleared.': '配對代碼已隱藏並清除。', 'Valid for': '有效時間', seconds: '秒' };
  const translate = value => language.value === 'yue' ? (yue[value] ?? value) : language.value === 'bilingual' && yue[value] ? `${value} · ${yue[value]}` : value;
  let notify = () => {}, unsubscribed = 0;
  const view = mountBrowserPairing(host, {
    translate, now: () => 10000, setInterval: () => 1, clearInterval: () => {},
    subscribeLanguage: callback => { notify = callback; return () => { unsubscribed++; notify = () => {}; }; },
    request: async action => action === 'issue' ? { code: 'ABCD2345', expiresAt: 130000 } : { cleared: true },
  });
  assert.ok(find(host, 'Pair a browser') && find(host, 'Show pairing code'), 'English mode shows only English');
  assert.equal(walk(host).some(node => /配對/.test(node.textContent)), false);
  language.value = 'yue'; notify();
  assert.ok(find(host, '配對瀏覽器') && find(host, '顯示配對代碼'));
  assert.equal(find(host, 'Pair a browser'), undefined);
  language.value = 'bilingual'; notify();
  assert.ok(find(host, 'Pair a browser · 配對瀏覽器') && find(host, 'Show pairing code · 顯示配對代碼'));
  language.value = 'en'; notify();
  assert.ok(find(host, 'Pair a browser') && find(host, 'Show pairing code'));
  const show = find(host, 'Show pairing code');
  show.listeners.click(); await tick(); await tick();
  assert.ok(find(host, 'Valid for 120 seconds'));
  language.value = 'yue'; notify();
  assert.ok(find(host, '有效時間 120 秒'), 'the countdown line is translated again');
  assert.ok(find(host, '隱藏配對代碼'));
  assert.ok(find(host, 'ABCD 2345'), 'the code itself is untouched by a language change');
  view.destroy();
  assert.equal(unsubscribed, 1);
});

test('the desktop validates the new feature for the renderer only', async () => {
  const { validateFeatureRequest } = await import('../src/main/validation.js');
  assert.deepEqual(validateFeatureRequest('browser-pairing', 'issue', {}), { feature: 'browser-pairing', action: 'issue', payload: {} });
  assert.deepEqual(validateFeatureRequest('browser-pairing', 'clear', {}), { feature: 'browser-pairing', action: 'clear', payload: {} });
  assert.throws(() => validateFeatureRequest('browser-pairing', 'read', {}), /Unsupported/);
  assert.throws(() => validateFeatureRequest('browser-pairing', 'issue', {}, { browser: true }), /Unsupported/);
});
