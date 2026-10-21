import path from 'node:path';
import { registryDestination } from './registry-storage.js';

/** Test transport is main-owned and requires the existing isolated verification profile. */
export function registryVerificationDestination({ argv, verificationMode, profile }) {
  const values = argv.filter(value => value.startsWith('--registry-test-endpoint='));
  if (!values.length) return null;
  if (values.length !== 1 || !verificationMode || typeof profile !== 'string' || !path.isAbsolute(profile))
    throw Error('Registry verification requires an isolated verification profile.');
  const endpoint = values[0].slice('--registry-test-endpoint='.length);
  const target = registryDestination({ endpoint, repository: 'verification/vault', testOnly: true });
  return Object.freeze({ endpoint: target.endpoint, testOnly: true });
}
