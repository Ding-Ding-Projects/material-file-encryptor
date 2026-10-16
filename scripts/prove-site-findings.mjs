// Checks the deployed documentation site for the release download link, article headings, moved-article
// redirects, phone tap targets and share metadata. Writes a proof record next to the main site proof.
// Usage: node scripts/prove-site-findings.mjs --built <built-site-dir> --base <site-url> --deployed-commit <sha> --out <evidence-dir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const built = path.resolve(arg('built') || 'out/site');
const base = (arg('base') || 'https://ding-ding-projects.github.io/material-file-encryptor/').replace(/\/?$/, '/');
const deployedCommit = arg('deployed-commit');
const outDir = path.resolve(arg('out') || 'docs/evidence');
if (!/^[a-f0-9]{40}$/.test(deployedCommit || '')) throw new Error('--deployed-commit must be a full SHA.');
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_ROOT || process.cwd(), 'package.json'))('playwright');
const fetchRetry = async url => { let r; for (let i = 0; i < 4; i++) { r = await fetch(url); if (r.status < 500) return r; await new Promise(ok => setTimeout(ok, 1500 * (i + 1))); } return r; };
const normalizeHtml = (f, html) => f === 'index.html' ? html.replace(/<script type="application\/json" id="release-record">[\s\S]*?<\/script>/, '<!--release-record-->').replace(/<section class="download-band"[\s\S]*?<\/section>/, '<!--download-band-->') : html;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function walk(dir) { const rows = []; for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) rows.push(...await walk(full)); else rows.push(full); } return rows; }
const files = (await walk(built)).map(f => path.relative(built, f).split(path.sep).join('/')).filter(f => f.endsWith('.html')).sort();
const record = { schemaVersion: 1, url: base, deployedSourceCommit: deployedCommit, generatedAt: new Date().toISOString() };

// Live HTML must equal the built HTML.
const bodies = new Map(), mismatches = [];
const queue = [...files];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) { const f = queue.shift(); const response = await fetchRetry(base + f.split('/').map(encodeURIComponent).join('/')); const body = Buffer.from(await response.arrayBuffer()); const local = await fs.readFile(path.join(built, f)); if (!response.ok || sha(Buffer.from(normalizeHtml(f, body.toString('utf8')))) !== sha(Buffer.from(normalizeHtml(f, local.toString('utf8'))))) mismatches.push(`${f} ${response.status}`); else bodies.set(f, body.toString('utf8')); } }));
const liveIndex = bodies.get('index.html') ? '' : ''; record.liveHtml = { pages: files.length, byteMismatches: mismatches };

// Headings: exactly one h1 per page and no skipped level between consecutive headings in the main content.
const headingProblems = [];
for (const [f, html] of bodies) {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
  const dialogFree = main.replace(/<dialog[\s\S]*?<\/dialog>/g, '');
  const levels = [...dialogFree.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
  const h1Total = [...html.replace(/<dialog[\s\S]*?<\/dialog>/g, '').matchAll(/<h1[\s>]/g)].length;
  if (h1Total !== 1 && f !== 'workspace.html') headingProblems.push(`${f}: ${h1Total} h1`);
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) { headingProblems.push(`${f}: h${levels[i - 1]} to h${levels[i]}`); break; }
}
const articles = [...bodies.keys()].filter(f => f.startsWith('articles/'));
record.headings = { pagesChecked: bodies.size, articlePages: articles.length, problems: headingProblems.slice(0, 30), problemCount: headingProblems.length };

// Moved articles: redirect pages, listed in the library, and the redirect target exists.
const library = bodies.get('library.html') || '';
const redirects = articles.filter(f => /http-equiv="refresh"|location\.replace|rel="canonical"/i.test(bodies.get(f)) && /moved/i.test(bodies.get(f).slice(0, 4000)));
const stubIds = ['access-local', 'appearance-editor', 'local-personalization'].flatMap(n => [`articles/docs--features--${n}.html`, `articles/docs--features--${n}.zh-HK.html`]);
record.movedArticles = { libraryMentionsMoved: /Moved articles/i.test(library), stubs: stubIds.map(f => ({ page: f, linkedFromLibrary: library.includes(`href="${f}`) || library.includes(`href="./${f}`), redirectsOrExplains: /refresh|location|moved/i.test(bodies.get(f) || ''), exists: bodies.has(f) })), redirectLikePages: redirects.length };

