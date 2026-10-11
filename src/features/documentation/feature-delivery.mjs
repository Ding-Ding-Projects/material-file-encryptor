import { REQUIRED_FEATURE_IDS } from './required-features.mjs';
export function validateFeatureDelivery(manifest, exists = () => true) {
  const errors = [];
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.features)) return ['Invalid feature delivery schema.'];
  for (const surface of ['desktop', 'site']) for (const id of REQUIRED_FEATURE_IDS) {
    const rows = manifest.features.filter(row => row.id === id && row.surface === surface);
    if (rows.length !== 1) { errors.push(`${surface}/${id}: expected exactly one row.`); continue; }
    const row = rows[0];
    if (!['implemented', 'unverified', 'missing', 'not-applicable'].includes(row.status)) errors.push(`${surface}/${id}: invalid status.`);
    if (row.status !== 'implemented' && !row.reason?.trim()) errors.push(`${surface}/${id}: reason required.`);
    for (const field of ['implementation', 'documentation', 'localization', 'tests', 'evidence']) {
      if (!Array.isArray(row[field])) { errors.push(`${surface}/${id}: ${field} must be an array.`); continue; }
      if (row.status === 'implemented' && row[field].length === 0) errors.push(`${surface}/${id}: missing ${field}.`);
      for (const file of row[field]) if (typeof file !== 'string' || !file || !exists(file)) errors.push(`${surface}/${id}: absent ${field} file.`);
    }
  }
  const expected = new Set(REQUIRED_FEATURE_IDS);
  for (const row of manifest.features) if (!expected.has(row.id) || !['desktop', 'site'].includes(row.surface)) errors.push('Unknown feature or surface.');
  return errors;
}
