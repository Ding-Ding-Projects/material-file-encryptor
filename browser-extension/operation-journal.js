// Durable step journal for multi-step extension operations.
//
// A record holds only fixed words and ids: an operation kind, the build it was
// started by, and the state of each step. It never holds file contents, paths,
// links, codes, session values or personal wording, so it is safe to keep in
// extension storage. After an interruption the workspace offers Resume or
// Discard. Resume never replays a step that already finished, never replays a
// destructive step whose outcome is unknown, and is refused outright when the
// build that wrote the record is not the build that is running now.

export const journalKey = 'mfe-extension-journal-v1';
export const JOURNAL_KINDS = Object.freeze(['export', 'converter-enqueue', 'school-mode-set', 'element-lock-set']);
export const STEP_STATES = Object.freeze(['pending', 'started', 'done']);
export const JOURNAL_LIMITS = Object.freeze({operations: 10, steps: 6, bytes: 4096, staleMs: 150000});

const ID = /^[a-z0-9-]{1,40}$/;
const WORD = /^[a-z0-9-]{0,24}$/;
const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/;
const COMMIT = /^[0-9a-f]{12}$/;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function validStep(step) {
  return exact(step, ['id', 'destructive', 'state']) && ID.test(step.id) && typeof step.destructive === 'boolean' && STEP_STATES.includes(step.state);
}
function validOperation(op) {
  return exact(op, ['id', 'kind', 'owner', 'param', 'binding', 'updatedAt', 'steps'])
    && ID.test(op.id) && JOURNAL_KINDS.includes(op.kind) && ID.test(op.owner) && WORD.test(op.param)
    && exact(op.binding, ['version', 'commit']) && VERSION.test(op.binding.version) && (op.binding.commit === null || COMMIT.test(op.binding.commit))
    && Number.isSafeInteger(op.updatedAt) && op.updatedAt > 0
    && Array.isArray(op.steps) && op.steps.length >= 1 && op.steps.length <= JOURNAL_LIMITS.steps && op.steps.every(validStep) && new Set(op.steps.map(step => step.id)).size === op.steps.length;
}

/** A source binding: the extension version plus the first twelve characters of the staged source commit, or null. */
export function bindingFor(version, sourceCommit) {
  return {version: String(version), commit: typeof sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(sourceCommit) ? sourceCommit.slice(0, 12) : null};
}

function load(storage) {
  try {
    const raw = storage?.getItem(journalKey);
    if (!raw) return [];
    if (raw.length > JOURNAL_LIMITS.bytes) return [];
    const value = JSON.parse(raw);
    if (!exact(value, ['schemaVersion', 'operations']) || value.schemaVersion !== 1 || !Array.isArray(value.operations) || value.operations.length > JOURNAL_LIMITS.operations) return [];
    return value.operations.every(validOperation) ? value.operations : [];
  } catch { return []; }
}
function save(storage, operations) {
  try {
    if (!operations.length) { storage.removeItem(journalKey); return true; }
    const text = JSON.stringify({schemaVersion: 1, operations});
    if (text.length > JOURNAL_LIMITS.bytes) return false;
    storage.setItem(journalKey, text);
    return true;
  } catch { return false; }
}