// Share metadata on every page.
const required = ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'twitter:card'];
const metaProblems = [], images = new Set(), mismatchedUrl = [];
const metaOf = (html, key) => { const re = new RegExp('<meta[^>]+(?:property|name)="' + key + '"[^>]*content="([^"]*)"|<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="' + key + '"'); const m = html.match(re); return m ? (m[1] ?? m[2]) : null; };
for (const [f, html] of bodies) {
  for (const key of required) if (!metaOf(html, key)) metaProblems.push(`${f}: missing ${key}`);
  const image = metaOf(html, 'og:image'); if (image) images.add(image);
  const url = metaOf(html, 'og:url'); if (url && !url.startsWith(base)) mismatchedUrl.push(`${f}: og:url ${url}`);
  if (url && url !== base + (f === 'index.html' ? '' : f) && url !== base + f) mismatchedUrl.push(`${f}: og:url ${url} differs from the page URL`);
}
const imageChecks = [];
for (const image of images) { const r = await fetch(image); const body = Buffer.from(await r.arrayBuffer()); imageChecks.push({ image, status: r.status, contentType: r.headers.get('content-type'), bytes: body.length }); }
record.shareMetadata = { pagesChecked: bodies.size, problemCount: metaProblems.length, problems: metaProblems.slice(0, 20), ogUrlProblems: mismatchedUrl.slice(0, 20), distinctImages: imageChecks };
const sample = bodies.get('index.html') || ''; record.shareMetadata.indexPresent = bodies.has('index.html'); record.shareMetadata.indexSample = Object.fromEntries(required.map(k => [k, metaOf(sample, k)]));

// Release download link versus GitHub.
const latest = JSON.parse(execFileSync('gh', ['release', 'list', '-R', 'Ding-Ding-Projects/material-file-encryptor', '--exclude-drafts', '--exclude-pre-releases', '--limit', '1', '--json', 'tagName,isDraft,isPrerelease,publishedAt'], { encoding: 'utf8' }))[0];
const view = JSON.parse(execFileSync('gh', ['release', 'view', latest.tagName, '-R', 'Ding-Ding-Projects/material-file-encryptor', '--json', 'tagName,isDraft,isPrerelease,assets,targetCommitish,url'], { encoding: 'utf8' }));
record.githubLatestNormalRelease = { tag: view.tagName, isDraft: view.isDraft, isPrerelease: view.isPrerelease, url: view.url, installerAsset: view.assets.filter(a => a.name === 'MaterialFileEncryptor-Setup.exe').map(a => ({ name: a.name, size: a.size, url: a.url })) };

