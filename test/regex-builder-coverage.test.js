import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const coverage = JSON.parse(readFileSync(new URL('src/shared/surface/regex/coverage.json', root), 'utf8'));

// Hand-written list of the families the parity checklist names; a rule-shaped check alone would
// not notice a family that was never written down.
const REQUIRED_FAMILIES = ['construction', 'replacement', 'analysis', 'flavors', 'testing', 'debugger', 'benchmark', 'code', 'library', 'grep', 'history', 'integration', 'help-preferences'];
const STATUSES = new Set(['implemented', 'partial', 'unsupported']);

function testTitles() {
  const dir = new URL('test/', root);
  const titles = new Set();
  for (const name of readdirSync(dir)) {
    if (!/^(regex-builder-.*|surface-worker|surface-workbench)\.test\.js$/.test(name)) continue;
    const source = readFileSync(new URL(name, dir), 'utf8');
    for (const m of source.matchAll(/\btest\((['"`])((?:\\.|(?!\1).)*)\1/g)) titles.add(m[2].replace(/\\(['"`])/g, '$1'));
  }
  return titles;
}

function problems(doc, titles, fileExists = path => existsSync(new URL(path, root))) {
  const found = [];
  const ids = new Set();
  for (const family of REQUIRED_FAMILIES) if (!doc.families.includes(family) || !doc.topics.some(t => t.family === family)) found.push(`family missing: ${family}`);
  for (const t of doc.topics) {
    if (ids.has(t.id)) found.push(`duplicate id: ${t.id}`); ids.add(t.id);
    if (!REQUIRED_FAMILIES.includes(t.family)) found.push(`unknown family: ${t.id}`);
    if (!STATUSES.has(t.status)) { found.push(`bad status: ${t.id}`); continue; }
    if (t.status !== 'implemented' && !(typeof t.reason === 'string' && t.reason.length > 20)) found.push(`reason required: ${t.id}`);
    if (t.status === 'implemented') {
      if (!t.tests?.length) found.push(`implemented without tests: ${t.id}`);
      if (!t.implementation?.length) found.push(`implemented without implementation: ${t.id}`);
      if (t.reason) found.push(`implemented topic keeps a reason: ${t.id}`);
    }
    if (t.status === 'unsupported' && t.implementation?.length) found.push(`unsupported topic lists implementation: ${t.id}`);
    for (const file of t.implementation || []) if (!fileExists(file)) found.push(`missing file ${file}: ${t.id}`);
    for (const title of t.tests || []) if (!titles.has(title)) found.push(`unknown test "${title}": ${t.id}`);
  }
  return found;
}

test('coverage inventory is consistent with the source tree and the named tests', () => {
  assert.deepEqual(problems(coverage, testTitles()), []);
  assert.ok(coverage.topics.length >= 50);
  assert.match(coverage.manualVersionBaseline, /unavailable/);
});

test('coverage never claims more than its statuses allow', () => {
  const counts = Object.groupBy(coverage.topics, t => t.status);
  assert.ok(counts.implemented.length > 0 && counts.partial.length > 0 && counts.unsupported.length > 0);
  for (const t of counts.partial) assert.ok(t.reason.length > 20, t.id);
  // Items that need the built application can only ever be partial, never implemented.
  for (const id of ['analysis.selection-sync', 'testing.highlighting', 'testing.navigation', 'debugger.stepper-interface', 'help.keyboard-and-accessibility', 'library.isolation']) {
    assert.equal(coverage.topics.find(t => t.id === id).status, 'partial', id);
  }
});

test('coverage check turns red when a family, test or file binding is removed and green when restored', () => {
  const titles = testTitles();
  const clone = () => structuredClone(coverage);
  assert.deepEqual(problems(clone(), titles), []);
  const noFamily = clone(); noFamily.topics = noFamily.topics.filter(t => t.family !== 'debugger');
  assert.ok(problems(noFamily, titles).some(p => /family missing: debugger/.test(p)));
  const noTests = clone(); noTests.topics.find(t => t.status === 'implemented').tests = [];
  assert.ok(problems(noTests, titles).some(p => /implemented without tests/.test(p)));
  const fakeTest = clone(); fakeTest.topics.find(t => t.status === 'implemented').tests = ['a test that does not exist'];
  assert.ok(problems(fakeTest, titles).some(p => /unknown test/.test(p)));
  const noReason = clone(); delete noReason.topics.find(t => t.status === 'unsupported').reason;
  assert.ok(problems(noReason, titles).some(p => /reason required/.test(p)));
  const noFile = clone();
  assert.ok(problems(noFile, titles, () => false).some(p => /missing file/.test(p)));
  assert.deepEqual(problems(clone(), titles), []);
});
