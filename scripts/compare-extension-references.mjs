// Compares genuine captures of the staged extension with the checked-in design references at identical tuples.
//
// Usage: node scripts/compare-extension-references.mjs [--extension out/browser-extension]
//        [--out out/extension-reference-parity] [--browser <path>] [--quick]
//
// For every reference state that has a production route in the extension, the script renders the checked-in
// reference (design/extension-completion/reference.html, served read-only from this checkout on 127.0.0.1) and the
// staged extension at the same viewport, device scale, theme and language, captures both, and measures the share of
// pixels that differ. The production side is observed as it renders without a paired desktop, so a reference that
// depicts a native state the extension cannot reach on its own is recorded as such rather than forced. The receipt
// reports measured differences only; it never declares the two designs equivalent.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PREFERENCES_KEY, capture, findBrowser, flags, launchWithExtension, sleep, verifyStagedExtension} from './extension-browser.mjs';

/** Reference states the extension can show on its own, and the production route that shows them. */
export const PRODUCTION_ROUTES = Object.freeze({
  'popup:unpaired': {page: 'popup', note: 'Shown as observed without a paired desktop.'},
  'popup:unavailable': {page: 'popup', note: 'Shown as observed without a paired desktop.'},
  'transfers:empty': {page: 'options', section: 'connection'},
  'capabilities:converter-empty': {page: 'options', section: 'connection'},
  'capabilities:models-empty': {page: 'options', section: 'models'},
  'settings:language': {page: 'options', section: 'personalization'},
  'settings:appearance': {page: 'options', section: 'personalization'},
  'settings:attention': {page: 'options', section: 'personalization'},
  'settings:vocabulary-empty': {page: 'options', section: 'personalization'},
  'settings:schedules': {page: 'options', section: 'personalization'},
  'history:empty': {page: 'options', section: 'personalization'},
  'access:support-empty': {page: 'options', section: 'support'},
  'documentation:index': {page: 'options', section: 'docs'},
  'documentation:changelog-empty': {page: 'options', section: 'changelog'},
  'status:unavailable': {page: 'options', section: 'status'}
});

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2'};

/** Serves files below root for GET requests only, refusing hidden paths and anything outside root. */
export function startReferenceServer(root) {
  const base = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = path.resolve(base, '.' + pathname);
      if (request.method !== 'GET' || !file.startsWith(base + path.sep) || pathname.split('/').some(part => part.startsWith('.')) || !TYPES[path.extname(file)]) { response.writeHead(404).end(); return; }
      const bytes = await fs.readFile(file);
      response.writeHead(200, {'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store'}).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, origin: `http://127.0.0.1:${server.address().port}`})));
}

/** Plans comparisons: each mapped reference state at each theme, language and viewport it declares. */
export function comparisonPlan(states, {quick = false} = {}) {
  const plan = [];
  for (const entry of states) {
    const route = PRODUCTION_ROUTES[`${entry.screen}:${entry.state}`];
    if (!route) continue;
    const themes = quick ? entry.theme.slice(0, 1) : entry.theme, languages = quick ? entry.language.slice(0, 1) : entry.language, viewports = quick ? entry.viewports.slice(0, 1) : entry.viewports;
    for (const theme of themes) for (const language of languages) for (const [width, height] of viewports)
      plan.push({id: entry.id, reference: entry.reference, route, theme, language, width, height, scale: 1});
  }
  return plan;
}

const pixelDifference = (first, second) => `(async()=>{const load=src=>new Promise((ok,fail)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=fail;image.src=src;});
 const [a,b]=await Promise.all([load('data:image/png;base64,${first}'),load('data:image/png;base64,${second}')]);
 if(a.width!==b.width||a.height!==b.height)return {comparable:false,size:[a.width,a.height,b.width,b.height]};
 const pixels=image=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,image.width,image.height).data;};
 const x=pixels(a),y=pixels(b);let different=0;for(let index=0;index<x.length;index+=4){if(Math.max(Math.abs(x[index]-y[index]),Math.abs(x[index+1]-y[index+1]),Math.abs(x[index+2]-y[index+2]))>48)different++;}
 return {comparable:true,pixels:x.length/4,different,ratio:different/(x.length/4)};})()`;

