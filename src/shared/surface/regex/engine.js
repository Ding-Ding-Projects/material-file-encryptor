// Pure, dependency-free execution layer for the regex builder. It runs on the JavaScript RegExp
// engine of whatever host loads it (a worker in the app, Node in tests). Nothing here touches the
// DOM, and every operation is bounded by input size and result counts; wall-clock limits are
// enforced by the owning worker runner, which terminates a runaway match.
import { parsePattern } from './parser.js';
import { parseReplacement } from './replacement.js';

export const LIMITS = Object.freeze({ pattern: 512, sample: 65536, matches: 1000, pieces: 1000, lines: 5000, lineLength: 4096, attempts: 2000, cases: 50, benchmarkMs: 600 });

const FLAG_PATTERN = /^[dgimsuvy]*$/;

export function validateFlags(flags) {
  if (typeof flags !== 'string' || !FLAG_PATTERN.test(flags) || new Set(flags).size !== flags.length) return 'Invalid flags: use each of d g i m s u v y at most once.';
  if (flags.includes('u') && flags.includes('v')) return 'The u and v flags cannot be combined.';
  return null;
}

function assertInput(pattern, flags) {
  if (typeof pattern !== 'string' || pattern.length > LIMITS.pattern) throw Error(`Pattern is limited to ${LIMITS.pattern} characters.`);
  const flagError = validateFlags(flags);
  if (flagError) throw Error(flagError);
}

function addFlags(flags, extra) { let out = flags; for (const f of extra) if (!out.includes(f)) out += f; return out; }
function removeFlags(flags, drop) { return [...flags].filter(f => !drop.includes(f)).join(''); }

export function validate(pattern, flags = '') {
  try { assertInput(pattern, flags); new RegExp(pattern, flags); return { ok: true }; } catch (error) { return { ok: false, error: error.message }; }
}

function groupMap(pattern, flags) {
  const { tree } = parsePattern(pattern, flags);
  const groups = [];
  (function walk(node) {
    if (node.type === 'group' && node.index) groups.push({ index: node.index, name: node.name || null });
    (node.children || []).forEach(walk);
  })(tree);
  return groups.sort((a, b) => a.index - b.index);
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function position(starts, index) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
  return { line: lo + 1, column: index - starts[lo] + 1 };
}

function advance(regex, input, match) {
  if (match[0] !== '') return;
  const cp = input.codePointAt(regex.lastIndex);
  regex.lastIndex += regex.unicode || regex.unicodeSets ? (cp > 0xffff ? 2 : 1) : 1;
}

function collect(pattern, flags, input, limit) {
  const regex = new RegExp(pattern, addFlags(removeFlags(flags, 'y'), 'gd'));
  const groupInfo = groupMap(pattern, flags);
  const starts = lineStarts(input);
  const matches = [];
  let match, truncated = false;
  while ((match = regex.exec(input))) {
    if (matches.length >= limit) { truncated = true; break; }
    const groupDetails = groupInfo.map(g => {
      const span = match.indices?.[g.index];
      return span ? { index: g.index, name: g.name, text: match[g.index], start: span[0], end: span[1] } : { index: g.index, name: g.name, text: null, start: null, end: null };
    });
    matches.push({ index: match.index, end: match.index + match[0].length, text: match[0], groupDetails, groups: match.groups ? { ...match.groups } : {}, captures: Array.from(match).slice(1), indices: match.indices ? Array.from(match.indices, s => s ? [s[0], s[1]] : null) : null, ...position(starts, match.index) });
    advance(regex, input, match);
  }
  return { matches, truncated };
}

export function expandReplacement(parts, match, input) {
  let out = '';
  for (const part of parts) {
    if (part.kind === 'literal') out += part.text;
    else if (part.kind === 'dollar') out += '$';
    else if (part.kind === 'match') out += match.text;
    else if (part.kind === 'before') out += input.slice(0, match.index);
    else if (part.kind === 'after') out += input.slice(match.end);
    else if (part.kind === 'group') out += match.groupDetails[part.number - 1]?.text ?? '';
    else if (part.kind === 'named') out += match.groupDetails.find(g => g.name === part.name)?.text ?? '';
  }
  return out;
}

