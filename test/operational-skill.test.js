import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Independent expected inventory: adding or removing a skill requires an explicit edit here.
const SKILLS = [
  'mfe-build-and-verify',
  'mfe-extension-evidence',
  'mfe-installed-verification',
  'mfe-motion-audit',
  'mfe-release-verification',
  'mfe-site-and-screenshots'
];
const SECTIONS = ['When to use', 'Prerequisites', 'Procedure', 'Expected output', 'Failure handling', 'Owner steps', 'Availability'];
const ROOT_FILES = ['build.bat', 'build-installer.bat'];
const PATH_PATTERN = /(?:^|[\s`(])((?:scripts|docs|test|native|browser-extension|contracts|skills)\/[A-Za-z0-9_.<>*\/-]+|build\.bat|build-installer\.bat)/g;

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([a-z][a-z-]*):\s*(.+)$/.exec(line);
    if (!pair) return null;
    fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

export function referencedPaths(text) {
  const found = new Set();
  for (const match of text.matchAll(PATH_PATTERN)) {
    let value = match[1].replace(/[.,;:]+$/, '');
    if (/[<>*]/.test(value)) continue; // placeholders and wildcards name families, not one file
    found.add(value);
  }
  return [...found].sort();
}

async function exists(relative) {
  try { await fs.access(path.join(root, relative)); return true; } catch { return false; }
}

export async function missingReferences(text) {
  const missing = [];
  for (const reference of referencedPaths(text)) if (!(await exists(reference))) missing.push(reference);
  return missing;
}

test('exactly the expected skill folders exist', async () => {
  const entries = await fs.readdir(path.join(root, 'skills'), { withFileTypes: true });
  const folders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(folders, SKILLS);
});

for (const name of SKILLS) {
  test(`${name} has valid frontmatter and the required sections`, async () => {
    const text = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    const fields = parseFrontmatter(text);
    assert.ok(fields, 'frontmatter block is present and well formed');
    assert.deepEqual(Object.keys(fields).sort(), ['description', 'name']);
    assert.equal(fields.name, name);
    assert.match(fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(fields.description.length >= 40 && fields.description.length <= 400, 'description length is reasonable');
    const headings = [...text.matchAll(/^## (.+)$/gm)].map(match => match[1].trim());
    assert.deepEqual(headings, SECTIONS);
    for (const section of SECTIONS) {
      const body = text.split(new RegExp(`^## ${section}$`, 'm'))[1].split(/^## /m)[0];
      assert.ok(body.trim().length > 20, `${section} is not empty`);
    }
  });

  test(`${name} references only paths that exist`, async () => {
    const text = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.ok(referencedPaths(text).length > 0, 'names at least one repository path');
    assert.deepEqual(await missingReferences(text), []);
  });

  test(`${name} contains no local absolute paths`, async () => {
    const text = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z]:\\|\/Users\/|\\Users\\/);
  });
}

test('the skills index lists every skill and links to an existing file', async () => {
  const text = await fs.readFile(path.join(root, 'skills/README.md'), 'utf8');
  for (const name of SKILLS) assert.ok(text.includes(`(${name}/SKILL.md)`), `${name} is linked`);
  assert.deepEqual(await missingReferences(text), []);
});

test('the build skill names both root entrypoints', async () => {
  const text = await fs.readFile(path.join(root, 'skills/mfe-build-and-verify/SKILL.md'), 'utf8');
  for (const file of ROOT_FILES) assert.ok(text.includes(file), `${file} is documented`);
});

test('the checker rejects a planted broken reference and a broken frontmatter', async () => {
  assert.deepEqual(await missingReferences('Run `node scripts/does-not-exist.mjs` first.'), ['scripts/does-not-exist.mjs']);
  assert.deepEqual(await missingReferences('Run `node scripts/verify-local.ps1` first.'), []);
  assert.deepEqual(await missingReferences('See `docs/evidence/installed-proof-*.json`.'), []);
  assert.equal(parseFrontmatter('no frontmatter here'), null);
  assert.equal(parseFrontmatter('---\nname: x\nnot a field\n---\nbody'), null);
});
