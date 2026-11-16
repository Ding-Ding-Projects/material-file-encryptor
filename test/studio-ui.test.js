import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';

globalThis.HTMLElement = class {};
const {mountQuicktype} = await import('../src/renderer/features/quicktype/index.js');
const {mountVirtualDisks} = await import('../src/renderer/features/virtual-disks/index.js');
const {mountWorldGenerator} = await import('../src/renderer/features/server-manager/world-generator-panel.js');
const flush = async () => { for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve)); };

function scene() {
  const doc = createAccessDocument(), create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const node = create(tag);
    node.localName = tag; node.style = {}; node.classList = {add() {}}; node.hidden = false; node.disabled = false; node.checked = false; node.type = ''; node.tabIndex = 0; node.files = [];
    node.insertBefore = function (child, before) { child.remove(); child.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(before), 0, child); };
    node.click = async function () { if (!this.disabled) await this.dispatchEvent({type: 'click', target: this, preventDefault() {}}); };
    if (tag === 'mfe-search') { node.query = ''; node.render = () => {}; node.filter = async rows => rows.filter(row => row.text.toLowerCase().includes(node.query.toLowerCase())); node.generation = 0; }
    if (tag === 'canvas') node.getContext = () => null;
    return node;
  };
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({getPropertyValue: () => ''});
  const root = doc.createElement('main');
  doc.body.append(root);
  return {doc, root};
}
const buttons = (root, text) => root.querySelectorAll('md-outlined-button').concat(root.querySelectorAll('md-filled-button'), root.querySelectorAll('md-text-button')).filter(node => node.textContent.includes(text));

test('the type generator loads languages from the host and regenerates from the typed request', async () => {
  const {root} = scene();
  const calls = [];
  const request = async (action, payload) => {
    calls.push({action, payload});
    if (action === 'languages') return {languages: [{id: 'typescript', name: 'TypeScript', extension: 'ts', options: [{name: 'just-types', description: 'Only types', kind: 'boolean', defaultValue: false}]}, {id: 'go', name: 'Go', extension: 'go', options: []}], inference: [{name: 'inferMaps', defaultValue: true}], limits: {}};
    return {code: 'export interface Root {}', extension: 'ts', warnings: []};
  };
  const mounted = mountQuicktype(root, {request, getLanguage: () => 'en'});
  await flush();
  assert.equal(calls[0].action, 'languages');
  assert.ok(calls.some(call => call.action === 'generate' && call.payload.language === 'typescript' && call.payload.sourceKind === 'json'));
  assert.match(root.textContent, /Type generator/);
  assert.match(root.textContent, /just-types/);
  assert.ok(buttons(root, 'Copy').length === 1 && buttons(root, 'Save as file').length === 1);
  mounted.destroy();
  assert.equal(root.children.length, 0, 'destroy removes the surface');
});

test('the type generator shows Cantonese and the host error in the status line', async () => {
  const {root} = scene();
  const request = async action => { if (action === 'languages') return {languages: [{id: 'go', name: 'Go', extension: 'go', options: []}], inference: [], limits: {}}; throw new Error('Source 1 is not valid JSON: boom'); };
  mountQuicktype(root, {request, getLanguage: () => 'yue'});
  await flush();
  assert.match(root.textContent, /型別產生器/);
  assert.match(root.textContent, /not valid JSON: boom/);
});

test('the virtual disk manager explains an unsupported host and keeps all work in the host', async () => {
  const {root} = scene();
  mountVirtualDisks(root, {request: async () => ({supported: false, reason: 'The virtual disk manager needs Windows.'})});
  await flush();
  assert.match(root.textContent, /needs Windows/);
});

test('the virtual disk manager lists disks, creates through the host and confirms a detach by naming the disk', async () => {
  const {root} = scene();
  const calls = [];
  const confirmations = [];
  const request = async (action, payload) => {
    calls.push({action, payload});
    if (action === 'capabilities') return {supported: true, storage: true, hyperv: false, diskpart: true, elevated: false};
    if (action === 'list') return {status: 'done', result: {disks: [{number: 3, path: 'E:\\vm\\x.vhdx', sizeBytes: 10 * 1024 ** 3, letters: ['F'], readOnly: false}]}};
    if (action === 'pickDisk') return {path: 'E:\\vm\\x.vhdx'};
    if (action === 'inspect') return {status: 'done', result: {attached: true, sizeBytes: 10 * 1024 ** 3, fileBytes: 1024 ** 3, number: 3, partitionStyle: 'GPT', partitions: 1, letters: ['F']}};
    return {status: 'done', result: {}, route: 'storage', equivalent: {powershell: 'Dismount-DiskImage', diskpart: ''}};
  };
  const mounted = mountVirtualDisks(root, {request, confirmDestructive: async (id, affected) => { confirmations.push({id, affected}); return true; }});
  await flush();
  assert.match(root.textContent, /E:\\vm\\x\.vhdx/);
  assert.match(root.textContent, /Storage, DiskPart/);
  await buttons(root, 'Choose a disk file')[0].click();
  await flush();
  assert.match(root.textContent, /Smallest|Virtual size/);
  await buttons(root, 'Detach')[0].click();
  await flush();
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].id, 'desktop.virtual-disk-detach');
  assert.match(confirmations[0].affected, /E:\\vm\\x\.vhdx/);
  assert.ok(calls.some(call => call.action === 'detach' && call.payload.path === 'E:\\vm\\x.vhdx'));
  mounted.destroy();
});

