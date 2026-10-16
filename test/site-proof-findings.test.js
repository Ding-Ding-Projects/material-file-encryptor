import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageSite } from '../scripts/build-site.mjs';
import { buildReleaseRecord } from '../scripts/generate-release-record.mjs';
import { currentRelease, verifiedDownload, publishedDownload, renderReleaseDownload, loadReleaseRecord } from '../docs/site/release.js';

const root = process.cwd();
const SITE = 'https://ding-ding-projects.github.io/material-file-encryptor/';
let out; let scratch;
const releaseApi = (patch = {}) => ({
  tag_name: 'v1.900.1', draft: false, prerelease: false, target_commitish: 'a'.repeat(40), published_at: '2026-10-17T00:00:00Z',
  html_url: 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.900.1',
  assets: [
    { name: 'RELEASES', size: 91, digest: 'sha256:' + '1'.repeat(64) },
    { name: 'MaterialFileEncryptor-Setup.exe', size: 433743360, digest: 'sha256:' + 'c'.repeat(64) },
  ], ...patch,
});

before(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-findings-'));
  const recordPath = path.join(scratch, 'release-record.json');
  await fs.writeFile(recordPath, JSON.stringify(buildReleaseRecord(releaseApi())));
  process.env.RELEASE_RECORD_PATH = recordPath;
  out = path.join(scratch, 'site');
  await stageSite(root, out);
});
after(async () => { delete process.env.RELEASE_RECORD_PATH; await fs.rm(scratch, { recursive: true, force: true }); });

async function htmlFiles(dir = out, prefix = '') {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await htmlFiles(path.join(dir, entry.name), prefix + entry.name + '/'));
    else if (entry.name.endsWith('.html')) found.push(prefix + entry.name);
  }
  return found;
}

// Finding 1: the download area must track the current verified normal release.
test('release record is built only from a normal release read back with an installer checksum', () => {
  const record = buildReleaseRecord(releaseApi());
  assert.equal(record.tag, 'v1.900.1'); assert.equal(record.prerelease, false); assert.equal(record.draft, false);
  assert.equal(record.installer.url, 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/download/v1.900.1/MaterialFileEncryptor-Setup.exe');
  assert.equal(record.installer.sha256, 'c'.repeat(64)); assert.equal(record.installer.bytes, 433743360);
  assert.equal(record.verification.installed.status, 'pending', 'installed behaviour is never claimed by the generator');
  for (const bad of [{ draft: true }, { prerelease: true }, { target_commitish: 'main' }, { assets: [] }, { assets: [{ name: 'MaterialFileEncryptor-Setup.exe', size: 5 }] }, { tag_name: 'x y' }])
    assert.throws(() => buildReleaseRecord(releaseApi(bad)), /RELEASE_/);
});
test('the committed fallback record is a normal release, never the retired preview', () => {
  assert.equal(currentRelease.prerelease, false); assert.doesNotMatch(currentRelease.tag, /preview/);
  assert.ok(publishedDownload(currentRelease));
});
test('a published normal release gets a working download while unproven behaviour is labelled', () => {
  const nodes = new Map(); const mk = tag => ({ tagName: tag.toUpperCase(), attributes: {}, setAttribute(n, v) { this.attributes[n] = v; }, replaceWith(next) { nodes.set('#preview-download', next); } });
  const button = mk('button'); button.disabled = true; nodes.set('#preview-download', button); nodes.set('#download-help', {}); nodes.set('#download-state', {});
  const doc = { querySelector: s => nodes.get(s), createElement: mk };
  const record = buildReleaseRecord(releaseApi());
  assert.equal(verifiedDownload(record), null, 'pending behaviour checks are not verified');
  assert.equal(renderReleaseDownload(doc, record), true);
  const link = nodes.get('#preview-download'); assert.equal(link.tagName, 'A'); assert.equal(link.href, record.installer.url);
  assert.match(nodes.get('#download-state').textContent, /verification pending/);
  for (const broken of [{ ...record, prerelease: true }, { ...record, draft: true }, { ...record, targetCommit: 'b'.repeat(40) }, { ...record, installer: { ...record.installer, url: 'https://example.com/a.exe' } }]) {
    assert.equal(publishedDownload(broken), null);
    const d2 = { querySelector: s => ({ '#preview-download': { tagName: 'BUTTON', disabled: true, removeAttribute() {} }, '#download-help': {}, '#download-state': {} })[s], createElement: mk };
    assert.equal(renderReleaseDownload(d2, broken), false);
  }
});
test('loadReleaseRecord prefers a valid embedded record and falls back otherwise', () => {
  const embedded = buildReleaseRecord(releaseApi());
  const doc = text => ({ querySelector: s => (s === '#release-record' ? { textContent: text } : null) });
  assert.equal(loadReleaseRecord(doc(JSON.stringify(embedded))).tag, 'v1.900.1');
  assert.equal(loadReleaseRecord(doc('{not json')).tag, currentRelease.tag);
  assert.equal(loadReleaseRecord(doc(JSON.stringify({ ...embedded, draft: true }))).tag, currentRelease.tag);
});
test('built home page shows the injected current release and no stale preview', async () => {
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /v0\.1\.0-preview\.16\.1/);
  assert.ok(html.includes('releases/tag/v1.900.1')); assert.ok(html.includes('<code>v1.900.1</code>'));
  assert.ok(html.includes('a'.repeat(12)));
  assert.match(html, /<script type="application\/json" id="release-record">/);
});
test('the publish workflow regenerates the release record from the latest normal release', async () => {
  const yml = await fs.readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  assert.match(yml, /generate-release-record\.mjs/); assert.match(yml, /RELEASE_RECORD_PATH/);
});

