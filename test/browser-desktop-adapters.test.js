import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createPublishProgressAdapter, DEFAULT_PUBLICATION_TARGETS} from '../src/main/browser-publish-adapter.js';
import {createExtensionStatusEnrollment} from '../src/main/browser-status-enrollment.js';
import {createBrowserPublishMediation} from '../src/main/browser-publish-mediation.js';
import {createBrowserStatusMediation} from '../src/main/browser-status-mediation.js';
import {createForgeWorkflow} from '../src/main/forge-workflow.js';

const request = (over = {}) => ({destination: 'discussion-comment', note: 'Imported 3 notes today.', links: ['https://example.com/a'], projectStatus: null, ...over});
const SECRET = 'ghp_' + 'A'.repeat(36);

// A fake forge that records calls and answers from a script keyed by the GraphQL operation name.
function fakeForge({account = true, discussions = [{id: 'D_abc123', title: DEFAULT_PUBLICATION_TARGETS.discussionTitle}], fail = false} = {}) {
  const calls = [];
  return {calls, async postNote({operation, variables}) {
    calls.push({query: operation.query, variables});
    if (fail) throw new Error('network ' + SECRET);
    if (!account) return {posted: false, reason: 'no-account'};
    if (operation.query.includes('discussions(')) return {posted: true, data: {repository: {discussions: {nodes: discussions}}}};
    if (operation.query.includes('addDiscussionComment')) return {posted: true, data: {addDiscussionComment: {comment: {id: 'DC_1'}}}};
    if (operation.query.includes('addProjectV2DraftIssue')) return {posted: true, data: {addProjectV2DraftIssue: {projectItem: {id: 'PVTI_1'}}}};
    if (operation.query.includes('updateProjectV2ItemFieldValue')) return {posted: true, data: {updateProjectV2ItemFieldValue: {projectV2Item: {id: 'PVTI_1'}}}};
    return {posted: true, data: {}};
  }};
}
const project = {projectId: 'PVT_abcd', itemId: 'PVTI_abcd', statusFieldId: 'PVTSSF_abcd', statusOptions: {todo: 'opt1', 'in-progress': 'opt2', done: 'opt3'}};

test('approved discussion comment posts once with the sanitized note and links', async () => {
  const forge = fakeForge(), publish = createPublishProgressAdapter({forge});
  assert.equal(await publish(request()), true);
  const comments = forge.calls.filter(call => call.query.includes('addDiscussionComment'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].variables.discussionId, 'D_abc123');
  assert.equal(comments[0].variables.body, 'Imported 3 notes today.\n\n- https://example.com/a');
  assert.equal(forge.calls.length, 2, 'one lookup and one comment');
});

test('no connected account answers unavailable and posts nothing', async () => {
  const forge = fakeForge({account: false});
  assert.equal(await createPublishProgressAdapter({forge})(request()), false);
  assert.equal(forge.calls.filter(call => call.query.includes('mutation')).length, 0);
});

test('a missing progress discussion or a transport failure is never approved', async () => {
  const missing = fakeForge({discussions: [{id: 'D_other', title: 'Something else'}]});
  assert.equal(await createPublishProgressAdapter({forge: missing})(request()), false);
  assert.equal(missing.calls.length, 1);
  const failing = fakeForge({fail: true});
  assert.equal(await createPublishProgressAdapter({forge: failing})(request()), false);
  assert.equal(await createPublishProgressAdapter({forge: null})(request()), false);
});

