import test from 'node:test';
import assert from 'node:assert/strict';
import { runAudit, NATIVE_CONTROL_ALLOWLIST } from '../scripts/audit-material-motion.mjs';

const result = runAudit();

test('the browser extension and renderer have no Material or motion audit findings', () => {
  assert.ok(result.scanned > 50, 'the audit must actually scan the extension and renderer sources');
  assert.deepEqual(result.findings, [], result.findings.map(f => `${f.rule} ${f.file} ${f.detail}`).join('\n'));
});

test('every native control allowlist entry states a reason and stays minimal', () => {
  assert.ok(NATIVE_CONTROL_ALLOWLIST.length <= 3);
  for (const entry of NATIVE_CONTROL_ALLOWLIST) {
    assert.ok(entry.reason && entry.reason.length > 30, `allowlist entry for ${entry.file} needs a real reason`);
    assert.ok(entry.file && entry.tag && entry.match instanceof RegExp);
  }
});
