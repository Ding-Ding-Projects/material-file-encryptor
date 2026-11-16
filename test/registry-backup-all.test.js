import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryBackupAll, backupRepositoryName, uniqueBackupNames, validBackupSuffix, BACKUP_SCHEDULE } from '../src/main/registry-backup-all.js';
import { validateRegistrySchedule } from '../src/main/registry-schedule.js';
import { validateRequest } from '../src/main/validation.js';

const drive = (sessionId, name, extra = {}) => ({ sessionId, name, letter: 'M:', locked: false, storageDir: `C:\\vaults\\${sessionId}`, transport: 'folder', ...extra });
function fixture(drives, { saved = {}, ensure, sync, signedIn = { state: 'signed-in', account: 'yourname' } } = {}) {
  const calls = [];
  const docker = { inspectRegistrySignIn: async () => signedIn, ensurePublicRepository: async repository => { calls.push(['ensure', repository]); if (ensure) return ensure(repository); return { repository, created: true, visibility: 'public' }; } };
  const rows = { ...saved };
  const service = {
    status: async id => rows[id] ? { configured: true, configuration: rows[id], nextDue: Date.parse('2026-11-16T15:00:00Z'), lastResult: { verifiedAt: '2026-11-16T14:00:00.000Z' } } : { configured: false, configuration: null, nextDue: null, lastResult: null },
    configure: async (id, configuration) => { calls.push(['configure', id, configuration]); validateRegistrySchedule(configuration.schedule); rows[id] = configuration; },
    sync: async id => { calls.push(['sync', id]); if (sync) return sync(id); return { verified: true, digest: 'sha256:' + 'a'.repeat(64), published: true }; },
    cancel: async id => { calls.push(['cancel', id]); },
  };
  const backup = createRegistryBackupAll({ drives: () => drives, docker, sync: service, now: () => Date.parse('2026-11-16T14:00:00Z') });
  const finish = async () => { for (let i = 0; i < 400 && backup.status().phase === 'running'; i++) await new Promise(resolve => setImmediate(resolve)); return backup.status(); };
  return { backup, calls, finish, rows };
}

test('repository names are slugged from the drive name, uniquified, and always registry-valid', () => {
  assert.equal(backupRepositoryName('Work vault'), 'mfe-work-vault');
  assert.equal(backupRepositoryName('Family Photos!! 2026'), 'mfe-family-photos-2026');
  assert.equal(backupRepositoryName('Café Données'), 'mfe-cafe-donnees');
  assert.equal(backupRepositoryName('我嘅磁碟'), 'mfe-drive');
  assert.equal(backupRepositoryName(''), 'mfe-drive');
  assert.ok(backupRepositoryName('x'.repeat(200)).length <= 44);
  assert.deepEqual(uniqueBackupNames(['mfe-work', 'mfe-work', 'mfe-other', 'mfe-work']), ['mfe-work', 'mfe-work-2', 'mfe-other', 'mfe-work-3']);
  for (const name of ['Work vault', '--', 'a'.repeat(80), '__x__']) assert.ok(validBackupSuffix(backupRepositoryName(name)), name);
  for (const bad of ['', 'UPPER', 'has space', '-lead', 'trail-', 'a/b', 'x'.repeat(101), 5, null]) assert.equal(validBackupSuffix(bad), false, String(bad));
});

test('the default schedule is enabled, hourly, retries after 15 minutes and is a valid saved schedule', () => {
  assert.equal(BACKUP_SCHEDULE.enabled, true); assert.equal(BACKUP_SCHEDULE.mode, 'interval'); assert.equal(BACKUP_SCHEDULE.intervalMinutes, 60); assert.equal(BACKUP_SCHEDULE.retryMinutes, 15);
  assert.doesNotThrow(() => validateRegistrySchedule({ ...BACKUP_SCHEDULE, days: [...BACKUP_SCHEDULE.days], times: [...BACKUP_SCHEDULE.times] }));
});

