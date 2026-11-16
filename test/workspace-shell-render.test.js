// Rendered behavior of the workspace shell from source with a stubbed bridge (not installed-application evidence).
import test from 'node:test';
import assert from 'node:assert/strict';
import {startShellServer, launchBrowser, openShellPage, shellState} from './helpers/shell-fixture.js';

const browser = await launchBrowser();
const skip = browser ? false : 'no Chromium-family browser could be launched';
const hosting = skip ? null : await startShellServer();
const open = (options = {}) => openShellPage({browser, origin: hosting.origin, width: 1440, height: 900, ...options});

test('drive tabs show every session, mark the active one and switch the selected session', {skip}, async () => {
  const {page, errors, close} = await open();
  const tabs = await page.locator('#drive-tabs [role=tab]').evaluateAll(nodes => nodes.map(node => ({id: node.dataset.sessionId, selected: node.getAttribute('aria-selected'), state: node.dataset.state, label: node.getAttribute('aria-label')})));
  assert.deepEqual(tabs.map(tab => tab.id), ['main', 's2', 's3']);
  assert.deepEqual(tabs.map(tab => tab.selected), ['true', 'false', 'false']);
  assert.deepEqual(tabs.map(tab => tab.state), ['mounted', 'unlocked', 'locked']);
  assert.match(tabs[0].label, /M: · Work vault · Mounted/);
  await page.locator('#drive-tabs [data-session-id="s3"]').click();
  await page.waitForSelector('#unlock-card', {state: 'visible'});
  assert.equal(await page.locator('#drive-tabs [aria-selected=true]').getAttribute('data-session-id'), 's3');
  assert.equal(await page.locator('#drive-content').isHidden(), true);
  assert.deepEqual(errors, []);
  await close();
});

test('the folder tree scopes the table and the breadcrumb, and sorting reorders the rows', {skip}, async () => {
  const {page, close} = await open();
  const names = () => page.locator('#file-list tr .file-name span:last-child').allTextContents();
  assert.equal((await names()).length, 9);
  await page.locator('.tree-row[data-path="Contracts"]').click();
  await page.waitForTimeout(300);
  assert.deepEqual(await names(), ['Supplier contract.docx']);
  assert.match(await page.locator('#breadcrumb').innerText(), /Contracts/);
  await page.locator('.tree-row[data-path=""]').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row[data-path="Finance"] .tree-caret').click();
  await page.locator('.tree-row[data-path="Finance/2026"]').click();
  await page.waitForTimeout(300);
  assert.equal((await names()).length, 3);
  assert.ok((await names()).includes('Receipts/Invoice 2026-118.pdf'), 'names are relative to the scoped folder');
  await page.locator('.tree-row[data-path=""]').click();
  await page.waitForTimeout(300);
  await page.locator('#view-drive th[data-sort="size"]').click();
  await page.waitForTimeout(300);
  const sizeOrder = await page.locator('#file-list tr td:nth-child(4)').allTextContents();
  assert.equal(await page.locator('#view-drive th[data-sort="size"]').getAttribute('aria-sort'), 'descending');
  assert.match(sizeOrder[0], /204/);
  await close();
});

test('the availability filter narrows the table to offline files', {skip}, async () => {
  const {page, close} = await open();
  await page.locator('#filter-button').click();
  await page.locator('mfe-context-menu md-menu-item', {hasText: 'Available offline'}).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#file-list tr').count(), 3);
  await close();
});

test('selecting a file fills the inspector with its part map and versions', {skip}, async () => {
  const {page, close} = await open();
  await page.locator('#file-list tr', {hasText: 'Archive 2025.zip'}).click();
  await page.waitForSelector('#inspector-versions .version-item');
  assert.equal(await page.locator('#inspector-parts .part-cell').count(), 22);
  assert.match(await page.locator('#inspector-parts').getAttribute('aria-label'), /22 encrypted parts/);
  assert.equal(await page.locator('#inspector-versions .version-item').count(), 2);
  assert.match(await page.locator('#inspector-backup').innerText(), /docker\.io\/example\/work-vault/);
  await page.locator('#file-list tr', {hasText: 'Product demo.mov'}).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#inspector-parts .part-cell').count(), 54);
  await close();
});

