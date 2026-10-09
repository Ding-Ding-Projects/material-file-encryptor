import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function createVerificationStartup('), source.indexOf('\nlet verificationStartup;'));
const create = vm.runInNewContext('(' + body + ')');
test('verification startup mutates only its unique entry and restores absence', () => {
  const entries = new Map([['UserEntry', { name: 'UserEntry', enabled: true }]]);
  const calls = [];
  const app = { getLoginItemSettings(options) { assert.equal(options.path, 'fixture.exe'); assert.deepEqual([...options.args], ['--startup']); return { launchItems: [...entries.values()] }; }, setLoginItemSettings(options) { calls.push(options); if (options.openAtLogin) entries.set(options.name, { name: options.name, enabled: options.enabled }); else entries.delete(options.name); } };
  const seam = create(app, 'fixture.exe', 'UniqueVerification');
  assert.equal(seam.read().enabled, false); seam.set(true); assert.equal(seam.read().enabled, true); seam.set(false); assert.equal(seam.read().enabled, false);
  assert.equal(seam.restore().restored, true); assert.equal(entries.get('UserEntry').enabled, true); assert.equal(calls.every(call => call.name === 'UniqueVerification'), true);
});
test('verification startup refuses an existing entry before mutation', () => {
  let mutated = false;
  assert.throws(() => create({ getLoginItemSettings: () => ({ launchItems: [{ name: 'Collision', enabled: false }] }), setLoginItemSettings: () => { mutated = true; } }, 'fixture.exe', 'Collision'), /already exists/);
  assert.equal(mutated, false);
});