export function runCases(pattern, flags, cases) {
  if (!Array.isArray(cases) || cases.length > LIMITS.cases) throw Error('Too many test cases');
  const regex = new RegExp(pattern, removeFlags(flags, 'gy'));
  return cases.map((entry, index) => {
    if (!entry || typeof entry.text !== 'string' || entry.text.length > LIMITS.lineLength || typeof entry.match !== 'boolean') throw Error('Invalid test case');
    regex.lastIndex = 0;
    const actual = regex.test(entry.text);
    return { index, expected: entry.match, actual, passed: actual === entry.match };
  });
}

/** Match, replacement preview and optional expected-outcome cases in one bounded pass. */
export function runTest({ pattern, flags = '', sample = '', replacement = '', cases = [], limit = LIMITS.matches }) {
  assertInput(pattern, flags);
  const started = performance.now();
  const input = String(sample);
  if (input.length > LIMITS.sample) throw Error(`Test text is limited to ${LIMITS.sample} characters.`);
  const { matches, truncated } = collect(pattern, flags, input, Math.min(limit, LIMITS.matches));
  const info = groupMap(pattern, flags);
  const parts = parseReplacement(String(replacement), { groupCount: info.length, names: info.filter(g => g.name).map(g => g.name) });
  const replaced = matches.map(m => ({ index: m.index, end: m.end, text: m.text, with: expandReplacement(parts, m, input) }));
  let output = '';
  let cursor = 0;
  for (const r of replaced) { output += input.slice(cursor, r.index) + r.with; cursor = r.end; }
  output += input.slice(cursor);
  return {
    matches, truncated, count: matches.length, groups: info, replacementParts: parts, replacement: output, replaced: replaced.length,
    // Equivalent to the native replace for non-truncated runs; retained for the Test tab and negative checks.
    cases: cases.length ? runCases(pattern, flags, cases) : [],
    elapsedMs: Math.round((performance.now() - started) * 100) / 100
  };
}

