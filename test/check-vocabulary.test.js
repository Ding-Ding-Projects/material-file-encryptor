import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkVocabulary, dictionaryDigest } from '../scripts/check-vocabulary.mjs';

const section = '## Vocabulary and locations\n\nSynthetic fixture entry.\n';
const sourceText = `# Synthetic instructions\nOutside before.\n${section}\n## Other section\nOutside after.\n`;
const expected = createHash('sha256').update(section).digest('hex');
async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'instruction-check-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const source = path.join(folder, 'source.md');
  await fs.writeFile(source, sourceText);
  await fs.writeFile(`${source}.lock.json`, JSON.stringify({ version: 1, sha256: expected }));
  return source;
}
test('heading-delimited hashing normalizes CRLF and excludes surrounding sections', () => {
  assert.equal(dictionaryDigest(sourceText), expected);
  assert.equal(dictionaryDigest(sourceText.replaceAll('\n', '\r\n')), expected);
  assert.equal(dictionaryDigest(sourceText.replace('Outside after.', 'Changed unrelated section.')), expected);
  assert.notEqual(dictionaryDigest(sourceText.replace('fixture entry', 'modified entry')), expected);
});
test('missing, duplicate and empty dictionary sections fail', () => {
  for (const text of ['# Other\nText', section + section, '## Vocabulary and locations\n\n## End\n'])
    assert.throws(() => dictionaryDigest(text), /PRIVATE_INSTRUCTIONS_CHECK_FAILED/);
});
test('absent configuration skips without disclosing source information', async () => {
  const environment = { ...process.env }; delete environment.PRIVATE_INSTRUCTIONS_SOURCE;
  const result = spawnSync(process.execPath, ['scripts/check-vocabulary.mjs'], { cwd: process.cwd(), env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(result.stdout, /skipped/); assert.equal(result.stderr, '');
});
test('valid external source and versioned sidecar pass without mutation', async t => {
  const source = await fixture(t); const before = await fs.readFile(`${source}.lock.json`, 'utf8');
  assert.equal((await checkVocabulary({ source })).code, 0);
  assert.equal(await fs.readFile(`${source}.lock.json`, 'utf8'), before);
});
for (const kind of ['missing-source', 'missing-lock', 'malformed-lock', 'stale-lock', 'unknown-field', 'wrong-version', 'blank-source', 'relative-source']) {
  test(`${kind} fails closed`, async t => {
    let source = await fixture(t);
    if (kind === 'missing-source') await fs.rm(source);
    if (kind === 'missing-lock') await fs.rm(`${source}.lock.json`);
    if (kind === 'malformed-lock') await fs.writeFile(`${source}.lock.json`, '{');
    if (kind === 'stale-lock') await fs.writeFile(source, sourceText.replace('fixture entry', 'changed entry'));
    if (kind === 'unknown-field') await fs.writeFile(`${source}.lock.json`, JSON.stringify({ version: 1, sha256: expected, extra: true }));
    if (kind === 'wrong-version') await fs.writeFile(`${source}.lock.json`, JSON.stringify({ version: 2, sha256: expected }));
    if (kind === 'blank-source') source = '';
    if (kind === 'relative-source') source = 'relative.md';
    assert.equal((await checkVocabulary({ source })).code, 1);
  });
}
test('source inside the repository is rejected', async t => {
  const source = await fixture(t);
  assert.equal((await checkVocabulary({ source, repositoryRoot: path.dirname(source) })).code, 1);
});
test('CLI failures expose no source path, dictionary text, hash or exception detail', async t => {
  const source = await fixture(t); await fs.writeFile(`${source}.lock.json`, JSON.stringify({ version: 1, sha256: 'b'.repeat(64) }));
  const result = spawnSync(process.execPath, ['scripts/check-vocabulary.mjs'], { cwd: process.cwd(), env: { ...process.env, PRIVATE_INSTRUCTIONS_SOURCE: source }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  for (const value of [source, path.dirname(source), 'Synthetic fixture entry', expected, 'b'.repeat(64), 'ENOENT', 'Error:']) assert.ok(!output.includes(value));
});
test('pre-push delegates to the same checker without lock generation', async () => {
  const hook = await fs.readFile('.githooks/pre-push', 'utf8');
  assert.match(hook, /exec node "\$root\/scripts\/check-vocabulary\.mjs"/);
  assert.doesNotMatch(hook, /writeFile|lock\.json|sha256/);
  assert.equal((await fs.readFile('.githooks/.gitattributes', 'utf8')).trim(), 'pre-push text eol=lf');
});
for (const kind of ['oversized-source', 'oversized-lock', 'invalid-utf8']) test(`${kind} fails with generic output`, async t => {
  const source = await fixture(t);
  if (kind === 'oversized-source') await fs.writeFile(source, 'x'.repeat(2 * 1024 * 1024 + 1));
  if (kind === 'oversized-lock') await fs.writeFile(`${source}.lock.json`, 'x'.repeat(4097));
  if (kind === 'invalid-utf8') await fs.writeFile(source, Buffer.from([0xff]));
  assert.deepEqual(await checkVocabulary({ source }), { code: 1, message: 'Private instruction check failed: source or lock is missing, invalid, or stale.' });
});