export async function compareExtensionReferences({extension = 'out/browser-extension', out = 'out/extension-reference-parity', browser = findBrowser(), quick = false, root = process.cwd()} = {}) {
  const {receipt: bundle, provenance, manifest} = await verifyStagedExtension(extension);
  const states = JSON.parse(await fs.readFile(path.join(root, 'design/extension-completion/states.json'), 'utf8'));
  const directory = path.join(out, bundle.buildIdentity.slice(0, 16));
  await fs.mkdir(directory, {recursive: true});
  const {server, origin: referenceOrigin} = await startReferenceServer(root);
  const session = await launchWithExtension({browser, extensionDirectory: extension});
  const record = {schemaVersion: 1, kind: 'extension-reference-parity', buildIdentity: bundle.buildIdentity, sourceCommit: provenance.sourceCommit, sourceModified: provenance.sourceModified, referenceSourceCommit: states.sourceCommit, extensionVersion: manifest.version,
    browser: null, threshold: 'a pixel differs when any colour channel differs by more than 48', unmappedStates: states.states.filter(entry => !PRODUCTION_ROUTES[`${entry.screen}:${entry.state}`]).map(entry => entry.id), comparisons: [], verdict: 'incomplete'};
  try {
    record.browser = (await session.version()).Browser;
    const extensionOrigin = `chrome-extension://${session.extensionId}`;
    const product = await session.open(extensionOrigin + '/options.html');
    const reference = await session.open('about:blank');
    const scratch = await session.open('about:blank');
    await sleep(1500);
    for (const item of comparisonPlan(states.states, {quick})) {
      const params = `&language=${item.language}&theme=${item.theme}`;
      await reference.send('Emulation.setDeviceMetricsOverride', {width: item.width, height: item.height, deviceScaleFactor: item.scale, mobile: false});
      await reference.send('Page.navigate', {url: `${referenceOrigin}/design/extension-completion/${item.reference}${params}`});
      await sleep(1200);
      const referenceShot = await capture(reference, item);
      const prefs = {version: 3, language: item.language, theme: item.theme, tab: item.route.section || 'home', funnyEnglish: 5, funnyCantonese: 5, emoji: false, displayName: '', accent: ''};
      await product.send('Emulation.setDeviceMetricsOverride', {width: item.width, height: item.height, deviceScaleFactor: item.scale, mobile: false});
      await product.eval(`localStorage.setItem(${JSON.stringify(PREFERENCES_KEY)},${JSON.stringify(JSON.stringify(prefs))})`);
      await product.send('Page.navigate', {url: item.route.page === 'popup' ? extensionOrigin + '/popup.html' : `${extensionOrigin}/options.html#${item.route.section}`});
      await sleep(1300);
      const productShot = await capture(product, item);
      const name = `${item.id.replaceAll(':', '_')}-${item.theme}-${item.language}-${item.width}x${item.height}`;
      await fs.writeFile(path.join(directory, name + '-reference.png'), referenceShot.bytes);
      await fs.writeFile(path.join(directory, name + '-extension.png'), productShot.bytes);
      const difference = await scratch.eval(pixelDifference(referenceShot.bytes.toString('base64'), productShot.bytes.toString('base64')));
      record.comparisons.push({id: item.id, theme: item.theme, language: item.language, viewport: [item.width, item.height], scale: item.scale,
        production: item.route.page === 'popup' ? 'popup.html' : 'options.html#' + item.route.section, productionNote: item.route.note || 'Shown as observed without a paired desktop.',
        reference: {file: name + '-reference.png', sha256: referenceShot.sha256}, extension: {file: name + '-extension.png', sha256: productShot.sha256}, difference});
    }
    record.verdict = record.comparisons.length && record.comparisons.every(row => row.difference.comparable) ? 'measured' : 'not-comparable';
  } catch (error) {
    record.error = String(error?.message || error).slice(0, 600);
  } finally {
    await session.close();
    server.close();
    await fs.writeFile(path.join(directory, 'receipt.json'), JSON.stringify(record, null, 2) + '\n');
  }
  return {directory, record};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = flags(process.argv.slice(2));
  const {directory, record} = await compareExtensionReferences({extension: options.extension, out: options.out, browser: options.browser ? findBrowser(options.browser) : undefined, quick: Boolean(options.quick)});
  const ratios = record.comparisons.filter(row => row.difference.comparable).map(row => row.difference.ratio);
  const mean = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null;
  console.log(`${record.comparisons.length} comparisons, verdict ${record.verdict}, mean differing share ${mean === null ? 'n/a' : (mean * 100).toFixed(1) + '%'}, ${record.unmappedStates.length} reference states without a production route. Receipt: ${path.join(directory, 'receipt.json')}`);
  if (record.error) console.log('Error: ' + record.error);
  process.exitCode = record.verdict === 'measured' ? 0 : 1;
}
