// Generated top-level pages that are not articles: features, settings, interactive examples, the crawler policy file and the sitemap.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pageShell} from './publication.mjs';
import {featureRows, featuresPage, settingsPage, diagramsPage, taskHero, tasksWithArticles, crawlerPolicyTxt, CRAWLER_POLICY_FILE, sitemapXml} from './modern-pages.mjs';
import {REQUIRED_FEATURE_IDS} from '../../src/features/documentation/required-features.mjs';
import {SITE_URL} from './social-metadata.mjs';

export async function buildExtraPages(root, output, home, articles) {
 const manifest = JSON.parse(await fs.readFile(path.join(root, 'contracts/feature-delivery.json'), 'utf8'));
 const rows = featureRows(manifest, REQUIRED_FEATURE_IDS);
 await fs.writeFile(path.join(output, 'features.html'), pageShell(home, 'Features', featuresPage(rows), {bodyClass: 'page-hub'}));
 await fs.writeFile(path.join(output, 'settings.html'), pageShell(home, 'Settings', settingsPage(), {bodyClass: 'page-hub', searchPanelOnPage: false}));
 await fs.writeFile(path.join(output, 'diagrams.html'), pageShell(home, 'Interactive examples', diagramsPage(), {bodyClass: 'page-hub'}));
 await fs.writeFile(path.join(output, CRAWLER_POLICY_FILE), crawlerPolicyTxt(SITE_URL));
 return {features: rows.length, tasks: tasksWithArticles(articles)};
}
/** Replaces the home placeholder with the task grid. Throws when the placeholder is missing so a template edit cannot silently drop it. */
export function injectTaskHero(html, entries) {
 if (!html.includes('<!--task-hero-->')) throw new Error('Home template is missing the task placeholder');
 return html.replace('<!--task-hero-->', () => `<div class="task-zone">${taskHero(entries)}</div>`);
}
export {sitemapXml};
