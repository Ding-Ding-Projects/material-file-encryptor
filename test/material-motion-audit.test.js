import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, auditGeneratedSite, runtimeUpgradeIntact, NATIVE_CONTROL_ALLOWLIST } from '../scripts/audit-material-motion.mjs';
import { stageSite } from '../scripts/build-site.mjs';

const result = runAudit();

test('the browser extension, renderer, documentation site and verification page have no Material or motion audit findings', () => {
  assert.ok(result.scanned > 50, 'the audit must actually scan the extension, renderer and site sources');
  assert.deepEqual(result.findings, [], result.findings.map(f => `${f.rule} ${f.file} ${f.detail}`).join('\n'));
});

test('every native control allowlist entry states a reason and stays minimal', () => {
  assert.ok(NATIVE_CONTROL_ALLOWLIST.length <= 5);
  for (const entry of NATIVE_CONTROL_ALLOWLIST) {
    assert.ok(entry.reason && entry.reason.length > 30, `allowlist entry for ${entry.file} needs a real reason`);
    assert.ok(entry.file && entry.tag && entry.match instanceof RegExp);
  }
});

test('documentation site entries are allowed only while the runtime control upgrade is wired in', () => {
  const site = NATIVE_CONTROL_ALLOWLIST.filter(entry => entry.file.startsWith('docs/site/'));
  assert.ok(site.length > 0 && site.every(entry => entry.runtimeUpgrade === true));
  assert.equal(runtimeUpgradeIntact(), true);
  const source = readFileSync(new URL('../docs/site/site.js', import.meta.url), 'utf8');
  assert.match(source, /preparePublicDocumentControls\(document\)/);
});

test('the audit fails on a planted native control, missing state transition, missing enter animation and missing reduced-motion override', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-audit-'));
  try {
    writeFileSync(join(dir, 'bad.css'), '.chip{cursor:pointer}.chip:hover{background:#eee}dialog{transition:opacity 1s ease-in}');
    writeFileSync(join(dir, 'bad.html'), '<!doctype html><link rel="stylesheet" href="bad.css"><button class="chip">Go</button><dialog open>Hi</dialog><p role="status">Ready</p>');
    const planted = auditGeneratedSite(dir);
    const rules = new Set(planted.findings.map(f => f.rule));
    for (const rule of ['native-control', 'missing-transition', 'missing-enter', 'missing-reduced']) assert.ok(rules.has(rule), `the planted ${rule} defect must be reported`);
    assert.deepEqual(auditGeneratedSite(dir).findings.length, planted.findings.length, 'planted findings must not leak into later audits');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the staged documentation site has no Material or motion audit findings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-site-'));
  try {
    await stageSite(process.cwd(), join(dir, 'site'));
    const staged = auditGeneratedSite(join(dir, 'site'));
    assert.ok(staged.pages > 10, 'the staged site must contain its generated pages');
    assert.deepEqual(staged.findings, [], staged.findings.map(f => `${f.rule} ${f.file} ${f.detail}`).join('\n'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
