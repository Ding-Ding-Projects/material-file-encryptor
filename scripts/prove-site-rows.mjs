// Drives the deployed documentation site in an isolated headless browser and writes a site row proof record.
// Usage: node scripts/prove-site-rows.mjs --built <built-site-dir> --base <site-url> --deployed-commit <sha> --out <evidence-dir>
// Environment: PLAYWRIGHT_ROOT may name a directory containing node_modules/playwright.
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
const requireFrom = createRequire(path.join(process.env.PLAYWRIGHT_ROOT || process.cwd(), 'package.json'));
const { chromium } = requireFrom('playwright');

const fetchRetry = async url => { let r; for (let i = 0; i < 4; i++) { r = await fetch(url); if (r.status < 500) return r; await new Promise(ok => setTimeout(ok, 1500 * (i + 1))); } return r; };
const normalizeHtml = (f, html) => f === 'index.html' ? html.replace(/<script type="application\/json" id="release-record">[\s\S]*?<\/script>/, '<!--release-record-->').replace(/<section class="download-band"[\s\S]*?<\/section>/, '<!--download-band-->') : html;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PROVENANCE = new Set(['site-provenance.json', 'workspace-provenance.json']);
async function walk(dir) { const rows = []; for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) rows.push(...await walk(full)); else rows.push(full); } return rows; }
const record = { schemaVersion: 1, url: base, deployedSourceCommit: deployedCommit, generatedAt: new Date().toISOString(), rows: {}, notes: [] };

const stageFile = path.join(outDir, '.stages.json');
if (arg('reuse-stages') === 'true') Object.assign(record, JSON.parse(await fs.readFile(stageFile, 'utf8'))); else {
// 1. Deployed bytes versus the locally built artifact.
const files = (await walk(built)).map(f => path.relative(built, f).split(path.sep).join('/')).sort();
const hashes = new Map(), liveBodies = new Map(), mismatches = [];
const bodyDigest = (f, body) => f === 'index.html' ? sha(Buffer.from(normalizeHtml(f, body.toString('utf8')))) : sha(body);
for (const f of files) hashes.set(f, bodyDigest(f, await fs.readFile(path.join(built, f))));
const queue = files.filter(f => !PROVENANCE.has(f));
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) { const f = queue.shift(); const response = await fetchRetry(base + f.split('/').map(encodeURIComponent).join('/')); const body = Buffer.from(await response.arrayBuffer()); if (!response.ok || bodyDigest(f, body) !== hashes.get(f)) mismatches.push(`${f} ${response.status}`); else if (f.endsWith('.html')) liveBodies.set(f, body.toString('utf8')); } }));
const manifestLines = files.filter(f => !PROVENANCE.has(f)).map(f => `${f}\t${hashes.get(f)}`);
const builtSha256 = sha(manifestLines.join('\n') + '\n');
const liveProvenance = await (await fetch(base + 'site-provenance.json')).json();
record.deployment = { builtSha256, builtSha256Definition: 'SHA-256 over sorted "path<TAB>sha256" lines of every built file except the two provenance files', fileCount: manifestLines.length, liveByteMismatches: mismatches, liveProvenance, builtDir: 'LF checkout build of the same source tree', excluded: [...PROVENANCE] };
if (mismatches.length) throw new Error('Deployed bytes differ from the built artifact: ' + mismatches.slice(0, 5).join(', '));

// 2. Internal route and anchor crawl over every deployed HTML page.
const htmlFiles = [...liveBodies.keys()];
const idsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const idCache = new Map(); const ids = f => idCache.get(f) || (idCache.set(f, idsOf(liveBodies.get(f))), idCache.get(f));
const broken = [], externalLinks = new Set(); let internalLinks = 0, anchorLinks = 0;
for (const page of htmlFiles) {
  for (const m of liveBodies.get(page).matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('javascript:')) continue;
    if (/^https?:\/\//.test(raw)) { if (!raw.startsWith(base)) { externalLinks.add(raw); continue; } }
    const url = new URL(raw, new URL(page, base)); if (!url.href.startsWith(base)) { externalLinks.add(raw); continue; }
    internalLinks++;
    const target = decodeURIComponent(url.pathname.slice(new URL(base).pathname.length)) || 'index.html';
    if (!hashes.has(target)) { broken.push(`${page} -> ${raw}`); continue; }
    if (url.hash && url.hash.length > 1 && target.endsWith('.html')) { anchorLinks++; if (!ids(target).has(decodeURIComponent(url.hash.slice(1)))) broken.push(`${page} -> ${raw} (anchor)`); }
  }
}
record.crawl = { htmlPages: htmlFiles.length, internalLinks, anchorLinks, externalLinks: externalLinks.size, brokenInternal: broken };

