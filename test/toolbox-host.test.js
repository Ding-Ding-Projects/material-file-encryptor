import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createToolboxHost, TOOLBOX_ACTIONS } from '../src/main/toolbox-host.js';
import { validateFeatureRequest } from '../src/main/validation.js';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mfe-toolbox-'));
  let nextOpen = [], nextSave = null;
  const events = [];
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: nextOpen }), showSaveDialog: async () => nextSave ? { canceled: false, filePath: nextSave } : { canceled: true } };
  const host = createToolboxHost({ dialog, getWindow: () => null, desktopCapturer: { getSources: async () => [] }, emit: (feature, data) => events.push(data) });
  return { dir, host, events, open: file => { nextOpen = [file]; }, save: file => { nextSave = file; } };
}

test('file encode writes beside the source, never overwrites, and verifies the round trip', async () => {
  const { dir, host, open } = await fixture();
  const source = path.join(dir, 'photo.bin'); const bytes = Buffer.from(Array.from({ length: 700000 }, (_, i) => (i * 31) & 255));
  await fs.writeFile(source, bytes); open(source);
  const picked = await host.dispatch('pickInput');
  const first = await host.dispatch('encodeFile', { id: picked.id, destination: 'beside', options: { variant: 'standard' } });
  assert.equal(first.name, 'photo.bin.base64.txt'); assert.equal(first.verified, true);
  assert.equal(await fs.readFile(path.join(dir, first.name), 'ascii'), bytes.toString('base64'));
  const second = await host.dispatch('encodeFile', { id: picked.id, destination: 'beside', options: {} });
  assert.equal(second.name, 'photo.bin.base64 (1).txt');
  const decodedSource = path.join(dir, first.name); open(decodedSource);
  const text = await host.dispatch('pickInput');
  const decoded = await host.dispatch('decodeFile', { id: text.id, destination: 'beside', options: {} });
  assert.equal(decoded.name, 'photo (1).bin');
  assert.deepEqual(await fs.readFile(path.join(dir, decoded.name)), bytes);
  await host.close();
});

test('unknown grants, unknown actions and invalid chunks are refused', async () => {
  const { host, dir, save } = await fixture();
  await assert.rejects(host.dispatch('encodeFile', { id: '00000000-0000-0000-0000-000000000000' }), /Choose the file again/);
  await assert.rejects(host.dispatch('formatDisk'), /Unsupported/);
  await assert.rejects(host.write('missing', Buffer.from('x')), /no longer open/);
  save(path.join(dir, 'out.webm'));
  const target = await host.dispatch('beginSave', { name: 'out.webm' });
  await assert.rejects(host.write(target.id, Buffer.alloc(0)), /Chunk size/);
  await host.write(target.id, Buffer.from('abc')); await host.write(target.id, Buffer.from('def'));
  const result = await host.dispatch('finishSave', { id: target.id });
  assert.equal(result.bytes, 6); assert.equal(await fs.readFile(path.join(dir, 'out.webm'), 'utf8'), 'abcdef');
  await assert.rejects(host.dispatch('finishSave', { id: target.id }), /no longer open/);
  await host.close();
});

test('abortSave removes the partial file and a cancelled save dialog returns nothing', async () => {
  const { host, dir, save } = await fixture();
  assert.equal(await host.dispatch('beginSave', { name: 'a.png' }), null);
  save(path.join(dir, 'partial.png')); const target = await host.dispatch('beginSave', { name: 'partial.png' });
  await host.write(target.id, Buffer.from('xyz')); await host.dispatch('abortSave', { id: target.id });
  await assert.rejects(fs.access(path.join(dir, 'partial.png')));
  await host.close();
});

test('recording only arms real source ids and the display handler grants once', async () => {
  const sources = [{ id: 'screen:1:0', name: 'Screen 1', thumbnail: { isEmpty: () => true } }];
  const host = createToolboxHost({ dialog: {}, getWindow: () => null, desktopCapturer: { getSources: async () => sources } });
  await assert.rejects(host.dispatch('recordingArm', { sourceId: '../../x' }), /Choose a screen/);
  await assert.rejects(host.dispatch('recordingArm', { sourceId: 'screen:9:0' }), /no longer available/);
  await host.dispatch('recordingArm', { sourceId: 'screen:1:0', microphone: true });
  let granted; host.displayMediaHandler({}, value => { granted = value; }); assert.equal(granted.video.id, 'screen:1:0');
  host.displayMediaHandler({}, value => { granted = value; }); assert.deepEqual(granted, {});
  const answers = [];
  await host.dispatch('recordingArm', { sourceId: 'screen:1:0', microphone: true });
  host.permissionHandler(null, 'media', value => answers.push(value), { mediaTypes: ['audio'] });
  host.permissionHandler(null, 'media', value => answers.push(value), { mediaTypes: ['video', 'audio'] });
  host.permissionHandler(null, 'geolocation', value => answers.push(value), {});
  assert.deepEqual(answers, [true, false, false]);
  await host.dispatch('recordingDisarm');
  await host.close();
});

test('the validator exposes exactly the toolbox actions to the desktop and none to the browser extension', () => {
  for (const action of TOOLBOX_ACTIONS) assert.equal(validateFeatureRequest('toolbox', action, {}).feature, 'toolbox');
  assert.throws(() => validateFeatureRequest('toolbox', 'pickInput', {}, { browser: true }), /Unsupported/);
  assert.throws(() => validateFeatureRequest('toolbox', 'deleteEverything', {}), /Unsupported/);
});
