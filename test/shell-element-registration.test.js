import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellFile = path.join(root, 'src/renderer/features/shell/index.js');
const surfaceDir = path.join(root, 'src/shared/surface');

// Every custom element the shell creates must be defined by a module the shell (or one of its imports) loads;
// an undefined tag renders as an empty box, which is how the front-screen build line went missing.
function definedTags(file, seen = new Set()) {
  if (seen.has(file) || !fs.existsSync(file)) return new Set();
  seen.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const tags = new Set([...source.matchAll(/register\('([a-z0-9-]+)'/g)].map(match => match[1]));
  for (const match of source.matchAll(/^import\s+(?:[^'";]*?from\s+)?'(\.[^']+\.js)'/gm)) {
    for (const tag of definedTags(path.resolve(path.dirname(file), match[1]), seen)) tags.add(tag);
  }
  return tags;
}

test('every surface element the shell creates is defined by a loaded module', () => {
  const source = fs.readFileSync(shellFile, 'utf8');
  const created = [...new Set([...source.matchAll(/element\('(mfe-[a-z0-9-]+)'/g)].map(match => match[1]))];
  const registeredSomewhere = new Set();
  for (const name of fs.readdirSync(surfaceDir)) {
    if (!name.endsWith('.js')) continue;
    for (const match of fs.readFileSync(path.join(surfaceDir, name), 'utf8').matchAll(/register\('([a-z0-9-]+)'/g)) registeredSomewhere.add(match[1]);
  }
  const loaded = definedTags(shellFile);
  const missing = created.filter(tag => registeredSomewhere.has(tag) && !loaded.has(tag));
  assert.deepEqual(missing, []);
  assert.ok(created.includes('mfe-build-provenance'), 'the shell still creates the build provenance line');
});
