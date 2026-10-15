import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function harness() {
  let onMessage, onPortMessage;
  const sent = [];
  const port = {
    disconnect() {}, onDisconnect: { addListener() {} }, onMessage: { addListener(fn) { onPortMessage = fn; } },
    postMessage(message) { sent.push(message); queueMicrotask(() => onPortMessage({ type: 'paired', session: 'a'.repeat(43) })); },
  };
  const chrome = { runtime: { id: 'fixture', getURL: name => 'chrome-extension://fixture/' + name, connectNative: () => port, onInstalled: { addListener() {} }, onMessage: { addListener(fn) { onMessage = fn; } } }, contextMenus: { create() {}, onClicked: { addListener() {} } }, action: { setBadgeText() {}, setTitle() {} } };
  vm.runInNewContext(await fs.readFile(new URL('../browser-extension/background.js', import.meta.url), 'utf8'), { chrome, URL, setTimeout, clearTimeout, queueMicrotask });
  const sender = { id: 'fixture', url: chrome.runtime.getURL('options.html') };
  const message = value => new Promise(resolve => { if (onMessage(value, sender, resolve) === false) resolve('sync'); });
  return { sent, message };
}

test('a valid code travels with the pair request to the native host and is never echoed back', async () => {
  const h = await harness();
  const reply = await h.message({ type: 'pair', code: 'ABCD2345' });
  assert.equal(reply.paired, true);
  assert.equal(JSON.stringify(h.sent), '[{"type":"pair","code":"ABCD2345"}]');
  assert.equal(JSON.stringify(reply).includes('ABCD2345'), false);
});

test('pairing without a code sends the original message', async () => {
  const h = await harness();
  assert.equal((await h.message({ type: 'pair' })).paired, true);
  assert.equal(JSON.stringify(h.sent), '[{"type":"pair"}]');
});

test('a malformed code or extra field never reaches the native host', async () => {
  const h = await harness();
  for (const bad of [{ type: 'pair', code: 'abcd2345' }, { type: 'pair', code: 'ABCD234' }, { type: 'pair', code: 'ABCD2340' }, { type: 'pair', code: 12345678 }, { type: 'pair', code: 'ABCD2345', extra: 1 }, { type: 'pair', other: 'ABCD2345' }, { type: 'pair', code: undefined }]) {
    const reply = await h.message(bad);
    assert.equal(typeof reply.error, 'string');
    assert.equal(JSON.stringify(reply).includes('ABCD2345'), false);
  }
  assert.equal(h.sent.length, 0);
});
