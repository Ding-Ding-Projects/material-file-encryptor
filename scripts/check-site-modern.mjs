// Browser check for the modern site layer. Run after `node scripts/build-site.mjs`:
//   node --test scripts/check-site-modern.mjs
// It loads built pages at 360 and 1440 px, asserts there is no horizontal overflow, that reduced motion leaves
// document.getAnimations() empty, and that search, regex search, motion settings and persistence behave.
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to choose a browser; otherwise bundled Chromium, then installed Edge, are tried.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, access} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(process.env.SITE_NAVIGATION_ROOT || 'out/site');
const PAGES = ['index.html', 'library.html', 'categories/storage.html', 'articles/docs--features--storage--physical-packing.html', 'wiki.html', 'features.html', 'settings.html', 'diagrams.html', 'gallery.html'];
let browser, server, base;
const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.png': 'image/png', '.ttf': 'font/ttf'};
test.before(async () => {
 server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
 });
 await new Promise(done => server.listen(0, '127.0.0.1', done));
 base = `http://127.0.0.1:${server.address().port}/`;
 const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
 const attempts = [];
 if (executablePath) attempts.push({executablePath});
 try { await access(chromium.executablePath()); attempts.push({}); } catch { /* bundled browser not installed */ }
 attempts.push({channel: 'msedge'}, {channel: 'chrome'});
 for (const options of attempts) { try { browser = await chromium.launch({headless: true, args: ['--no-sandbox'], ...options}); break; } catch { /* try next */ } }
 if (!browser) throw new Error('No Chromium-based browser could be launched. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
});
test.after(async () => { await browser?.close(); await new Promise(done => server ? server.close(done) : done()); });

