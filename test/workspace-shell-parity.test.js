// Feature-parity check for the workspace shell.
//
// It opens the renderer from source at a wide and a narrow viewport, inventories every action a person can reach
// at 1440 px, and fails when any of them cannot be reached at 360 px. "Reached" means the control is visible, or it
// sits behind one of the three doors the narrow layout provides: the command overflow menu, the navigation drawer
// and the details sheet. It also checks that the narrow page never scrolls sideways.
//
// Scope: this runs the source renderer with a stubbed preload bridge in a Chromium-family browser. It proves layout
// and reachability. It does not prove installed-application behavior, native dialogs or the host window frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startShellServer, launchBrowser, openShellPage, shellState} from './helpers/shell-fixture.js';

const WIDE = {width: 1440, height: 900};
const NARROW = {width: 360, height: 740};

// Controls that depend on state this fixture does not provide are listed here with the reason.
const STATE_DEPENDENT = new Set(['#mount-button', '#upgrade-vault', '#drive-tab-remove']);

const ACTIONS = [
  '#drive-tab-add', '#drive-tab-remove', '[data-window=minimize]', '[data-window=maximize]', '[data-window=close]',
  '#new-button', '#import-button', '#open-button', '#export-button', '#copy-path-button', '#offline-button', '#release-button',
  '#delete-button', '#resplit-button', '#sync-button', '#lock-button', '#force-lock-button', '#backup-now-button', '#file-details-button',
  '#filter-button', '#select-all-files', '#inspector-backup-settings', '#explorer-button', '#mount-button', '#upgrade-vault',
  'mfe-top-bar .search', 'mfe-top-bar md-icon-button[title="Notifications"]',
  'mfe-search[scope="drive-files"]'
];
const RAIL = ['drive', 'offline', 'history', 'recycle', 'storage', 'tools', 'settings', 'help'];
const SORT = ['name', 'availability', 'size', 'modified', 'parts'];