test('project destinations stay unavailable without a configured project and work with one', async () => {
  const bare = fakeForge();
  assert.equal(await createPublishProgressAdapter({forge: bare})(request({destination: 'publication-draft'})), false);
  assert.equal(await createPublishProgressAdapter({forge: bare})(request({destination: 'project-item-status', projectStatus: 'done'})), false);
  assert.equal(bare.calls.length, 0, 'no network call without a project target');
  const forge = fakeForge(), publish = createPublishProgressAdapter({forge, targets: {...DEFAULT_PUBLICATION_TARGETS, project}});
  assert.equal(await publish(request({destination: 'publication-draft'})), true);
  assert.equal(await publish(request({destination: 'project-item-status', projectStatus: 'done'})), true);
  assert.equal(forge.calls[1].variables.optionId, 'opt3');
  assert.equal(await publish(request({destination: 'project-item-status', projectStatus: 'done'}), {signal: AbortSignal.abort()}), false);
});

test('an unsanitized or malformed request is refused before any call', async () => {
  const forge = fakeForge(), publish = createPublishProgressAdapter({forge});
  assert.equal(await publish(request({note: 'token=' + SECRET})), false);
  assert.equal(await publish({destination: 'discussion-comment', note: 'x'}), false);
  assert.equal(forge.calls.length, 0);
});

test('the browser response carries only a fixed state word and no secret', async () => {
  const pair = {session: 'S'.repeat(43), expires: Date.now() + 60000};
  for (const forge of [fakeForge(), fakeForge({fail: true}), fakeForge({account: false})]) {
    const mediation = createBrowserPublishMediation({getPair: () => pair, isUnlocked: () => true, confirm: async () => true, publishProgress: createPublishProgressAdapter({forge})});
    const answer = await mediation.receive('origin', {type: 'publish-progress', session: pair.session, request: request()}, () => {});
    assert.deepEqual(Object.keys(answer).sort(), ['schemaVersion', 'state', 'type']);
    assert.ok(['approved', 'unavailable'].includes(answer.state));
    assert.equal(JSON.stringify(answer).includes(SECRET), false);
  }
  const rejecting = createBrowserPublishMediation({getPair: () => pair, isUnlocked: () => true, confirm: async () => false, publishProgress: createPublishProgressAdapter({forge: fakeForge()})});
  assert.equal((await rejecting.receive('origin', {type: 'publish-progress', session: pair.session, request: request()}, () => {})).state, 'rejected');
});

// The forge workflow transport, driven with a fake process runner.
const resolveTool = async name => path.resolve('synthetic-tools', name + '.exe');
function forgeFixture({accountsOutput}) {
  const calls = [];
  const service = createForgeWorkflow({resolveTool, credentialStorageCheck: async () => {}, env: {}, captureCredential: async () => Buffer.from('fixture_alice\n'),
    execute: async (file, args, options) => {
      calls.push({args, token: options.env.GH_TOKEN});
      if (args.includes('status')) return {code: 0, output: accountsOutput};
      if (args.includes('user')) return {code: 0, output: JSON.stringify({login: 'alice'})};
      if (args.includes('graphql')) return {code: 0, output: JSON.stringify({data: {ok: true}})};
      return {code: 0, output: ''};
    }});
  return {service, calls};
}
const operation = {query: 'mutation($body:String!){x(body:$body){id}}'};

test('forge postNote sends variables as separate arguments and keeps the credential in the child environment only', async t => {
  const {service, calls} = forgeFixture({accountsOutput: 'Logged in to github.com account alice (keyring)\n  - Active account: true\n'});
  t.after(() => service.close());
  const result = await service.postNote({operation, variables: {body: 'hello $(rm) "quoted"'}});
  assert.deepEqual(result, {posted: true, data: {ok: true}});
  const graphql = calls.find(call => call.args.includes('graphql'));
  assert.ok(graphql.args.includes('body=hello $(rm) "quoted"'));
  assert.equal(graphql.token, 'fixture_alice');
  assert.equal(calls.some(call => call.args.some(arg => String(arg).includes('fixture_alice'))), false);
});

test('forge postNote with no active account makes no graphql call', async t => {
  const {service, calls} = forgeFixture({accountsOutput: 'Logged in to github.com account alice (keyring)\n  - Active account: false\n'});
  t.after(() => service.close());
  assert.deepEqual(await service.postNote({operation, variables: {body: 'x'}}), {posted: false, reason: 'no-account'});
  assert.equal(calls.some(call => call.args.includes('graphql')), false);
});

