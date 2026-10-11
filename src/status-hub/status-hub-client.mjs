// Status Hub agent client — the pre-made integration for JavaScript applications.
//
// Mirrors the validation performed by apps/status-hub/src/server.mjs so a request
// composed here is never rejected on shape. Every public method resolves to a typed
// result object and never throws or rejects; transport failures put the client into
// a degraded no-op mode instead of blocking the caller.

import { randomBytes } from 'node:crypto';
import { buildPrivateEmission, PRIVATE_EMISSION_VERSION } from './private-emission.mjs';

export const PROTOCOL = Object.freeze({
  DEFAULT_BASE_URL: 'https://uh.dewhui.uk',
  HEALTH_PATH: '/health',
  SESSIONS_PATH: '/api/agent/sessions',
  INGEST_TOKEN_HEADER: 'x-agent-ingest-token',
  SESSION_KEY_HEADER: 'x-session-key',
  OLDEST_SEQUENCE_HEADER: 'x-status-hub-oldest-sequence',
  PRIVATE_EMISSION_VERSION
});

// Server limits, copied from apps/status-hub/src/server.mjs. protocol-parity.mjs
// asserts each value still appears in the server source.
export const LIMITS = Object.freeze({
  MAX_BODY_BYTES: 65536,
  MAX_RESPONSE_BYTES: 524288,
  MAX_EVENTS: 5000,
  MAX_SESSIONS: 256,
  MAX_QUESTIONS_PER_SESSION: 100,
  MAX_EVIDENCE_ITEMS: 8,
  MAX_NEXT_GATES: 8,
  MAX_WORKTREES: 128,
  MAX_PROGRESS_STEPS: 10000,
  AGENT_MAX_ATTEMPTS: 60,
  AGENT_WINDOW_MS: 60000,
  TITLE_MAX: 160,
  REPOSITORY_MAX: 240,
  BRANCH_MAX: 160,
  SUMMARY_MAX: 2000,
  ASSUMPTION_MAX: 1600,
  VERIFIED_BASELINE_MAX: 400,
  MACHINE_MAX: 160,
  EVIDENCE_LABEL_MAX: 160,
  EVIDENCE_URL_MAX: 800,
  NEXT_GATE_MAX: 240,
  WORKTREE_PATH_MAX: 600,
  WORKTREE_BRANCH_MAX: 240,
  WORKTREE_COMMIT_MAX: 64,
  STEP_MAX: 240,
  QUESTION_ID_MAX: 80,
  QUESTION_PROMPT_MAX: 1000,
  QUESTION_DETAIL_MAX: 1200,
  QUESTION_OPTIONS_MAX: 8,
  PANIC_EVENT_ID_MAX: 80,
  PANIC_AFFECTED_MAX: 240,
  OPTION_ID_MAX: 60,
  OPTION_LABEL_MAX: 160,
  LOWLEVEL_TRANSPORT_MAX: 80,
  LOWLEVEL_ENDPOINT_LABEL_MAX: 160,
  LOWLEVEL_VERSION_MAX: 80,
  LOWLEVEL_HEARTBEAT_MAX: 40,
  LOWLEVEL_DIAGNOSTIC_MAX: 400,
  LOWLEVEL_COUNT_MAX: 10000,
  SESSION_KEY_MIN: 24,
  SESSION_KEY_LENGTH: 64,
  CLIENT_REQUESTS_PER_MINUTE: 50
});

export const SESSION_KEY_BYTES = 32;

export const STATUSES = Object.freeze(['running', 'waiting', 'blocked', 'landed', 'failed']);
export const TERMINAL_STATUSES = Object.freeze(['landed', 'failed', 'waiting']);
export const EVIDENCE_STATES = Object.freeze(['pending', 'running', 'verified', 'failed']);
export const PROGRESS_STATES = Object.freeze(['running', 'waiting', 'blocked', 'completed']);
export const LOWLEVEL_STATES = Object.freeze(['configured', 'reachable', 'unavailable', 'stale']);
export const PANIC_CONDITIONS = Object.freeze(['destroyed', 'intrusion_attempt', 'reset', 'unavailable', 'vocabulary_leak', 'approved_local_vocabulary_upload']);
export const PANIC_PRESERVATION_STATES = Object.freeze(['unknown', 'preserved', 'at_risk', 'not_applicable']);
export const PANIC_RECOVERY_ACTIONS = Object.freeze(['stop_writes_and_preserve', 'restore_from_preserved_commit', 'isolate_and_investigate', 'retry_when_path_available', 'scrub_public_surface', 'resume_after_local_upload_validation', 'monitor_after_resolution']);

const DEFAULTS = Object.freeze({
  timeoutMs: 10000,
  coalesceMs: 15000,
  heartbeatMs: 120000,
  probeRetryMs: 60000,
  finishDeadlineMs: 3000,
  maxSendAttempts: 3,
  backoffCapMs: 60000,
  clientRequestsPerMinute: LIMITS.CLIENT_REQUESTS_PER_MINUTE
});

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

function cleanString(value, max, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(CONTROL, '').trim().slice(0, max);
}

function boundedString(value, max, warnings, field, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    warnings.push({ field, reason: `dropped because it is not a string (maximum ${max} characters)` });
    return fallback;
  }
  const normalized = value.replace(CONTROL, '').trim();
  if (normalized.length > max) warnings.push({ field, reason: `clamped to ${max} characters` });
  if (normalized.length !== value.trim().length) warnings.push({ field, reason: 'removed control characters' });
  return normalized.slice(0, max);
}

function boundedId(value, max, warnings, field, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    warnings.push({ field, reason: `dropped because it is not a string (maximum ${max} characters)` });
    return fallback;
  }
  const normalized = value.replace(CONTROL, '').trim();
  if (normalized.length > max) warnings.push({ field, reason: `clamped to ${max} characters` });
  const cleaned = normalized.slice(0, max);
  if (!/^[A-Za-z0-9._:-]+$/.test(cleaned)) {
    warnings.push({ field, reason: 'dropped because it contains unsupported identifier characters' });
    return fallback;
  }
  return cleaned;
}

