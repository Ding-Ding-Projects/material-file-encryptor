import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('trusted CI scanner handles bare objects and never executes candidate scripts', t => {
  const temporaryParent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryParent, 'publication-bare-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), temporaryParent);
    assert.ok(path.basename(root).startsWith('publication-bare-test-'));
    fs.rmSync(root, { recursive: true });
  });
  const repository = path.join(root, 'candidate.git');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Claude Fable 5.1', GIT_AUTHOR_EMAIL: 'noreply@anthropic.com', GIT_COMMITTER_NAME: 'Claude Fable 5.1', GIT_COMMITTER_EMAIL: 'noreply@anthropic.com' };
  const git = (args, input) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, env, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '--bare', repository]);
  const object = text => git(['-C', repository, 'hash-object', '-w', '--stdin'], text);
  const sentinel = path.join(root, 'candidate-executed');
  const packageBlob = object(JSON.stringify({ scripts: { preinstall: `node -e "require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'executed')"` } }));
  const makeCommit = (text, parent) => {
    const blob = object(text);
    const tree = git(['-C', repository, 'mktree'], `100644 blob ${blob}\tREADME.md\n100644 blob ${packageBlob}\tpackage.json\n`);
    return git(['-C', repository, 'commit-tree', tree, ...(parent ? ['-p', parent] : [])], 'Synthetic publication fixture\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\n');
  };
  const base = makeCommit('Neutral baseline.\n');
  const clean = makeCommit('Neutral candidate.\n', base);
  const contaminated = makeCommit('restrictedmarker\n', base);
  const policy = JSON.stringify({ schemaVersion: 1, dictionary: { terms: [{ alias: 'restrictedmarker', plural: 'restrictedmarkers', proseOnly: true, forms: ['restrictedmarker', 'restrictedmarkers'] }] }, publicSafePhrases: [] });
  const runner = fileURLToPath(new URL('../scripts/run-publication-language-ci.mjs', import.meta.url));
  const scan = (tip, selectedBase = base) => spawnSync(process.execPath, [runner, '--root', repository, '--tip', tip, '--base', selectedBase, '--mode', 'history'], { input: policy, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  const positive = scan(clean);
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(JSON.parse(positive.stdout).historyProof, true);
  const negative = scan(contaminated);
  assert.equal(negative.status, 1, negative.stderr);
  assert.ok(JSON.parse(negative.stdout).findings.some(row => row.category === 'private-language'));
  const unknownBase = scan(clean, '0'.repeat(40));
  assert.equal(unknownBase.status, 2);
  assert.equal(JSON.parse(unknownBase.stdout).historyProof, false);
  assert.equal(fs.existsSync(sentinel), false);
});
