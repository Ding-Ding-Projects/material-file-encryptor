import test from 'node:test';
import assert from 'node:assert/strict';
import { VaultSessions } from '../src/main/vault-sessions.js';
import { validateRequest } from '../src/main/validation.js';
const locked = () => ({ locked: true, mounted: false, operations: [], availableDriveLetters: ['N:'] });
const location = value => `C:\\VaultTest\\${value}`;
function fixture() {
  const calls = [];
  const sessions = new VaultSessions({ initialState: locked(), initialPreferences: { cacheDir: 'primary', storageDir: 'original', startup: true, autoUnlock: true }, cacheRoot: id => location(id) });
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
  assert.equal(sessions.selected.preferences.cacheDir, location('second'));
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
test('saved secondary sessions restore locked with the original cache and no access to vault paths', async () => {
  const { sessions, calls } = fixture();
  const primary = sessions.selected;
  sessions.cacheRoot = () => { throw Error('Restoring must not generate another cache location.'); };
  sessions.setSavedSessions([{ storageDir: location('saved-source'), cacheDir: location('old-native-id'), driveName: 'Archive', driveLetter: 'Q:', transport: 'privateGit', remoteRepository: 'owner/archive', autoUnlock: true, password: 'never-kept', keyFilePath: 'never-kept' }]);
  await sessions.restore(primary.preferences);
  assert.equal(sessions.selectedId, 'main');
  assert.equal(sessions.selected, primary);
  assert.deepEqual(calls, [{ method: 'createSession', params: undefined }]);
  const row = sessions.rows.get('second');
  assert.equal(row.state.locked, true);
  assert.equal(row.state.mounted, false);
  assert.equal(row.preferences.cacheDir, location('old-native-id'));
  assert.equal(row.preferences.storageDir, location('saved-source'));
  assert.equal(row.preferences.autoUnlock, false);
  assert.equal(row.preferences.transport, 'privateGit');
  assert.equal(row.preferences.remoteRepository, 'owner/archive');
  assert.equal(row.preferences.password, undefined);
  assert.equal(row.preferences.keyFilePath, undefined);
  sessions.accept('second', { ...locked(), driveLetter: 'M:', driveName: 'Material Files', storageDir: null, cacheDir: null });
  const summary = sessions.inventory().find(row => row.sessionId === 'second');
  assert.equal(summary.storageDir, location('saved-source'));
  assert.equal(summary.cacheDir, location('old-native-id'));
  assert.equal(summary.driveName, 'Archive');
  assert.equal(summary.driveLetter, 'Q:');
  sessions.select('second');
  assert.equal(sessions.selected.preferences.cacheDir, location('old-native-id'));
});
test('partial restoration preserves failed descriptors across subsequent saves and session removal', async () => {
  const { sessions } = fixture();
  const first = { storageDir: location('first-source'), cacheDir: location('first-cache') };
  const second = { storageDir: location('second-source'), cacheDir: location('second-cache') };
  sessions.setSavedSessions([first, second]);
  let attempt = 0;
  sessions.client.request = async method => {
    if (method === 'createSession') {
      if (++attempt === 1) throw Error('helper unavailable');
      return { sessionId: 'restored', status: locked() };
    }
    return {};
  };
  await assert.rejects(sessions.restore({}), /1 secondary.*preserved/);
  assert.equal(sessions.selectedId, 'main');
  assert.deepEqual(new Set(sessions.savedSessions().map(row => row.cacheDir)), new Set([location('first-cache'), location('second-cache')]));
  await sessions.remove('restored');
  assert.deepEqual(sessions.savedSessions(), [{ autoUnlock: false, ...first }]);
});
test('staged descriptors survive missing native support and new defaults cannot inherit credentials', async () => {
  const { sessions } = fixture();
  sessions.setSavedSessions([{ cacheDir: location('preserved-cache') }]);
  sessions.client = null;
  await assert.rejects(sessions.restore({}), /preserved/);
  assert.deepEqual(sessions.savedSessions(), [{ autoUnlock: false, cacheDir: location('preserved-cache') }]);
  assert.throws(() => sessions.setSavedSessions([]), /already/);
  const next = fixture().sessions;
  await next.add({ password: 'secret', keyFilePath: 'secret', keys: ['secret'], credentials: 'secret' });
  assert.ok(!JSON.stringify(next.savedSessions()).includes('secret'));
});
test('invalid saved settings are rejected before allocating any native session', async () => {
  const { sessions, calls } = fixture();
  assert.throws(() => sessions.setSavedSessions([{ storageDir: 'lost-cache' }]));
  await assert.rejects(sessions.add({}, { storageDir: 'lost-cache' }));
  assert.deepEqual(calls, []);
  assert.equal(sessions.selectedId, 'main');
});
test('restoration refuses an unlocked or mounted native response without discarding recovery locations', async () => {
  for (const status of [{ ...locked(), locked: false }, { ...locked(), mounted: true }]) {
    const { sessions } = fixture();
    sessions.setSavedSessions([{ cacheDir: location('preserved-cache') }]);
    sessions.client.request = async () => ({ sessionId: 'invalid-state', status });
    await assert.rejects(sessions.restore({}), /preserved/);
    assert.equal(sessions.rows.size, 1);
    assert.equal(sessions.selectedId, 'main');
    assert.deepEqual(sessions.savedSessions(), [{ autoUnlock: false, cacheDir: location('preserved-cache') }]);
  }
});
test('pending recovery descriptors count toward the secondary session limit', async () => {
  const { sessions, calls } = fixture();
  sessions.setSavedSessions(Array.from({ length: 23 }, (_, index) => ({ cacheDir: location(`saved-${index}`) })));
  await assert.rejects(sessions.add({}), /awaiting recovery/);
  assert.deepEqual(calls, []);
  assert.equal(sessions.savedSessions().length, 23);
});
