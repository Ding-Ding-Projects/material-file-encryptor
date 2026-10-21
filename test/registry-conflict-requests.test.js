import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryConflictRequests, validateRegistryConflictRequest } from '../src/main/registry-conflict-requests.js';
import { validateRequest } from '../src/main/validation.js';

const review = () => ({ conflictId: 'a'.repeat(64), choice: 'keep-both', currentVersion: 'b'.repeat(32), preservedVersion: 'c'.repeat(32) });
function fixture(overrides = {}) {
  const calls = [], prompts = [];
  const invoke = createRegistryConflictRequests({ nativeRequest: async (method, params, id) => {
    calls.push({ method, params, id });
    return method === 'listConflicts' ? { items: [], nextCursor: null } : { conflictId: params.conflictId, choice: params.choice, resolved: true };
  }, confirm: async options => { prompts.push(options); return { response: 1 }; }, available: () => true,
  exiting: () => false, busy: () => false, selectedSession: () => 'vault-a', ...overrides });
  return { invoke, calls, prompts };
}

test('conflict ingress bounds opaque cursors and rejects undeclared or executable values', () => {
  assert.deepEqual(validateRequest('listRegistryConflicts', {}), { limit: 25 });
  assert.deepEqual(validateRequest('listRegistryConflicts', { limit: 1000, cursor: null }), { limit: 1000 });
  for (const value of [{ limit: 1001 }, { limit: 0 }, { cursor: '../file' }, { endpoint: 'https://example.com' }, Object.create({ limit: 25 }), { get limit() { throw Error('Getter executed'); } }]) assert.throws(() => validateRequest('listRegistryConflicts', value), /Invalid conflict review/);
  for (const value of [{ ...review(), choice: 'replace-all' }, { ...review(), currentVersion: null }, { ...review(), deletionCommitId: 'd'.repeat(32) }, { ...review(), sessionId: 'other' }]) assert.throws(() => validateRegistryConflictRequest('resolveRegistryConflict', value), /Invalid conflict review/);
});

test('deletion intent is explicit and never fabricated as a preserved live version', () => {
  const value = { ...review(), choice: 'apply-deletion', preservedVersion: null, deletionCommitId: 'd'.repeat(32) };
  assert.deepEqual(validateRequest('resolveRegistryConflict', value), value);
  assert.throws(() => validateRequest('resolveRegistryConflict', { ...value, preservedVersion: 'c'.repeat(32) }));
  assert.throws(() => validateRequest('resolveRegistryConflict', { ...value, deletionCommitId: undefined }));
  assert.deepEqual(validateRequest('resolveRegistryConflict', { ...value, deletionCommitId: 'd'.repeat(64) }).deletionCommitId, 'd'.repeat(64));
});

test('cancelling main-owned confirmation performs no native mutation', async () => {
  const f = fixture({ confirm: async () => ({ response: 0 }) });
  assert.deepEqual(await f.invoke('resolveRegistryConflict', review(), 'vault-a'), { cancelled: true });
  assert.equal(f.calls.length, 0);
});

test('confirmation freezes reviewed input and forwards only the exact admitted vault', async () => {
  const value = review();
  const f = fixture({ confirm: async () => { value.currentVersion = 'f'.repeat(32); value.choice = 'use-preserved'; return { response: 1 }; } });
  await f.invoke('resolveRegistryConflict', value, 'vault-a');
  assert.equal(f.calls[0].params.currentVersion, 'b'.repeat(32));
  assert.equal(f.calls[0].params.choice, 'keep-both');
  assert.equal(f.calls[0].id, 'vault-a');
});

test('session, shutdown and registry admission are rechecked after confirmation', async () => {
  for (const mode of ['selectedSession', 'exiting', 'busy']) {
    let accepted = false;
    const f = fixture({ [mode]: () => mode === 'selectedSession' ? accepted ? 'vault-b' : 'vault-a' : accepted,
      confirm: async () => { accepted = true; return { response: 1 }; } });
    await assert.rejects(f.invoke('resolveRegistryConflict', review(), 'vault-a'));
    assert.equal(f.calls.length, 0);
  }
});

test('listing preserves bounded paging without asking for mutation consent', async () => {
  const f = fixture();
  await f.invoke('listRegistryConflicts', { limit: 25, cursor: 'e'.repeat(64) }, 'vault-a');
  assert.equal(f.prompts.length, 0);
  assert.deepEqual(f.calls[0], { method: 'listConflicts', params: { limit: 25, cursor: 'e'.repeat(64) }, id: 'vault-a' });
});

test('confirmation uses each supported language without changing reviewed identifiers', async () => {
  for (const language of ['en', 'yue', 'bilingual']) {
    const f = fixture({ language: () => language });
    await f.invoke('resolveRegistryConflict', review(), 'vault-a');
    const prompt = f.prompts[0];
    assert.equal(prompt.title.includes('Resolve file conflict'), language !== 'yue');
    assert.equal(prompt.title.includes('處理檔案衝突'), language !== 'en');
    assert.ok(prompt.detail.includes('a'.repeat(64)));
    assert.equal(prompt.defaultId, 0);
  }
});

test('unconfirmed native effects and malformed recovery paths remain unverified', async () => {
  for (const result of [{ resolved: true }, { ...review(), resolved: false }, { ...review(), resolved: true, restoredPaths: [] }, { ...review(), resolved: true, restoredPaths: ['one', 'one'] }, { ...review(), resolved: true, restoredPaths: ['one', '\n'] }]) {
    const f = fixture({ nativeRequest: async () => result });
    await assert.rejects(f.invoke('resolveRegistryConflict', review(), 'vault-a'), /unverified/);
  }
  const f = fixture({ nativeRequest: async (_method, params) => ({ conflictId: params.conflictId, choice: params.choice, resolved: true, restoredPaths: ['one', 'two'] }) });
  assert.deepEqual((await f.invoke('resolveRegistryConflict', review(), 'vault-a')).restoredPaths, ['one', 'two']);
});

test('ordinary native resolutions accept an explicitly null recovery-path field', async () => {
  const f = fixture({ nativeRequest: async (_method, params) => ({ conflictId: params.conflictId, choice: params.choice, resolved: true, restoredPaths: null }) });
  assert.equal((await f.invoke('resolveRegistryConflict', review(), 'vault-a')).resolved, true);
});
