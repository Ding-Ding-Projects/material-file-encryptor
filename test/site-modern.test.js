import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {enrichArticles, buildSearchIndex, featureRows, featuresPage, settingsPage, diagram, diagramsPage, crawlerPolicyTxt, CRAWLER_POLICY_FILE, sitemapXml, startHere, tasksWithArticles, libraryPage, articlePage, provenanceFooter} from '../docs/site/modern-pages.mjs';
import {TASKS, REFERENCE_TASK, taskIdFor} from '../docs/site/tasks.mjs';
import {resolveVars, profileKinds, defaultMotion, KINDS, PROFILE_NAMES} from '../docs/site/modern/motion.js';
import {REQUIRED_FEATURE_IDS} from '../src/features/documentation/required-features.mjs';
import {injectTaskHero} from '../docs/site/extra-pages.mjs';

const catalog = JSON.parse(await fs.readFile('docs/site/content-catalog.json', 'utf8'));
const fake = source => ({source, title: source.split('/').pop(), markdown: '# T\n\n## Part\n\nWords here.', category: source.startsWith('docs/features/') ? source.split('/')[2] : 'reference', url: 'articles/x.html', sha256: 'a'.repeat(64)});
const taskIds = new Set([...TASKS, REFERENCE_TASK].map(task => task.id));

test('every catalogued article belongs to exactly one known task', () => {
 for (const source of catalog.articles) {
  const id = taskIdFor(fake(source));
  assert.ok(taskIds.has(id), `${source} -> ${id}`);
 }
 assert.equal(taskIdFor({source: 'docs/features/storage/physical-packing.md', category: 'storage'}), 'parts');
 assert.equal(taskIdFor({source: 'docs/features/storage/history-and-recycle-bin.zh-HK.md', category: 'storage'}), 'recover');
});
test('the library hub lists every non-moved article once and leads with tasks, not folders', () => {
 const articles = enrichArticles(catalog.articles.map((source, index) => ({...fake(source), url: `articles/a${index}.html`})));
 const html = libraryPage(tasksWithArticles(articles), {wikiCount: 3, categories: catalog.categories});
 for (const article of articles) assert.ok(html.includes(`href="${article.url}"`), article.source);
 assert.ok(html.indexOf('id="task-setup"') < html.indexOf('Browse by source category'));
 assert.ok(!html.includes('Complete source article'));
});
test('article pages move provenance into a collapsed footer and keep it complete', () => {
 const article = enrichArticles([fake('docs/features/storage/native-vault.md')])[0];
 const page = articlePage({article, body: '<h1 id="t">T</h1><h2 id="a">A<a class="heading-link" href="#a">#</a></h2>', related: [], provenance: provenanceFooter({sourceUrl: 'https://example.test/x', sourceLabel: 'x.md', sha256: 'b'.repeat(64)})});
 assert.match(page, /<details class="provenance">/);
 assert.ok(!/<details class="provenance" open/.test(page));
 assert.ok(page.includes('b'.repeat(64)) && page.includes('https://example.test/x'));
 assert.ok(page.includes('class="toc"') && page.includes('href="#a"'));
});
test('the search index is bounded and carries titles, headings and excerpts', () => {
 const articles = enrichArticles([fake('docs/features/storage/native-vault.md')]);
 const index = JSON.parse(buildSearchIndex(articles));
 assert.equal(index.items.length, 1);
 assert.deepEqual(index.items[0].h, ['Part']);
 assert.throws(() => buildSearchIndex(articles, 10), /size bound/);
});
test('motion Off and Reduced resolve to zero duration and distance; Full scales with speed', () => {
 const state = {...defaultMotion(), kinds: profileKinds('standard')};
 const full = resolveVars({...state, mode: 'full', speed: 1}), fast = resolveVars({...state, mode: 'full', speed: 2});
 assert.equal(full['--m-page-dur'], '560ms');
 assert.equal(fast['--m-page-dur'], '280ms');
 for (const mode of ['reduced', 'off']) {
  const vars = resolveVars({...state, mode});
  for (const kind of KINDS) assert.equal(vars[`--m-${kind}-dur`], '0ms');
  assert.equal(vars['--m-page-dist'], '0px');
 }
 const disabled = resolveVars({...state, mode: 'full', kinds: {...state.kinds, card: {...state.kinds.card, on: false}}});
 assert.equal(disabled['--m-card-dur'], '0ms');
});
test('the four motion profiles exist and differ', () => {
 assert.deepEqual([...PROFILE_NAMES], ['calm', 'standard', 'expressive', 'playful']);
 assert.ok(profileKinds('playful').page.dist > profileKinds('calm').page.dist);
 assert.equal(profileKinds('playful').page.ease, 'spring');
});
test('features page is honest: only the delivery record can mark a feature implemented', async () => {
 const manifest = JSON.parse(await fs.readFile('contracts/feature-delivery.json', 'utf8'));
 const rows = featureRows(manifest, REQUIRED_FEATURE_IDS);
 assert.equal(rows.length, REQUIRED_FEATURE_IDS.length);
 for (const row of rows) {
  const recorded = manifest.features.find(item => item.id === row.id && item.surface === 'desktop')?.status || 'unverified';
  assert.equal(row.app, recorded, row.id);
 }
 const html = featuresPage(rows);
 const implemented = (html.match(/status-implemented/g) || []).length;
 assert.equal(implemented, rows.filter(row => row.app === 'implemented').length + rows.filter(row => row.site === 'implemented').length);
 assert.ok(html.includes('data-site-search-rows') && html.includes('data-filter-status="unverified"'));
});
test('settings page has groups with their own reset, a search host and a reset-all', () => {
 const html = settingsPage();
 for (const group of ['language', 'motion', 'sound', 'reading', 'wording']) assert.ok(html.includes(`id="group-${group}"`), group);
 for (const group of ['motion', 'sound', 'reading']) assert.ok(html.includes(`data-reset-group="${group}"`), group);
 assert.ok(html.includes('data-site-search-settings') && html.includes('id="reset-all"'));
 for (const profile of PROFILE_NAMES) assert.ok(html.includes(`data-profile="${profile}"`));
});
test('every interactive diagram is labelled as an example only', () => {
 const html = diagramsPage();
 assert.equal((html.match(/class="example-label"[^>]*>Example only\. Nothing here runs the installed app\.</g) || []).length, 3);
 for (const kind of ['parts', 'offline', 'unlock']) assert.ok(diagram(kind).includes(`data-diagram="${kind}"`));
});
test('the crawler policy file and the sitemap name the canonical site', () => {
 assert.match(crawlerPolicyTxt('https://example.test/site/'), /Sitemap: https:\/\/example\.test\/site\/sitemap\.xml/);
 const xml = sitemapXml('https://example.test/site/', ['index.html', 'articles/a b.html']);
 assert.ok(xml.includes('<loc>https://example.test/site/</loc>') && xml.includes('articles/a%20b.html'));
});
test('the home template must keep its task placeholder and gets the grid at build time', async () => {
 const home = await fs.readFile('docs/site/index.html', 'utf8');
 assert.ok(home.includes('<!--task-hero-->'));
 const articles = enrichArticles(catalog.articles.map((source, index) => ({...fake(source), url: `articles/a${index}.html`})));
 const out = injectTaskHero(home, tasksWithArticles(articles));
 assert.ok(out.includes('What do you want') && out.includes('class="task-grid stagger"'));
 assert.throws(() => injectTaskHero('<main></main>', []), /placeholder/);
 assert.ok(startHere(articles.filter(a => a.task === 'setup')).length >= 1);
});
