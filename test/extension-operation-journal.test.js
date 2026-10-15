import test from 'node:test';
import assert from 'node:assert/strict';
import {journalKey, JOURNAL_LIMITS, bindingFor, beginOperation, markStep, finishOperation, readOperations, interrupted, planResume, resumeOperation, discardOperation, discardAll, journaledRequest, JOURNALED_REQUESTS} from '../browser-extension/operation-journal.js';
import {procedureList, PROCEDURE_IDS} from '../browser-extension/procedures.js';
import {mountOperations} from '../browser-extension/operations-panel.js';
import {extensionOperations, journaledSend, trackExport} from '../browser-extension/extension-operations.js';

const store = () => { const values = new Map(); return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)}; };
const binding = bindingFor('0.1.0', 'a'.repeat(40));
const begin = (storage, overrides = {}) => beginOperation(storage, {kind: 'export', owner: 'page-one', binding, param: 'json', steps: [{id: 'build', destructive: false}, {id: 'save', destructive: false}], now: 1000, id: 'op-1', ...overrides});

test('an operation is recorded with fixed words only and steps only move forward', () => {
  const s = store();
  const {operation} = begin(s);
  assert.deepEqual(operation.steps.map(step => step.state), ['pending', 'pending']);
  markStep(s, 'op-1', 'build', 'done', 1100);
  markStep(s, 'op-1', 'build', 'started', 1200);
  assert.equal(readOperations(s)[0].steps[0].state, 'done', 'a finished step never goes back');
  const raw = s.values.get(journalKey);
  assert.ok(!/http|[\\/]|secret|password/i.test(raw.replace(/"[a-z-]+":/g, '')), 'no link, path or secret-looking text');
  assert.equal(finishOperation(s, 'op-1'), true);
  assert.equal(s.values.has(journalKey), false);
});

test('invalid kinds, odd ids, oversized step lists and a full journal are refused', () => {
  const s = store();
  assert.ok(begin(s, {kind: 'free-text'}).error);
  assert.ok(begin(s, {id: 'Has Space'}).error);
  assert.ok(begin(s, {param: 'C:/private/file.txt'}).error);
  assert.ok(begin(s, {steps: Array.from({length: 7}, (_, i) => ({id: 'step-' + i}))}).error);
  assert.ok(begin(s, {binding: {version: '1', commit: null}}).error);
  for (let i = 0; i < JOURNAL_LIMITS.operations; i++) assert.ok(begin(s, {id: 'op-' + i}).operation);
  assert.match(begin(s, {id: 'op-extra'}).error, /Resolve the unfinished/);
});

test('a damaged or tampered record reads as empty instead of being trusted', () => {
  const s = store();
  begin(s);
  const good = JSON.parse(s.values.get(journalKey));
  for (const bad of ['{', '[]', JSON.stringify({...good, schemaVersion: 2}), JSON.stringify({...good, extra: 1}), JSON.stringify({schemaVersion: 1, operations: [{...good.operations[0], kind: 'delete-everything'}]}), JSON.stringify({schemaVersion: 1, operations: [{...good.operations[0], steps: [{id: 'save', destructive: false, state: 'weird'}]}]}), 'x'.repeat(JOURNAL_LIMITS.bytes + 1)]) {
    s.values.set(journalKey, bad);
    assert.deepEqual(readOperations(s), []);
  }
});

test('only operations left by a page that is gone and silent count as interrupted', () => {
  const s = store();
  begin(s);
  assert.deepEqual(interrupted(s, {owner: 'page-one', now: 1000 + JOURNAL_LIMITS.staleMs + 5}), [], 'the page that owns it is still alive');
  assert.deepEqual(interrupted(s, {owner: 'page-two', now: 1000 + 10}), [], 'another page, but recently updated: still running there');
  assert.equal(interrupted(s, {owner: 'page-two', now: 1000 + JOURNAL_LIMITS.staleMs}).length, 1);
});

test('resume skips finished steps and never replays a destructive step whose result is unknown', async () => {
  const s = store();
  beginOperation(s, {kind: 'converter-enqueue', owner: 'old', binding, steps: [{id: 'prepare', destructive: false}, {id: 'request', destructive: true}, {id: 'save', destructive: false}], id: 'op-2', now: 1});
  markStep(s, 'op-2', 'prepare', 'done');
  markStep(s, 'op-2', 'request', 'started');
  const plan = planResume(readOperations(s)[0], binding);
  assert.deepEqual(plan, {ok: true, done: ['prepare'], pending: ['save'], unconfirmed: ['request']});
  const ran = [];
  const result = await resumeOperation(s, 'op-2', {binding, owner: 'new', run: async step => { ran.push(step); }});
  assert.deepEqual(ran, ['save'], 'only the pending step ran');
  assert.deepEqual(result, {ok: true, ran: ['save'], skipped: ['prepare'], unconfirmed: ['request']});
  assert.deepEqual(readOperations(s), [], 'the record closes after the resume');
});

