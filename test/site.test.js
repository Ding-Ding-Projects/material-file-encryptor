import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVocabulary, replaceVocabulary, filterGuides } from '../docs/site/preferences.js';

const valid = replacements => JSON.stringify({ version: 1, replacements });
test('site vocabulary accepts the desktop contract and treats replacement markup as plain text', () => {
  const vocabulary = parseVocabulary(valid([{ from: 'folder', to: '<script>alert(1)</script>' }]));
  assert.equal(replaceVocabulary('Choose a folder.', vocabulary), 'Choose a <script>alert(1)</script>.');
});
test('replacements are literal, longest first, and never cascade', () => {
  const vocabulary = parseVocabulary(valid([{ from: 'file', to: 'folder' }, { from: 'folder', to: 'directory' }, { from: 'a.b', to: 'literal' }, { from: 'file size', to: 'capacity' }]));
  assert.equal(replaceVocabulary('file size / file / folder / a.b / axb', vocabulary), 'capacity / folder / directory / literal / axb');
});
test('invalid vocabulary formats, ambiguous entries, prototype names, and bounds fail closed', () => {
  for (const input of [
    'not json', JSON.stringify({ version: 2, replacements: [] }), JSON.stringify({ version: 1, replacements: [], secret: 'x' }),
    valid([{ from: 'x', to: 'y' }, { from: 'x', to: 'z' }]), valid([{ from: '', to: 'x' }]),
    valid([{ from: 'x', to: 'y', extra: 1 }]), valid([{ from: '__proto__', to: 'x' }]),
    valid([{ from: 'x', to: 'constructor' }]), valid([{ from: 'x\n', to: 'y' }]),
    valid([{ from: 'x'.repeat(121), to: 'y' }]), valid([{ from: 'x', to: 'y'.repeat(501) }]),
    valid(Array.from({ length: 201 }, (_, i) => ({ from: String(i), to: '' }))), ' '.repeat(131073),
  ]) assert.throws(() => parseVocabulary(input), Error);
  assert.deepEqual(parseVocabulary(valid([])), { version: 1, replacements: [] });
});
test('documentation search matches all terms without interpreting regex or markup', () => {
  const guides = [{ id: 'offline', text: 'Encrypted offline cache and pinning' }, { id: 'size', text: 'Maximum part size includes overhead KB MB GB' }];
  assert.deepEqual(filterGuides(guides, 'CACHE encrypted').map(x => x.id), ['offline']);
  assert.deepEqual(filterGuides(guides, 'part overhead').map(x => x.id), ['size']);
  assert.deepEqual(filterGuides(guides, 'cache overhead'), []);
  assert.deepEqual(filterGuides(guides, '<script>'), []);
  assert.deepEqual(filterGuides(guides, '  '), guides);
});
test('all same-page links resolve, asset links fit repository Pages, and release status is honest', async () => {
  const html = await readFile(new URL('../docs/site/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'element IDs must be unique');
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing #${match[1]}`);
  assert.match(html, /src="images\/drive-workflow\.png"/);
  assert.match(html, /src="images\/offline-workflow\.png"/);
  assert.doesNotMatch(html, /(?:src|href)="(?:\.\.\/|https?:\/\/[^"\s]+\.(?:js|css|woff2?))/);
  assert.match(html, /disabled aria-describedby="download-help"/);
  assert.match(html, /Planned drive architecture/);
  assert.match(html, /not a native Windows capture/);
  assert.doesNotMatch(html, /href="[^"]+\.(?:exe|msi)"/);
  assert.doesNotMatch(html, /—/);
});
