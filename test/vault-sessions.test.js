import test from 'node:test';
import assert from 'node:assert/strict';
import { VaultSessions } from '../src/main/vault-sessions.js';
import { validateRequest } from '../src/main/validation.js';
const locked = () => ({ locked: true, mounted: false, operations: [], availableDriveLetters: ['N:'] });
function fixture() {
  const calls = [];
  const sessions = new VaultSessions({ initialState: locked(), initialPreferences: { cacheDir: 'primary', storageDir: 'original', startup: true, autoUnlock: true }, cacheRoot: id => `cache/${id}` });
  sessions.client = { request: async (method, params) => {
    calls.push({ method, params });
    if (method === 'createSession') return { sessionId: 'second', status: locked() };
    if (method === 'statusSummary') return locked();
    if (method === 'operations') return [{ operationId: 'same-local-id', state: 'running' }];
    return { locked: true };
  } };
  return { sessions, calls };
}
test('new vault has independent defaults and routes every operation to its identity', async () => {
  const { sessions, calls } = fixture();
  await sessions.add(sessions.selected.preferences);
  assert.equal(sessions.selectedId, 'second');
  assert.equal(sessions.selected.preferences.cacheDir, 'cache/second');
  assert.equal(sessions.selected.preferences.storageDir, undefined);
  assert.equal(sessions.selected.preferences.autoUnlock, false);
  assert.equal(sessions.selected.preferences.driveLetter, 'N:');
  await sessions.request('startImport', { paths: ['file'] });
  assert.deepEqual(calls.at(-1), { method: 'startImport', params: { paths: ['file'], sessionId: 'second' } });
  sessions.select('main');
  assert.equal(sessions.selected.preferences.storageDir, 'original');
  assert.equal(sessions.selected.preferences.cacheDir, 'primary');
});
test('pending foreground calls and stale UI identities cannot switch or mutate another vault', async () => {
  const { sessions } = fixture();
  let finish;
  const running = sessions.run(() => new Promise(resolve => { finish = resolve; }), 'main');
  await assert.rejects(sessions.change(async () => {}), /current action/);
  finish(); await running;
  await sessions.change(() => sessions.add(sessions.selected.preferences));
  let executed = false;
  await assert.rejects(sessions.run(() => { executed = true; }, 'main'), /selected vault changed/);
  assert.equal(executed, false);
  await assert.rejects(sessions.change(async () => sessions.run(() => {})), /selection/);
  assert.equal(sessions.switching, false);
});
test('background status and operations remain independently identified', async () => {
  const { sessions } = fixture();
  await sessions.add({});
  assert.equal(sessions.accept('main', { ...locked(), locked: false, mounted: true }), false);
  assert.equal(sessions.selected.state.locked, true);
  assert.equal(sessions.inventory().find(row => row.sessionId === 'main').mounted, true);
  assert.deepEqual((await sessions.operations()).map(row => row.sessionId), ['main', 'second']);
  assert.equal(sessions.safelyLocked, false);
});
test('shutdown attempts all sessions even if one fails and never reports them all locked', async () => {
  const { sessions } = fixture(); await sessions.add({});
  sessions.accept('main', { ...locked(), locked: false, mounted: true });
  const attempted = [];
  sessions.client.request = async (method, { sessionId }) => {
    if (method === 'lock') { attempted.push(sessionId); if (sessionId === 'main') throw Error('busy'); }
    return locked();
  };
  await assert.rejects(sessions.each('lock'), /busy/);
  assert.deepEqual(attempted.sort(), ['main', 'second']);
  assert.equal(sessions.safelyLocked, false);
});
test('removal requires verified lock and cannot remove primary session', async () => {
  const { sessions } = fixture(); await sessions.add({});
  await assert.rejects(sessions.remove('main'), /primary/);
  sessions.accept('second', { ...locked(), lockVerified: false });
  await assert.rejects(sessions.remove('second'), /verify/);
  sessions.accept('second', locked());
  await sessions.remove('second');
  assert.equal(sessions.selectedId, 'main'); assert.equal(sessions.rows.size, 1);
});
test('helper failure marks every session uncertain without pretending keys were released', async () => {
  const { sessions } = fixture(); await sessions.add({}); sessions.failAll();
  assert.equal(sessions.safelyLocked, false);
  assert.ok(sessions.inventory().every(row => row.recoveryRequired));
});
test('global services never inherit a selected vault identity', async () => {
  const { sessions, calls } = fixture(); await sessions.add({});
  await sessions.request('server.status', {});
  assert.deepEqual(calls.at(-1).params, {});
});
test('session bridge admits only bounded native identities', () => {
  for (const value of ['', '../vault', 'x'.repeat(65), null, 4])
    assert.throws(() => validateRequest('selectSession', { sessionId: value }));
  assert.deepEqual(validateRequest('selectSession', { sessionId: 'main' }), { sessionId: 'main' });
  assert.throws(() => validateRequest('addSession', { sessionId: 'invented' }));
});
