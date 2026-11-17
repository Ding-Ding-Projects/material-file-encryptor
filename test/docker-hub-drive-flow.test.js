import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { HUB_DRIVE_COPY } from '../src/renderer/features/docker-hub-drive/copy.js';
import {
  runCreateFlow, runOpenFlow, validateNewDrive, validateOpenDrive, suggestedRepository, CHIPS, chipMatches, chipCounts, searchRows, visibleRepositories,
  plainMatcher, regexMatcher, catalogProblem, repositoryProblemKey, errorKey, NEW_DRIVE_SCHEDULE, RESTORED_DRIVE_SCHEDULE, normalizeDriveName, DEFAULT_PART_SIZE_BYTES, allDrives
} from '../src/renderer/features/docker-hub-drive/model.js';

const DATA_ROOT = path.resolve('C:\\Users\\you\\AppData\\Roaming\\App\\Drives');
function fakeApi(overrides = {}) {
  const calls = [];
  const api = {
    calls,
    chooseFolder: async () => { calls.push(['chooseFolder']); return null; },
    hubDriveFolders: async () => { calls.push(['folders']); return { driveId: 'a1b2c3d4e5f60718', storageDir: path.join(DATA_ROOT, 'a1b2c3d4e5f60718', 'storage'), cacheDir: path.join(DATA_ROOT, 'a1b2c3d4e5f60718', 'cache'), ownerOnly: true }; },
    hubDriveFoldersDiscard: async id => { calls.push(['discard', id]); return { discarded: true }; },
    create: async options => { calls.push(['create', options]); return {}; },
    hubEnsureRepository: async repository => { calls.push(['ensure', repository]); return { repository, created: true, visibility: 'public' }; },
    configureRegistryStorage: async configuration => { calls.push(['configure', configuration]); return {}; },
    syncRegistryStorage: async () => { calls.push(['sync']); return {}; },
    hubRestoreSnapshot: async selection => { calls.push(['restore', selection]); return { state: 'done', result: { driveId: 'ffffeeeeddddcccc', storageDir: path.join(DATA_ROOT, 'ffffeeeeddddcccc', 'storage'), cacheDir: path.join(DATA_ROOT, 'ffffeeeeddddcccc', 'cache'), vaultId: 'a'.repeat(32), driveName: 'Work files', visibility: 'public' } }; },
    hubRestoreStatus: async () => ({ state: 'downloading', completedFiles: 1, completedBytes: 10 }),
    unlock: async options => { calls.push(['unlock', options]); return {}; },
    ...overrides
  };
  return api;
}
const draft = (extra = {}) => ({ repository: 'pat/material-file-encryptor-storage', driveName: 'Work files', driveLetter: 'M:', credentialMode: 'password', password: 'correct horse', confirmPassword: 'correct horse', ...extra });

test('creating a Docker Hub drive never asks for a folder and uses the host allocated paths', async () => {
  const api = fakeApi(); const steps = [];
  const result = await runCreateFlow({ api, draft: draft(), onStep: (step, status) => steps.push(`${step}:${status}`) });
  assert.equal(result.ok, true);
  assert.equal(api.calls.some(call => call[0] === 'chooseFolder'), false, 'no folder dialog is ever called');
  const create = api.calls.find(call => call[0] === 'create')[1];
  assert.ok(create.storageDir.startsWith(DATA_ROOT) && create.cacheDir.startsWith(DATA_ROOT), 'both folders are inside the application data area');
  assert.notEqual(create.storageDir, create.cacheDir);
  assert.equal(create.driveLetter, 'M:'); assert.equal(create.partSizeBytes, DEFAULT_PART_SIZE_BYTES); assert.equal(create.password, 'correct horse');
  assert.deepEqual(api.calls.map(call => call[0]), ['folders', 'create', 'ensure', 'configure', 'sync'], 'folders, drive, repository, destination and the first sync, in that order');
  assert.deepEqual(steps.filter(item => item.endsWith('done')), ['folders:done', 'vault:done', 'repository:done', 'destination:done', 'sync:done']);
});