test('plan lists every drive, marks locked ones as needing unlock and shows last and next sync', async () => {
  const f = fixture([drive('main', 'Work vault'), drive('s2', 'Tax records', { locked: true }), drive('s3', 'Work vault')],
    { saved: { main: { repository: 'yourname/mfe-work-vault', visibility: 'public', schedule: { ...BACKUP_SCHEDULE, days: [...BACKUP_SCHEDULE.days], times: ['02:00'] } } } });
  const { drives, running } = await f.backup.plan();
  assert.equal(running, false); assert.equal(drives.length, 3);
  assert.equal(drives[0].ineligibleReason, null); assert.equal(drives[0].configured.repository, 'yourname/mfe-work-vault');
  assert.equal(drives[0].lastSync, '2026-11-16T14:00:00.000Z'); assert.equal(drives[0].nextSync, '2026-11-16T15:00:00.000Z');
  assert.equal(drives[1].ineligibleReason, 'locked'); assert.equal(drives[2].suffix, 'mfe-work-vault-2');
  const remote = await fixture([drive('x', 'Remote', { transport: 'privateGit' }), drive('y', 'Empty', { storageDir: '' })]).backup.plan();
  assert.deepEqual(remote.drives.map(item => item.ineligibleReason), ['not-folder', 'no-storage']);
});

test('one click: creates public repositories, enables the hourly schedule, syncs each drive and reports per-drive results', async () => {
  const f = fixture([drive('main', 'Work vault'), drive('s2', 'Family photos')]);
  const started = await f.backup.start({ sessionIds: ['main', 's2'], names: { s2: 'mfe-photos' } });
  assert.equal(started.phase, 'running'); assert.equal(started.drives[0].repository, 'yourname/mfe-work-vault'); assert.equal(started.drives[1].repository, 'yourname/mfe-photos');
  const result = await f.finish();
  assert.equal(result.phase, 'finished'); assert.deepEqual(result.drives.map(row => row.state), ['done', 'done']);
  assert.deepEqual(f.calls.map(call => call.slice(0, 2).join(':')), ['ensure:yourname/mfe-work-vault', 'configure:main', 'sync:main', 'ensure:yourname/mfe-photos', 'configure:s2', 'sync:s2']);
  const configure = f.calls.find(call => call[0] === 'configure')[2];
  assert.equal(configure.visibility, 'public'); assert.equal(configure.schedule.enabled, true); assert.equal(configure.schedule.intervalMinutes, 60); assert.equal(configure.schedule.retryMinutes, 15);
  assert.equal(result.drives[0].lastSync, '2026-11-16T14:00:00.000Z'); assert.equal(result.drives[0].nextSync, '2026-11-16T15:00:00.000Z'); assert.match(result.drives[0].digest, /^sha256:/);
});

test('a failing drive is reported precisely and never stops the others', async () => {
  const f = fixture([drive('main', 'Work vault'), drive('s2', 'Family photos')], {
    ensure: repository => { if (repository.endsWith('work-vault')) { const error = Error('Docker Hub does not allow this account to create yourname/mfe-work-vault.'); error.code = 'REPOSITORY_CREATE_DENIED'; throw error; } return { repository }; } });
  await f.backup.start({ sessionIds: ['main', 's2'] });
  const result = await f.finish();
  assert.equal(result.drives[0].state, 'failed'); assert.equal(result.drives[0].error.code, 'REPOSITORY_CREATE_DENIED'); assert.match(result.drives[0].error.message, /does not allow/);
  assert.equal(result.drives[1].state, 'done'); assert.equal(f.calls.some(call => call[0] === 'sync' && call[1] === 'main'), false, 'no upload happens for a drive whose repository was not prepared');
  const sync = fixture([drive('main', 'Work vault')], { sync: () => { throw Error('Registry synchronization is incomplete. Local encrypted data was retained. Review the destination and retry.'); } });
  await sync.backup.start({ sessionIds: ['main'] }); const failed = await sync.finish();
  assert.equal(failed.drives[0].state, 'failed'); assert.equal(failed.drives[0].error.code, 'SYNC_FAILED');
});

test('an existing private destination keeps working unchanged: same repository, same visibility, no public creation', async () => {
  const saved = { main: { repository: 'oldteam/private-vault', visibility: 'private', schedule: { ...BACKUP_SCHEDULE, enabled: false, days: [0], times: ['03:00'] } } };
  const f = fixture([drive('main', 'Work vault')], { saved });
  await f.backup.start({ sessionIds: ['main'] }); const result = await f.finish();
  assert.equal(result.drives[0].state, 'done'); assert.equal(f.calls.some(call => call[0] === 'ensure'), false);
  const configure = f.calls.find(call => call[0] === 'configure')[2];
  assert.equal(configure.repository, 'oldteam/private-vault'); assert.equal(configure.visibility, 'private'); assert.equal(configure.schedule.enabled, true);
  const enabled = fixture([drive('main', 'Work vault')], { saved: { main: { repository: 'oldteam/private-vault', visibility: 'private', schedule: { ...BACKUP_SCHEDULE, intervalMinutes: 240, days: [0], times: ['03:00'] } } } });
  await enabled.backup.start({ sessionIds: ['main'] }); await enabled.finish();
  assert.equal(enabled.calls.find(call => call[0] === 'configure')[2].schedule.intervalMinutes, 240, 'an enabled schedule the user chose is kept');
});