function ok(data = {}) { return { ok: true, ...data }; }
function fail(code, error, extra = {}) { return { ok: false, code, error, ...extra }; }

function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** Drops anything the server would drop, and records why, so no send is a surprise. */
export function clampSession(input, warnings = []) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (source !== input) warnings.push({ field: 'session', reason: 'expected an object; invalid input was dropped' });
  const out = {};
  const warn = (field, reason) => warnings.push({ field, reason });
  if (source.title !== undefined) out.title = boundedString(source.title, LIMITS.TITLE_MAX, warnings, 'title');
  if (source.repository !== undefined) out.repository = boundedString(source.repository, LIMITS.REPOSITORY_MAX, warnings, 'repository');
  if (source.branch !== undefined) out.branch = boundedString(source.branch, LIMITS.BRANCH_MAX, warnings, 'branch');
  if (source.status !== undefined) {
    if (STATUSES.includes(source.status)) out.status = source.status;
    else warn('status', `must be one of ${STATUSES.join('|')}`);
  }
  if (source.summary !== undefined) out.summary = boundedString(source.summary, LIMITS.SUMMARY_MAX, warnings, 'summary');
  if (source.assumption !== undefined) out.assumption = boundedString(source.assumption, LIMITS.ASSUMPTION_MAX, warnings, 'assumption');
  if (source.verifiedBaseline !== undefined) out.verifiedBaseline = boundedString(source.verifiedBaseline, LIMITS.VERIFIED_BASELINE_MAX, warnings, 'verifiedBaseline');
  if (source.machine !== undefined) out.machine = boundedString(source.machine, LIMITS.MACHINE_MAX, warnings, 'machine');
  if (source.evidence !== undefined) out.evidence = clampEvidence(source.evidence, warnings);
  if (source.nextGates !== undefined) out.nextGates = clampNextGates(source.nextGates, warnings);
  if (source.worktrees !== undefined) out.worktrees = clampWorktrees(source.worktrees, warnings);
  if (source.progress !== undefined) {
    const progress = clampProgress(source.progress, warnings);
    if (progress) out.progress = progress;
    else warn('progress', 'needs completedSteps<=totalSteps<=10000 or percent 0-100');
  }
  if (source.lowlevel !== undefined) {
    const lowlevel = clampLowlevel(source.lowlevel, warnings);
    if (lowlevel) out.lowlevel = lowlevel;
    else warn('lowlevel', `needs state in ${LOWLEVEL_STATES.join('|')} and an endpointLabel without ://, @, or control characters`);
  }
  return out;
}

export function clampPanicEvent(input, warnings = []) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const id = boundedId(source.id, LIMITS.PANIC_EVENT_ID_MAX, warnings, 'panic.id');
  const condition = PANIC_CONDITIONS.includes(source.condition) ? source.condition : '';
  const phase = source.phase === 'active' || source.phase === 'resolved' ? source.phase : '';
  const commit = boundedString(source.commit, LIMITS.WORKTREE_COMMIT_MAX, warnings, 'panic.commit');
  const detectedAt = boundedString(source.detectedAt, 40, warnings, 'panic.detectedAt');
  const preservationState = PANIC_PRESERVATION_STATES.includes(source.preservationState) ? source.preservationState : '';
  const recoveryAction = PANIC_RECOVERY_ACTIONS.includes(source.recoveryAction) ? source.recoveryAction : '';
  if (!id || !condition || !phase || source.verified !== true || !/^[a-f0-9]{7,64}$/i.test(commit) || !Number.isFinite(Date.parse(detectedAt)) || !preservationState || !recoveryAction) {
    warnings.push({ field: 'panic', reason: 'needs a supported id, condition, phase, verified=true, commit, timestamp, preservation state, and recovery action' });
    return null;
  }
  if (phase === 'active' && condition === 'approved_local_vocabulary_upload') {
    warnings.push({ field: 'panic.condition', reason: 'approved_local_vocabulary_upload is a resolved relief only' });
    return null;
  }
  let affected;
  if (source.affected?.safeForExternal === true) {
    const kind = source.affected.kind === 'path' || source.affected.kind === 'surface' ? source.affected.kind : '';
    const value = boundedString(source.affected.value, LIMITS.PANIC_AFFECTED_MAX, warnings, 'panic.affected.value');
    if (!kind || !value || kind === 'path' && (/^(?:[A-Za-z]:|[/\\])/.test(value) || value.split(/[\\/]+/).includes('..'))) return null;
    affected = { kind, value, safeForExternal: true };
  }
  return { id, condition, phase, verified: true, commit, detectedAt, preservationState, recoveryAction, ...(affected ? { affected } : {}) };
}