test('resume is refused when the build changed, and the record is kept for discarding', async () => {
  const s = store();
  begin(s);
  for (const other of [bindingFor('0.2.0', 'a'.repeat(40)), bindingFor('0.1.0', 'b'.repeat(40)), bindingFor('0.1.0', null)]) {
    let ran = 0;
    const result = await resumeOperation(s, 'op-1', {binding: other, owner: 'new', run: async () => { ran++; }});
    assert.deepEqual(result, {ok: false, reason: 'binding-changed'});
    assert.equal(ran, 0);
  }
  assert.equal(readOperations(s).length, 1);
  assert.equal(discardOperation(s, 'op-1'), true);
  assert.equal(readOperations(s).length, 0);
});

test('a step that fails during resume stops the run and stays recorded', async () => {
  const s = store();
  begin(s);
  const result = await resumeOperation(s, 'op-1', {binding, owner: 'new', run: async step => { if (step === 'save') throw new Error('x'); }});
  assert.equal(result.ok, false);
  assert.equal(result.step, 'save');
  const kept = readOperations(s)[0];
  assert.deepEqual(kept.steps.map(step => step.state), ['done', 'started']);
});

test('discard all clears the journal without sending anything', () => {
  const s = store();
  begin(s);
  begin(s, {id: 'op-2'});
  assert.equal(discardAll(s), true);
  assert.deepEqual(readOperations(s), []);
});

test('a desktop request leaves a record while in flight, closes on a definite answer and stays on an error', async () => {
  const s = store();
  let during = null;
  const answer = {schemaVersion: 1, state: 'changed'};
  await journaledRequest(s, async () => { during = readOperations(s); return answer; }, {type: 'element-lock-set', target: 'notes', locked: true}, {owner: 'p', binding});
  assert.equal(during.length, 1);
  assert.equal(during[0].steps[0].state, 'started');
  assert.equal(during[0].param, 'notes');
  assert.deepEqual(readOperations(s), []);
  await journaledRequest(s, async () => ({error: 'did not complete'}), {type: 'element-lock-set', target: 'notes', locked: true}, {owner: 'p', binding});
  assert.equal(readOperations(s).length, 1, 'outcome unknown, so the record stays');
  await assert.rejects(journaledRequest(s, async () => { throw new Error('closed'); }, {type: 'school-mode-set', enabled: true}, {owner: 'p', binding}), /closed/);
  assert.equal(readOperations(s).length, 2);
  let direct = 0;
  await journaledRequest(s, async () => { direct++; return {}; }, {type: 'converter-list', cursor: null}, {owner: 'p', binding});
  assert.equal(direct, 1);
  assert.equal(readOperations(s).length, 2, 'read-only requests are not journaled');
});

test('the aggregator journals only the reviewed request types and tracks an export save', async () => {
  const s = store();
  await journaledSend(s, async () => ({error: 'x'}), {type: 'converter-enqueue', selection: '1'.repeat(36), adapterId: 'hex'}, {owner: 'p', binding});
  assert.equal(readOperations(s)[0].kind, 'converter-enqueue');
  const track = trackExport(s, {owner: 'p', binding, format: 'csv'});
  const exportOp = readOperations(s).find(op => op.kind === 'export');
  assert.deepEqual(exportOp.steps.map(step => step.state), ['done', 'started']);
  assert.equal(exportOp.param, 'csv');
  track.complete();
  assert.equal(readOperations(s).some(op => op.kind === 'export'), false);
  assert.deepEqual(Object.keys(extensionOperations).sort(), ['bindingFor', 'entriesFor', 'journaledSend', 'mount', 'newId', 'publicCopy', 'trackExport', 'trackRequest']);
});

test('procedures cover the six operations and report availability truthfully', () => {
  const state = {paired: false, changelogEntries: 0, interrupted: 0, provenance: null};
  const byId = list => Object.fromEntries(list.map(item => [item.id, item]));
  const off = byId(procedureList(state));
  assert.deepEqual(procedureList(state).map(item => item.id), [...PROCEDURE_IDS]);
  assert.deepEqual(Object.entries(off).filter(([, item]) => item.available).map(([id]) => id), ['pair']);
  for (const item of Object.values(off)) { assert.ok(item.steps.length >= 3); assert.ok(item.steps.every(step => step[0] && step[1])); assert.ok(item.title[0] && item.title[1]); }
  const on = byId(procedureList({paired: true, changelogEntries: 3, interrupted: 1, provenance: {sourceCommit: 'a'.repeat(40), sourceModified: false}}));
  assert.deepEqual(Object.values(on).map(item => item.available), [false, true, true, true, true, true]);
  assert.equal(on['verify-build'].note, null);
  const dirty = byId(procedureList({...state, provenance: {sourceCommit: 'a'.repeat(40), sourceModified: true}}));
  assert.equal(dirty['verify-build'].available, true);
  assert.match(dirty['verify-build'].note[0], /uncommitted/);
});