// 3. Article inventory versus the repository catalogue and the library page.
const catalog = JSON.parse(await fs.readFile(path.join(built, 'documentation-inventory.json'), 'utf8').catch(() => '{}'));
const articlePages = htmlFiles.filter(f => f.startsWith('articles/'));
const libraryHtml = liveBodies.get('library.html'), wikiHtml = liveBodies.get('wiki.html');
const notLinkedFromLibraryOrWiki = articlePages.filter(f => !libraryHtml.includes(`href="${f}`) && !wikiHtml.includes(`href="${f}`) && !libraryHtml.includes(`href="./${f}`));
const linkedAnywhere = new Set(); for (const page of htmlFiles) for (const m of liveBodies.get(page).matchAll(/href="(?:\.\/|\.\.\/)?(articles\/[^"#]+)/g)) linkedAnywhere.add(decodeURIComponent(m[1]));
const unreachableArticles = articlePages.filter(f => !linkedAnywhere.has(f));
const thinArticles = articlePages.filter(f => { const body = liveBodies.get(f); const main = body.slice(body.indexOf('<main')); return main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length < 400 || !/<h[12][ >]/.test(main); });
const articlesWithoutH1 = articlePages.filter(f => !/<h1[ >]/.test(liveBodies.get(f)));
record.articles = { unreachableFromAnyPage: unreachableArticles, thinOrUntitledArticles: thinArticles, articlesWithoutH1: articlesWithoutH1.length, deployedArticlePages: articlePages.length, wikiArticlePages: articlePages.filter(f => f.includes('wiki--')).length, notLinkedFromLibraryOrWiki: notLinkedFromLibraryOrWiki.length, notLinkedSample: notLinkedFromLibraryOrWiki.slice(0, 10), inventoryKeys: Object.keys(catalog).slice(0, 8) };

// 4. Wiki snapshot versus the live GitHub wiki.
const wikiDir = path.join(outDir, '.wiki-clone-' + process.pid);
try {
  execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', '--depth', '1', 'https://github.com/Ding-Ding-Projects/material-file-encryptor.wiki.git', wikiDir], { stdio: 'pipe' });
  const wikiHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wikiDir, encoding: 'utf8' }).trim();
  const wikiFiles = (await fs.readdir(wikiDir)).filter(f => f.endsWith('.md')).sort();
  const compare = [];
  for (const f of wikiFiles) { const live = await fs.readFile(path.join(wikiDir, f)); const snap = await fs.readFile(path.join(built, 'docs/wiki-snapshot-unavailable', f)).catch(() => null) || (() => { try { return execFileSync('git', ['show', 'HEAD:docs/site/wiki/' + f], { maxBuffer: 1 << 24 }); } catch { return null; } })(); compare.push({ file: f, wikiSha256: sha(live), snapshotSha256: snap ? sha(snap) : null, equal: !!snap && sha(snap) === sha(live) }); }
  record.wiki = { wikiHead, recordedInDeployedPage: wikiHtml.includes(wikiHead), pages: compare };
} finally { await fs.rm(wikiDir, { recursive: true, force: true }); }

// 5. Repository homepage readback.
const homepage = JSON.parse(execFileSync('gh', ['repo', 'view', 'Ding-Ding-Projects/material-file-encryptor', '--json', 'homepageUrl,visibility'], { encoding: 'utf8' }));
record.homepage = { ...homepage, equalsDeployedUrl: homepage.homepageUrl === base, httpStatus: (await fetch(homepage.homepageUrl)).status };