export function clampEvidence(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  if (!Array.isArray(value) && value !== undefined) warnings.push({ field: 'evidence', reason: 'expected an array; invalid input was dropped' });
  if (list.length > LIMITS.MAX_EVIDENCE_ITEMS) warnings.push({ field: 'evidence', reason: `only the first ${LIMITS.MAX_EVIDENCE_ITEMS} items are kept` });
  return list.slice(0, LIMITS.MAX_EVIDENCE_ITEMS).map((item, index) => {
    const field = `evidence[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push({ field, reason: 'needs an object with a label and URL' });
      return null;
    }
    const label = boundedString(item.label, LIMITS.EVIDENCE_LABEL_MAX, warnings, `${field}.label`);
    const url = cleanEvidenceUrl(item.url);
    if (typeof item.url === 'string' && item.url.trim().length > LIMITS.EVIDENCE_URL_MAX) warnings.push({ field: `${field}.url`, reason: `clamped to ${LIMITS.EVIDENCE_URL_MAX} characters before URL validation` });
    if (!label || !url) { warnings.push({ field, reason: 'needs a label and an http(s) URL without embedded credentials' }); return null; }
    return {
      id: boundedId(item.id, 60, warnings, `${field}.id`, `evidence-${index + 1}`),
      label,
      url,
      state: EVIDENCE_STATES.includes(item.state) ? item.state : (warnings.push({ field: `${field}.state`, reason: `defaulted to pending; must be one of ${EVIDENCE_STATES.join('|')}` }), 'pending')
    };
  }).filter(Boolean);
}

export function clampNextGates(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  if (!Array.isArray(value) && value !== undefined) warnings.push({ field: 'nextGates', reason: 'expected an array; invalid input was dropped' });
  if (list.length > LIMITS.MAX_NEXT_GATES) warnings.push({ field: 'nextGates', reason: `only the first ${LIMITS.MAX_NEXT_GATES} entries are kept` });
  const output = [];
  for (const [index, gate] of list.slice(0, LIMITS.MAX_NEXT_GATES).entries()) {
    const cleaned = boundedString(gate, LIMITS.NEXT_GATE_MAX, warnings, `nextGates[${index}]`);
    if (cleaned && !output.includes(cleaned)) output.push(cleaned);
  }
  return output;
}

export function clampWorktrees(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  if (!Array.isArray(value) && value !== undefined) warnings.push({ field: 'worktrees', reason: 'expected an array; invalid input was dropped' });
  if (list.length > LIMITS.MAX_WORKTREES) warnings.push({ field: 'worktrees', reason: `only the first ${LIMITS.MAX_WORKTREES} entries are kept` });
  return list.slice(0, LIMITS.MAX_WORKTREES).map((entry, index) => {
      const field = `worktrees[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        warnings.push({ field, reason: 'needs an object with a path, branch, commit, bytes, and dirty flag' });
        return null;
      }
      const path = boundedString(entry.path, LIMITS.WORKTREE_PATH_MAX, warnings, `${field}.path`);
      const branch = boundedString(entry.branch, LIMITS.WORKTREE_BRANCH_MAX, warnings, `${field}.branch`);
      const commit = boundedString(entry.commit, LIMITS.WORKTREE_COMMIT_MAX, warnings, `${field}.commit`);
      const bytes = Number(entry?.bytes);
      if (!path || !/^[a-f0-9]{7,64}$/i.test(commit) || !Number.isSafeInteger(bytes) || bytes < 0) {
        warnings.push({ field, reason: 'needs a path, a 7-64 hex commit, and a non-negative integer byte size' });
        return null;
      }
      return { path, branch, commit, bytes, dirty: entry.dirty === true };
    }).filter(Boolean);
}

function cleanEvidenceUrl(value) {
  const raw = cleanString(value, LIMITS.EVIDENCE_URL_MAX);
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export function clampProgress(value, warnings = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (value !== undefined) warnings.push({ field: 'progress', reason: 'expected an object' });
    return null;
  }
  const hasCounts = 'completedSteps' in value || 'totalSteps' in value;
  const base = {
    currentStep: boundedString(value.currentStep, LIMITS.STEP_MAX, warnings, 'progress.currentStep'),
    nextStep: boundedString(value.nextStep, LIMITS.STEP_MAX, warnings, 'progress.nextStep'),
    ...(PROGRESS_STATES.includes(value.state) ? { state: value.state } : value.state === undefined ? {} : (warnings.push({ field: 'progress.state', reason: `defaulted; must be one of ${PROGRESS_STATES.join('|')}` }), {}))
  };
  if (hasCounts) {
    const completedSteps = Number(value.completedSteps);
    const totalSteps = Number(value.totalSteps);
    if (!Number.isSafeInteger(completedSteps) || !Number.isSafeInteger(totalSteps)
      || completedSteps < 0 || totalSteps < 0 || totalSteps > LIMITS.MAX_PROGRESS_STEPS || completedSteps > totalSteps) return null;
    return { completedSteps, totalSteps, ...base };
  }
  const percent = Number(value.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return { percent: Math.round(percent), ...base };
}

export function clampLowlevel(value, warnings = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !LOWLEVEL_STATES.includes(value.state)) {
    if (value !== undefined) warnings.push({ field: 'lowlevel', reason: `needs state in ${LOWLEVEL_STATES.join('|')}` });
    return null;
  }
  const endpointLabel = boundedString(value.endpointLabel, LIMITS.LOWLEVEL_ENDPOINT_LABEL_MAX, warnings, 'lowlevel.endpointLabel');
  if (endpointLabel && /:\/\/|@|[\u0000-\u001f\u007f]/.test(endpointLabel)) return null;
  const count = (candidate) => {
    const parsed = Number(candidate);
    if (candidate === undefined || (Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= LIMITS.LOWLEVEL_COUNT_MAX)) return candidate === undefined ? null : parsed;
    warnings.push({ field: 'lowlevel.count', reason: `dropped; must be an integer from 0 to ${LIMITS.LOWLEVEL_COUNT_MAX}` });
    return null;
  };
  return {
    state: value.state,
    cheapHeadless: typeof value.cheapHeadless === 'boolean' ? value.cheapHeadless : null,
    transport: boundedString(value.transport, LIMITS.LOWLEVEL_TRANSPORT_MAX, warnings, 'lowlevel.transport'),
    endpointLabel,
    version: boundedString(value.version, LIMITS.LOWLEVEL_VERSION_MAX, warnings, 'lowlevel.version'),
    lastHeartbeat: boundedString(value.lastHeartbeat, LIMITS.LOWLEVEL_HEARTBEAT_MAX, warnings, 'lowlevel.lastHeartbeat'),
    headlessDesktopCount: count(value.headlessDesktopCount),
    headlessWindowCount: count(value.headlessWindowCount),
    diagnostic: boundedString(value.diagnostic, LIMITS.LOWLEVEL_DIAGNOSTIC_MAX, warnings, 'lowlevel.diagnostic')
  };
}

