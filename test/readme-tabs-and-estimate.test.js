import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  BUCKETS, RATES, SECTION_HEADING, TOLERANCE, arithmetic, checkReadme, classify, computeEstimate, estimateFromFiles, parseReadmeBlock, renderReadmeBlock, writeReadmeBlock,
} from '../scripts/human-time-estimate.mjs';

const readme = (await fs.readFile('README.md', 'utf8')).replace(/\r\n/g, '\n');

/** Splits README text into the parts outside and inside collapsible blocks. */
function visibleText(text) {
  let depth = 0, visible = '';
  for (const line of text.split('\n')) {
    if (line.trim() === '<details>') { depth += 1; continue; }
    if (line.trim() === '</details>') { depth -= 1; continue; }
    if (depth === 0) visible += line + '\n';
  }
  return visible;
}

test('the README opens with a compact index and keeps first-reader content visible', () => {
  const firstSection = readme.indexOf('\n## ');
  const opening = readme.slice(0, firstSection);
  assert.match(opening, /^# Material File Encryptor/);
  assert.match(opening, /\*\*Install:\*\*/);
  assert.match(opening, /\*\*Price:\*\* free\./);
  assert.match(opening, /\*\*Contents:\*\*/);
  assert.match(opening, /\[Documentation website\]\(https:\/\/ding-ding-projects\.github\.io\/material-file-encryptor\/\)/);
  const visible = visibleText(readme);
  for (const needed of ['## Choose a workflow', '## Build, package and verify', '## Documentation and contributing', SECTION_HEADING, '**Install:**', '### Current captures']) {
    assert.ok(visible.includes(needed), `"${needed}" must be visible without expanding anything`);
  }
  // Every index anchor resolves to a heading that is itself visible.
  const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const visibleSlugs = new Set([...visible.matchAll(/^#{2,3} (.+)$/gm)].map(match => slug(match[1])));
  const contents = opening.match(/\*\*Contents:\*\*[^\n]*/)[0];
  const anchors = [...contents.matchAll(/\]\(#([^)]+)\)/g)].map(match => match[1]);
  assert.ok(anchors.length >= 6);
  for (const anchor of anchors) assert.ok(visibleSlugs.has(anchor), `index anchor #${anchor} should name a visible heading`);
});

test('long reference sections are collapsed behind findable summaries', () => {
  const opens = (readme.match(/^<details>$/gm) || []).length, closes = (readme.match(/^<\/details>$/gm) || []).length;
  assert.equal(opens, closes);
  assert.ok(opens >= 20, 'the long reference sections and the screenshot groups are all collapsed');
  const summaries = [...readme.matchAll(/^<details>\n<summary>([^<>\n]+)<\/summary>$/gm)].map(match => match[1]);
  assert.equal(summaries.length, opens, 'every collapsible block opens with a plain-text summary');
  assert.ok(summaries.every(summary => summary.length >= 8), 'summaries are descriptive enough to find');
  for (const summary of ['Verification table, unfinished delivery and the preview capture history', 'Security, privacy and recovery boundaries in full']) assert.ok(summaries.includes(summary));
  assert.ok(readme.indexOf('</details>\n\n### Current captures') > 0, 'the evidence block closes before the screenshot gallery, which stays intact');
});

test('the repository tabs GitHub shows above the README are real files', async () => {
  for (const [file, heading] of [['CONTRIBUTING.md', '# Contributing'], ['SECURITY.md', '# Security policy'], ['CODE_OF_CONDUCT.md', '# Code of conduct'], ['LICENSE', '']]) {
    const text = await fs.readFile(file, 'utf8');
    assert.ok(text.length > 500, `${file} is not a stub`);
    if (heading) assert.ok(text.startsWith(heading), `${file} starts with ${heading}`);
  }
});

test('the README human-time estimate is current and its arithmetic is shown and correct', () => {
  const estimate = computeEstimate();
  assert.deepEqual(checkReadme(readme, estimate), [], 'run `node scripts/human-time-estimate.mjs --write` to refresh the README block');
  const parsed = parseReadmeBlock(readme);
  assert.deepEqual(parsed.days, arithmetic(parsed.inputs.weighted).days);
  assert.deepEqual(parsed.months, arithmetic(parsed.inputs.weighted).months);
  assert.match(parsed.block, /Estimate, not a measurement/);
  assert.match(parsed.block, /Arithmetic:/);
  assert.match(parsed.block, /Left out, exactly as the line count leaves them out/);
  assert.match(parsed.block, new RegExp(`${RATES.conservative} \\(conservative\\) to ${RATES.optimistic} \\(optimistic\\)`));
  assert.ok(parsed.months.low < parsed.months.high, 'the estimate is a range');
});

test('the estimate check fails when the README is stale or its arithmetic is wrong', () => {
  const estimate = computeEstimate();
  const fresh = writeReadmeBlock(readme, estimate);
  assert.deepEqual(checkReadme(fresh, estimate), []);
  const stale = { ...estimate, weighted: Math.round(estimate.weighted * (1 + TOLERANCE * 2)) };
  assert.ok(checkReadme(fresh, stale).some(problem => /differs from the current tree/.test(problem)));
  const withinTolerance = { ...estimate, weighted: Math.round(estimate.weighted * (1 + TOLERANCE / 2)) };
  assert.deepEqual(checkReadme(fresh, withinTolerance), []);
  const wrongMonths = fresh.replace(/about \*\*[\d.]+ to/, 'about **1.0 to');
  assert.ok(checkReadme(wrongMonths, estimate).some(problem => /months do not follow/.test(problem)));
  const wrongTotal = fresh.replace(/\| \*\*Total\*\* \| \| \*\*([\d,]+)\*\* \| \| \*\*[\d,]+\*\* \|/, '| **Total** | | **$1** | | **1** |');
  assert.ok(checkReadme(wrongTotal, estimate).length > 0);
  assert.deepEqual(checkReadme('# No estimate here\n', estimate), ['The README has no readable human-time estimate block.']);
});

test('the estimator counts only hand-written code and states what it leaves out', () => {
  assert.deepEqual(classify('src/renderer/app.js'), { bucket: 'application' });
  assert.deepEqual(classify('native/MaterialFileEncryptor.Core/Vault.cs'), { bucket: 'native' });
  assert.deepEqual(classify('native/MaterialFileEncryptor.Core.Tests/VaultTests.cs'), { bucket: 'tests' });
  assert.deepEqual(classify('test/ui-renderer.test.js'), { bucket: 'tests' });
  assert.deepEqual(classify('scripts/build.ps1'), { bucket: 'tooling' });
  assert.deepEqual(classify('build.bat'), { bucket: 'tooling' });
  assert.deepEqual(classify('docs/site/site.css'), { bucket: 'markup' });
  for (const excluded of ['native/vendor/WinFsp/winfsp.cs', 'src/renderer/fonts/index.js', 'package-lock.json', 'docs/features/data.json', 'docs/images/a.png', 'README.md', 'design/x/prototype.html', 'vendor.min.js']) {
    assert.ok(classify(excluded).excluded, `${excluded} is left out`);
  }
  const files = { 'src/a.js': 'one\n\n  \ntwo\n', 'native/B.cs': 'x\ny\n', 'src/vendor/lib.js': 'ignored\n', 'docs/readme.md': 'prose\n\nmore\n', 'bin.dat.js': null };
  const result = estimateFromFiles(Object.keys(files), path => files[path]);
  assert.equal(result.buckets.application.nonBlank, 2);
  assert.equal(result.buckets.native.nonBlank, 2);
  assert.equal(result.weighted, 2 + 2 * 1.5);
  assert.equal(result.markdown.nonBlank, 2);
  assert.equal(result.excluded['binary or unreadable files'], 1);
  assert.equal(BUCKETS.length, Object.keys(result.buckets).length);
  assert.match(renderReadmeBlock(result), /Left out, exactly as the line count leaves them out/);
});
