import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubCatalog } from '../src/main/hub-catalog.js';

const dev = char => char.repeat(32), vault = char => char.repeat(64);
const tag = (device, revision, day, bytes = 1000) => ({ name: `mfe-${dev(device)}-${revision.repeat(32)}`, digest: 'sha256:' + (device + revision).repeat(32).slice(0, 64), last_updated: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, full_size: bytes });
const repo = (name, extra = {}) => ({ name, namespace: 'pat', is_private: false, last_updated: '2026-11-10T10:00:00Z', ...extra });

/** A fake Docker Hub API with real paging, plus a fake registry reader keyed by digest. */
function fake({ repositories = {}, tags = {}, namespaces, failTags = {}, identities = {} } = {}) {
  const requests = [];
  const hub = { async get(path, signal) {
    requests.push(path); signal?.throwIfAborted();
    const url = new URL(path, 'https://hub.docker.com'); const page = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('page_size') || 50);
    const slice = list => ({ results: list.slice((page - 1) * size, page * size), next: list.length > page * size ? 'next' : null });
    if (url.pathname === '/v2/repositories/namespaces') { if (!namespaces) { const error = Error('missing'); error.code = 'NOT_FOUND'; throw error; } return { namespaces }; }
    let match = /^\/v2\/namespaces\/([^/]+)\/repositories$/.exec(url.pathname);
    if (match) return slice(repositories[match[1]] ?? []);
    match = /^\/v2\/namespaces\/([^/]+)\/repositories\/([^/]+)\/tags$/.exec(url.pathname);
    if (match) { const key = `${match[1]}/${match[2]}`; if (failTags[key]) { const error = Error('boom'); error.code = failTags[key]; throw error; } return slice(tags[key] ?? []); }
    throw Error('unexpected ' + path);
  } };
  const reads = [];
  const reader = { async snapshotInfo(request) { reads.push(request); const info = identities[request.digest]; if (!info) throw Error('unreadable'); return info; } };
  return { hub, reader, requests, reads };
}
const catalogOf = (parts, extra = {}) => createHubCatalog({ hub: parts.hub, reader: parts.reader, account: async () => 'pat', ...extra });
async function finish(catalog) { catalog.start(); return catalog.settled(); }

test('lists the account and organization repositories with visibility, last pushed and size', async () => {
  const parts = fake({ namespaces: ['pat', 'studio'], repositories: { pat: [repo('mfe-storage', { storage_size: 5000 }), repo('notes', { is_private: true })], studio: [repo('assets', { namespace: 'studio' })] } });
  const result = await finish(catalogOf(parts));
  assert.equal(result.phase, 'done');
  assert.deepEqual(result.namespaces.map(item => [item.name, item.organization]), [['pat', false], ['studio', true]]);
  const byId = Object.fromEntries(result.repositories.map(item => [item.id, item]));
  assert.equal(byId['pat/notes'].visibility, 'private');
  assert.equal(byId['pat/mfe-storage'].visibility, 'public');
  assert.equal(byId['pat/mfe-storage'].size, 5000);
  assert.equal(byId['pat/mfe-storage'].lastPushed, '2026-11-10T10:00:00.000Z');
  assert.ok(byId['studio/assets']);
});