export function clampQuestion(input, warnings = []) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (source !== input) warnings.push({ field: 'question', reason: 'expected an object; invalid input was dropped' });
  const id = boundedId(source.id, LIMITS.QUESTION_ID_MAX, warnings, 'question.id');
  const prompt = boundedString(source.prompt, LIMITS.QUESTION_PROMPT_MAX, warnings, 'question.prompt');
  if (!id || !prompt) { warnings.push({ field: 'question', reason: 'needs an id and prompt' }); return null; }
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  if (!Array.isArray(source.options) && source.options !== undefined) warnings.push({ field: 'question.options', reason: 'expected an array; invalid input was dropped' });
  if (rawOptions.length > LIMITS.QUESTION_OPTIONS_MAX) warnings.push({ field: 'options', reason: `only the first ${LIMITS.QUESTION_OPTIONS_MAX} options are kept` });
  const options = rawOptions.slice(0, LIMITS.QUESTION_OPTIONS_MAX)
    .map((option, index) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) { warnings.push({ field: `question.options[${index}]`, reason: 'needs an object with an id and label' }); return null; }
      const optionId = boundedId(option.id || `option-${index + 1}`, LIMITS.OPTION_ID_MAX, warnings, `question.options[${index}].id`);
      const label = boundedString(option.label, LIMITS.OPTION_LABEL_MAX, warnings, `question.options[${index}].label`);
      if (!optionId || !label) { warnings.push({ field: `question.options[${index}]`, reason: 'needs a valid id and label' }); return null; }
      return { id: optionId, label };
    })
    .filter(Boolean)
    .filter((option) => option.id && option.label);
  const allowText = source.allowText !== false;
  if (!options.length && !allowText) { warnings.push({ field: 'question', reason: 'needs at least one option or a text answer' }); return null; }
  return { id, prompt, detail: boundedString(source.detail, LIMITS.QUESTION_DETAIL_MAX, warnings, 'question.detail'), options, allowText };
}

export const buildEvidence = clampEvidence;
export const buildNextGates = clampNextGates;
export const buildProgress = clampProgress;
export const buildLowlevel = clampLowlevel;
export const buildQuestion = clampQuestion;
export const buildSession = clampSession;

export function generateSessionKey() {
  return randomBytes(SESSION_KEY_BYTES).toString('hex');
}

function retryAfterMilliseconds(headers) {
  const raw = headers?.get?.('retry-after');
  if (raw === null || raw === undefined || raw === '') return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 60 * 60 * 1000));
  const at = Date.parse(String(raw));
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), 60 * 60 * 1000)) : null;
}

function readWithAbort(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  return new Promise((resolveRead, rejectRead) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const settle = (settler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      settler(value);
    };
    const onAbort = () => {
      try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* the body may already be closed */ }
      settle(rejectRead, Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    let pendingRead;
    try { pendingRead = reader.read(); } catch (error) { settle(rejectRead, error); return; }
    Promise.resolve(pendingRead).then((value) => settle(resolveRead, value), (error) => settle(rejectRead, error));
  });
}

function promiseWithAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const settle = (settler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      settler(value);
    };
    const onAbort = () => settle(rejectPromise, Object.assign(new Error('aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then((value) => settle(resolvePromise, value), (error) => settle(rejectPromise, error));
  });
}

async function readBoundedResponse(response, maxBytes, signal = null) {
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const next = await readWithAbort(reader, signal);
        if (next.done) break;
        const chunk = Buffer.from(next.value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* response is already bounded and unusable */ }
          return { ok: false, tooLarge: true };
        }
        chunks.push(chunk);
      }
      return { ok: true, text: Buffer.concat(chunks, total).toString('utf8') };
    } catch {
      try { await reader.cancel(); } catch { /* response is already closed */ }
      return { ok: false, aborted: signal?.aborted === true, error: signal?.aborted ? 'The hub response read was cancelled.' : 'The hub response body could not be read.' };
    }
  }
  try {
    const text = await promiseWithAbort(response.text(), signal);
    if (Buffer.byteLength(text, 'utf8') > maxBytes) return { ok: false, tooLarge: true };
    return { ok: true, text };
  } catch {
    return { ok: false, aborted: signal?.aborted === true, error: signal?.aborted ? 'The hub response read was cancelled.' : 'The hub response body could not be read.' };
  }
}