test('the first sync is followed by an hourly schedule with the background task off', async () => {
  const api = fakeApi(); await runCreateFlow({ api, draft: draft() });
  const configure = api.calls.find(call => call[0] === 'configure')[1];
  assert.deepEqual(configure, { repository: 'pat/material-file-encryptor-storage', visibility: 'public', schedule: NEW_DRIVE_SCHEDULE });
  assert.equal(configure.schedule.enabled, true); assert.equal(configure.schedule.intervalMinutes, 60); assert.equal(configure.schedule.background, false);
  assert.ok(api.calls.findIndex(call => call[0] === 'configure') < api.calls.findIndex(call => call[0] === 'sync'), 'the destination is saved before the first sync');
});

test('a key file replaces the password and each new drive gets its own folders', async () => {
  const folders = []; let counter = 0;
  const api = fakeApi({ hubDriveFolders: async () => { const id = String(++counter).padStart(16, '0'); folders.push(id); return { driveId: id, storageDir: path.join(DATA_ROOT, id, 'storage'), cacheDir: path.join(DATA_ROOT, id, 'cache') }; } });
  await runCreateFlow({ api, draft: draft({ credentialMode: 'keyFile', keyFilePath: 'C:\\keys\\a.key', password: '' }) });
  await runCreateFlow({ api, draft: draft() });
  const [first, second] = api.calls.filter(call => call[0] === 'create').map(call => call[1]);
  assert.equal(first.keyFilePath, 'C:\\keys\\a.key'); assert.equal(Object.hasOwn(first, 'password'), false);
  assert.notEqual(first.storageDir, second.storageDir); assert.notEqual(first.cacheDir, second.cacheDir);
});

test('a drive that cannot be created discards its unused folders and a retry allocates again', async () => {
  let attempts = 0;
  const api = fakeApi({ create: async () => { if (++attempts === 1) throw Object.assign(Error('That drive letter is taken'), { code: 'X' }); return {}; } });
  const first = await runCreateFlow({ api, draft: draft() });
  assert.equal(first.ok, false); assert.equal(first.failedStep, 'vault'); assert.equal(first.created, false);
  assert.deepEqual(api.calls.filter(call => call[0] === 'discard'), [['discard', 'a1b2c3d4e5f60718']]);
  const second = await runCreateFlow({ api, draft: draft(), resume: first.resume });
  assert.equal(second.ok, true);
  assert.equal(api.calls.filter(call => call[0] === 'folders').length, 2, 'a fresh allocation after the discard');
});

test('a later failure keeps the created drive and resumes from the failed step only', async () => {
  let syncs = 0;
  const api = fakeApi({ syncRegistryStorage: async () => { api.calls.push(['sync']); if (++syncs === 1) throw Object.assign(Error('down'), { code: 'PROVIDER_UNAVAILABLE' }); return {}; } });
  const first = await runCreateFlow({ api, draft: draft() });
  assert.equal(first.ok, false); assert.equal(first.created, true); assert.equal(first.failedStep, 'sync');
  assert.equal(api.calls.some(call => call[0] === 'discard'), false, 'a created drive is never discarded');
  const before = api.calls.length;
  const second = await runCreateFlow({ api, draft: draft(), resume: first.resume });
  assert.equal(second.ok, true);
  assert.deepEqual(api.calls.slice(before).map(call => call[0]), ['sync'], 'only the failed step runs again');
  assert.equal(api.calls.filter(call => call[0] === 'create').length, 1);
});

test('a repository the account may not create stops before the destination and names the problem', async () => {
  const api = fakeApi({ hubEnsureRepository: async () => { throw Object.assign(Error('no'), { code: 'REPOSITORY_CREATE_DENIED' }); } });
  const result = await runCreateFlow({ api, draft: draft() });
  assert.equal(result.failedStep, 'repository'); assert.equal(errorKey(result.error), 'errDenied');
  assert.equal(api.calls.some(call => call[0] === 'configure' || call[0] === 'sync'), false);
});