test('refusals: not signed in, locked drive, unknown drive, bad or duplicate names, a second concurrent run', async () => {
  const out = fixture([drive('main', 'Work vault')], { signedIn: { state: 'stale', reason: 'stored-sign-in-unverified' } });
  await assert.rejects(out.backup.start({ sessionIds: ['main'] }), error => error.code === 'SIGN_IN_REQUIRED');
  const unknownAccount = fixture([drive('main', 'Work vault')], { signedIn: { state: 'signed-in', account: null } });
  await assert.rejects(unknownAccount.backup.start({ sessionIds: ['main'] }), error => error.code === 'SIGN_IN_REQUIRED');
  const f = fixture([drive('main', 'Work vault'), drive('s2', 'Tax', { locked: true }), drive('s3', 'Other')]);
  await assert.rejects(f.backup.start({ sessionIds: ['nope'] }), error => error.code === 'INVALID_NAME');
  await assert.rejects(f.backup.start({ sessionIds: [] }), error => error.code === 'INVALID_NAME');
  await assert.rejects(f.backup.start({ sessionIds: ['main', 's3'], names: { main: 'same', s3: 'same' } }), error => error.code === 'INVALID_NAME');
  await assert.rejects(f.backup.start({ sessionIds: ['main'], names: { main: 'Bad Name' } }), error => error.code === 'INVALID_NAME');
  await f.backup.start({ sessionIds: ['s2', 'main'] }); await assert.rejects(f.backup.start({ sessionIds: ['main'] }), error => error.code === 'BUSY');
  const result = await f.finish(); assert.equal(result.drives[0].state, 'failed'); assert.equal(result.drives[0].error.code, 'LOCKED'); assert.equal(result.drives[1].state, 'done');
  assert.equal(f.calls.some(call => call[0] === 'sync' && call[1] === 's2'), false);
});

test('cancel stops before the next drive and asks the running synchronization to stop', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture([drive('main', 'Work vault'), drive('s2', 'Family photos')], { sync: async () => { await gate; return { verified: true, digest: 'sha256:' + 'b'.repeat(64) }; } });
  await f.backup.start({ sessionIds: ['main', 's2'] });
  for (let i = 0; i < 50 && f.backup.status().drives[0].state !== 'syncing'; i++) await new Promise(resolve => setImmediate(resolve));
  const cancelled = await f.backup.cancel(); assert.equal(cancelled.phase, 'running');
  assert.ok(f.calls.some(call => call[0] === 'cancel' && call[1] === 'main'));
  release(); const result = await f.finish();
  assert.equal(result.phase, 'cancelled'); assert.equal(result.drives[1].state, 'cancelled'); assert.equal(f.calls.some(call => call[0] === 'sync' && call[1] === 's2'), false);
});

test('request validation accepts only drive ids and registry-valid names', () => {
  assert.deepEqual(validateRequest('backupAllStart', { sessionIds: ['main'], names: { main: 'mfe-work' } }), { sessionIds: ['main'], names: { main: 'mfe-work' } });
  assert.deepEqual(validateRequest('backupAllStart', { sessionIds: ['main', 'abc-123'] }), { sessionIds: ['main', 'abc-123'], names: {} });
  for (const bad of [{}, { sessionIds: [] }, { sessionIds: ['main', 'main'] }, { sessionIds: ['a b'] }, { sessionIds: ['main'], names: { main: 'Upper' } }, { sessionIds: ['main'], names: [] }, { sessionIds: ['main'], endpoint: 'http://x' }, { sessionIds: ['main'], repository: 'a/b' }])
    assert.throws(() => validateRequest('backupAllStart', bad), undefined, JSON.stringify(bad));
  for (const method of ['backupAllPlan', 'backupAllStatus', 'backupAllCancel', 'recheckRegistryLogin']) { assert.deepEqual(validateRequest(method, {}), {}); assert.throws(() => validateRequest(method, { extra: 1 })); }
});
