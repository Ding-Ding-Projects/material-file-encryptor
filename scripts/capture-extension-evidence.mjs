// Captures interaction and visual receipts of the staged browser extension, bound to its exact built bytes.
//
// Usage: node scripts/capture-extension-evidence.mjs [--extension out/browser-extension] [--out out/extension-evidence]
//        [--browser <path>] [--quick]
//
// The script first proves the staged files still match bundle-receipt.json and recomputes the build identity. It then
// loads that directory as an unpacked extension into a disposable headless browser profile, opens every workspace
// section and the popup at each theme, language and viewport, checks what the page itself reports (build identity,
// visible view, language, theme, horizontal overflow, script errors) and saves a PNG for each state. The receipt
// records the build identity, the browser version and the hash of every image. It does not sign, install or publish
// anything, and an unpacked load into a temporary profile is not a store installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PREFERENCES_KEY, capture, findBrowser, flags, launchWithExtension, sleep, verifyStagedExtension} from './extension-browser.mjs';

export const THEMES = ['light', 'dark'];
export const LANGUAGES = ['en', 'yue', 'bilingual'];
export const WORKSPACE_VIEWPORTS = [[1280, 800], [320, 568]];
export const POPUP_VIEWPORTS = [[400, 560], [320, 480]];

/** The states to capture: the workspace Home, every section the page declares, and the popup. */
export function evidencePlan(sections, {quick = false} = {}) {
  const themes = quick ? ['light'] : THEMES, languages = quick ? ['en'] : LANGUAGES;
  const plan = [];
  for (const theme of themes) for (const language of languages) {
    for (const [width, height] of quick ? WORKSPACE_VIEWPORTS.slice(0, 1) : WORKSPACE_VIEWPORTS)
      for (const section of ['home', ...sections]) plan.push({page: 'options', section, theme, language, width, height});
    for (const [width, height] of quick ? POPUP_VIEWPORTS.slice(0, 1) : POPUP_VIEWPORTS) plan.push({page: 'popup', section: null, theme, language, width, height});
  }
  return plan;
}

export const captureName = item => [item.page, item.section, item.theme, item.language, `${item.width}x${item.height}`].filter(Boolean).join('-');

const checkExpression = (item, identity) => `(()=>{const root=document.documentElement;const text=document.getElementById('build-identity')?.textContent||'';
 const visible=id=>{const node=document.getElementById(id);return !!node&&!node.hidden&&getComputedStyle(node).display!=='none';};
 return {language:root.lang,theme:root.dataset.theme||null,view:root.dataset.view||null,
  panelVisible:${item.page === 'options' && item.section !== 'home' ? `visible('panel-${item.section}')` : 'null'},
  homeVisible:${item.page === 'options' ? "visible('home-view')" : 'null'},
  identityShown:${item.page === 'options' ? `text.includes(${JSON.stringify(identity.slice(0, 16))})` : 'null'},
  horizontalOverflow:root.scrollWidth>innerWidth+1,version:chrome.runtime.getManifest().version};})()`;

export function judge(item, checks, manifest) {
  const failures = [];
  const language = item.language === 'yue' ? 'zh-HK' : 'en';
  if (checks.language !== language) failures.push(`document language ${checks.language} instead of ${language}`);
  if (checks.theme !== item.theme) failures.push(`theme ${checks.theme} instead of ${item.theme}`);
  if (checks.version !== manifest.version) failures.push('a different extension version is loaded');
  if (checks.horizontalOverflow) failures.push('the page scrolls sideways');
  if (item.page === 'options') {
    if (item.section === 'home' && (checks.view !== 'home' || !checks.homeVisible)) failures.push('Home is not the visible view');
    if (item.section !== 'home' && (checks.view !== 'section' || !checks.panelVisible)) failures.push(`section ${item.section} is not visible`);
    if (!checks.identityShown) failures.push('the page does not show the staged build identity');
  }
  if (checks.errors?.length) failures.push('script errors: ' + checks.errors.slice(0, 3).join(' | '));
  return failures;
}