test('opening restores into the automatic location, unlocks, then links the repository with the schedule off', async () => {
  const api = fakeApi(); const progress = [];
  const result = await runOpenFlow({ api, draft: { repository: 'pat/mfe-storage', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'pw' }, onProgress: value => progress.push(value), pollMs: 1, setTimer: (fn) => { fn(); return 1; }, clearTimer: () => {} });
  assert.equal(result.ok, true);
  assert.equal(api.calls.some(call => call[0] === 'chooseFolder'), false);
  assert.deepEqual(api.calls[0], ['restore', { repository: 'pat/mfe-storage', digest: 'sha256:' + 'c'.repeat(64), location: 'automatic' }]);
  const unlock = api.calls.find(call => call[0] === 'unlock')[1];
  assert.ok(unlock.storageDir.startsWith(DATA_ROOT) && unlock.cacheDir.startsWith(DATA_ROOT));
  assert.equal(unlock.driveName, 'Work files'); assert.equal(unlock.driveLetter, 'N:');
  assert.deepEqual(api.calls.at(-1), ['configure', { repository: 'pat/mfe-storage', visibility: 'public', schedule: RESTORED_DRIVE_SCHEDULE }]);
  assert.equal(RESTORED_DRIVE_SCHEDULE.enabled, false);
});

test('the advanced option asks the host to open its folder chooser and nothing else changes', async () => {
  const api = fakeApi();
  await runOpenFlow({ api, draft: { repository: 'pat/mfe-storage', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'pw', location: 'choose' } });
  assert.equal(api.calls[0][1].location, 'choose');
  assert.equal(api.calls.some(call => call[0] === 'chooseFolder'), false, 'the renderer never opens a folder dialog itself');
});

test('a failed unlock keeps the restored drive so only the unlock is retried', async () => {
  let unlocks = 0;
  const api = fakeApi({ unlock: async () => { if (++unlocks === 1) throw Error('bad password'); return {}; } });
  const input = { repository: 'pat/mfe-storage', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'pw' };
  const first = await runOpenFlow({ api, draft: input });
  assert.equal(first.ok, false); assert.equal(first.failedStep, 'unlock'); assert.ok(first.restored);
  const second = await runOpenFlow({ api, draft: input, resume: first.resume });
  assert.equal(second.ok, true);
  assert.equal(api.calls.filter(call => call[0] === 'restore').length, 1, 'the snapshot is not downloaded twice');
});

test('a cancelled or failed restore is reported without touching unlock', async () => {
  const cancelled = fakeApi({ hubRestoreSnapshot: async () => ({ state: 'cancelled' }) });
  const result = await runOpenFlow({ api: cancelled, draft: { repository: 'pat/x1', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'pw' } });
  assert.equal(result.cancelled, true); assert.equal(cancelled.calls.some(call => call[0] === 'unlock'), false);
  const failed = fakeApi({ hubRestoreSnapshot: async () => ({ state: 'failed', error: { code: 'RESTORE_FAILED' } }) });
  const outcome = await runOpenFlow({ api: failed, draft: { repository: 'pat/x1', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'pw' } });
  assert.equal(outcome.ok, false); assert.equal(errorKey(outcome.error), 'restoreFailed');
});

test('validation names exactly what is missing', () => {
  assert.deepEqual(validateNewDrive(draft()), []);
  assert.deepEqual(validateNewDrive(draft({ repository: '' })), ['validationRepository']);
  assert.deepEqual(validateNewDrive(draft({ repository: 'Pat/Bad' })), ['validationRepositoryName']);
  assert.deepEqual(validateNewDrive(draft({ driveName: 'a/b', driveLetter: '', password: '' })), ['validationName', 'validationLetter', 'validationPassword']);
  assert.deepEqual(validateNewDrive(draft({ confirmPassword: 'other' })), ['validationMatch']);
  assert.deepEqual(validateNewDrive(draft({ credentialMode: 'keyFile', keyFilePath: '' })), ['validationPassword']);
  assert.deepEqual(validateOpenDrive({ repository: 'pat/mfe-storage', digest: 'sha256:' + 'c'.repeat(64), driveLetter: 'N:', credentialMode: 'password', password: 'x' }), []);
  assert.deepEqual(validateOpenDrive({ repository: '', driveLetter: '', credentialMode: 'password', password: '' }), ['validationRepository', 'validationLetter', 'validationPassword']);
  assert.equal(normalizeDriveName(' Work files '), 'Work files'); assert.equal(normalizeDriveName('x'.repeat(33)), null);
});

const repo = (id, drives = [], extra = {}) => ({ id, namespace: id.split('/')[0], name: id.split('/')[1], visibility: 'public', lastPushed: null, size: null, scan: 'done', error: null, drives, unreadable: 0, ...extra });
const drive = (id, name = null) => ({ id: id.repeat(64).slice(0, 64), shortId: id.repeat(8), name, lastBackup: '2026-11-17T10:00:00.000Z', snapshots: 3, bytes: 1000, devices: 1, revisions: [], latest: null });

