import test from 'node:test';
import assert from 'node:assert/strict';
import { runTest, runSplit, runGrep, runDebug, runBenchmark, runOperation, validate, validateFlags, LIMITS } from '../src/shared/surface/regex/engine.js';
import { buildSegments } from '../src/shared/surface/regex/highlight.js';

test('match results expose positions, line and column, groups and unmatched captures', () => {
  const r = runTest({ pattern: '(?<w>[a-z])(\\d)?', flags: 'i', sample: 'a1\nB' });
  assert.equal(r.count, 2);
  assert.deepEqual(r.matches.map(m => [m.text, m.index, m.line, m.column]), [['a1', 0, 1, 1], ['B', 3, 2, 1]]);
  assert.deepEqual(r.matches[0].groupDetails.map(g => [g.index, g.name, g.text, g.start, g.end]), [[1, 'w', 'a', 0, 1], [2, null, '1', 1, 2]]);
  assert.deepEqual(r.matches[1].groupDetails[1], { index: 2, name: null, text: null, start: null, end: null });
  assert.equal(r.matches[0].groups.w, 'a');
});

test('no-match, empty pattern and plain text behave', () => {
  assert.equal(runTest({ pattern: 'zzz', flags: '', sample: 'abc' }).count, 0);
  assert.equal(runTest({ pattern: 'b', flags: '', sample: 'abcb' }).count, 2);
});

test('zero-width matches terminate and advance by whole code points', () => {
  const r = runTest({ pattern: '(?=.)', flags: 'u', sample: '😀a' });
  assert.deepEqual(r.matches.map(m => m.index), [0, 2]);
  const empty = runTest({ pattern: 'x*', flags: '', sample: 'ab' });
  assert.deepEqual(empty.matches.map(m => m.index), [0, 1, 2]);
});

test('Unicode and astral text keep correct indices', () => {
  const r = runTest({ pattern: '\\p{Script=Han}+', flags: 'u', sample: 'ab香港😀' });
  assert.equal(r.matches[0].text, '香港'); assert.equal(r.matches[0].index, 2);
  assert.equal(runTest({ pattern: '😀', flags: 'u', sample: 'x😀' }).matches[0].end, 3);
});

test('match count is capped and reported as truncated', () => {
  const r = runTest({ pattern: 'a', flags: '', sample: 'a'.repeat(1500) });
  assert.equal(r.matches.length, LIMITS.matches); assert.equal(r.truncated, true);
});