export async function captureExtensionEvidence({extension = 'out/browser-extension', out = 'out/extension-evidence', browser = findBrowser(), quick = false} = {}) {
  const {receipt: bundle, provenance, manifest} = await verifyStagedExtension(extension);
  const directory = path.join(out, bundle.buildIdentity.slice(0, 16));
  await fs.mkdir(directory, {recursive: true});
  const session = await launchWithExtension({browser, extensionDirectory: extension});
  const record = {schemaVersion: 1, kind: 'extension-product-evidence', buildIdentity: bundle.buildIdentity, sourceCommit: provenance.sourceCommit, sourceModified: provenance.sourceModified, extensionVersion: manifest.version,
    browser: null, load: 'unpacked extension in a disposable headless profile', installation: 'not-performed', signing: 'not-performed', startedAtUtc: new Date().toISOString(), captures: [], verdict: 'incomplete'};
  try {
    record.browser = (await session.version()).Browser;
    const origin = `chrome-extension://${session.extensionId}`;
    const page = await session.open(origin + '/options.html');
    await sleep(2000);
    const sections = await page.eval("[...document.querySelectorAll('[data-tab]')].map(node=>node.dataset.tab).filter(id=>/^[a-z-]+$/.test(id))");
    for (const item of evidencePlan([...new Set(sections)], {quick})) {
      const before = page.errors().length;
      const prefs = {version: 3, language: item.language, theme: item.theme, tab: item.section || 'home', funnyEnglish: 5, funnyCantonese: 5, emoji: false, displayName: '', accent: ''};
      await page.send('Emulation.setDeviceMetricsOverride', {width: item.width, height: item.height, deviceScaleFactor: 1, mobile: false});
      const url = item.page === 'popup' ? origin + '/popup.html' : origin + '/options.html' + (item.section === 'home' ? '' : '#' + item.section);
      await page.eval(`localStorage.setItem(${JSON.stringify(PREFERENCES_KEY)},${JSON.stringify(JSON.stringify(prefs))})`);
      await page.send('Page.navigate', {url});
      await sleep(item.page === 'popup' ? 900 : 1400);
      const checks = await page.eval(checkExpression(item, bundle.buildIdentity));
      checks.errors = page.errors().slice(before);
      const shot = await capture(page, {width: item.width, height: item.height});
      const file = captureName(item) + '.png';
      await fs.writeFile(path.join(directory, file), shot.bytes);
      const failures = judge(item, checks, manifest);
      record.captures.push({...item, scale: 1, file, sha256: shot.sha256, checks, passed: failures.length === 0, failures});
    }
    page.close();
    record.verdict = record.captures.every(row => row.passed) ? 'all-checks-passed' : 'checks-failed';
  } catch (error) {
    record.error = String(error?.message || error).slice(0, 600);
  } finally {
    await session.close();
    record.finishedAtUtc = new Date().toISOString();
    await fs.writeFile(path.join(directory, 'receipt.json'), JSON.stringify(record, null, 2) + '\n');
  }
  return {directory, record};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = flags(process.argv.slice(2));
  const {directory, record} = await captureExtensionEvidence({extension: options.extension, out: options.out, browser: options.browser ? findBrowser(options.browser) : undefined, quick: Boolean(options.quick)});
  const failed = record.captures.filter(row => !row.passed);
  console.log(`${record.captures.length} captures, ${failed.length} with failed checks, verdict ${record.verdict}. Receipt: ${path.join(directory, 'receipt.json')}`);
  for (const row of failed.slice(0, 20)) console.log(`- ${row.file}: ${row.failures.join('; ')}`);
  if (record.error) console.log('Error: ' + record.error);
  process.exitCode = record.verdict === 'all-checks-passed' ? 0 : 1;
}