test('the repository is proposed from the signed-in account and says when it already holds drives', () => {
  assert.deepEqual(suggestedRepository('pat', []), { repository: 'pat/material-file-encryptor-storage', exists: false, driveCount: 0, visibility: 'public' });
  const known = suggestedRepository('pat', [repo('pat/material-file-encryptor-storage', [drive('a'), drive('b')], { visibility: 'private' })]);
  assert.equal(known.exists, true); assert.equal(known.driveCount, 2); assert.equal(known.visibility, 'private');
});

test('chips, plain search and regex search combine to the visible rows', () => {
  const list = [repo('pat/work', [drive('a', 'Work files')]), repo('pat/old', [], { visibility: 'private' }), repo('acme/shared', [drive('b', 'Photos'), drive('c')]), repo('pat/empty')];
  assert.deepEqual(CHIPS, ['all', 'drives', 'empty', 'public', 'private']);
  assert.deepEqual(chipCounts(list), { all: 4, drives: 2, empty: 2, public: 3, private: 1 });
  assert.equal(chipMatches('drives', list[0]), true);
  const rows = searchRows(list);
  assert.ok(rows.some(row => row.id === 'pat/work' && row.text === 'Work files'), 'drive names are searchable');
  const ids = matcher => matcher(rows).map(row => row.id);
  assert.deepEqual(visibleRepositories(list, 'all', ids(plainMatcher('photos'))).map(item => item.id), ['acme/shared']);
  assert.deepEqual(visibleRepositories(list, 'drives', null).map(item => item.id), ['pat/work', 'acme/shared']);
  assert.deepEqual(visibleRepositories(list, 'private', null).map(item => item.id), ['pat/old']);
  assert.deepEqual(visibleRepositories(list, 'public', ids(regexMatcher('^pat/(work|empty)'))).map(item => item.id), ['pat/work', 'pat/empty']);
  assert.deepEqual(visibleRepositories(list, 'all', ids(regexMatcher('\\bPHOTOS\\b'))).map(item => item.id), ['acme/shared'], 'regex is case-insensitive by default');
  assert.equal(regexMatcher('(unclosed'), null, 'an invalid pattern is reported, not thrown');
  assert.deepEqual(visibleRepositories(list, 'all', []).map(item => item.id), [], 'a search with no matches shows nothing');
  assert.equal(allDrives(list).length, 3);
});

test('problems map to plain messages for signed out, offline and per repository failures', () => {
  assert.equal(catalogProblem({ phase: 'failed', reason: 'SIGN_IN_REQUIRED' }), 'problemSignedOut');
  assert.equal(catalogProblem({ phase: 'failed', reason: 'PROVIDER_UNAVAILABLE' }), 'problemOffline');
  assert.equal(catalogProblem({ phase: 'failed', reason: 'ODD' }), 'problemOther');
  assert.equal(catalogProblem({ phase: 'done' }), null);
  for (const code of ['AUTHENTICATION_REQUIRED', 'PROVIDER_UNAVAILABLE', 'TIMEOUT', 'UNREADABLE_SNAPSHOTS', 'ODD']) assert.ok(HUB_DRIVE_COPY[repositoryProblemKey({ code })]);
  assert.equal(repositoryProblemKey(null), null);
});

test('every message key used by the model exists in English and Cantonese', () => {
  for (const key of ['validationName', 'validationLetter', 'validationPassword', 'validationMatch', 'validationRepository', 'validationRepositoryName', 'errSignIn', 'errDenied', 'errPrivate', 'errProvider', 'errBusy', 'errGeneric', 'restoreFailed', 'restoreNotFound', 'problemSignedOut', 'problemOffline', 'problemOther']) {
    assert.ok(Array.isArray(HUB_DRIVE_COPY[key]) && HUB_DRIVE_COPY[key].length === 2 && HUB_DRIVE_COPY[key].every(text => text && typeof text === 'string'), key);
  }
  for (const [key, [en, yue]] of Object.entries(HUB_DRIVE_COPY)) { assert.ok(en && yue, key); assert.ok([...en.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join() === [...yue.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(), `placeholders match in ${key}`); }
});