test('replacement preview equals the native replacement including backreferences', () => {
  const cases = [['(?<w>\\w)(\\d)?', 'gi', 'a1 b c3', '[$<w>|$2|$&|$`|$\'|$$|$1]']];
  for (const [pattern, flags, sample, replacement] of cases) {
    const mine = runTest({ pattern, flags, sample, replacement });
    assert.equal(mine.replacement, sample.replace(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'), replacement));
  }
  const r = runTest({ pattern: '(\\d+)-(\\d+)', flags: '', sample: '10-20 and 3-4', replacement: '$2/$1' });
  assert.equal(r.replacement, '20/10 and 4/3'); assert.equal(r.replaced, 2);
});

test('expected outcome cases pass and fail correctly', () => {
  const r = runTest({ pattern: '^a+$', flags: '', sample: '', cases: [{ text: 'aaa', match: true }, { text: 'b', match: false }, { text: 'ab', match: true }] });
  assert.deepEqual(r.cases.map(c => c.passed), [true, true, false]);
  assert.throws(() => runTest({ pattern: 'a', flags: '', sample: '', cases: [{ text: 1, match: true }] }), /Invalid test case/);
  assert.throws(() => runTest({ pattern: 'a', flags: '', sample: '', cases: Array.from({ length: 51 }, () => ({ text: 'a', match: true })) }), /Too many/);
});

test('split behaves like JavaScript split, including capture pieces', () => {
  assert.deepEqual(runSplit({ pattern: '[,;]\\s*', flags: '', sample: 'a, b;c' }).pieces, ['a', 'b', 'c']);
  assert.deepEqual(runSplit({ pattern: '(-)', flags: '', sample: 'a-b' }).pieces, ['a', '-', 'b']);
  assert.deepEqual(runSplit({ pattern: '(x)|-', flags: '', sample: 'a-b' }).pieces, ['a', null, 'b']);
  assert.equal(runSplit({ pattern: ',', flags: '', sample: ','.repeat(1500) }).truncated, true);
});

test('grep over a supplied list counts lines and matches and can invert', () => {
  const lines = ['alpha', 'beta', 'aaa', ''];
  const r = runGrep({ pattern: 'a', flags: '', lines });
  assert.deepEqual(r.results.map(x => [x.line, x.count]), [[1, 2], [2, 1], [3, 3]]);
  assert.equal(r.matchedLines, 3); assert.equal(r.totalMatches, 6); assert.equal(r.scanned, 4);
  assert.deepEqual(runGrep({ pattern: 'a', flags: '', lines, invert: true }).results.map(x => x.line), [4]);
  assert.deepEqual(runGrep({ pattern: '^$', flags: '', lines }).results.map(x => x.line), [4]);
  assert.throws(() => runGrep({ pattern: 'a', flags: '', lines: Array(5001).fill('a') }), /limited to 5000/);
  assert.deepEqual(runOperation({ pattern: 'a', flags: 'g', rows: [{ id: 1, text: 'a' }, { id: 2, text: 'a' }, { id: 3, text: 'b' }] }), { matches: [1, 2] });
});

test('attempt trace finds exactly the matches a native scan finds', () => {
  for (const [pattern, flags, sample] of [['ab+c', '', 'xabbc abd abc'], ['a|b', '', 'cab'], ['\\d+', '', 'a12b345'], ['(?=a)', 'u', '😀aa']]) {
    const trace = runDebug({ pattern, flags, sample });
    const traced = trace.attempts.filter(a => a.matched).map(a => [a.position, a.end]);
    const native = runTest({ pattern, flags, sample }).matches.map(m => [m.index, m.end]);
    assert.deepEqual(traced, native, `${pattern} on ${sample}`);
    assert.equal(trace.traceKind, 'attempt-level'); assert.equal(trace.internalSteps, false);
  }
});

test('failed attempts report how far the leading elements matched', () => {
  const trace = runDebug({ pattern: 'ab+c', flags: '', sample: 'abd' });
  const failed = trace.attempts[0];
  assert.equal(failed.matched, false); assert.equal(failed.reached, 2); assert.equal(failed.total, 3); assert.equal(failed.failedAt, 'c');
  const alternation = runDebug({ pattern: 'a|b', flags: '', sample: 'c' });
  assert.equal(alternation.attempts[0].reached, null);
});

test('attempt trace is bounded', () => {
  const trace = runDebug({ pattern: 'x', flags: '', sample: 'a'.repeat(5000) });
  assert.equal(trace.attempts.length, LIMITS.attempts); assert.equal(trace.truncated, true);
  assert.equal(runDebug({ pattern: 'a', flags: '', sample: 'xxa', from: 2 }).attempts[0].position, 2);
});

test('benchmark times growing copies of the sample and states what it cannot count', () => {
  const r = runBenchmark({ pattern: 'a+b', flags: '', sample: 'aaa b ' });
  assert.deepEqual(r.rows.map(x => x.factor), [1, 2, 4, 8]);
  assert.ok(r.rows.every(x => x.runs >= 1 && typeof x.averageMs === 'number'));
  assert.match(r.note, /not exposed/);
  assert.throws(() => runBenchmark({ pattern: 'a', flags: '', sample: 'a'.repeat(5000) }), /limited to 4096/);
});

test('invalid patterns, flags and oversized input are rejected before running', () => {
  assert.equal(validate('[', 'u').ok, false);
  assert.equal(validate('a', 'ii').ok, false);
  assert.equal(validate('a', 'uv').ok, false);
  assert.equal(validate('a'.repeat(513), '').ok, false);
  assert.equal(validate('(?<n>a)\\k<n>', 'u').ok, true);
  assert.match(validateFlags('x'), /Invalid flags/);
  assert.throws(() => runTest({ pattern: 'a', flags: '', sample: 'a'.repeat(LIMITS.sample + 1) }), /limited to/);
  assert.throws(() => runOperation({ op: 'nope', pattern: 'a', flags: '' }), /Unknown operation/);
});

test('highlight segments split text at match and group boundaries without markup', () => {
  const sample = 'ab12cd';
  const { matches } = runTest({ pattern: '([a-z]+)(\\d+)', flags: '', sample });
  const { segments } = buildSegments(sample, matches);
  assert.equal(segments.map(s => s.text).join(''), sample);
  assert.deepEqual(segments.map(s => [s.text, s.matchIndex, s.groups]), [['ab', 0, [1]], ['12', 0, [2]], ['cd', -1, []]]);
  const zero = buildSegments('abc', runTest({ pattern: '(?=b)', flags: '', sample: 'abc' }).matches);
  assert.equal(zero.zeroWidth.length, 1);
  assert.equal(buildSegments('<b>&', []).segments[0].text, '<b>&');
});
