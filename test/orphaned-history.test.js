import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('creating a drive in a folder with no drive sets an old history aside instead of colliding with it', () => {
  const source = readFileSync(new URL('../native/MaterialFileEncryptor.Host/VaultController.cs', import.meta.url), 'utf8');
  assert.match(source, /if \(create && !File\.Exists\(System\.IO\.Path\.Combine\(options\.StorageRoot, "vault\.json"\)\) && !File\.Exists\(System\.IO\.Path\.Combine\(options\.CacheRoot, "vault\.json"\)\)\)\s+SetAsideOrphanedHistory\(historyRoot\);\s+selectedHistory = new GitVaultHistory\(options\.CacheRoot, historyRoot\);/);
  assert.match(source, /string aside = historyRoot \+ "\.orphaned-"/);
  assert.match(source, /try \{ Directory\.Move\(historyRoot, aside\); return aside; \}/, 'renamed, never deleted');
  assert.doesNotMatch(source, /Directory\.Delete\(historyRoot/);
  const lifecycle = readFileSync(new URL('../native/MaterialFileEncryptor.Lifecycle.Tests/Program.cs', import.meta.url), 'utf8');
  assert.match(lifecycle, /^OrphanedHistoryRegression\.Run\(\);$/m);
});
