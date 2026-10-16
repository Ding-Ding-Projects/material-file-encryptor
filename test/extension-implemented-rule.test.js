import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFeatureDelivery } from '../src/features/documentation/feature-delivery.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../contracts/feature-delivery.json', import.meta.url), 'utf8'));

// An applicable extension row, given present behaviour and complete evidence below, used as the fixture for the implemented-row rules.
const index = manifest.features.findIndex(row => row.surface === 'extension' && row.id === 'display-name' && row.status === 'unverified');
const rowErrors = (candidate, id) => validateFeatureDelivery(candidate).filter(error => error.startsWith(`extension/${id}:`));

function withRow(change) {
  const copy = structuredClone(manifest);
  const row = copy.features[index];
  Object.assign(row, {
    status: 'implemented', builtInteraction: 'verified', visualEvidence: 'verified',
    evidence: [...(row.evidence || []), 'docs/evidence/installed-proof-1.782.1.json'],
    evidenceVerdict: 'current-runtime-verified', behaviorVerdict: 'present'
  });
  if (row.completion && Array.isArray(row.completion.gaps)) row.completion.gaps = [];
  change(row);
  return copy;
}

test('the committed extension rows still pass the extension rules', () => {
  assert.ok(index >= 0, 'an applicable extension row with present behaviour exists');
  assert.deepEqual(validateFeatureDelivery(manifest), []);
});

test('an extension row with complete evidence may be implemented', () => {
  const id = manifest.features[index].id;
  assert.deepEqual(rowErrors(withRow(() => {}), id), []);
});

test('an implemented extension row still saying runtime-unverified is rejected', () => {
  const id = manifest.features[index].id;
  assert.ok(rowErrors(withRow(row => { row.evidenceVerdict = 'current-runtime-unverified'; }), id).some(error => error.includes('invalid independent evidence verdict')));
});

test('an implemented extension row without present behaviour is rejected', () => {
  const id = manifest.features[index].id;
  assert.ok(rowErrors(withRow(row => { row.behaviorVerdict = 'partial'; }), id).some(error => error.includes('behavior and delivery verdicts disagree')));
});

test('an implemented extension row that still lists gaps is rejected', () => {
  const id = manifest.features[index].id;
  const candidate = withRow(row => { row.completion = { ...(row.completion || {}), gaps: ['proof'] }; });
  assert.ok(rowErrors(candidate, id).some(error => error.includes('gaps contradict')));
});

test('an unverified extension row may not drop the runtime-unverified verdict', () => {
  const copy = structuredClone(manifest);
  const row = copy.features[index];
  row.evidenceVerdict = 'current-runtime-verified';
  assert.ok(rowErrors(copy, row.id).some(error => error.includes('invalid independent evidence verdict')));
});