test('repository listing pages through the API and stops at the page bound', async () => {
  const many = Array.from({ length: 130 }, (_, index) => repo(`repo-${index}`));
  const parts = fake({ namespaces: [], repositories: { pat: many } });
  const result = await finish(catalogOf(parts, { limits: { pageSize: 50, repositoryPages: 2 } }));
  assert.equal(result.repositories.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(parts.requests.filter(path => path.includes('/repositories?')).length, 2, 'never asks for a third page');
  const all = await finish(catalogOf(fake({ namespaces: [], repositories: { pat: many } }), { limits: { pageSize: 50, repositoryPages: 5 } }));
  assert.equal(all.repositories.length, 130);
  assert.equal(all.truncated, false);
});

test('missing organization support is reported, not hidden', async () => {
  const parts = fake({ repositories: { pat: [repo('one')] } });
  const result = await finish(catalogOf(parts));
  assert.equal(result.organizationsUnavailable, true);
  assert.deepEqual(result.namespaces.map(item => item.name), ['pat']);
});

test('auto-detect groups snapshot tags per drive with name, last backup, snapshot count and size', async () => {
  const a = vault('a'), b = vault('b');
  const tags = { 'pat/mfe-storage': [tag('1', '1', 17, 4000), tag('1', '2', 12, 3000), tag('2', '3', 16, 9000), tag('3', '4', 5, 800), { name: 'latest', digest: 'sha256:' + 'f'.repeat(64) }] };
  const identities = {
    [tag('1', '1', 17).digest]: { vaultId: a, deviceId: dev('1'), driveName: 'Work files', bytes: 4000, fileCount: 3 },
    [tag('2', '3', 16).digest]: { vaultId: a, deviceId: dev('2'), driveName: null, bytes: 9000, fileCount: 3 },
    [tag('3', '4', 5).digest]: { vaultId: b, deviceId: dev('3'), driveName: null, bytes: 800, fileCount: 1 },
  };
  const parts = fake({ namespaces: [], repositories: { pat: [repo('mfe-storage'), repo('empty')] }, tags, identities });
  const result = await finish(catalogOf(parts));
  const row = result.repositories.find(item => item.id === 'pat/mfe-storage');
  assert.equal(row.scan, 'done');
  assert.equal(row.drives.length, 2);
  const [work, other] = row.drives;
  assert.equal(work.id, a); assert.equal(work.shortId, 'aaaaaaaa'); assert.equal(work.name, 'Work files');
  assert.equal(work.snapshots, 3); assert.equal(work.devices, 2);
  assert.equal(work.lastBackup, '2026-11-17T10:00:00.000Z');
  assert.equal(work.latest.digest, tag('1', '1', 17).digest);
  assert.equal(work.bytes, 4000);
  assert.deepEqual(work.revisions.map(item => item.updatedAt.slice(8, 10)), ['17', '16', '12']);
  assert.equal(other.id, b); assert.equal(other.name, null); assert.equal(other.snapshots, 1);
  assert.equal(result.repositories.find(item => item.id === 'pat/empty').drives.length, 0);
  assert.equal(parts.reads.length, 3, 'only one snapshot per device is read');
});

test('a failing repository only marks its own row and the rest of the list survives', async () => {
  const identities = { [tag('1', '1', 17).digest]: { vaultId: vault('a'), deviceId: dev('1'), driveName: null, bytes: 1, fileCount: 1 } };
  const parts = fake({ namespaces: [], repositories: { pat: [repo('good'), repo('broken'), repo('limited')] }, tags: { 'pat/good': [tag('1', '1', 17)] }, identities, failTags: { 'pat/broken': 'PROVIDER_UNAVAILABLE', 'pat/limited': 'AUTHENTICATION_REQUIRED' } });
  const result = await finish(catalogOf(parts));
  assert.equal(result.phase, 'done');
  const get = id => result.repositories.find(item => item.id === id);
  assert.equal(get('pat/good').drives.length, 1);
  assert.deepEqual(get('pat/broken').error, { code: 'PROVIDER_UNAVAILABLE' });
  assert.deepEqual(get('pat/limited').error, { code: 'AUTHENTICATION_REQUIRED' });
  assert.equal(get('pat/broken').scan, 'error');
  assert.equal(result.progress.done, 3);
});

test('an unreadable snapshot is counted and never invents a drive', async () => {
  const parts = fake({ namespaces: [], repositories: { pat: [repo('odd')] }, tags: { 'pat/odd': [tag('1', '1', 17)] }, identities: {} });
  const row = (await finish(catalogOf(parts))).repositories[0];
  assert.equal(row.drives.length, 0); assert.equal(row.unreadable, 1);
  assert.deepEqual(row.error, { code: 'UNREADABLE_SNAPSHOTS' });
});

test('scan bounds: tag pages, devices per repository, concurrency and the repository timeout', async () => {
  const tags = Array.from({ length: 12 }, (_, index) => tag(String(index).replace('10', 'a').replace('11', 'b').slice(-1), 'a', 1 + index));
  const parts = fake({ namespaces: [], repositories: { pat: [repo('big')] }, tags: { 'pat/big': tags } });
  const row = (await finish(catalogOf(parts, { limits: { pageSize: 5, tagPages: 2 } }))).repositories[0];
  assert.equal(row.tags.scanned, 10); assert.equal(row.tags.truncated, true);
  assert.equal(parts.requests.filter(path => path.includes('/tags?')).length, 2);

  const devices = Array.from({ length: 6 }, (_, index) => tag('0123456789abcdef'[index], '1', 10));
  const identities = Object.fromEntries(devices.map((item, index) => [item.digest, { vaultId: vault('0123456789abcdef'[index]), deviceId: dev('0'), driveName: null, bytes: 1, fileCount: 1 }]));
  const capped = fake({ namespaces: [], repositories: { pat: [repo('many')] }, tags: { 'pat/many': devices }, identities });
  const cappedRow = (await finish(catalogOf(capped, { limits: { devicesPerRepository: 4 } }))).repositories[0];
  assert.equal(capped.reads.length, 4); assert.equal(cappedRow.tags.truncated, true);

  let active = 0, peak = 0;
  const slow = fake({ namespaces: [], repositories: { pat: Array.from({ length: 8 }, (_, index) => repo(`r${index}`)) } });
  const original = slow.hub.get; slow.hub.get = async (path, signal) => { if (path.includes('/tags?')) { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; } return original(path, signal); };
  await finish(catalogOf(slow, { limits: { concurrency: 2 } }));
  assert.ok(peak <= 2 && peak >= 1, `peak concurrency ${peak}`);

  const stuck = fake({ namespaces: [], repositories: { pat: [repo('stuck'), repo('fine')] } });
  const base = stuck.hub.get; stuck.hub.get = (path, signal) => path.includes('/stuck/tags') ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) : base(path, signal);
  const result = await finish(catalogOf(stuck, { limits: { repositoryTimeoutMs: 20 } }));
  assert.equal(result.repositories.find(item => item.id === 'pat/stuck').error.code, 'TIMEOUT');
  assert.equal(result.repositories.find(item => item.id === 'pat/fine').scan, 'done');
  assert.equal(result.phase, 'done');
});