// The embedded release record must name a published normal release whose installer asset matches.
const embedded = (() => { const m = (bodies.get('index.html') || '').match(/id="release-record">([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; })();
let embeddedCheck = null;
if (embedded) { const v = JSON.parse(execFileSync('gh', ['release', 'view', embedded.tag, '-R', 'Ding-Ding-Projects/material-file-encryptor', '--json', 'tagName,isDraft,isPrerelease,assets'], { encoding: 'utf8' })); const a = v.assets.find(x => x.name === embedded.installer.name); embeddedCheck = { tag: embedded.tag, githubIsDraft: v.isDraft, githubIsPrerelease: v.isPrerelease, installerUrlMatchesAsset: !!a && a.url === embedded.installer.url, installerBytesMatchAsset: !!a && a.size === embedded.installer.bytes, verification: embedded.verification, isNewestAtProofTime: embedded.tag === latest.tagName }; }
record.embeddedReleaseRecord = embeddedCheck;
const browser = await chromium.launch({ headless: true });
const results = { download: {}, targets: [], captures: [] };
const shot = async (page, name) => { const file = path.join(outDir, name); await page.screenshot({ path: file }); results.captures.push({ file: path.relative(process.cwd(), file).split(path.sep).join('/'), sha256: sha(await fs.readFile(file)) }); };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false }); context.setDefaultTimeout(90000);
  const page = await context.newPage();
  await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.documentElement.dataset.language, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1500);
  results.download = await page.evaluate(() => { const d = document.querySelector('#preview-download'); const r = d.getBoundingClientRect(); const inner = d.shadowRoot && d.shadowRoot.querySelector('a'); return { tag: d.localName, outer: d.outerHTML.slice(0, 400), hrefProperty: d.href || null, shadowAnchorHref: inner ? inner.href : null, href: d.getAttribute('href'), disabled: d.disabled === true, text: d.textContent.trim(), state: document.querySelector('#download-state').textContent.trim(), help: document.querySelector('#download-help').textContent.trim(), width: Math.round(r.width), height: Math.round(r.height) }; });
  await page.evaluate(() => document.querySelector('#download').scrollIntoView({ block: 'center' })); await page.waitForTimeout(500); await shot(page, 'findings-desktop-download-area.png');
  // The link is never followed: only its target is read from the release listing.
  await page.goto(base + 'library.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000);
  results.libraryMovedHeadingVisible = await page.evaluate(() => { const el = [...document.querySelectorAll('h2,h3,summary,p,span')].find(e => /Moved articles/i.test(e.textContent) && e.getBoundingClientRect().height > 0); if (el) el.scrollIntoView({ block: 'center' }); return !!el; }); if (results.libraryMovedHeadingVisible) { await page.waitForTimeout(400); await shot(page, 'findings-desktop-library-moved-articles.png'); }
  await page.goto(base + 'articles/docs--features--local-personalization.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000); await page.waitForFunction(() => document.readyState !== 'loading'); results.movedStubFinalUrl = page.url(); results.movedStubH1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map(h => h.textContent.trim())); results.movedStubText = await page.evaluate(() => document.querySelector('main').innerText.slice(0, 300)); await shot(page, 'findings-desktop-moved-article.png');
  await context.close();
  for (const width of [320, 375, 390]) {
    const phone = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' }); phone.setDefaultTimeout(90000);
    const p = await phone.newPage();
    for (const route of ['index.html', 'library.html', 'wiki.html', 'gallery.html', 'articles/docs--features--access--README.html']) {
      await p.goto(base + route, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.documentElement.dataset.language, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
      const small = await p.evaluate(() => [...document.querySelectorAll('a[href],button,summary,select,input:not([type=hidden]),md-text-button,md-outlined-button,md-filled-button,md-icon-button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],dialog:not([open])') && (r.height < 23.5 || r.width < 23.5); }).map(e => e.localName + ' ' + e.textContent.trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
      results.targets.push({ width, route, undersized: small });
      if (width === 320 && route === 'index.html') await shot(p, 'findings-phone-320-index.png');
    }
    await phone.close();
  }
} finally { await browser.close(); }
record.browser = results;
record.summary = { liveHtmlMismatches: mismatches.length, headingProblems: headingProblems.length, shareMetadataProblems: metaProblems.length, undersizedTargets: results.targets.reduce((n, t) => n + t.undersized.length, 0) };
const out = path.join(outDir, `site-findings-proofs-${deployedCommit.slice(0, 8)}.json`);
await fs.mkdir(outDir, { recursive: true }); await fs.writeFile(out, JSON.stringify(record, null, 1) + '\n');
console.log(JSON.stringify({ out, summary: record.summary, headings: record.headings, movedArticles: record.movedArticles, shareMetadata: { ...record.shareMetadata, indexSample: record.shareMetadata.indexSample }, github: record.githubLatestNormalRelease, download: results.download, moved: [results.libraryMovedHeadingVisible, results.movedStubFinalUrl, results.movedStubH1], targets: results.targets.filter(t => t.undersized.length) }, null, 1));