test('Back up now announces itself with an event the storage lane can consume', {skip}, async () => {
  const {page, close} = await open();
  await page.evaluate(() => { window.__backupEvents = []; window.addEventListener('mfe:open-cloud-backup', event => window.__backupEvents.push(event.detail)); });
  await page.locator('#backup-now-button').click();
  assert.deepEqual(await page.evaluate(() => window.__backupEvents), [{sessionId: 'main'}]);
  await close();
});

test('the unlock card reports a wrong password in place and unlocks with the right one', {skip}, async () => {
  const locked = shellState({sessionId: 's3', driveName: 'Tax records', driveLetter: 'T:', locked: true, mounted: false, files: []});
  const {page, close} = await open({state: locked});
  assert.match(await page.locator('#unlock-card-title').innerText(), /Tax records is locked/);
  await page.locator('#unlock-submit').click();
  assert.match(await page.locator('#unlock-error').innerText(), /Enter your password/);
  await page.locator('#unlock-password input').fill('wrong');
  await page.locator('#unlock-submit').click();
  await page.waitForFunction(() => /not correct/.test(document.getElementById('unlock-error').textContent));
  assert.equal(await page.locator('#unlock-card').getAttribute('data-state'), 'failed');
  assert.equal(await page.locator('#locked-state').isVisible(), true, 'the drive stays locked');
  await page.locator('#unlock-password input').fill('right');
  await page.locator('#unlock-submit').click();
  await page.waitForSelector('#drive-content', {state: 'visible'});
  assert.equal(await page.evaluate(() => document.getElementById('unlock-password').value), '', 'the password is cleared after unlocking');
  await close();
});

test('text size, density and high contrast apply, persist and reset to the stored value on reload', {skip}, async () => {
  const {page, close} = await open();
  await page.evaluate(() => {
    const scale = document.getElementById('text-scale-setting'); scale.value = 150; scale.dispatchEvent(new Event('input', {bubbles: true}));
    const contrast = document.getElementById('high-contrast-setting'); contrast.selected = true; contrast.dispatchEvent(new Event('change', {bubbles: true}));
    const density = document.getElementById('density-setting'); density.value = 'comfortable'; density.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => ({scale: document.documentElement.style.getPropertyValue('--mfe-text-scale'), contrast: document.documentElement.dataset.contrast, density: document.documentElement.dataset.density, stored: JSON.parse(localStorage.getItem('mfe.shell.v1')), row: getComputedStyle(document.querySelector('#file-list tr td:nth-child(2)')).height}));
  assert.equal(applied.scale, '1.5');
  assert.equal(applied.contrast, 'high');
  assert.equal(applied.density, 'comfortable');
  assert.deepEqual(applied.stored, {density: 'comfortable', textScale: 150, highContrast: true});
  assert.ok(parseFloat(applied.row) >= 48, `comfortable rows are at least 48px (${applied.row})`);
  await page.reload();
  await page.waitForSelector('#drive-tabs [role=tab]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.contrast), 'high');
  assert.equal(await page.evaluate(() => document.getElementById('text-scale-output').textContent), '150%');
  await close();
});

test('high contrast changes the colors the shell uses, and forced colors keep the selected tab outlined', {skip}, async () => {
  const normal = await open();
  const base = await normal.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--line').trim());
  await normal.close();
  const contrast = await open({preferences: {density: 'compact', textScale: 100, highContrast: true}});
  const strong = await contrast.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--line').trim());
  assert.notEqual(strong, base);
  assert.equal(strong, '#000');
  await contrast.close();
  const forced = await open({forcedColors: 'active'});
  const outline = await forced.page.evaluate(() => getComputedStyle(document.querySelector('#drive-tabs [aria-selected=true]')).outlineStyle);
  assert.equal(outline, 'solid');
  await forced.close();
});

test('a wording file mapping is not needed for shell labels: every visible shell string comes from the translator', {skip}, async () => {
  const {page, close} = await open({preferences: null});
  await page.evaluate(() => localStorage.setItem('material-drive.preferences.v1', JSON.stringify({language: 'yue'})));
  await page.reload();
  await page.waitForSelector('#drive-tabs [role=tab]');
  await page.waitForTimeout(600);
  const labels = await page.evaluate(() => ({upload: document.querySelector('#import-button span:last-child').textContent, details: document.getElementById('inspector-title').textContent, status: document.getElementById('status-mounted').textContent}));
  assert.equal(labels.upload, '上載');
  assert.equal(labels.details, '詳情');
  assert.match(labels.status, /已掛載/);
  await close();
});

test.after(async () => {
  await browser?.close();
  await hosting?.close();
});