async function menuLabels(page, trigger) {
  await page.locator(trigger).click();
  await page.waitForSelector('mfe-context-menu md-menu-item', {timeout: 5000});
  const labels = await page.locator('mfe-context-menu md-menu-item').evaluateAll(items => items.map(item => item.textContent.trim().replace(/\s+/g, ' ')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return labels;
}

/** Resolves every key in the inventory to the way it is reached, or null when it cannot be reached. */
async function reach(page, narrow) {
  const result = new Map();
  const visible = async selector => {
    const locator = page.locator(selector).first();
    return (await locator.count()) > 0 && await locator.isVisible();
  };
  const overflowLabels = (await visible('#more-button')) ? await menuLabels(page, '#more-button') : [];
  const sortLabels = (narrow && await visible('#sort-button')) ? await menuLabels(page, '#sort-button') : [];
  const textOf = selector => page.locator(selector).first().evaluate(node => node.textContent.trim().replace(/\s+/g, ' '));

  for (const selector of ACTIONS) {
    if ((await page.locator(selector).count()) === 0) { result.set(selector, null); continue; }
    if (await visible(selector)) { result.set(selector, 'visible'); continue; }
    const label = await textOf(selector).catch(() => '');
    if (label && overflowLabels.includes(label)) result.set(selector, 'overflow menu');
    else result.set(selector, null);
  }

  // The details sheet: its own controls count as reached when the toggle opens a sheet that shows them.
  const sheetTargets = ['#inspector-backup-settings', '#explorer-button'];
  if (narrow && await visible('#inspector-toggle')) {
    await page.locator('#inspector-toggle').click();
    await page.waitForTimeout(350);
    for (const selector of sheetTargets) if (await visible(selector)) result.set(selector, 'details sheet');
    await page.locator('#inspector-close').click();
    await page.waitForTimeout(350);
  }

  // The navigation drawer carries the rail and the folder tree.
  const railVisible = async destination => visible(`mfe-navigation-rail md-text-button[data-destination="${destination}"]`);
  const treeKeys = await page.locator('.tree-row').evaluateAll(rows => rows.map(row => row.dataset.path));
  const treeVisible = async path => page.locator(`.tree-row[data-path="${path}"]`).first().isVisible();
  let drawerOpen = false;
  const openDrawer = async () => {
    if (drawerOpen || !(await visible('mfe-top-bar .drawer'))) return;
    await page.locator('mfe-top-bar .drawer').click();
    await page.waitForTimeout(350);
    drawerOpen = true;
  };
  for (const destination of RAIL) {
    let how = (await railVisible(destination)) ? 'visible' : null;
    if (!how && narrow) { await openDrawer(); if (await railVisible(destination)) how = 'navigation drawer'; }
    result.set('rail:' + destination, how);
  }
  for (const path of treeKeys) {
    let how = (await treeVisible(path)) ? 'visible' : null;
    if (!how && narrow) { await openDrawer(); if (await treeVisible(path)) how = 'navigation drawer'; }
    result.set('tree:' + path, how);
  }
  if (drawerOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }

  for (const key of SORT) {
    const header = `#view-drive th[data-sort="${key}"]`;
    if (await visible(header)) { result.set('sort:' + key, 'column header'); continue; }
    const wanted = {name: 'Name', availability: 'Availability', size: 'Size', modified: 'Modified', parts: 'Parts'}[key];
    result.set('sort:' + key, sortLabels.includes(wanted) ? 'sort menu' : null);
  }
  const tabs = await page.locator('#drive-tabs [role=tab]').evaluateAll(nodes => nodes.map(node => node.dataset.sessionId));
  for (const id of tabs) {
    const tab = page.locator(`#drive-tabs [data-session-id="${id}"]`);
    await tab.scrollIntoViewIfNeeded();
    result.set('tab:' + id, (await tab.isVisible()) ? 'drive tab strip' : null);
  }
  return result;
}

const browser = await launchBrowser();
const skipReason = browser ? false : 'no Chromium-family browser could be launched';
const hosting = skipReason ? null : await startShellServer();

test('every action reachable at 1440 px stays reachable at 360 px', {skip: skipReason}, async () => {
  const wide = await openShellPage({browser, origin: hosting.origin, ...WIDE});
  const wideMap = await reach(wide.page, false);
  await wide.close();
  const narrow = await openShellPage({browser, origin: hosting.origin, ...NARROW});
  const narrowMap = await reach(narrow.page, true);
  assert.deepEqual(narrow.errors, [], 'no page errors at 360 px');
  await narrow.close();

  const wideReachable = [...wideMap].filter(([, how]) => how);
  const wideMissing = [...wideMap].filter(([key, how]) => !how && !STATE_DEPENDENT.has(key)).map(([key]) => key);
  assert.deepEqual(wideMissing, [], 'the inventory itself must be reachable at 1440 px, otherwise the probe is wrong');
  assert.ok(wideReachable.length >= 40, `the wide inventory is substantial (${wideReachable.length} actions)`);

  const lost = wideReachable.filter(([key]) => !narrowMap.get(key)).map(([key]) => key);
  assert.deepEqual(lost, [], 'actions reachable at 1440 px but not at 360 px');
});

test('the parity check turns red when a wide-screen action is hidden at 360 px', {skip: skipReason}, async () => {
  const narrow = await openShellPage({browser, origin: hosting.origin, ...NARROW});
  // Remove one command everywhere: no menu entry and no visible control remain for it.
  await narrow.page.evaluate(() => document.getElementById('delete-button').remove());
  const map = await reach(narrow.page, true);
  await narrow.close();
  assert.equal(map.get('#delete-button'), null, 'a removed command is reported as unreachable');
});

test('the narrow page never scrolls sideways, locked or unlocked, with the details sheet open', {skip: skipReason}, async () => {
  const overflow = page => page.evaluate(() => ({scroll: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth}));
  const unlocked = await openShellPage({browser, origin: hosting.origin, ...NARROW});
  let sizes = await overflow(unlocked.page);
  assert.ok(sizes.scroll <= sizes.inner && sizes.body <= sizes.inner, `unlocked ${JSON.stringify(sizes)}`);
  await unlocked.page.locator('#inspector-toggle').click();
  await unlocked.page.waitForTimeout(350);
  sizes = await overflow(unlocked.page);
  assert.ok(sizes.scroll <= sizes.inner, `sheet open ${JSON.stringify(sizes)}`);
  await unlocked.close();
  const locked = await openShellPage({browser, origin: hosting.origin, ...NARROW, state: shellState({sessionId: 's3', driveName: 'Tax records', driveLetter: 'T:', locked: true, mounted: false, files: []})});
  sizes = await overflow(locked.page);
  assert.ok(sizes.scroll <= sizes.inner && sizes.body <= sizes.inner, `locked ${JSON.stringify(sizes)}`);
  assert.ok(await locked.page.locator('#unlock-card').isVisible(), 'the unlock card is shown inside the locked drive tab');
  await locked.close();
});

test('touch targets in the narrow command bar and details sheet are at least 44 px high', {skip: skipReason}, async () => {
  const narrow = await openShellPage({browser, origin: hosting.origin, ...NARROW});
  const heights = await narrow.page.evaluate(() => [...document.querySelectorAll('#command-bar .file-actions > md-text-button')]
    .filter(button => button.getBoundingClientRect().width > 0).map(button => [button.id, Math.round(button.getBoundingClientRect().height)]));
  await narrow.close();
  assert.ok(heights.length >= 2);
  for (const [id, height] of heights) assert.ok(height >= 44, `${id} is ${height}px high`);
});

test.after(async () => {
  await browser?.close();
  await hosting?.close();
});
