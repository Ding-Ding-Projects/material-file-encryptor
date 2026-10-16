import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DESKTOP_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-desktop.js';
import {SITE_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-site.js';
import {EXTENSION_POPUP_INFO_ICON_INVENTORY, EXTENSION_OPTIONS_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-extension.js';
import {INFO_ICON_COPY, buildSurfaceInventory, infoIconDescriptor} from '../src/shared/local-ux/info-icon-inventory.js';
import {GUIDANCE_COPY} from '../src/shared/surface/control-guidance.js';
import {mountInfoIcons, probeInfoIcons, assertInventory} from '../src/shared/surface/info-icon-mount.js';
import {createInfoIconController} from '../src/shared/surface/info-icon-controller.js';
import {infoIconDom} from './helpers/info-icon-dom.js';
import {extractControls, selectorMatches, uncoveredControls, unmatchedSelectors} from './helpers/info-icon-sources.js';

const read = relative => fs.readFile(new URL('../' + relative, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Independent, hand-written lists. Deleting a descriptor cannot hide a gap here.
const SURFACES = [
  {name: 'desktop', inventory: DESKTOP_INFO_ICON_INVENTORY, html: 'src/renderer/index.html', minimum: 60,
    required: ['#lock-button', '#create-button', '#unlock-button', '#mount-button', '#import-button', '#sync-button', '#split-apply', '#resplit-button', '#startup-setting', '#auto-unlock-setting', '#forget-credential', '#theme-setting', '#language-setting', '#password-input', '#storage-input', '#cache-input', '#drive-name', '#dialog-submit', '#confirm-action', 'mfe-search[scope="drive-files"]', '#force-lock-button', 'mfe-navigation-rail', '#open-setup-guide']},
  {name: 'site', inventory: SITE_INFO_ICON_INVENTORY, html: 'docs/site/index.html', minimum: 20,
    required: ['#preferences-open', '#part-limit', '#workflow-play', '#doc-search', '#preview-download', '#vocabulary-file', '#vocabulary-reset', '#menu-toggle']},
  {name: 'extension popup', inventory: EXTENSION_POPUP_INFO_ICON_INVENTORY, html: 'browser-extension/popup.html', minimum: 15,
    required: ['#pair', '#disconnect', '#workspace', '#launch-connection', '#launch-servers', '#search']},
  {name: 'extension options', inventory: EXTENSION_OPTIONS_INFO_ICON_INVENTORY, html: 'browser-extension/options.html', minimum: 130,
    required: ['#pair', '#pair-code', '#note-new', '#ticket-save', '#models-connect', '#export-preview', '#confirm-execute', 'button[data-tab="connection"]', '#lock-connection-lock', '#school-toggle', '#docs-search', '#accent-apply']}
];
const RUNTIME_SOURCES = {desktop: ['src/renderer/app.js', 'src/renderer/features/shell/navigation.js'], site: ['docs/site/site-foundation.js']};

for (const surface of SURFACES) {
  test(`${surface.name}: every hand-written required control has its own descriptor`, () => {
    const selectors = surface.inventory.descriptors.map(row => row.selector);
    for (const selector of surface.required) assert.ok(selectors.includes(selector), `${surface.name} omits ${selector}`);
    assert.ok(surface.inventory.descriptors.length >= surface.minimum, `${surface.name} shrank below ${surface.minimum}`);
  });

  test(`${surface.name}: no capable control in the markup lacks an explanation or a stated exemption`, async () => {
    const html = await read(surface.html);
    assert.ok(extractControls(html).length > 5, 'the markup scan found controls');
    assert.deepEqual(uncoveredControls(html, surface.inventory).map(control => `${control.tag}#${control.attributes.id || ''}`), []);
    assert.deepEqual(unmatchedSelectors(html, surface.inventory), [], 'every static selector matches real markup');
  });

  test(`${surface.name}: the coverage scan turns red when a descriptor or a control is changed`, async () => {
    const html = await read(surface.html);
    const first = surface.inventory.descriptors.find(row => !row.group && !row.runtime);
    const reduced = {descriptors: surface.inventory.descriptors.filter(row => row !== first), exemptions: surface.inventory.exemptions};
    assert.ok(uncoveredControls(html, reduced).length >= 1, 'removing a descriptor must leave an uncovered control');
    const extra = html.replace('</body>', '<md-outlined-button id="added-without-explanation">Added</md-outlined-button></body>');
    assert.ok(uncoveredControls(extra, surface.inventory).some(control => control.attributes.id === 'added-without-explanation'));
    const stale = {descriptors: [...surface.inventory.descriptors, {...first, id: 'stale', selector: '#no-such-control'}], exemptions: surface.inventory.exemptions};
    assert.deepEqual(unmatchedSelectors(html, stale), ['#no-such-control']);
  });

  test(`${surface.name}: descriptors are complete, unique, bilingual and carry an authored sample`, () => {
    assertInventory(surface.inventory.descriptors, surface.inventory);
    const known = text => Object.hasOwn(INFO_ICON_COPY, text) || Object.hasOwn(GUIDANCE_COPY, text);
    for (const row of surface.inventory.descriptors) {
      const practice = row.practice;
      const strings = [row.label, row.purpose, row.options, row.default, row.effects, row.example, row.validation, row.recovery, row.unavailableReason, ...row.steps,
        practice.label, practice.input, practice.action, practice.expected, ...(practice.choices || []).flatMap(choice => [choice.label, choice.result])];
      for (const text of strings) assert.ok(known(text), `${row.id}: no Cantonese wording for "${text}"`);
      assert.ok(row.steps.length >= 3, `${row.id}: guided steps`);
      assert.equal(row.sourceId, 'docs/features/interface/info-icon-guidance.md');
    }
    for (const exemption of surface.inventory.exemptions) assert.ok(exemption.reason && Object.hasOwn(INFO_ICON_COPY, exemption.reason), `${exemption.selector}: stated reason`);
  });

  test(`${surface.name}: each icon sits immediately before its own target, opens its panel and closes from the keyboard`, () => {
    const {root, target, doc} = infoIconDom();
    const commands = [];
    const nodes = surface.inventory.descriptors.map(row => target(row.selector));
    const query = (scope, selector) => scope.querySelector(selector);
    const report = mountInfoIcons(root, {inventory: surface.inventory, query, registerCommands: rows => { commands.push(...rows); return () => {}; }});
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.missing, []);
    assert.equal(report.mounted.length, surface.inventory.descriptors.length);
    surface.inventory.descriptors.forEach((row, index) => {
      const host = nodes[index].previousElementSibling;
      assert.equal(String(host.tagName), 'mfe-control-guidance', row.id);
      assert.equal(host.dataset.guidanceId, row.id);
      assert.equal(host.attributes['data-info-icon'], row.surface);
      assert.equal(root.children.indexOf(host) + 1, root.children.indexOf(nodes[index]), `${row.id}: the icon is the sibling immediately before its target`);
      assert.equal(host.shadowRoot.children[0].tagName, 'md-icon-button');
    });
    assert.deepEqual(probeInfoIcons(root, {inventory: surface.inventory, query, commands}), []);
    assert.equal(commands.length, surface.inventory.descriptors.length * 2);
    report.destroy();
    assert.equal(root.children.length, nodes.length, 'destroying every icon leaves only the original controls');
    void doc;
  });
}

test('the icon names its target in English, Cantonese and both languages', () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#lock-button');
  for (const mode of ['en', 'yue', 'bilingual']) {
    const t = source => { const yue = INFO_ICON_COPY[source] || GUIDANCE_COPY[source] || source; return mode === 'en' ? source : mode === 'yue' ? yue : `${source} / ${yue}`; };
    const {root, target} = infoIconDom();
    const node = target('#lock-button');
    const report = mountInfoIcons(root, {inventory: {descriptors: [row]}, t});
    const entry = node.previousElementSibling.shadowRoot.children[0];
    assert.equal(entry.attributes['aria-label'], `${t('Help for')} ${t(row.label)}`);
    if (mode === 'yue') assert.match(entry.attributes['aria-label'], /鎖定磁碟/);
    report.destroy();
  }
});

test('each runtime-created control is created by named source so its icon has something to bind to', async () => {
  for (const surface of SURFACES.filter(item => RUNTIME_SOURCES[item.name])) {
    const source = (await Promise.all(RUNTIME_SOURCES[surface.name].map(read))).join('\n');
    const runtime = surface.inventory.descriptors.filter(row => row.runtime);
    assert.ok(runtime.length >= 1, `${surface.name} has runtime rows`);
    for (const row of runtime) {
      const token = row.selector.startsWith('#') ? row.selector.slice(1) : /\[scope="([^"]+)"\]/.exec(row.selector)?.[1] || row.selector;
      assert.ok(source.includes(token), `${row.id}: ${token} is not created in ${RUNTIME_SOURCES[surface.name].join(', ')}`);
    }
  }
});

test('the desktop mounts its icons from the shell after the controls exist and rebuilds them on a language change', async () => {
  const app = await read('src/renderer/app.js');
  assert.match(app, /createShellInfoIcons\(document\.body,/);
  assert.match(app, /shellInfoIcons\?\.setLanguage\(preferences\.language\)/);
  assert.ok(app.indexOf('createShellInfoIcons(document.body') > app.indexOf("detailsButton.id='file-details-button'"), 'mounted after the runtime controls are created');
  const site = await read('docs/site/site-foundation.js');
  assert.match(site, /createInfoIconController\(document,\{inventory:SITE_INFO_ICON_INVENTORY/);
  assert.match(site, /infoIcons\.destroy\(\)/);
});

test('the controller mounts once per language and registers the palette commands in one batch', () => {
  const {root, target} = infoIconDom();
  const nodes = DESKTOP_INFO_ICON_INVENTORY.descriptors.slice(0, 5).map(row => target(row.selector));
  const batches = [];
  let language = 'en';
  const controller = createInfoIconController(root, {
    inventory: {descriptors: DESKTOP_INFO_ICON_INVENTORY.descriptors.slice(0, 5)},
    getLanguage: () => language, registerCommands: rows => { batches.push(rows.length); return () => batches.push('disposed'); }
  });
  assert.deepEqual(batches, [10], 'one registration for the whole set');
  controller.setLanguage('en');
  assert.deepEqual(batches, [10], 'an unchanged language does not rebuild');
  language = 'yue';
  controller.setLanguage('yue');
  assert.deepEqual(batches, [10, 'disposed', 10]);
  assert.equal(root.children.length, 10, 'rebuilding never leaves a duplicate icon');
  controller.destroy();
  assert.equal(root.children.length, 5);
  assert.equal(nodes.every(node => node.parentNode === root), true);
});

test('mounting twice never adds a second icon above the same control', () => {
  const {root, target} = infoIconDom();
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors[0];
  target(row.selector);
  const inventory = {descriptors: [row]};
  const first = mountInfoIcons(root, {inventory}), second = mountInfoIcons(root, {inventory});
  assert.equal(root.children.length, 2);
  assert.equal(second.mounted.length, 1);
  first.destroy();
});

test('a control that is not on this page is reported instead of silently skipped', () => {
  const {root} = infoIconDom();
  const report = mountInfoIcons(root, {inventory: {descriptors: DESKTOP_INFO_ICON_INVENTORY.descriptors.slice(0, 3)}});
  assert.equal(report.missing.length, 3);
  assert.equal(report.mounted.length, 0);
});

// ---------------------------------------------------------------- guard

function mountOne(row, {commands = true} = {}) {
  const {root, target, Node} = infoIconDom();
  const node = target(row.selector);
  const registered = [];
  const report = mountInfoIcons(root, {inventory: {descriptors: [row]}, registerCommands: commands ? rows => { registered.push(...rows); return () => {}; } : undefined});
  return {root, node, report, registered, host: node.previousElementSibling, Node, inventory: {descriptors: [row]}};
}
const codes = (context, overrides = {}) => [...new Set(probeInfoIcons(context.root, {inventory: context.inventory, commands: context.registered, ...overrides}).map(problem => problem.code))].sort();

test('guard: an intact icon reports nothing, and removing the icon, the target binding, the keyboard action or the panel each turns it red on its own', () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#sync-button');

  const intact = mountOne(row);
  assert.deepEqual(codes(intact), [], 'baseline');

  const noIcon = mountOne(row);
  noIcon.host.remove();
  assert.deepEqual(codes(noIcon), ['icon-missing']);

  const noButton = mountOne(row);
  noButton.host.shadowRoot.children.shift();
  assert.deepEqual(codes(noButton), ['icon-missing']);

  const unbound = mountOne(row);
  unbound.host.dataset.guidanceId = 'desktop.some-other-control';
  assert.deepEqual(codes(unbound), ['target-binding']);

  const noPanel = mountOne(row);
  const shadow = noPanel.host.shadowRoot;
  shadow.children.splice(shadow.children.findIndex(node => node.tagName === 'section'), 1);
  assert.deepEqual(codes(noPanel), ['contextual-panel']);

  const noEscape = mountOne(row);
  const fresh = new noEscape.Node('shadow');
  fresh.root = true;
  fresh.append(...noEscape.host.shadowRoot.children);
  noEscape.host.shadowRoot = fresh;
  assert.deepEqual(codes(noEscape), ['keyboard-action'], 'an Escape handler that is gone is detected');

  const noCommands = mountOne(row, {commands: false});
  assert.deepEqual(codes(noCommands), ['keyboard-action'], 'unregistered keyboard commands are detected');
});

test('guard: an icon whose panel omits the control-specific purpose is reported', () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#sync-button');
  const context = mountOne(row);
  const other = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#lock-button');
  const wrong = {descriptors: [{...row, purpose: other.purpose}]};
  assert.deepEqual([...new Set(probeInfoIcons(context.root, {inventory: wrong, commands: context.registered}).map(problem => problem.code))], ['contextual-panel']);
});

test('guard: a control with no target on the page is reported by the probe', () => {
  const {root} = infoIconDom();
  assert.deepEqual(probeInfoIcons(root, {inventory: {descriptors: [DESKTOP_INFO_ICON_INVENTORY.descriptors[0]]}}).map(problem => problem.code), ['target-missing']);
});

// ---------------------------------------------------------------- isolation

test('opening the explanation, using the sample and finishing the guided steps never operate or read the real control', async () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#theme-setting');
  const context = mountOne(row);
  let clicks = 0, changes = 0;
  context.node.addEventListener('click', () => clicks++);
  context.node.addEventListener('change', () => changes++);
  Object.defineProperty(context.node, 'value', {get() { throw Error('A live value was read.'); }, set() { throw Error('A live value was written.'); }});
  const module = context.report.modules[0];
  module.open();
  const panel = context.host.shadowRoot.children.at(-1);
  assert.equal(panel.hidden, false);
  module.openWizard();
  const wizard = panel.children[5];
  for (let step = 0; step < 3; step++) {
    wizard.querySelector('md-filled-button').click();
    await tick();
  }
  assert.equal(clicks, 0, 'the guide never presses the control');
  assert.equal(changes, 0);
  assert.ok(panel.children[3].dataset.guidanceSandbox, 'the sample runs in an isolated container');
  module.close();
});

test('an unavailable control still explains itself while the guided start stays disabled', () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#mount-button');
  const context = mountOne(row);
  context.node.disabled = true;
  const module = context.report.modules[0];
  module.open();
  const panel = context.host.shadowRoot.children.at(-1);
  assert.equal(panel.hidden, false);
  assert.equal(panel.children[4].children[0].disabled, true);
  assert.match(panel.children[2].textContent, /unavailable/i);
});