// Finding 2: each article has exactly one h1 and a valid heading order.
test('every article page has a single h1 and no skipped heading levels', async () => {
  const files = (await htmlFiles()).filter(f => f.startsWith('articles/'));
  assert.ok(files.length > 200);
  for (const file of files) {
    const html = await fs.readFile(path.join(out, file), 'utf8');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    const levels = [...main.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
    assert.equal(levels.filter(l => l === 1).length, 1, `${file} h1 count`);
    let prev = 0;
    for (const level of levels) { assert.ok(level <= prev + 1, `${file} skips from h${prev} to h${level}`); prev = level; }
    assert.equal(levels[0], 1, `${file} must start with h1`);
  }
});

// Finding 3: no moved-article stub stays orphaned.
test('moved-article stubs are redirects and every article page is linked from another page', async () => {
  const files = await htmlFiles(); const linked = new Set();
  for (const file of files) {
    const html = await fs.readFile(path.join(out, file), 'utf8');
    for (const [, href] of html.matchAll(/href="([^"#]+)/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), href));
      if (resolved !== file) linked.add(resolved);
    }
  }
  const orphans = files.filter(f => f.startsWith('articles/') && !linked.has(f));
  assert.deepEqual(orphans, []);
  for (const name of ['access-local', 'appearance-editor', 'local-personalization']) for (const suffix of ['', '.zh-HK']) {
    const html = await fs.readFile(path.join(out, `articles/docs--features--${name}${suffix}.html`), 'utf8');
    assert.match(html, /<meta http-equiv="refresh" content="0; url=[^"]+\.html">/, name + suffix);
    assert.match(html, /<link rel="canonical" href="[^"]+">/);
  }
  const library = await fs.readFile(path.join(out, 'library.html'), 'utf8');
  assert.ok(library.includes('docs--features--access-local.html'));
});

// Finding 4: small controls get a 24 by 24 CSS pixel target.
test('inline links, footer brand and footer navigation links declare a 24px minimum target', async () => {
  const css = await fs.readFile(path.join(root, 'docs/site/site.css'), 'utf8');
  const block = css.slice(css.indexOf('/* target-size */'));
  assert.ok(css.includes('/* target-size */'), 'target-size block present');
  for (const selector of ['.guide-body p a', '.hero-note a', '.footer-brand', '.site-footer nav a']) {
    const rule = new RegExp(selector.replace(/[.>#]/g, m => '\\' + m) + '[^{]*\\{[^}]*min-height:\\s*24px').test(block);
    assert.ok(rule, selector);
  }
  assert.match(block, /\.site-footer nav a[^{]*\{[^}]*min-width:\s*24px/);
});

// Finding 5: social metadata on every page.
test('every built page carries Open Graph and Twitter card metadata with a public image', async () => {
  const files = await htmlFiles(); assert.ok(files.length > 250);
  for (const file of files) {
    const html = await fs.readFile(path.join(out, file), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    for (const prop of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image'])
      assert.match(head, new RegExp(`<meta property="${prop}" content="[^"]+">`), `${file} ${prop}`);
    assert.match(head, /<meta name="twitter:card" content="summary_large_image">/, file);
    const url = head.match(/property="og:url" content="([^"]+)"/)[1];
    assert.ok(url.startsWith(SITE), file);
    assert.equal(url, file === 'index.html' ? SITE : SITE + file, file);
    const image = head.match(/property="og:image" content="([^"]+)"/)[1];
    await fs.access(path.join(out, decodeURIComponent(image.slice(SITE.length))));
    if (file.endsWith('.zh-HK.html')) assert.match(head, /property="og:locale" content="zh_HK"/, file);
  }
});