test('forge postNote surfaces transport errors without echoing them', async t => {
  const service = createForgeWorkflow({resolveTool, credentialStorageCheck: async () => {}, env: {}, captureCredential: async () => Buffer.from('fixture_alice\n'),
    execute: async (file, args) => args.includes('status') ? {code: 0, output: 'Logged in to github.com account alice (keyring)\n  - Active account: true\n'} : args.includes('user') ? {code: 0, output: JSON.stringify({login: 'alice'})} : {code: 1, output: SECRET}});
  t.after(() => service.close());
  await assert.rejects(service.postNote({operation, variables: {body: 'x'}}), error => !error.message.includes(SECRET));
  await assert.rejects(service.postNote({operation: {}, variables: {}}), /Invalid/);
});

// Status enrollment.
const report = {version: '1.2.3', connection: 'paired', lastRefresh: '2026-10-14T10:00Z', counts: {notes: 1, schedules: 2, tickets: 3, operations: 4}};
function fakeClient({degraded = false, ok = true} = {}) {
  const updates = [];
  return {updates, finished: [], closed: false, status() { return {degraded}; }, async update(value) { updates.push(value); return {ok}; }, async finish(state) { this.finished.push(state); return {ok: true}; }, close() { this.closed = true; }};
}

test('enrollment registers an independent client with only the bounded fields when the hub is configured', async () => {
  const client = fakeClient(), created = [];
  const enrollment = createExtensionStatusEnrollment({createClient: async options => { created.push(options); return client; }, clientOptions: {repository: 'o/r'}, sessionId: () => 'ext-1'});
  assert.equal(await enrollment.enroll(report), 'enrolled');
  assert.equal(await enrollment.enroll(report), 'enrolled');
  assert.equal(created.length, 1, 'one independent client is reused');
  assert.equal(created[0].sessionId, 'ext-1');
  assert.equal(created[0].exitHooks, false);
  assert.equal(client.updates[0].summary, 'Browser extension 1.2.3 paired. Notes 1, schedules 2, tickets 3, operations 4. Last refresh 2026-10-14T10:00Z.');
  await enrollment.close();
  assert.deepEqual(client.finished, ['waiting']);
  assert.equal(client.closed, true);
  assert.equal(await enrollment.enroll(report), 'unavailable');
});

test('enrollment answers unavailable when the hub is not configured, degraded or failing', async () => {
  assert.equal(await createExtensionStatusEnrollment({}).enroll(report), 'unavailable');
  assert.equal(await createExtensionStatusEnrollment({createClient: async () => fakeClient({degraded: true})}).enroll(report), 'unavailable');
  assert.equal(await createExtensionStatusEnrollment({createClient: async () => fakeClient({ok: false})}).enroll(report), 'unavailable');
  assert.equal(await createExtensionStatusEnrollment({createClient: async () => { throw new Error(SECRET); }}).enroll(report), 'unavailable');
});

test('the status mediator reports enrolled only through the configured enrollment', async () => {
  const pair = {session: 'S'.repeat(43), expires: Date.now() + 60000};
  const message = {type: 'enroll-status-client', session: pair.session, report};
  const live = createBrowserStatusMediation({getPair: () => pair, isUnlocked: () => true, enrollStatusClient: createExtensionStatusEnrollment({createClient: async () => fakeClient()}).enroll});
  assert.deepEqual(await live.receive('o', message, () => {}), {type: 'status-client', schemaVersion: 1, state: 'enrolled'});
  const bare = createBrowserStatusMediation({getPair: () => pair, isUnlocked: () => true, enrollStatusClient: createExtensionStatusEnrollment({}).enroll});
  assert.deepEqual(await bare.receive('o', message, () => {}), {type: 'status-client', schemaVersion: 1, state: 'unavailable'});
});