test('the sample of a credential control uses only fixed demonstration text', () => {
  const row = DESKTOP_INFO_ICON_INVENTORY.descriptors.find(item => item.selector === '#password-input');
  assert.equal(row.practice.initial, 'DEMO-ONLY');
  const serialized = JSON.stringify(row);
  assert.doesNotMatch(serialized, /hunter2|correct horse|secret123/i);
});

// ---------------------------------------------------------------- builder

test('the builder rejects an unknown kind, a repeated purpose and a control listed twice', () => {
  const base = ['#a', 'button', 'A', '甲', 'Purpose A.', '用途甲。', 'Effect A.', '效果甲。'];
  assert.throws(() => infoIconDescriptor(['#a', 'dial', ...base.slice(2)], {surface: 'x'}), /Unknown information icon kind/);
  assert.throws(() => buildSurfaceInventory('x', [base, ['#b', ...base.slice(1)]]), /Repeated purpose/);
  assert.throws(() => buildSurfaceInventory('x', [base, [...base.slice(0, 4), 'Purpose B.', '用途乙。', 'Effect B.', '效果乙。']]), /Duplicate information icon identity|appears twice/);
});

test('descriptors never carry a live value or a link to a real operation', () => {
  for (const surface of SURFACES) for (const row of surface.inventory.descriptors) {
    assert.equal(typeof row.run, 'undefined');
    assert.equal(typeof row.validate, 'undefined');
    assert.ok(Object.values(row).every(value => typeof value !== 'function'));
  }
});

test('selector matching used by the coverage scan accepts only the documented forms', () => {
  const control = {tag: 'md-radio', attributes: {name: 'credential-mode', value: 'password'}};
  assert.equal(selectorMatches(control, 'md-radio[name="credential-mode"]'), true);
  assert.equal(selectorMatches(control, '[value="keyFile"]'), false);
  assert.throws(() => selectorMatches(control, '.class'), /Unsupported/);
});

test('the published article and its Cantonese twin are generated from the registered inventories and are current', async () => {
  const {articleText, ARTICLE_FILES} = await import('../scripts/generate-info-icon-article.mjs');
  for (const [locale, relative] of Object.entries(ARTICLE_FILES)) {
    const written = (await read(relative)).replaceAll('\r\n', '\n');
    assert.equal(written, articleText(locale), `${relative} is stale. Run node scripts/generate-info-icon-article.mjs`);
  }
  const english = articleText('en');
  for (const surface of SURFACES) for (const row of surface.inventory.descriptors) assert.ok(english.includes(`### ${row.concept}`), `${row.id} has an article section its help link can reach`);
});