test('results are cached for the session and Refresh scans again', async () => {
  const parts = fake({ namespaces: [], repositories: { pat: [repo('one')] } });
  const catalog = catalogOf(parts);
  await finish(catalog); const first = parts.requests.length;
  catalog.start(); await catalog.settled(); assert.equal(parts.requests.length, first, 'a finished scan is served from the cache');
  catalog.start({ force: true }); await catalog.settled(); assert.ok(parts.requests.length > first);
});

test('partial results are visible while the scan runs', async () => {
  const parts = fake({ namespaces: [], repositories: { pat: [repo('a'), repo('b')] } });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const base = parts.hub.get; parts.hub.get = async (path, signal) => { if (path.includes('/b/tags')) await gate; return base(path, signal); };
  const catalog = catalogOf(parts, { limits: { concurrency: 1 } });
  catalog.start();
  for (let index = 0; index < 50 && catalog.snapshot().progress.done < 1; index++) await new Promise(resolve => setTimeout(resolve, 5));
  const partial = catalog.snapshot();
  assert.equal(partial.phase, 'scanning'); assert.equal(partial.progress.done, 1); assert.equal(partial.progress.total, 2);
  release(); assert.equal((await catalog.settled()).phase, 'done');
});

test('signed out and offline states are reported with a reason and an empty list', async () => {
  const signedOut = createHubCatalog({ hub: { get: async () => ({}) }, reader: { snapshotInfo: async () => ({}) }, account: async () => { const error = Error('x'); error.code = 'SIGN_IN_REQUIRED'; throw error; } });
  const out = await finish(signedOut); assert.equal(out.phase, 'failed'); assert.equal(out.reason, 'SIGN_IN_REQUIRED'); assert.deepEqual(out.repositories, []);
  const offline = createHubCatalog({ hub: { get: async () => ({}) }, reader: { snapshotInfo: async () => ({}) }, account: async () => { throw Error('network'); } });
  const down = await finish(offline); assert.equal(down.reason, 'PROVIDER_UNAVAILABLE');
  const listing = createHubCatalog({ hub: { get: async () => { const error = Error('down'); error.code = 'PROVIDER_UNAVAILABLE'; throw error; } }, reader: { snapshotInfo: async () => ({}) }, account: async () => 'pat' });
  const result = await finish(listing); assert.equal(result.phase, 'done'); assert.equal(result.namespaces[0].error.code, 'PROVIDER_UNAVAILABLE');
});

test('cancel stops the scan and keeps what was found', async () => {
  const parts = fake({ namespaces: [], repositories: { pat: [repo('a'), repo('b')] } });
  const base = parts.hub.get; parts.hub.get = (path, signal) => path.includes('/b/tags') ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) : base(path, signal);
  const catalog = catalogOf(parts, { limits: { concurrency: 2 } }); catalog.start();
  for (let index = 0; index < 50 && catalog.snapshot().progress.done < 1; index++) await new Promise(resolve => setTimeout(resolve, 5));
  catalog.cancel(); const result = await catalog.settled();
  assert.equal(result.phase, 'cancelled'); assert.equal(result.repositories.length, 2);
});

test('hostile repository, namespace and tag names are ignored', async () => {
  const parts = fake({ namespaces: ['../evil', 'good-org'], repositories: { pat: [repo('Bad Name'), repo('../x'), repo('fine')] }, tags: { 'pat/fine': [{ name: 'mfe-zz-yy', digest: 'sha256:' + '1'.repeat(64) }] } });
  const result = await finish(catalogOf(parts));
  assert.deepEqual(result.namespaces.map(item => item.name), ['pat', 'good-org']);
  assert.deepEqual(result.repositories.map(item => item.id), ['pat/fine']);
  assert.equal(result.repositories[0].drives.length, 0);
});