export function newId(random = globalThis.crypto) {
  const bytes = new Uint8Array(8);
  random.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Every unfinished operation on record, oldest first. A damaged record reads as empty. */
export function readOperations(storage) { return load(storage); }

/** Starts an operation. Every step begins pending. Returns {operation} or {error}. */
export function beginOperation(storage, {kind, owner, binding, steps, param = '', id = newId(), now = Date.now()}) {
  const operation = {id, kind, owner, param, binding, updatedAt: now, steps: (steps || []).map(step => ({id: step.id, destructive: step.destructive === true, state: 'pending'}))};
  if (!validOperation(operation)) return {error: 'The operation record is not valid.'};
  const operations = load(storage);
  if (operations.length >= JOURNAL_LIMITS.operations) return {error: 'Resolve the unfinished operations first.'};
  if (!save(storage, [...operations, operation])) return {error: 'The operation could not be recorded in this browser.'};
  return {operation};
}

const ORDER = {pending: 0, started: 1, done: 2};
/** Moves one step forward. A step never goes backwards, and a finished step never changes. */
export function markStep(storage, id, stepId, state, now = Date.now()) {
  const operations = load(storage), index = operations.findIndex(op => op.id === id);
  if (index < 0 || !STEP_STATES.includes(state)) return {error: 'Unknown operation.'};
  const step = operations[index].steps.find(item => item.id === stepId);
  if (!step) return {error: 'Unknown step.'};
  if (ORDER[state] > ORDER[step.state]) step.state = state;
  operations[index].updatedAt = now;
  if (!save(storage, operations)) return {error: 'The operation could not be recorded in this browser.'};
  return {operation: operations[index]};
}

export function finishOperation(storage, id) {
  const operations = load(storage), next = operations.filter(op => op.id !== id);
  if (next.length === operations.length) return false;
  return save(storage, next);
}
export const discardOperation = finishOperation;
export function discardAll(storage) { try { storage?.removeItem(journalKey); return true; } catch { return false; } }

/** Operations that a page which no longer exists left behind: another owner and no recent update. */
export function interrupted(storage, {owner, now = Date.now(), staleMs = JOURNAL_LIMITS.staleMs} = {}) {
  return load(storage).filter(op => op.owner !== owner && now - op.updatedAt >= staleMs);
}

/**
 * What a resume may do. Done steps are never listed. A destructive step that
 * was started but not finished has an unknown outcome and is reported for
 * checking, never replayed. A binding mismatch refuses everything.
 */
export function planResume(op, binding) {
  if (!validOperation(op)) return {ok: false, reason: 'invalid'};
  if (op.binding.version !== binding?.version || op.binding.commit !== binding?.commit) return {ok: false, reason: 'binding-changed'};
  return {
    ok: true,
    done: op.steps.filter(step => step.state === 'done').map(step => step.id),
    pending: op.steps.filter(step => step.state === 'pending' || step.state === 'started' && !step.destructive).map(step => step.id),
    unconfirmed: op.steps.filter(step => step.state === 'started' && step.destructive).map(step => step.id),
  };
}

/**
 * Resumes one operation. `run(stepId, op)` is awaited for each pending step in
 * order; a step that throws stops the run and stays recorded. Unconfirmed
 * destructive steps are handed back for checking and are never passed to `run`.
 */
export async function resumeOperation(storage, id, {binding, owner, run, now = Date.now()}) {
  const op = load(storage).find(item => item.id === id);
  if (!op) return {ok: false, reason: 'missing'};
  const plan = planResume(op, binding);
  if (!plan.ok) return plan;
  const operations = load(storage), index = operations.findIndex(item => item.id === id);
  operations[index].owner = owner;
  operations[index].updatedAt = now;
  save(storage, operations);
  const ran = [];
  for (const stepId of plan.pending) {
    markStep(storage, id, stepId, 'started', now);
    try { await run(stepId, op); } catch { return {ok: false, reason: 'step-failed', step: stepId, ran, unconfirmed: plan.unconfirmed}; }
    markStep(storage, id, stepId, 'done', now);
    ran.push(stepId);
  }
  finishOperation(storage, id);
  return {ok: true, ran, skipped: plan.done, unconfirmed: plan.unconfirmed};
}

/**
 * Opens a journal record for a desktop request that changes state. `settle(result)`
 * closes it on a definite answer from the desktop. An error answer, or a request
 * that threw before settle ran, leaves the record in place, because the desktop
 * may or may not have acted.
 */
export function trackRequest(storage, {type, fields = {}, owner, binding, now = Date.now}) {
  const spec = JOURNALED_REQUESTS[type];
  if (!spec) return {settle() {}};
  const begun = beginOperation(storage, {kind: spec.kind, owner, binding, steps: [{id: 'request', destructive: true}], param: spec.param?.(fields) || '', now: now()});
  const id = begun.operation?.id;
  if (id) markStep(storage, id, 'request', 'started', now());
  return {settle(result) { if (id && result && !result.error) { markStep(storage, id, 'request', 'done', now()); finishOperation(storage, id); } }};
}

/** Sends a message through a tracked request: the record is open while the request is in flight. */
export async function journaledRequest(storage, send, message, {owner, binding, now = Date.now}) {
  const track = trackRequest(storage, {type: message?.type, fields: message, owner, binding, now});
  const result = await send(message);
  track.settle(result);
  return result;
}

/** Which desktop requests are journaled, by message type. */
export const JOURNALED_REQUESTS = Object.freeze({
  'converter-enqueue': {kind: 'converter-enqueue'},
  'school-mode-set': {kind: 'school-mode-set'},
  'element-lock-set': {kind: 'element-lock-set', param: fields => (/^[a-z0-9-]{1,24}$/.test(fields?.target) ? fields.target : '')},
});