export function runSplit({ pattern, flags = '', sample = '', limit = LIMITS.pieces }) {
  assertInput(pattern, flags);
  const started = performance.now();
  const input = String(sample);
  if (input.length > LIMITS.sample) throw Error(`Test text is limited to ${LIMITS.sample} characters.`);
  const regex = new RegExp(pattern, removeFlags(flags, 'gy'));
  const pieces = input.split(regex);
  const truncated = pieces.length > Math.min(limit, LIMITS.pieces);
  return { pieces: pieces.slice(0, Math.min(limit, LIMITS.pieces)).map(p => p === undefined ? null : p), count: pieces.length, truncated, elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
}

/** Grep over a supplied list of text lines (or legacy {id,text} rows). */
export function runGrep({ pattern, flags = '', lines, invert = false }) {
  assertInput(pattern, flags);
  if (!Array.isArray(lines) || lines.length > LIMITS.lines) throw Error(`Grep is limited to ${LIMITS.lines} lines.`);
  const started = performance.now();
  const regex = new RegExp(pattern, removeFlags(flags, 'gy'));
  const counter = new RegExp(pattern, addFlags(removeFlags(flags, 'y'), 'g'));
  const results = [];
  let matchedLines = 0, totalMatches = 0;
  lines.forEach((line, i) => {
    const text = String(line).slice(0, LIMITS.lineLength);
    regex.lastIndex = 0;
    const hit = regex.test(text);
    if (hit) {
      matchedLines++;
      counter.lastIndex = 0;
      let count = 0, m;
      while ((m = counter.exec(text)) && count < 100) { count++; advance(counter, text, m); }
      totalMatches += count;
      if (!invert) results.push({ line: i + 1, text, count });
    } else if (invert) results.push({ line: i + 1, text, count: 0 });
  });
  return { results: results.slice(0, 2000), matchedLines, totalMatches, scanned: lines.length, truncated: results.length > 2000, elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
}

export function runFilter({ pattern, flags = '', rows }) {
  assertInput(pattern, flags);
  const regex = new RegExp(pattern, removeFlags(flags, 'gy'));
  return { matches: rows.filter(row => { regex.lastIndex = 0; return regex.test(String(row.text).slice(0, LIMITS.lineLength)); }).map(row => row.id) };
}

/**
 * Attempt-level trace. Each start position is tried with a sticky copy of the pattern, which is
 * how a scanning engine behaves semantically. For failed attempts the number of leading top-level
 * elements that still matched is measured by sticky-testing growing prefixes of the pattern. This is
 * NOT an internal backtracking step trace: the engine exposes none, and real engines may skip start
 * positions as an optimization that this trace does not reproduce.
 */
export function runDebug({ pattern, flags = '', sample = '', from = 0, maxAttempts = LIMITS.attempts }) {
  assertInput(pattern, flags);
  const started = performance.now();
  const input = String(sample);
  if (input.length > LIMITS.sample) throw Error(`Test text is limited to ${LIMITS.sample} characters.`);
  const baseFlags = addFlags(removeFlags(flags, 'g'), 'y');
  const sticky = new RegExp(pattern, baseFlags);
  const { tree } = parsePattern(pattern, flags);
  const elements = tree.type === 'sequence' ? tree.children : null;
  const prefixes = [];
  if (elements && elements.length > 1) {
    for (let k = 1; k < elements.length; k++) {
      try { prefixes.push({ k, regex: new RegExp(pattern.slice(0, elements[k - 1].end), baseFlags), text: pattern.slice(elements[k - 1].start, elements[k - 1].end), end: elements[k - 1].end }); } catch { break; }
    }
  }
  const unicode = flags.includes('u') || flags.includes('v');
  const attempts = [];
  let subTests = 0;
  let p = Math.max(0, Math.min(Number(from) || 0, input.length));
  const cap = Math.min(maxAttempts, LIMITS.attempts);
  let truncated = false;
  while (p <= input.length) {
    if (attempts.length >= cap) { truncated = true; break; }
    sticky.lastIndex = p;
    const m = sticky.exec(input);
    if (m) {
      attempts.push({ position: p, matched: true, end: p + m[0].length, text: m[0], reached: elements ? elements.length : null, total: elements ? elements.length : null });
      p = m[0] === '' ? p + (unicode && input.codePointAt(p) > 0xffff ? 2 : 1) : p + m[0].length;
    } else {
      let reached = 0;
      if (prefixes.length) {
        for (const prefix of prefixes) {
          if (subTests++ > 40000) break;
          prefix.regex.lastIndex = p;
          if (!prefix.regex.test(input)) break;
          reached = prefix.k;
        }
      }
      attempts.push({ position: p, matched: false, end: null, text: input[p] ?? '', reached: prefixes.length ? reached : null, total: elements ? elements.length : null, failedAt: prefixes.length && reached < elements.length ? elements[reached].text : null });
      p += unicode && input.codePointAt(p) > 0xffff ? 2 : 1;
    }
  }
  return {
    attempts, truncated, traceKind: 'attempt-level', internalSteps: false,
    note: 'Attempt-level trace from sticky matching. The engine exposes no internal backtracking steps.',
    elapsedMs: Math.round((performance.now() - started) * 100) / 100
  };
}

/** Bounded timing of the same pattern on growing copies of the sample (measured, not step counts). */
export function runBenchmark({ pattern, flags = '', sample = '', budgetMs = LIMITS.benchmarkMs }) {
  assertInput(pattern, flags);
  const input = String(sample);
  if (input.length > 4096) throw Error('Benchmark text is limited to 4096 characters.');
  const regex = new RegExp(pattern, addFlags(removeFlags(flags, 'y'), 'g'));
  const deadline = performance.now() + Math.min(budgetMs, LIMITS.benchmarkMs);
  const rows = [];
  for (const factor of [1, 2, 4, 8]) {
    if (performance.now() > deadline) break;
    const text = input.repeat(factor).slice(0, LIMITS.sample);
    let runs = 0, matches = 0;
    const begin = performance.now();
    while (runs < 20 && performance.now() < deadline) {
      regex.lastIndex = 0; let m;
      matches = 0;
      while ((m = regex.exec(text)) && matches < LIMITS.matches) { matches++; advance(regex, text, m); }
      runs++;
    }
    rows.push({ factor, length: text.length, runs, matches, averageMs: runs ? Math.round(((performance.now() - begin) / runs) * 1000) / 1000 : null });
  }
  return { rows, complete: rows.length === 4, note: 'Measured wall-clock time on this engine. Step and backtracking counts are not exposed.' };
}

export const operations = Object.freeze({ test: runTest, split: runSplit, grep: runGrep, filter: runFilter, debug: runDebug, benchmark: runBenchmark });

export function runOperation(data) {
  if (data.rows) return runFilter(data);
  const run = operations[data.op || 'test'];
  if (!run) throw Error('Unknown operation');
  return run(data);
}