test('declining the confirmation leaves the disk attached and sends nothing', async () => {
  const {root} = scene();
  const calls = [];
  const request = async (action, payload) => {
    calls.push(action);
    if (action === 'capabilities') return {supported: true, storage: true, hyperv: true, diskpart: true};
    if (action === 'list') return {status: 'done', result: {disks: []}};
    if (action === 'pickDisk') return {path: 'E:\\vm\\x.vhdx'};
    if (action === 'inspect') return {status: 'done', result: {sizeBytes: 1024 ** 3}};
    return {status: 'done', result: {}};
  };
  mountVirtualDisks(root, {request, confirmDestructive: async () => false});
  await flush();
  await buttons(root, 'Choose a disk file')[0].click();
  await flush();
  await buttons(root, 'Detach')[0].click();
  await flush();
  assert.ok(!calls.includes('detach'));
  assert.match(root.textContent, /Nothing changed/);
});

test('the world generator needs the version, options, destination and license before it can start', async () => {
  const {root} = scene();
  const calls = [];
  const request = async (action, payload) => {
    calls.push({action, payload});
    if (action === 'refreshCatalogue') return {catalogue: {sourceSha256: 'a'.repeat(64)}};
    if (action === 'versions') return {versions: [{id: '1.21.4', channel: 'release'}, {id: '24w01a', channel: 'snapshot'}], next: null};
    if (action === 'worldOptions') return {worldPresets: ['minecraft:normal', 'minecraft:flat'], biomes: ['minecraft:plains'], blocks: ['minecraft:stone'], gamerules: [{name: 'doFireTick', type: 'bool'}, {name: 'randomTickSpeed', type: 'integer'}], gaps: []};
    if (action === 'pickWorldDestination') return {destinationId: '11111111-1111-4111-8111-111111111111', label: 'worlds'};
    if (action === 'startWorldGeneration') return {status: 'running', stage: 'download', progress: {batches: 0, done: 0}, log: []};
    return null;
  };
  mountWorldGenerator(root, {request, getLanguage: () => 'en'});
  await flush();
  const generate = () => buttons(root, 'Generate the world')[0];
  assert.equal(generate().disabled, true);
  await buttons(root, 'Load official versions')[0].click();
  await flush();
  assert.ok(!root.textContent.includes('24w01a'), 'only official releases are offered');
  await buttons(root, 'Read options for this version')[0].click();
  await flush();
  assert.match(root.textContent, /doFireTick/);
  assert.match(root.textContent, /100 × 100 chunks = 1600 × 1600 blocks/);
  await buttons(root, 'Browse for a folder')[0].click();
  await flush();
  assert.equal(generate().disabled, true, 'the license is still unticked');
  const license = root.querySelectorAll('md-checkbox').find(node => (node.getAttribute('aria-label') || '').includes('License'));
  license.checked = true;
  await license.dispatchEvent({type: 'change', target: license});
  await flush();
  assert.equal(generate().disabled, false);
  await generate().click();
  await flush();
  const start = calls.find(call => call.action === 'startWorldGeneration');
  assert.equal(start.payload.widthChunks, 100);
  assert.equal(start.payload.eulaAccepted, true);
  assert.deepEqual(start.payload.output, {kind: 'folder', destinationId: '11111111-1111-4111-8111-111111111111'});
});

test('the world generator shows an extraction gap instead of a made-up preset list', async () => {
  const {root} = scene();
  const request = async action => {
    if (action === 'refreshCatalogue') return {catalogue: {sourceSha256: 'b'.repeat(64)}};
    if (action === 'versions') return {versions: [{id: '1.21.4', channel: 'release'}], next: null};
    if (action === 'worldOptions') return {worldPresets: [], biomes: [], blocks: [], gamerules: [], gaps: [{key: 'worldPresets', reason: 'The data generator did not write data/minecraft/worldgen/world_preset for this version.'}]};
    return null;
  };
  mountWorldGenerator(root, {request});
  await flush();
  await buttons(root, 'Load official versions')[0].click();
  await flush();
  await buttons(root, 'Read options for this version')[0].click();
  await flush();
  assert.match(root.textContent, /No world presets were produced/);
});
