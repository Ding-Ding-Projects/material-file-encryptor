import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extensionBuildIdentity, stageBrowserExtension} from '../scripts/build-browser-extension.mjs';
import {verifyStagedExtension} from '../scripts/extension-browser.mjs';
import {evidencePlan, judge, captureName} from '../scripts/capture-extension-evidence.mjs';
import {PRODUCTION_ROUTES, comparisonPlan, startReferenceServer} from '../scripts/compare-extension-references.mjs';

const fakeCompile = async ({entry, output}) => fs.writeFile(output, entry.endsWith('search-entry.js') ? 'new URL("./regex-worker.js",import.meta.url);' : 'self.onmessage=()=>{};');
const stage = async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-evidence-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const destination = path.join(root, 'stage');
  const receipt = await stageBrowserExtension({root: process.cwd(), destination, compile: fakeCompile});
  return {destination, receipt};
};

test('the build identity covers every staged output except the provenance module and the receipt', () => {
  const files = [{path: 'b.js', sha256: '2'.repeat(64)}, {path: 'a.js', sha256: '1'.repeat(64)}];
  const identity = extensionBuildIdentity(files);
  assert.match(identity, /^[0-9a-f]{64}$/);
  assert.equal(extensionBuildIdentity([...files].reverse()), identity, 'order does not matter');
  assert.equal(extensionBuildIdentity([...files, {path: 'vendor/provenance.js', sha256: '3'.repeat(64)}, {path: 'bundle-receipt.json', sha256: '4'.repeat(64)}]), identity);
  assert.notEqual(extensionBuildIdentity([files[0], {path: 'a.js', sha256: '5'.repeat(64)}]), identity, 'a changed byte changes the identity');
});

test('staging records the build identity in the receipt and in the provenance module', async t => {
  const {destination, receipt} = await stage(t);
  assert.match(receipt.buildIdentity, /^[0-9a-f]{64}$/);
  assert.equal(extensionBuildIdentity(receipt.files), receipt.buildIdentity);
  const provenance = (await import(pathToFileURL(path.join(destination, 'vendor/provenance.js')).href)).default;
  assert.equal(provenance.buildIdentity, receipt.buildIdentity);
  const verified = await verifyStagedExtension(destination);
  assert.equal(verified.receipt.buildIdentity, receipt.buildIdentity);
});

test('evidence refuses a staged build whose bytes changed after staging', async t => {
  const {destination} = await stage(t);
  await fs.appendFile(path.join(destination, 'options.js'), '\n// changed');
  await assert.rejects(verifyStagedExtension(destination), /differs from its receipt/);
});

test('the evidence plan covers Home, every declared section and the popup at each tuple', () => {
  const plan = evidencePlan(['connection', 'status']);
  assert.equal(plan.length, 2 * 3 * (2 * 3 + 2));
  assert.ok(plan.some(item => item.page === 'popup' && item.width === 320 && item.height === 480 && item.theme === 'dark' && item.language === 'bilingual'));
  assert.ok(plan.some(item => item.section === 'home' && item.width === 320 && item.height === 568));
  assert.equal(new Set(plan.map(captureName)).size, plan.length, 'every capture has its own file name');
  assert.equal(evidencePlan(['connection'], {quick: true}).length, 3);
});

test('evidence checks report each failure rather than passing silently', () => {
  const item = {page: 'options', section: 'status', theme: 'dark', language: 'yue'};
  const good = {language: 'zh-HK', theme: 'dark', view: 'section', panelVisible: true, homeVisible: false, identityShown: true, horizontalOverflow: false, version: '1.0.0', errors: []};
  assert.deepEqual(judge(item, good, {version: '1.0.0'}), []);
  const bad = judge(item, {...good, language: 'en', panelVisible: false, identityShown: false, horizontalOverflow: true, version: '0.9.0', errors: ['TypeError: x']}, {version: '1.0.0'});
  assert.equal(bad.length, 6);
  assert.ok(judge({page: 'options', section: 'home', theme: 'light', language: 'en'}, {...good, language: 'en', theme: 'light', view: 'section'}, {version: '1.0.0'}).includes('Home is not the visible view'));
});

test('reference comparisons only use states the extension can show and keep identical tuples', async () => {
  const states = JSON.parse(await fs.readFile('design/extension-completion/states.json', 'utf8')).states;
  const ids = new Set(states.map(entry => `${entry.screen}:${entry.state}`));
  for (const key of Object.keys(PRODUCTION_ROUTES)) assert.ok(ids.has(key), key + ' is a real reference state');
  const plan = comparisonPlan(states);
  assert.ok(plan.length > 0);
  for (const item of plan) {
    const entry = states.find(row => row.id === item.id);
    assert.ok(entry.theme.includes(item.theme) && entry.language.includes(item.language));
    assert.ok(entry.viewports.some(([width, height]) => width === item.width && height === item.height));
    assert.equal(item.scale, 1);
  }
  assert.equal(comparisonPlan(states, {quick: true}).length, Object.keys(PRODUCTION_ROUTES).length);
});

test('the reference server serves the checkout read-only and refuses hidden or outside paths', async t => {
  const {server, origin} = await startReferenceServer(process.cwd());
  t.after(() => server.close());
  assert.equal((await fetch(origin + '/design/extension-completion/reference.html')).status, 200);
  assert.equal((await fetch(origin + '/.git/config')).status, 404);
  assert.equal((await fetch(origin + '/%2e%2e/%2e%2e/secret.html')).status, 404);
  assert.equal((await fetch(origin + '/package.json', {method: 'POST', body: '{}'})).status, 404);
  assert.equal((await fetch(origin + '/scripts/build.bat')).status, 404, 'only known web file types are served');
});