await fs.writeFile(stageFile, JSON.stringify({ deployment: record.deployment, crawl: record.crawl, articles: record.articles, wiki: record.wiki, homepage: record.homepage }));
}
const builtSha256 = record.deployment.builtSha256;
// 6. Browser behaviour in an isolated profile.
const browser = await chromium.launch({ headless: true });
const results = { tuples: [], interactions: {}, captures: [] };
const shot = async (page, name) => { const file = path.join(outDir, name); await page.screenshot({ path: file, fullPage: false }); results.captures.push({ file: path.relative(process.cwd(), file).split(path.sep).join('/'), sha256: sha(await fs.readFile(file)) }); };
const settle = async page => { await page.waitForSelector('body', { timeout: 90000 }); await page.waitForFunction(() => document.documentElement.dataset.language, null, { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(250); };
const openPrefs = async page => { const visible = await page.locator('#preferences-open').isVisible(); if (visible) await page.click('#preferences-open'); else await page.click('#preferences-footer'); await page.waitForSelector('#preferences-dialog[open]'); };
const setLanguage = async (page, language) => { await openPrefs(page); await page.click('#local-ux-language', { timeout: 30000 }); await page.waitForTimeout(400); await page.click('#local-ux-language md-select-option >> text=' + ({ yue: 'Cantonese', bilingual: 'Bilingual', en: 'English' })[language], { timeout: 30000 }); await page.waitForFunction(l => document.documentElement.dataset.language === l, language, { timeout: 15000 }); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#preferences-dialog').open, null, { timeout: 15000 }); await page.waitForTimeout(300); };
const metrics = page => page.evaluate(() => {
  const root = document.documentElement, vw = window.innerWidth;
  const escapes = [...document.body.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === 'hidden') return false; if (r.right <= vw + 1 && r.left >= -1) return false; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; } return true; }).slice(0, 5).map(e => e.localName + (e.id ? '#' + e.id : '') + '.' + String(e.className).slice(0, 40));
  const bg = getComputedStyle(document.body).backgroundColor;
  return { innerWidth: vw, scrollWidth: root.scrollWidth, horizontalOverflow: root.scrollWidth > vw + 1, escapingElements: escapes, language: root.dataset.language, lang: root.lang, theme: root.dataset.theme || null, background: bg, title: document.title, h1: document.querySelector('h1')?.textContent.trim().slice(0, 80) || null };
});
const routes = ['index.html', 'library.html', 'wiki.html', 'gallery.html', 'articles/DESIGN.html', 'articles/wiki--Home.html'];
const viewports = { phone: { width: 320, height: 640 }, desktop: { width: 1280, height: 900 } };
try {
  for (const [vpName, viewport] of Object.entries(viewports)) {
    for (const language of ['en', 'yue', 'bilingual']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', acceptDownloads: false, serviceWorkers: 'block' });
      context.setDefaultTimeout(90000); context.setDefaultNavigationTimeout(90000); const page = await context.newPage();
      const external = []; page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
      await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await settle(page);
      if (language !== 'en') await setLanguage(page, language); else await settle(page);
      for (const route of routes) {
        if (route !== 'index.html') { await page.goto(base + route, { waitUntil: 'domcontentloaded' }); await settle(page); }
        const m = await metrics(page); m.theme = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        results.tuples.push({ viewport: vpName, width: viewport.width, language, theme, route, ...m, persistedLanguage: m.language === language, externalRequests: external.length });
        if (route === 'index.html' || (vpName === 'phone' && language === 'en' && theme === 'light')) {
          if (route === 'index.html' && ((vpName === 'desktop' && ['en-light', 'yue-dark', 'bilingual-light'].includes(language + '-' + theme)) || (vpName === 'phone' && ['en-light', 'yue-dark', 'bilingual-dark'].includes(language + '-' + theme)))) await shot(page, `site-${vpName}-index-${language}-${theme}.png`);
          if (vpName === 'phone' && language === 'en' && theme === 'light' && route !== 'index.html' && route !== 'workspace.html') await shot(page, `site-phone-${route.replace(/[\/.]/g, '-')}.png`);
        }
      }
      if (external.length) results.tuples.at(-1).externalSample = external.slice(0, 3);
      await context.close();
    }
  }

  // Interaction flows (desktop).
  {
    const context = await browser.newContext({ viewport: viewports.desktop, reducedMotion: 'reduce', serviceWorkers: 'block' }); context.setDefaultTimeout(90000); context.setDefaultNavigationTimeout(90000); const page = await context.newPage();
    const flow = {};
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await settle(page);
    flow.homeTitle = await page.title();
    await page.click('nav#navigation a[href="#security"]'); await page.waitForTimeout(400);
    flow.securityAnchorInView = await page.evaluate(() => { const r = document.querySelector('#security').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    await page.click('#explore-toggle'); flow.exploreOpen = await page.getAttribute('#explore-toggle', 'data-aria-expanded');
    await page.click('#explore-links a[href="library.html"]'); await page.waitForURL(/library\.html/); await settle(page);
    flow.libraryH1 = (await page.locator('h1').first().textContent()).trim();
    await fs.writeFile(path.join(outDir, '.matrix.json'), JSON.stringify(results.tuples));
    const firstArticle = await page.locator('a[href^="articles/"]').first(); const href = await firstArticle.getAttribute('href');
    await firstArticle.click(); await page.waitForURL(/articles\//); await settle(page);
    flow.articleHref = href; flow.articleH1Count = await page.locator('h1').count(); flow.articleTitle = (await page.locator('main h1, main h2').first().textContent()).trim(); flow.articleTextLength = (await page.locator('main').innerText()).length;
    await page.click('a.brand'); await page.waitForURL(/index\.html/); flow.brandReturnsHome = true;
    await page.goto(base + 'wiki.html', { waitUntil: 'domcontentloaded' }); await settle(page);
    flow.wikiArticleLinks = await page.locator('a[href^="articles/wiki--"]').count();
    await page.locator('a[href^="articles/wiki--"]').first().click(); await page.waitForURL(/wiki--/); await settle(page);
    flow.wikiArticleTitle = (await page.locator('main h1, main h2').first().textContent()).trim();
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await settle(page);
    flow.downloadState = (await page.locator('#download-state').textContent()).trim();
    flow.downloadButtonDisabled = await page.evaluate(() => document.querySelector('#preview-download').disabled === true); flow.downloadControl = await page.evaluate(() => document.querySelector('#preview-download').localName + ' href=' + document.querySelector('#preview-download').getAttribute('href'));
    flow.downloadHelp = (await page.locator('#download-help').textContent()).trim();
    flow.faqToggled = await page.evaluate(() => { const d = document.querySelector('#faq details, details'); d.open = false; d.querySelector('summary').click(); return d.open; });
    results.interactions.desktop = flow; await context.close();
  }
  // Touch flow (phone).
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' }); context.setDefaultTimeout(90000); context.setDefaultNavigationTimeout(90000); const page = await context.newPage();
    const flow = {};
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' }); await settle(page);
    flow.menuClosed = await page.getAttribute('#menu-toggle', 'data-aria-expanded');
    await page.tap('#menu-toggle'); await page.waitForTimeout(300); flow.menuOpened = await page.getAttribute('#menu-toggle', 'data-aria-expanded');
    await shot(page, 'site-phone-menu-open.png');
    await page.tap('nav#navigation a[href="#documentation"]'); await page.waitForTimeout(400);
    flow.docsAnchorInView = await page.evaluate(() => { const r = document.querySelector('#documentation').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    const small = await page.evaluate(() => [...document.querySelectorAll('a[href],button,summary,select,input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && (r.height < 24 || r.width < 24); }).map(e => e.localName + ' ' + e.textContent.trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
    flow.interactiveTargetsUnder24px = small.length; flow.undersizedTargets = small;
    results.interactions.phone = flow; await context.close();
  }
} finally { await browser.close(); }
record.browser = results;
const sizes = results.tuples;
record.summary = { tuples: sizes.length, overflowTuples: sizes.filter(t => t.horizontalOverflow).length, languageNotPersisted: sizes.filter(t => !t.persistedLanguage).length, externalRequestTuples: sizes.filter(t => t.externalRequests).length };
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `site-row-proofs-${deployedCommit.slice(0, 8)}.json`);
await fs.writeFile(outFile, JSON.stringify(record, null, 1) + '\n');
await fs.rm(stageFile, { force: true });
console.log(JSON.stringify({ outFile, builtSha256, summary: record.summary, crawl: record.crawl, articles: record.articles, wiki: record.wiki, homepage: record.homepage, interactions: results.interactions }, null, 1));
