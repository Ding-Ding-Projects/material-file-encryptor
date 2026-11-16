import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern, flattenTree, nodeAt } from '../src/shared/surface/regex/parser.js';
import { explainNode, riskNotes } from '../src/shared/surface/regex/explain.js';
import { tokenCatalog, insertToken, escapeLiteral, guidedTokens } from '../src/shared/surface/regex/tokens.js';
import { parseReplacement } from '../src/shared/surface/regex/replacement.js';

const kinds = pattern => flattenTree(parsePattern(pattern).tree).map(r => r.node.type);

test('syntax tree covers groups, classes, quantifiers, references and lookarounds', () => {
  const parsed = parsePattern('^(?<year>\\d{4})-(a|b)+?[^a-z\\d]\\k<year>(?<=x)$');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.captureCount, 2);
  assert.deepEqual(parsed.names, ['year']);
  const types = kinds('^(?<year>\\d{4})-(a|b)+?[^a-z\\d]\\k<year>(?<=x)$');
  for (const expected of ['anchor', 'group', 'quantifier', 'class', 'range', 'backreference', 'alternation', 'class-escape']) assert.ok(types.includes(expected), expected);
  const quant = flattenTree(parsed.tree).find(r => r.node.type === 'quantifier' && r.node.lazy);
  assert.equal(quant.node.min, 1); assert.equal(quant.node.max, Infinity);
});

test('every node carries its source range so the tree can select pattern text', () => {
  const pattern = 'a(b|c)*d';
  const parsed = parsePattern(pattern);
  for (const { node } of flattenTree(parsed.tree)) assert.equal(pattern.slice(node.start, node.end), node.text);
  const hit = nodeAt(parsed.tree, 3);
  assert.equal(hit.text, 'b');
});

test('invalid intermediate edits are reported as structured errors without throwing', () => {
  for (const [pattern, message] of [['(a', /closing parenthesis/], ['a)', /Unmatched/], ['[a-', /closing bracket/], ['*a', /Nothing to repeat/], ['a\\', /backslash/], ['[z-a]', /out of order/]]) {
    const parsed = parsePattern(pattern);
    assert.ok(parsed.errors.some(e => message.test(e.message)), `${pattern}: ${JSON.stringify(parsed.errors)}`);
    assert.ok(parsed.errors.every(e => typeof e.yue === 'string' || e.message));
  }
  assert.ok(parsePattern('\\p{L}', '').errors.some(e => /u or v flag/.test(e.message)));
  assert.deepEqual(parsePattern('\\p{L}', 'u').errors, []);
  assert.ok(parsePattern('(?<a>x)(?<a>y)').errors.some(e => /Duplicate/.test(e.message)));
  assert.ok(parsePattern('\\k<nope>').errors.some(e => /unknown group/.test(e.message)));
});

test('v flag class operators and nested classes are parsed', () => {
  const parsed = parsePattern('[\\p{L}--[a-z]]', 'v');
  assert.deepEqual(parsed.errors, []);
  const types = flattenTree(parsed.tree).map(r => r.node.type);
  assert.ok(types.includes('class-operator')); assert.equal(types.filter(t => t === 'class').length, 2);
});

test('every node kind has an English and Cantonese explanation', () => {
  const patterns = ['^a.b$', '\\bx\\B', '(a)(?:b)(?<n>c)(?=d)(?!e)(?<=f)(?<!g)', 'a*b+c?d{2}e{2,}f{1,3}g+?', '[^a-c\\d]', '\\u0041\\x41\\u{1F600}\\cA\\t\\0', '\\p{L}\\P{N}', '\\1\\k<n>', '(?i:a)', 'a|b'];
  for (const pattern of patterns) {
    for (const { node } of flattenTree(parsePattern(pattern, 'u').tree)) {
      const e = explainNode(node);
      assert.ok(e.en.length > 2 && e.yue.length > 1 && !/undefined/.test(e.en + e.yue), `${pattern} ${node.type}`);
    }
  }
  assert.match(explainNode(parsePattern('a{2,5}?').tree.children[0]).en, /between 2 and 5 times, as few as possible/);
});

test('risk notes flag nested repetition and long expressions as heuristics', () => {
  assert.ok(riskNotes('^(a+)+$').length >= 1);
  assert.equal(riskNotes('abc').length, 0);
  assert.ok(riskNotes('x'.repeat(300)).length === 1);
});

test('token palette explains every token and inserts selection-aware syntax', () => {
  assert.ok(tokenCatalog.length >= 40);
  for (const token of tokenCatalog) {
    assert.ok(token.enDesc.length > 5 && token.yueDesc.length > 1, token.id);
    const body = token.insert.replace('text', 'x');
    const sample = token.group === 'quantifiers' ? 'a' + body : token.group === 'references' ? '(?<name>b)(c)' + body : body;
    const flags = token.needs === 'v' ? 'v' : 'u';
    assert.deepEqual(parsePattern(sample, flags).errors, [], `${token.id} ${sample}`);
    if (token.needs !== 'modifiers') assert.doesNotThrow(() => new RegExp(sample, flags), `${token.id} ${sample}`);
  }
  assert.ok(guidedTokens.some(t => t[0] === 'namedReference'));
  const group = tokenCatalog.find(t => t.id === 'noncapture');
  assert.deepEqual(insertToken('abc', 1, 2, group), { pattern: 'a(?:b)c', selectionStart: 6, selectionEnd: 6, rejected: false });
  const empty = insertToken('ab', 2, 2, group);
  assert.equal(empty.pattern, 'ab(?:text)'); assert.equal(empty.pattern.slice(empty.selectionStart, empty.selectionEnd), 'text');
  const named = insertToken('', 0, 0, tokenCatalog.find(t => t.id === 'named'));
  assert.equal(named.pattern.slice(named.selectionStart, named.selectionEnd), 'name');
  assert.equal(insertToken('a', 1, 1, tokenCatalog.find(t => t.id === 'digit')).pattern, 'a\\d');
  assert.equal(insertToken('a'.repeat(512), 512, 512, group).rejected, true);
});

test('escaped literal text can never change the expression structure', () => {
  const nasty = 'a.b*c?(d)[e]{1}|\\/^$+';
  const re = new RegExp(escapeLiteral(nasty));
  assert.ok(re.test(`xx${nasty}yy`));
  assert.equal(new RegExp(`^${escapeLiteral(nasty)}$`).test(nasty + '!'), false);
});

test('replacement templates parse into explained parts matching JavaScript rules', () => {
  const parts = parseReplacement('x$1-$<n>-$&$$ $` $\' $9', { groupCount: 2, names: ['n'] });
  assert.deepEqual(parts.map(p => p.kind), ['literal', 'group', 'literal', 'named', 'literal', 'match', 'dollar', 'literal', 'before', 'literal', 'after', 'literal']);
  assert.equal(parts.at(-1).text, ' $9', 'a reference past the group count stays literal, as in JavaScript');
  for (const p of parts) assert.ok(p.en && p.yue);
  assert.equal(parseReplacement('$<n>', { groupCount: 0, names: [] })[0].kind, 'literal');
});