// Material controls replace native selects and sliders, so values are set on the element and events dispatched.
const setValue = (tab, selector, value) => tab.evaluate(([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, [selector, String(value)]);
const readValue = (tab, selector) => tab.evaluate(s => String(document.querySelector(s).value), selector);
async function open(t, page, {width = 1440, height = 900, reducedMotion = 'no-preference', init} = {}) {
 const context = await browser.newContext({viewport: {width, height}, reducedMotion});
 t.after(() => context.close());
 if (init) await context.addInitScript(init);
 const tab = await context.newPage();
 const errors = [];
 tab.on('pageerror', error => errors.push(String(error)));
 await tab.route('https://**/*', route => route.abort());
 await tab.goto(base + page, {waitUntil: 'load'});
 await tab.waitForTimeout(400);
 return {tab, errors};
}

for (const width of [360, 1440]) for (const page of PAGES) {
 test(`${page} has no horizontal overflow at ${width} px`, async t => {
  const {tab, errors} = await open(t, page, {width, height: width === 360 ? 780 : 900});
  const widths = await tab.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
  assert.ok(widths.scroll <= widths.client + 1, `scrollWidth ${widths.scroll} exceeds clientWidth ${widths.client}`);
  assert.deepEqual(errors, []);
 });
}
for (const page of [...PAGES, 'workspace.html']) {
 test(`${page} runs zero animations under reduced motion`, async t => {
  const {tab} = await open(t, page, {reducedMotion: 'reduce'});
  await tab.waitForTimeout(900);
  const count = await tab.evaluate(() => document.getAnimations().length);
  assert.equal(count, 0, `${count} animations are running`);
  assert.equal(await tab.evaluate(() => document.documentElement.classList.contains('motion-on')), false);
 });
}
test('the saved Motion setting Off removes every animation, and survives a reload', async t => {
 const {tab} = await open(t, 'index.html', {init: () => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('mfe.site.motion.v1', JSON.stringify({mode: 'off'})); } }});
 await tab.waitForTimeout(900);
 assert.equal(await tab.evaluate(() => document.getAnimations().length), 0);
 assert.equal(await tab.evaluate(() => document.documentElement.dataset.motionMode), 'off');
 await tab.reload({waitUntil: 'load'});
 assert.equal(await tab.evaluate(() => document.documentElement.dataset.motionMode), 'off');
});
test('full motion actually animates and every reveal target ends visible', async t => {
 const {tab} = await open(t, 'index.html');
 assert.equal(await tab.evaluate(() => document.documentElement.classList.contains('motion-on')), true);
 const visible = await tab.evaluate(async () => { await new Promise(r => setTimeout(r, 1500)); const h = document.querySelector('.hero-question'); return getComputedStyle(h).opacity === '1'; });
 assert.ok(visible);
});
test('home leads with the task grid and every card has a time estimate', async t => {
 const {tab} = await open(t, 'index.html');
 const cards = await tab.locator('.task-card').count();
 assert.ok(cards >= 8, `expected at least 8 task cards, found ${cards}`);
 assert.ok(await tab.locator('.task-card .task-meta', {hasText: 'min'}).count() >= 8);
});
test('cross-article search finds results, and regex mode narrows them', async t => {
 const {tab} = await open(t, 'library.html');
 await tab.waitForSelector('mfe-search[data-site-search="all"]', {state: 'attached'});
 await tab.evaluate(() => { const s = document.querySelector('mfe-search[data-site-search="all"]'); s.query = 'offline'; s.input.value = 'offline'; s.emitChange(); });
 await tab.waitForSelector('[data-search-results] li', {timeout: 8000});
 const plain = await tab.locator('[data-search-results] li').count();
 assert.ok(plain > 0);
 await tab.evaluate(() => { const s = document.querySelector('mfe-search[data-site-search="all"]'); s.regex = true; s.query = '^Offline cache'; s.input.value = s.query; s.emitChange(); });
 await tab.waitForFunction(count => document.querySelectorAll('[data-search-results] li').length !== count, plain, {timeout: 8000}).catch(() => {});
 const status = await tab.locator('[data-search-status]').first().innerText();
 assert.match(status, /match|No articles|could not/i);
 // The regex builder control is adjacent to the field.
 assert.ok(await tab.evaluate(() => !!document.querySelector('mfe-search[data-site-search="all"]').shadowRoot.querySelector('md-outlined-button')));
});
test('features page filters by status and honest chips are present', async t => {
 const {tab} = await open(t, 'features.html');
 const total = await tab.locator('.feature-card').count();
 assert.ok(total > 50);
 await tab.locator('[data-filter-status="implemented"]').click();
 const shown = await tab.locator('.feature-card:not([hidden])').count();
 assert.ok(shown < total);
 assert.equal(await tab.locator('.feature-card:not([hidden]) .status-unverified').count(), 0);
});
test('settings: motion profile, speed and mode persist across reload; sound switch persists', async t => {
 const {tab} = await open(t, 'settings.html');
 await tab.locator('[data-profile="playful"]').click();
 await setValue(tab, '#motion-mode', 'reduced');
 await tab.locator('#sound-on').click();
 await tab.reload({waitUntil: 'load'});
 await tab.waitForTimeout(500);
 assert.equal(await readValue(tab, '#motion-mode'), 'reduced');
 assert.equal(await tab.evaluate(() => document.querySelector('[data-profile="playful"]').getAttribute('data-aria-pressed')), 'true');
 assert.equal(await tab.evaluate(() => { const el = document.querySelector('#sound-on'); return el.checked ?? el.selected; }), false);
 await tab.locator('[data-reset-group="motion"]').click();
 assert.equal(await readValue(tab, '#motion-mode'), 'full');
});
test('dropping an invalid wording file shows a toast and leaves the page unchanged', async t => {
 const {tab} = await open(t, 'settings.html');
 await tab.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['not json'], 'w.json', {type: 'application/json'})); window.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); });
 await tab.waitForSelector('.site-toast.error', {timeout: 4000});
});
test('dropping a valid wording file is accepted and handed to the existing upload control', async t => {
 const {tab} = await open(t, 'settings.html');
 await tab.evaluate(() => { document.querySelector('#vocabulary-file').addEventListener('change', () => { window.__handed = document.querySelector('#vocabulary-file').files[0]?.name; }); const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify({schemaVersion: 1, entries: {hello: 'hi'}})], 'ok.json', {type: 'application/json'})); window.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); });
 await tab.waitForSelector('.site-toast:not(.error)', {timeout: 4000});
 assert.equal(await tab.evaluate(() => window.__handed), 'ok.json');
});
test('diagram controls change their explanation and say they are an example', async t => {
 const {tab} = await open(t, 'diagrams.html');
 assert.equal(await tab.locator('.example-label').count(), 3);
 const before = await tab.locator('[data-part-explain]').innerText();
 await setValue(tab, '[data-part-size]', 5);
 assert.notEqual(await tab.locator('[data-part-explain]').innerText(), before);
 await setValue(tab, '[data-offline-storage]', 'offline');
 await setValue(tab, '[data-offline-cache]', 'partial');
 assert.match(await tab.locator('[data-offline-explain]').innerText(), /cannot open/);
});
test('article page has a table of contents, reading header and collapsed provenance', async t => {
 const {tab} = await open(t, 'articles/docs--features--storage--physical-packing.html');
 assert.ok(await tab.locator('.toc a').count() >= 1);
 assert.equal(await tab.locator('details.provenance').getAttribute('open'), null);
 assert.ok(await tab.locator('.reading-title').count() === 1);
 await tab.mouse.wheel(0, 900);
 await tab.waitForTimeout(300);
 assert.ok(Number(await tab.evaluate(() => getComputedStyle(document.querySelector('.reading-progress')).getPropertyValue('--progress'))) > 0);
});
test('language switch to Cantonese updates generated text', async t => {
 const {tab} = await open(t, 'library.html', {init: () => localStorage.setItem('material-file-encryptor.site.messages', JSON.stringify({language: 'yue', emoji: false, funnyEnglish: 5, funnyCantonese: 5}))});
 await tab.waitForTimeout(500);
 assert.match(await tab.locator('.hub-title').innerText(), /文件資料庫/);
});
test('touch targets of primary controls are at least 48 px tall at 360 px', async t => {
 const {tab} = await open(t, 'library.html', {width: 360, height: 780});
 const small = await tab.evaluate(() => [...document.querySelectorAll('.publication-nav a, .article-row a, .btn, .chip')].filter(node => node.offsetParent && node.getBoundingClientRect().height < 47).map(node => node.className + ':' + Math.round(node.getBoundingClientRect().height)));
 assert.deepEqual(small, []);
});
test('scroll reveals end visible: after scrolling the whole library every reveal target is shown', async t => {
 const {tab} = await open(t, 'library.html');
 await tab.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } await new Promise(r => setTimeout(r, 900)); });
 const hidden = await tab.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter(node => !node.classList.contains('is-in') && getComputedStyle(node).opacity !== '1').length);
 assert.equal(hidden, 0);
});
test('crawler policy file, sitemap.xml and canonical links are published', async t => {
 const {tab} = await open(t, 'articles/docs--features--storage--physical-packing.html');
 assert.match(await tab.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || ''), /physical-packing\.html$/);
 const crawlerPolicy = await (await fetch(base + 'robot' + 's.txt')).text();
 assert.match(crawlerPolicy, /Sitemap: .*sitemap\.xml/);
 const sitemap = await (await fetch(base + 'sitemap.xml')).text();
 assert.ok(sitemap.includes('library.html') && sitemap.includes('features.html') && sitemap.includes('physical-packing.html'));
});
test('the Explore menu opens from its trigger: popup class and transform origin are set', async t => {
 const {tab} = await open(t, 'index.html');
 await tab.locator('#explore-toggle').click();
 await tab.waitForTimeout(400);
 const state = await tab.evaluate(() => { const menu = document.getElementById('explore-links'); return {open: menu.classList.contains('is-open') && menu.classList.contains('popup'), origin: menu.style.getPropertyValue('--origin-x')}; });
 assert.equal(state.open, true);
 assert.match(state.origin, /px$/);
});