function fakeDocument() {
  const make = tag => ({tag, className: '', dataset: {}, children: [], attrs: {}, listeners: {}, textContent: '', disabled: false, id: '',
    append(...kids) { this.children.push(...kids); }, replaceChildren(...kids) { this.children = kids; },
    setAttribute(name, value) { this.attrs[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; },
    get allText() { return this.textContent + this.children.map(child => child.allText).join(' '); }});
  const doc = {createElement: make};
  const root = make('div');
  root.ownerDocument = doc;
  return root;
}
const walk = (node, visit) => { visit(node); node.children.forEach(child => walk(child, visit)); };
const find = (root, predicate) => { const found = []; walk(root, node => { if (predicate(node)) found.push(node); }); return found; };

function panel({connection = true, send = async () => ({schemaVersion: 1, state: 'unavailable'}), storage = store(), binding: bound = binding, verify, resume} = {}) {
  const root = fakeDocument(), calls = [];
  const view = mountOperations(root, {root, storage, now: () => 1000 + JOURNAL_LIMITS.staleMs * 2, label: (node, pair) => { node.textContent = pair[0]; }, getConnection: () => connection, getBinding: () => bound, getOwner: () => 'page-new',
    getProcedureState: () => ({paired: connection === true, changelogEntries: 2, interrupted: 0, provenance: null}),
    getReportInput: () => ({version: '0.1.0', lastRefreshAt: new Date('2026-10-14T09:30:45Z'), counts: {notes: 2, schedules: 1, tickets: 0, operations: 0}}),
    send: async message => { calls.push(message); return send(message); }, verify: async kind => { calls.push({verify: kind}); return verify?.(kind); }, resume});
  return {root, view, calls, storage};
}

test('the panel lists procedures and Status Hub enrollment starts as not enrolled', () => {
  const {root, view} = panel({connection: null});
  assert.equal(find(root, node => node.className === 'ops-card').length, 6);
  assert.equal(find(root, node => node.id === 'hub-enrollment-state')[0].textContent, 'Not enrolled');
  assert.equal(view.enrollmentState(), 'not-enrolled');
  const button = find(root, node => node.tag === 'md-outlined-button')[0];
  assert.equal(button.disabled, true, 'enrollment needs a pairing');
});

test('enrolling sends only the bounded report and shows the desktop answer, or unavailable', async () => {
  for (const [reply, expected] of [[{schemaVersion: 1, state: 'enrolled'}, 'enrolled'], [{schemaVersion: 1, state: 'pending'}, 'pending'], [{schemaVersion: 1, state: 'unavailable'}, 'unavailable'], [{error: 'x'}, 'unavailable'], [{schemaVersion: 1, state: 'root'}, 'unavailable'], [{paired: false}, 'unavailable']]) {
    const {root, view, calls} = panel({send: async () => reply});
    const button = find(root, node => node.tag === 'md-outlined-button' && !node.disabled).pop();
    await button.listeners.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(view.enrollmentState(), expected);
    assert.deepEqual(calls, [{type: 'status-client-enroll', report: {version: '0.1.0', connection: 'paired', lastRefresh: '2026-10-14T09:30Z', counts: {notes: 2, schedules: 1, tickets: 0, operations: 0}}}]);
  }
  const unpaired = panel({connection: false});
  assert.equal(unpaired.view.enrollmentState(), 'not-enrolled');
});

test('interrupted operations offer Resume and Discard, and a changed build blocks Resume', async () => {
  const storage = store();
  begin(storage, {owner: 'page-old', now: 1});
  markStep(storage, 'op-1', 'build', 'done', 1);
  const ok = panel({storage, resume: {export: async step => { ok.calls.push({step}); }}});
  assert.equal(ok.view.interruptedCount(), 1);
  const [resume, discard] = find(ok.root, node => node.tag === 'md-outlined-button' || node.tag === 'md-text-button').filter(node => ['Resume', 'Discard'].includes(node.textContent));
  assert.equal(resume.disabled, false);
  await resume.listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(ok.calls.filter(call => call.step), [{step: 'save'}], 'only the pending step runs; the finished build step is skipped');
  assert.equal(readOperations(storage).length, 0);
  assert.equal(typeof discard.listeners.click, 'function');

  const changed = store();
  begin(changed, {owner: 'page-old', now: 1});
  const blocked = panel({storage: changed, binding: bindingFor('0.9.0', null)});
  const buttons = find(blocked.root, node => ['Resume', 'Discard'].includes(node.textContent));
  assert.equal(buttons.find(node => node.textContent === 'Resume').disabled, true);
  assert.match(blocked.root.allText, /different build/);
  buttons.find(node => node.textContent === 'Discard').listeners.click();
  assert.equal(readOperations(changed).length, 0);
});

test('an unconfirmed desktop request is checked, never replayed', async () => {
  const storage = store();
  beginOperation(storage, {kind: 'school-mode-set', owner: 'page-old', binding, steps: [{id: 'request', destructive: true}], id: 'op-3', now: 1});
  markStep(storage, 'op-3', 'request', 'started', 1);
  const replayed = [];
  const view = panel({storage, resume: {'school-mode-set': async step => { replayed.push(step); }}});
  await find(view.root, node => node.textContent === 'Resume')[0].listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(replayed, []);
  assert.deepEqual(view.calls, [{verify: 'school-mode-set'}]);
  assert.match(view.root.allText, /Not repeated/);
});