/** Probes the hub without credentials, exactly as the wiring instructions require. */
export async function resolveBaseUrl(options = {}) {
  const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const baseUrl = Object.prototype.hasOwnProperty.call(source, 'baseUrl')
    ? source.baseUrl
    : Object.prototype.hasOwnProperty.call(process.env, 'STATUS_HUB_URL')
      ? process.env.STATUS_HUB_URL
      : PROTOCOL.DEFAULT_BASE_URL;
  const fetchImpl = typeof source.fetchImpl === 'function' ? source.fetchImpl : fetch;
  const timeoutMs = source.timeoutMs ?? DEFAULTS.timeoutMs;
  const candidate = normalizeBaseUrl(baseUrl);
  if (!candidate) return fail('INVALID_BASE_URL', 'The hub base URL must be an http(s) URL without embedded credentials.', { baseUrl: '' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${candidate}${PROTOCOL.HEALTH_PATH}`, { signal: controller.signal, headers: { accept: 'application/json' } });
    const body = await readBoundedResponse(response, LIMITS.MAX_RESPONSE_BYTES);
    if (!body.ok) return fail(body.tooLarge ? 'RESPONSE_TOO_LARGE' : 'HEALTH_FAILED', body.tooLarge ? 'The hub health response exceeded the bounded size.' : body.error || `The hub health route answered HTTP ${response.status}.`, { baseUrl: candidate, status: response.status });
    if (!response.ok) return fail('HEALTH_FAILED', `The hub health route answered HTTP ${response.status}.`, { baseUrl: candidate, status: response.status });
    return ok({ baseUrl: candidate });
  } catch (error) {
    return fail('UNREACHABLE', `The hub at ${candidate} could not be reached: ${error?.name === 'AbortError' ? 'timeout' : error?.name || 'transport failure'}.`, { baseUrl: candidate, status: 0 });
  } finally {
    clearTimeout(timer);
  }
}

class MinuteBucket {
  constructor(limit) { this.limit = limit; this.stamps = []; }
  take(nowMs) {
    while (this.stamps.length && this.stamps[0] <= nowMs - 60000) this.stamps.shift();
    if (this.stamps.length >= this.limit) return 60000 - (nowMs - this.stamps[0]);
    this.stamps.push(nowMs);
    return 0;
  }
}

export class StatusHubClient {
  #options; #state; #sessionKey; #created = false; #terminal = false; #closed = false;
  #cursor = 0; #questionIds = new Set(); #bucket; #lastSentJson = ''; #lastSentAt = 0; #sending = null; #pollPromise = null; #finishPromise = null;
  #heartbeatTimer = null; #degradedUntil = 0; #exitHook = null; #finishController = null;
  lastError = ''; lastSuccessAt = ''; degradedSince = ''; warnings = [];

  constructor(options) {
    const optionSource = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const {
      sessionId, baseUrl, ingestToken = process.env.AGENT_INGEST_TOKEN || '',
      sessionKey = generateSessionKey(), fetchImpl = fetch, nowMs = () => Date.now(),
      timeoutMs = DEFAULTS.timeoutMs, coalesceMs = DEFAULTS.coalesceMs, heartbeatMs = DEFAULTS.heartbeatMs,
      probeRetryMs = DEFAULTS.probeRetryMs, finishDeadlineMs = DEFAULTS.finishDeadlineMs,
      maxSendAttempts = DEFAULTS.maxSendAttempts, backoffCapMs = DEFAULTS.backoffCapMs,
      requestsPerMinute = DEFAULTS.clientRequestsPerMinute, sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
      exitHooks = true, initialDegraded = null, ...initial
    } = options || {};
    this.sessionId = boundedId(sessionId, 120, this.warnings, 'sessionId');
    this.#sessionKey = typeof sessionKey === 'string' ? sessionKey : '';
    const requestedNow = typeof nowMs === 'function' ? nowMs : () => Date.now();
    const safeNow = () => {
      try {
        const value = Number(requestedNow());
        return Number.isFinite(value) ? value : Date.now();
      } catch {
        return Date.now();
      }
    };
    const safeSleep = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    const safeFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
    const boundedTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULTS.timeoutMs;
    const boundedCoalesce = Number.isFinite(Number(coalesceMs)) && Number(coalesceMs) >= 0 ? Number(coalesceMs) : DEFAULTS.coalesceMs;
    const boundedHeartbeat = Number.isFinite(Number(heartbeatMs)) && Number(heartbeatMs) >= 0 ? Number(heartbeatMs) : DEFAULTS.heartbeatMs;
    const boundedProbeRetry = Number.isFinite(Number(probeRetryMs)) && Number(probeRetryMs) > 0 ? Number(probeRetryMs) : DEFAULTS.probeRetryMs;
    const boundedFinishDeadline = Number.isFinite(Number(finishDeadlineMs)) && Number(finishDeadlineMs) > 0 ? Number(finishDeadlineMs) : DEFAULTS.finishDeadlineMs;
    const boundedAttempts = Number.isSafeInteger(Number(maxSendAttempts)) && Number(maxSendAttempts) > 0 ? Number(maxSendAttempts) : DEFAULTS.maxSendAttempts;
    const boundedBackoff = Number.isFinite(Number(backoffCapMs)) && Number(backoffCapMs) > 0 ? Number(backoffCapMs) : DEFAULTS.backoffCapMs;
    const requestedRate = Number.isSafeInteger(Number(requestsPerMinute)) && Number(requestsPerMinute) > 0 ? Number(requestsPerMinute) : DEFAULTS.clientRequestsPerMinute;
    const boundedRate = Math.min(DEFAULTS.clientRequestsPerMinute, requestedRate);
    const configuredBaseUrl = Object.prototype.hasOwnProperty.call(optionSource, 'baseUrl')
      ? baseUrl
      : Object.prototype.hasOwnProperty.call(process.env, 'STATUS_HUB_URL')
        ? process.env.STATUS_HUB_URL
        : PROTOCOL.DEFAULT_BASE_URL;
    const normalizedBaseUrl = normalizeBaseUrl(configuredBaseUrl);
    this.#options = {
      baseUrl: normalizedBaseUrl,
      ingestToken: typeof ingestToken === 'string' ? ingestToken : '', fetchImpl: safeFetch, nowMs: safeNow,
      timeoutMs: boundedTimeout, coalesceMs: boundedCoalesce, heartbeatMs: boundedHeartbeat,
      probeRetryMs: boundedProbeRetry, finishDeadlineMs: boundedFinishDeadline, maxSendAttempts: boundedAttempts,
      backoffCapMs: boundedBackoff, sleep: safeSleep
    };
    this.#bucket = new MinuteBucket(boundedRate);
    this.#state = clampSession({ status: 'running', ...initial }, this.warnings);
    if (!this.sessionId) this.#recordDegraded('INVALID_SESSION_ID', 'The session id must use only letters, digits, dot, underscore, colon, or hyphen.');
    if (!normalizedBaseUrl) this.#recordDegraded('INVALID_BASE_URL', 'The hub base URL must be an http(s) URL without embedded credentials, query, or fragment components.');
    if (!new RegExp(`^[a-f0-9]{${LIMITS.SESSION_KEY_LENGTH}}$`).test(this.#sessionKey)) this.#recordDegraded('INVALID_SESSION_KEY', `The session key must be exactly ${LIMITS.SESSION_KEY_LENGTH} lowercase hexadecimal characters.`);
    if (!this.#options.ingestToken) this.#recordDegraded('MISSING_INGEST_TOKEN', 'AGENT_INGEST_TOKEN is not configured, so hub writes are recorded no-ops.');
    if (initialDegraded?.error && this.#degradedUntil === 0) this.#recordDegraded(initialDegraded.code || 'UNREACHABLE', initialDegraded.error, initialDegraded.code !== 'INVALID_BASE_URL');
    if (exitHooks && typeof process !== 'undefined' && typeof process.once === 'function') {
      this.#exitHook = () => { this.finish('waiting').catch(() => {}); };
      process.once('beforeExit', this.#exitHook);
    }
    if (boundedHeartbeat > 0 && typeof setInterval === 'function') {
      this.#heartbeatTimer = setInterval(() => {
        if (this.#terminal || this.#closed) return;
        if (this.#options.nowMs() - this.#lastSentAt >= boundedHeartbeat) this.update({}).catch(() => {});
      }, Math.max(50, Math.floor(boundedHeartbeat / 4)));
      if (typeof this.#heartbeatTimer.unref === 'function') this.#heartbeatTimer.unref();
    }
  }

  get degraded() { return this.#degradedUntil === Infinity || this.#options.nowMs() < this.#degradedUntil; }

  status() {
    return {
      sessionId: this.sessionId,
      degraded: this.degraded,
      degradedSince: this.degradedSince,
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      terminal: this.#terminal,
      replyCursor: this.#cursor,
      warnings: [...this.warnings]
    };
  }

  #recordDegraded(code, message, temporary = false) {
    this.lastError = message;
    if (!this.degradedSince) this.degradedSince = new Date(this.#options.nowMs()).toISOString();
    this.#degradedUntil = temporary ? this.#options.nowMs() + this.#options.probeRetryMs : Infinity;
    return fail(code, message, { degraded: true });
  }

  #recover() {
    this.#degradedUntil = 0;
    this.degradedSince = '';
    this.lastError = '';
    this.lastSuccessAt = new Date(this.#options.nowMs()).toISOString();
  }

  async #sleep(milliseconds, signal = null) {
    if (signal?.aborted) return false;
    try {
      await promiseWithAbort(this.#options.sleep(milliseconds), signal);
      return !signal?.aborted;
    } catch {
      return false;
    }
  }

  async #request(path, { method = 'GET', body = null, includeSessionKey = true, signal = null } = {}) {
    try {
      const wait = this.#bucket.take(this.#options.nowMs());
      if (wait > 0 && !(await this.#sleep(wait, signal))) return fail('ABORTED', 'The hub request was cancelled before the rate-limit wait completed.', { status: 0 });
      if (signal?.aborted) return fail('ABORTED', 'The hub request was cancelled.', { status: 0 });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#options.timeoutMs);
      const abortExternal = () => controller.abort();
      if (signal) signal.addEventListener('abort', abortExternal, { once: true });
      try {
        if (signal?.aborted) return fail('ABORTED', 'The hub request was cancelled.', { status: 0 });
        const response = await this.#options.fetchImpl(`${this.#options.baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            [PROTOCOL.INGEST_TOKEN_HEADER]: this.#options.ingestToken,
            ...(includeSessionKey ? { [PROTOCOL.SESSION_KEY_HEADER]: this.#sessionKey } : {}),
            ...(body ? { 'content-type': 'application/json' } : {})
          },
          ...(body ? { body } : {})
        });
        if (signal?.aborted) return fail('ABORTED', 'The hub request was cancelled.', { status: 0 });
        const bodyResult = await readBoundedResponse(response, LIMITS.MAX_RESPONSE_BYTES, signal);
        if (!bodyResult.ok) {
          if (bodyResult.aborted || signal?.aborted) return fail('ABORTED', 'The hub response read was cancelled.', { status: 0 });
          return fail(bodyResult.tooLarge ? 'RESPONSE_TOO_LARGE' : 'TRANSPORT', bodyResult.tooLarge ? 'The hub response exceeded the bounded size.' : bodyResult.error, { status: response.status });
        }
        if (signal?.aborted) return fail('ABORTED', 'The hub response was cancelled.', { status: 0 });
        let payload = {};
        if (bodyResult.text) {
          try { payload = JSON.parse(bodyResult.text); } catch { return fail('BAD_JSON', 'The hub returned a response that is not JSON.', { status: response.status }); }
        }
        if (!response.ok) {
          const oldest = Number(response.headers?.get?.(PROTOCOL.OLDEST_SEQUENCE_HEADER) || 0) || 0;
          return fail('HTTP_' + response.status, typeof payload.error === 'string' && payload.error ? payload.error : `The hub answered ${path} with HTTP ${response.status}.`, { status: response.status, retryAfterMs: retryAfterMilliseconds(response.headers), oldestSequence: oldest });
        }
        return ok({ status: response.status, data: payload });
      } catch (error) {
        if (signal?.aborted) return fail('ABORTED', 'The hub request was cancelled.', { status: 0 });
        return fail('TRANSPORT', error?.name === 'AbortError'
          ? `The hub did not answer ${path} within ${this.#options.timeoutMs} ms.`
          : `The hub could not be reached: ${error?.name || 'transport failure'}.`, { status: 0 });
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abortExternal);
      }
    } catch (error) {
      return fail('TRANSPORT', `The hub request for ${path} could not be started: ${error?.name || 'transport failure'}.`, { status: 0 });
    }
  }

  /** Sends one composed body with bounded retries; degraded on persistent failure. */
  async #send(path, method, payload, { signal = null } = {}) {
    if (this.#closed) return fail('CLOSED', 'The client is closed.');
    if (signal?.aborted) return fail('ABORTED', 'The client send was cancelled.', { status: 0 });
    if (this.degraded) {
      if (this.#degradedUntil === Infinity || this.#options.nowMs() < this.#degradedUntil) return fail('DEGRADED', this.lastError || 'The client is degraded.', { degraded: true });
      this.#degradedUntil = 0;
    }
    let emission;
    try {
      emission = await buildPrivateEmission(payload, { includeAgentIdentity: method === 'POST' && path === PROTOCOL.SESSIONS_PATH && !this.#created });
    } catch (error) {
      return fail(error?.code || 'PRIVATE_EMISSION_REJECTED', error?.message || 'The private-emission guard rejected the payload.');
    }
    if (signal?.aborted) return fail('ABORTED', 'The client send was cancelled.', { status: 0 });
    if (!emission.ok) { this.lastError = emission.error; return emission; }
    const body = emission.body;
    if (Buffer.byteLength(body, 'utf8') > LIMITS.MAX_BODY_BYTES) return fail('BODY_TOO_LARGE', 'The composed request exceeds the 64 KiB body limit even after clamping.');
    let attempt = 0;
    let delay = 500;
    while (attempt < this.#options.maxSendAttempts) {
      if (this.#closed) return fail('CLOSED', 'The client is closed.');
      if (signal?.aborted) return fail('ABORTED', 'The client send was cancelled.', { status: 0 });
      attempt += 1;
      let result;
      try { result = await this.#request(path, { method, body, signal }); } catch (error) { result = fail('TRANSPORT', `The hub request failed: ${error?.name || 'transport failure'}.`, { status: 0 }); }
      if (signal?.aborted || result.code === 'ABORTED') return fail('ABORTED', 'The client send was cancelled.', { status: 0 });
      if (result.ok) { this.#recover(); return result; }
      this.lastError = result.error;
      if (result.status === 429) {
        const retryDelay = Number.isFinite(result.retryAfterMs) ? result.retryAfterMs : delay;
        if (!(await this.#sleep(Math.min(retryDelay, this.#options.backoffCapMs), signal))) return signal?.aborted ? fail('ABORTED', 'The client send was cancelled.', { status: 0 }) : this.#recordDegraded('DEGRADED', 'The retry delay could not be scheduled.', true);
      } else if (result.status === 0 || result.status >= 500) {
        if (!(await this.#sleep(Math.min(delay + Math.floor(Math.random() * Math.max(1, delay)), this.#options.backoffCapMs), signal))) return signal?.aborted ? fail('ABORTED', 'The client send was cancelled.', { status: 0 }) : this.#recordDegraded('DEGRADED', 'The retry delay could not be scheduled.', true);
      } else {
        return result;
      }
      delay = Math.min(delay * 2, this.#options.backoffCapMs);
    }
    return this.#recordDegraded('DEGRADED', `The hub kept failing after ${this.#options.maxSendAttempts} attempts: ${this.lastError || 'transport failure'}.`, true);
  }

  /**
   * Idempotent create-or-update through POST /api/agent/sessions. Identical state
   * inside the coalescing window is skipped; concurrent callers share one in-flight send.
   */
  async update(partial = {}) {
    try {
      if (this.#terminal) return fail('TERMINAL', 'The session already sent its terminal status.');
      if (this.#finishController) return fail('FINISHING', 'The session is finishing; updates are paused until the terminal result is known.');
      Object.assign(this.#state, clampSession(partial || {}, this.warnings));
      const desired = JSON.stringify(this.#state);
      const nowMs = this.#options.nowMs();
      if (this.#created && desired === this.#lastSentJson && nowMs - this.#lastSentAt < this.#options.coalesceMs) return ok({ coalesced: true });
      while (this.#sending) await this.#sending.catch(() => {});
      const sending = this.#send(PROTOCOL.SESSIONS_PATH, 'POST', { id: this.sessionId, ...this.#state }).catch((error) => fail('CLIENT', error?.message || 'The client could not send the session update.'));
      this.#sending = sending;
      const result = await sending;
      if (this.#sending === sending) this.#sending = null;
      if (result.ok) { this.#created = true; this.#lastSentJson = desired; this.#lastSentAt = this.#options.nowMs(); }
      return result;
    } catch (error) {
      return fail(error?.code || 'CLIENT', error?.message || 'The client could not update the session.');
    }
  }

  /** Publishes one interactive question without blocking the work. */
  async publishQuestion(question) {
    try {
      if (this.#terminal) return fail('TERMINAL', 'The session already sent its terminal status.');
      if (!this.#created) { const created = await this.update({}); if (!created.ok) return created; }
      const clamped = clampQuestion(question, this.warnings);
      if (!clamped) return fail('INVALID_QUESTION', 'A question needs an id, a prompt, and at least one option or a text answer.');
      if (this.#questionIds.has(clamped.id)) return fail('QUESTION_DUPLICATE', 'That question id has already been published.');
      if (this.#questionIds.size >= LIMITS.MAX_QUESTIONS_PER_SESSION) return fail('QUESTION_LIMIT', `A session may publish at most ${LIMITS.MAX_QUESTIONS_PER_SESSION} questions.`);
      const result = await this.#send(`${PROTOCOL.SESSIONS_PATH}/${encodeURIComponent(this.sessionId)}/questions`, 'POST', clamped);
      if (result.ok) this.#questionIds.add(clamped.id);
      return result;
    } catch (error) {
      return fail(error?.code || 'CLIENT', error?.message || 'The client could not publish the question.');
    }
  }

  /** Publishes one verified panic condition. Suspicion and candidate states are refused locally. */
  async publishPanic(event) {
    try {
      if (!this.#created) { const created = await this.update({}); if (!created.ok) return created; }
      const clamped = clampPanicEvent(event, this.warnings);
      if (!clamped) return fail('INVALID_PANIC_EVENT', 'A verified panic event did not satisfy the bounded protocol.');
      return this.#send(`${PROTOCOL.SESSIONS_PATH}/${encodeURIComponent(this.sessionId)}/panic`, 'POST', clamped);
    } catch (error) {
      return fail(error?.code || 'CLIENT', error?.message || 'The client could not publish the panic event.');
    }
  }

  /**
   * Polls the session inbox from the tracked cursor. A 409 resynchronizes from the
   * X-Status-Hub-Oldest-Sequence header and retries once, so an expired cursor
   * costs one extra request instead of a stuck inbox.
   */
  async pollReplies() {
    if (this.#terminal) return fail('TERMINAL', 'The session already sent its terminal status.');
    if (this.#finishController) return fail('FINISHING', 'The session is finishing; reply polling is paused until the terminal result is known.');
    if (this.#pollPromise) return this.#pollPromise;
    const polling = this.#pollRepliesInternal();
    this.#pollPromise = polling;
    try {
      return await polling;
    } finally {
      if (this.#pollPromise === polling) this.#pollPromise = null;
    }
  }

  async #pollRepliesInternal() {
    try {
      if (this.#closed) return fail('CLOSED', 'The client is closed.');
      if (!this.#created) return ok({ replies: [], latest: this.#cursor });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await this.#request(`${PROTOCOL.SESSIONS_PATH}/${encodeURIComponent(this.sessionId)}/replies?after=${this.#cursor}`);
        if (result.ok) {
          this.#recover();
          const replies = Array.isArray(result.data?.replies) ? result.data.replies : [];
          if (Number.isSafeInteger(result.data?.latest)) this.#cursor = Math.max(this.#cursor, result.data.latest);
          return ok({ replies, latest: this.#cursor });
        }
        if (result.status === 409 && result.oldestSequence > 0) { this.#cursor = Math.max(0, result.oldestSequence - 1); continue; }
        this.lastError = result.error;
        return result;
      }
      return fail('CURSOR_RESYNC_FAILED', 'The reply cursor could not be resynchronized.');
    } catch (error) {
      return fail(error?.code || 'CLIENT', error?.message || 'The client could not poll replies.');
    }
  }

  /** The at-every-checkpoint helper: refresh state, then observe the inbox. */
  async pollAtCheckpoint(partial = {}) {
    try {
      const update = await this.update(partial);
      const replies = await this.pollReplies();
      return ok({ update, replies });
    } catch (error) {
      return fail(error?.code || 'CLIENT', error?.message || 'The client could not poll the checkpoint.');
    }
  }

  /** Sends the final status. Safe to call more than once; only the first send counts. */
  async finish(status = 'waiting', partial = {}) {
    if (this.#terminal) return ok({ alreadyTerminal: true });
    if (this.#finishPromise) return this.#finishPromise;
    this.#finishPromise = (async () => {
      const finishController = new AbortController();
      this.#finishController = finishController;
      try {
        const terminalStatus = TERMINAL_STATUSES.includes(status) ? status : 'waiting';
        Object.assign(this.#state, clampSession({ ...(partial && typeof partial === 'object' ? partial : {}), status: terminalStatus }, this.warnings));
        let timeoutHandle;
        const send = this.#send(PROTOCOL.SESSIONS_PATH, 'POST', { id: this.sessionId, ...this.#state }, { signal: finishController.signal })
          .catch((error) => fail(error?.code || 'CLIENT', error?.message || 'The terminal update failed.'));
        const timeout = new Promise((resolveTimeout) => {
          timeoutHandle = setTimeout(() => {
            finishController.abort();
            resolveTimeout(fail('FINISH_TIMEOUT', 'The terminal update missed its deadline.'));
          }, this.#options.finishDeadlineMs);
        });
        const result = await Promise.race([send, timeout]);
        clearTimeout(timeoutHandle);
        if (result?.code === 'FINISH_TIMEOUT') {
          finishController.abort();
          send.catch(() => {});
        }
        this.#terminal = true;
        this.close();
        return result;
      } catch (error) {
        finishController.abort();
        this.#terminal = true;
        this.close();
        return fail(error?.code || 'CLIENT', error?.message || 'The terminal update failed.');
      } finally {
        if (this.#finishController === finishController) this.#finishController = null;
      }
    })();
    return this.#finishPromise;
  }

  /** Graceful shutdown entry point. It attempts the terminal update before cleanup. */
  async dispose(status = 'waiting', partial = {}) {
    return this.finish(status, partial);
  }

  close() {
    this.#closed = true;
    if (this.#finishController && !this.#finishController.signal.aborted) this.#finishController.abort();
    if (this.#heartbeatTimer) { clearInterval(this.#heartbeatTimer); this.#heartbeatTimer = null; }
    if (this.#exitHook && typeof process !== 'undefined') { process.removeListener('beforeExit', this.#exitHook); this.#exitHook = null; }
  }
}

/**
 * The one-call entry point: resolves the hub, creates the session, and returns a
 * ready client. Never throws; when the hub is unreachable the returned client is
 * degraded and every write is a recorded no-op so the application keeps working.
 */
export async function createStatusHubClient(options = {}) {
  try {
    const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const probeOptions = { fetchImpl: source.fetchImpl, timeoutMs: source.timeoutMs };
    if (Object.prototype.hasOwnProperty.call(source, 'baseUrl')) probeOptions.baseUrl = source.baseUrl;
    const probe = await resolveBaseUrl(probeOptions);
    const client = new StatusHubClient({ ...source, baseUrl: probe.baseUrl, initialDegraded: probe.ok ? null : probe });
    if (probe.ok) await client.update({});
    return client;
  } catch (error) {
    const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    return new StatusHubClient({ ...source, initialDegraded: { code: error?.code || 'UNREACHABLE', error: `The hub could not be reached: ${error?.name || 'transport failure'}.` } });
  }
}
