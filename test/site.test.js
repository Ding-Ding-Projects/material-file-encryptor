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
  assert.match(html, /Conceptual drive architecture/);
  assert.match(html, /not a native Windows capture/);
  assert.doesNotMatch(html, /href="[^"]+\.(?:exe|msi)"/);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /github\.com\/DingDingProjects\//);
  for (const match of html.matchAll(/href="(https:\/\/github\.com[^"]+)"/g)) assert.ok(match[1].startsWith('https://github.com/Ding-Ding-Projects/material-file-encryptor'), 'GitHub links must use the real repository owner');
});

test('message preferences accept only supported locales, booleans, and 1–5 integer levels', async () => {
  const { loadMessagePreferences, messagePair, localized } = await import('../docs/site/locales.js');
  const storage = value => ({ getItem: () => JSON.stringify(value) });
  assert.deepEqual(loadMessagePreferences(storage({ language: 'yue', emoji: true, successTone: 5, searchTone: 2 })), { language: 'yue', emoji: true, successTone: 5, searchTone: 2 });
  assert.deepEqual(loadMessagePreferences(storage({ language: 'unknown', emoji: 'yes', successTone: 6, searchTone: 1.5 })), { language: 'en', emoji: false, successTone: 1, searchTone: 1 });
  assert.equal(loadMessagePreferences({ getItem: () => '{invalid' }).language, 'en');
  for (const kind of ['success', 'search']) {
    const levels = [1, 2, 3, 4, 5].map(level => messagePair(kind, level, 3));
    assert.equal(new Set(levels.map(pair => pair[0])).size, 5);
    assert.equal(new Set(levels.map(pair => pair[1])).size, 5);
    assert.ok(levels.every(pair => /[\u3400-\u9fff]/u.test(pair[1])));
  }
  assert.equal(localized('Security', 'yue'), '保安');
  assert.equal(localized('Linux Electron interface · source', 'yue'), 'Linux Electron 介面 · 原始碼');
  assert.equal(localized('Security', 'bilingual'), 'Security / 保安');
  assert.equal(localized('build.bat /s', 'yue'), 'build.bat /s');
});

test('interactive part illustration counts overhead and rejects unusable limits', async () => {
  const { exampleParts, EXAMPLE_FILE_BYTES, EXAMPLE_OVERHEAD } = await import('../docs/site/explainer.js');
  assert.equal(exampleParts('4', 'MB').parts, 5);
  assert.equal(exampleParts('8', 'MB').parts, 3);
  assert.equal(exampleParts('1', 'GB'), null);
  assert.equal(exampleParts('87890.625', 'KB').limit, 90000000);
  assert.equal(exampleParts('87890.6259765625', 'KB'), null);
  assert.equal(exampleParts('1', 'KB').limit, 1024);
  assert.deepEqual(exampleParts('0.0009765625', 'MB'), exampleParts('1', 'KB'));
  assert.equal(exampleParts('0.9990234375', 'KB'), null);
  assert.equal(exampleParts('1.0000000009313226', 'GB'), null);
  assert.equal(exampleParts('128', 'KB').parts, 129);
  assert.equal(exampleParts('64', 'KB').parts, 257);
  assert.equal(exampleParts('4', 'MB').total, EXAMPLE_FILE_BYTES + 5 * EXAMPLE_OVERHEAD);
  for (const [value, unit] of [['0', 'MB'], ['-1', 'MB'], ['abc', 'GB'], ['2', 'GB'], ['1', 'TB'], ['0.00001', 'KB'], ['1e3', 'KB']]) assert.equal(exampleParts(value, unit), null);
});

test('capture gallery identifies actual Linux evidence and conceptual animation controls', async () => {
  const html = await readFile(new URL('../docs/site/index.html', import.meta.url), 'utf8');
  for (const capture of ['locked', 'create', 'keyfile-choice', 'settings-dark', 'help']) assert.match(html, new RegExp(`src="images/captures/desktop-${capture}\\.png"`));
  assert.match(html, /Actual Electron application captures from Linux/);
  assert.match(html, /not proof of a Windows filesystem mount/);
  assert.match(html, /Linux Electron interface · source <code>[a-f0-9]+<\/code>/);
  assert.match(html, /<video controls preload="metadata"/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.match(html, /src="images\/captures\/desktop-linux\.webm"/);
  assert.match(html, /Conceptual demonstration only/);
  assert.match(html, /id="workflow-play"/);
  assert.match(html, /id="workflow-replay"/);
  assert.match(html, /id="success-tone" min="1" max="5"/);
});
