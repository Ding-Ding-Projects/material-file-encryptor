import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountServerTargets} from '../src/renderer/features/server-manager/targets-panel.js';
import {TARGETS_COPY, targetsTranslator} from '../src/renderer/features/server-manager/targets-copy.js';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const ID = 'managed-0d3f5b2a-1111-4222-8333-444455556666';
const tools = host => ({
  buttons: label => ['md-filled-button', 'md-outlined-button', 'md-text-button'].flatMap(tag => host.querySelectorAll(tag)).filter(node => node.textContent === label || node.textContent.startsWith(label + ' / ')),
  button(label) { const found = this.buttons(label); assert.ok(found.length, 'button ' + label); return found[0]; },
  chip: target => host.querySelectorAll('md-filter-chip').find(node => node.dataset.target === target),
  tab: label => host.querySelectorAll('md-primary-tab').find(node => node.textContent === label),
  field: label => host.querySelectorAll('md-outlined-text-field').find(node => node.getAttribute('aria-label') === label || node.getAttribute('label') === label),
  select: label => host.querySelectorAll('md-outlined-select').find(node => node.getAttribute('aria-label') === label),
});
async function type(node, value) { node.value = value; await node.dispatchEvent({type: 'input'}); }
async function choose(node, value) { node.value = value; await node.dispatchEvent({type: 'change'}); }

function backend({servers = [], targets} = {}) {
  const calls = [];
  const state = {servers: structuredClone(servers)};
  const rows = targets ?? [{id: 'local-process', available: true, reason: 'Java 21 found'}, {id: 'local-container', available: false, reason: 'The Docker daemon is not reachable.'}, {id: 'ssh-process', available: true, reason: 'ssh found'}, {id: 'ssh-container', available: true, reason: 'ssh found'}];
  const view = (overrides = {}) => ({serverId: ID, name: 'Paper 1.21.4', target: 'local-process', flavor: 'paper', version: '1.21.4', build: '11', state: 'prepared', licenseAccepted: false, port: 25565, memoryMb: 2048, containerMode: null, error: null, createdAt: 'x', distribution: {artifact: 'server-jar', integrity: 'verified-sha256', hashAlgorithm: 'sha256', hashSource: 'api', sha256: 'a'.repeat(64)}, ssh: null, extensions: [], ...overrides });
  const request = async (action, payload = {}) => {
    calls.push({action, payload: structuredClone(payload)});
    if (action === 'targets') return {targets: rows, flavors: [], servers: state.servers};
    if (action === 'servers') return {servers: state.servers};
    if (action === 'flavorVersions') return {flavor: payload.flavor, total: 2, versions: [{id: '1.21.4', channel: 'release'}, {id: '25w01a', channel: 'snapshot'}]};
    if (action === 'createServer') { state.servers = [view({serverId: ID, state: 'preparing', ...(payload.ssh ? {ssh: {host: payload.ssh.host, port: payload.ssh.port ?? 22, user: payload.ssh.user, keyConfigured: !!payload.ssh.keyId}} : {})})]; return state.servers[0]; }
    if (action === 'chooseSshKey') return {chosen: true, keyId: 'key-0d3f5b2a-1111-4222-8333-444455556666', label: 'id_ed25519'};
    if (action === 'acceptServerLicense') { state.servers = [view({licenseAccepted: true})]; return {accepted: true}; }
    if (action === 'startServer') { state.servers = [view({licenseAccepted: true, state: 'running'})]; return state.servers[0]; }
    if (action === 'stopServer') { state.servers = [view({licenseAccepted: true, state: 'stopped'})]; return state.servers[0]; }
    if (action === 'serverLogs') return {lines: ['[Server] Done', 'second line']};
    if (action === 'serverSettings') return {descriptors: [{key: 'motd', type: 'string', max: 59}, {key: 'max-players', type: 'integer', min: 1, max: 1000}, {key: 'pvp', type: 'boolean'}, {key: 'difficulty', type: 'enum', choices: ['peaceful', 'easy', 'normal', 'hard']}], values: {motd: 'Old', 'max-players': '20', pvp: 'true', difficulty: 'easy'}, restartRequired: false};
    if (action === 'changeServerSetting') return {key: payload.key, applied: 'next-start'};
    if (action === 'searchExtensions') return {results: [{project: 'worldedit', title: 'WorldEdit', summary: 'Edit', downloads: 1}]};
    if (action === 'installExtension') { state.servers = [view({licenseAccepted: true, state: payload.serverId ? 'stopped' : 'stopped', extensions: [{fileName: 'worldedit.jar', directory: 'plugins', source: 'modrinth', upstreamVerified: true, sha256: 'b'.repeat(64)}]})]; return {installed: true}; }
    if (action === 'restartServer') return state.servers[0];
    if (action === 'serverStatus') return state.servers[0];
    throw Error('Unexpected action ' + action);
  };
  return {calls, request, state, view};
}
function scene(options, services = {}) {
  const doc = createAccessDocument(), host = doc.createElement('div');
  doc.body.append(host);
  const fake = backend(options);
  const module = mountServerTargets(host, {request: fake.request, getLanguage: () => 'en', ...services});
  return {doc, host, fake, module, ...tools(host)};
}
const nativeTags = host => host.querySelectorAll('*').filter(node => ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(node.tagName)).map(node => node.tagName);

test('the target picker shows the real availability of all four targets and uses Material controls only', async () => {
  const s = scene();
  await flush();
  assert.deepEqual(nativeTags(s.host), [], 'no native control replaces a Material control');
  assert.deepEqual(['local-process', 'local-container', 'ssh-process', 'ssh-container'].map(id => [id, s.chip(id).dataset.available]), [['local-process', 'true'], ['local-container', 'false'], ['ssh-process', 'true'], ['ssh-container', 'true']]);
  assert.match(s.chip('local-container').title, /Docker daemon is not reachable/);
  assert.equal(s.chip('local-process').selected, true);
  assert.equal(s.chip('local-process').getAttribute('aria-label'), 'Local process: Available');
  assert.match(s.host.textContent, /Create a server/);
  assert.equal(s.button('Create server').disabled, true, 'creating is disabled until a version is loaded');
  assert.ok(!s.fake.calls.some(call => call.action === 'flavorVersions'), 'no official source is contacted until the person asks');
});

test('a local process server is created from a loaded version with only fixed identifiers and numbers', async () => {
  const s = scene();
  await flush();
  s.button('Load versions').click(); await flush();
  assert.deepEqual(s.fake.calls.find(call => call.action === 'flavorVersions').payload, {flavor: 'paper'});
  assert.equal(s.button('Create server').disabled, false);
  await type(s.field('Server name'), 'My Paper');
  await type(s.field('Port'), '25570');
  await choose(s.select('Memory'), '4096');
  s.button('Create server').click(); await flush();
  const create = s.fake.calls.find(call => call.action === 'createServer');
  assert.deepEqual(create.payload, {target: 'local-process', flavor: 'paper', version: '1.21.4', port: 25570, memoryMb: 4096, name: 'My Paper'});
  assert.match(s.host.textContent, /Server created\. Preparation is running\./);
  assert.match(s.host.textContent, /Paper 1\.21\.4/);
  assert.ok(s.host.querySelectorAll('md-linear-progress').length >= 1, 'a preparing server shows progress');
});

test('an invalid port is refused in the panel and nothing is requested', async () => {
  const s = scene();
  await flush();
  s.button('Load versions').click(); await flush();
  await type(s.field('Port'), '80');
  s.button('Create server').click(); await flush();
  assert.match(s.host.textContent, /valid port between 1024 and 65535/);
  assert.ok(!s.fake.calls.some(call => call.action === 'createServer'));
});

test('SSH targets collect host, user, port and a native key choice, and offer no password field or path', async () => {
  const s = scene();
  await flush();
  s.chip('ssh-process').click(); await flush();
  assert.equal(s.host.querySelectorAll('md-outlined-text-field').some(node => /password|passphrase|path/i.test(node.getAttribute('aria-label') ?? '') || node.type === 'password'), false, 'there is no field that could carry a password or a key path');
  assert.match(s.host.textContent, /Passwords are never used/);
  assert.match(s.host.textContent, /No key chosen\. The ssh-agent will be used\./);
  s.button('Load versions').click(); await flush();
  assert.equal(s.button('Create server').disabled, true, 'a host and user are required');
  await type(s.field('SSH host'), 'play.example.org'); await type(s.field('SSH user'), 'mc'); await type(s.field('SSH port'), '2222');
  s.button('Choose SSH key file').click(); await flush();
  assert.deepEqual(s.fake.calls.find(call => call.action === 'chooseSshKey').payload, {});
  assert.match(s.host.textContent, /Key file chosen: id_ed25519/);
  await type(s.field('SSH host'), 'play.example.org'); await type(s.field('SSH user'), 'mc');
  s.button('Create server').click(); await flush();
  const create = s.fake.calls.find(call => call.action === 'createServer').payload;
  assert.deepEqual(create.ssh, {host: 'play.example.org', user: 'mc', port: 2222, keyId: 'key-0d3f5b2a-1111-4222-8333-444455556666'});
  assert.ok(!/\\|\/home|BEGIN/.test(JSON.stringify(create)), 'only an opaque key id is sent');
});

test('container targets add the container mode, and Forge stays on the official image', async () => {
  const s = scene({targets: [{id: 'local-process', available: true, reason: 'ok'}, {id: 'local-container', available: true, reason: 'Docker answered'}, {id: 'ssh-process', available: false, reason: 'x'}, {id: 'ssh-container', available: false, reason: 'x'}]});
  await flush();
  s.chip('local-container').click(); await flush();
  const mode = s.select('Container mode');
  assert.ok(mode && mode.disabled === false);
  await choose(s.select('Flavor'), 'forge'); await flush();
  assert.equal(s.select('Container mode').disabled, true, 'installer flavors cannot use the mounted jar mode');
  s.button('Load versions').click(); await flush();
  s.button('Create server').click(); await flush();
  assert.equal(s.fake.calls.find(call => call.action === 'createServer').payload.containerMode, 'itzg');
});

test('server cards show live state chips and gate Start on the license accepted in the desktop', async () => {
  const s = scene();
  s.fake.state.servers = [s.fake.view()];
  s.module.setLanguage();
  await flush();
  s.module.refresh(); await flush();
  const card = s.host.querySelectorAll('article')[0];
  assert.equal(card.dataset.state, 'prepared');
  assert.ok(card.querySelectorAll('span').some(node => node.dataset.state === 'prepared'));
  assert.ok(card.querySelectorAll('span').some(node => node.dataset.state === 'pending' && node.textContent === 'License not accepted'));
  assert.equal(s.button('Start').disabled, true);
  s.button('Accept server license').click(); await flush();
  assert.deepEqual(s.fake.calls.find(call => call.action === 'acceptServerLicense').payload, {serverId: ID});
  assert.equal(s.button('Start').disabled, false);
  assert.equal(s.buttons('Accept server license').length, 0);
  s.button('Start').click(); await flush();
  assert.ok(s.host.querySelectorAll('span').some(node => node.dataset.state === 'running' && node.textContent === 'running'));
  assert.equal(s.button('Stop').disabled, false);
  assert.equal(s.button('Restart').disabled, false);
  s.button('Stop').click(); await flush();
  assert.ok(s.host.querySelectorAll('span').some(node => node.dataset.state === 'stopped'));
  s.module.destroy();
});

test('logs, typed settings and plugin installation drive the matching actions', async () => {
  const s = scene();
  s.fake.state.servers = [s.fake.view({licenseAccepted: true, state: 'stopped'})];
  await flush(); s.module.refresh(); await flush();
  s.tab('Logs').click(); await flush();
  assert.match(s.host.textContent, /\[Server\] Done\nsecond line/);
  assert.deepEqual(s.fake.calls.find(call => call.action === 'serverLogs').payload, {serverId: ID, lines: 100});
  s.tab('Settings').click(); await flush();
  assert.ok(s.host.querySelectorAll('md-switch').length === 1 && s.host.querySelectorAll('md-outlined-select').some(node => node.getAttribute('aria-label') === 'difficulty'));
  await type(s.field('max-players'), '40');
  s.buttons('Apply')[1].click(); await flush();
  assert.deepEqual(s.fake.calls.filter(call => call.action === 'changeServerSetting').at(-1).payload, {serverId: ID, key: 'max-players', value: 40});
  const toggle = s.host.querySelectorAll('md-switch')[0]; toggle.selected = false; await toggle.dispatchEvent({type: 'change'});
  s.buttons('Apply')[2].click(); await flush();
  assert.deepEqual(s.fake.calls.filter(call => call.action === 'changeServerSetting').at(-1).payload, {serverId: ID, key: 'pvp', value: false});
  assert.match(s.host.textContent, /Applies on the next start\./);
  s.tab('Plugins and mods').click(); await flush();
  await type(s.field('Search Modrinth'), 'worldedit');
  s.button('Search').click(); await flush();
  assert.deepEqual(s.fake.calls.find(call => call.action === 'searchExtensions').payload, {serverId: ID, query: 'worldedit'});
  s.button('Install').click(); await flush();
  assert.deepEqual(s.fake.calls.find(call => call.action === 'installExtension').payload, {serverId: ID, source: 'modrinth', project: 'worldedit'});
  assert.match(s.host.textContent, /plugins\/worldedit\.jar · Verified against the publisher SHA-512/);
  s.button('Install from a file').click(); await flush();
  assert.deepEqual(s.fake.calls.filter(call => call.action === 'installExtension').at(-1).payload, {serverId: ID, source: 'file'}, 'the renderer never supplies a path; the main process opens the file chooser');
  assert.deepEqual(nativeTags(s.host), []);
});

test('plugins are disabled while the server is live and absent for vanilla', async () => {
  const s = scene();
  s.fake.state.servers = [s.fake.view({licenseAccepted: true, state: 'running'})];
  await flush(); s.module.refresh(); await flush();
  s.tab('Plugins and mods').click(); await flush();
  assert.match(s.host.textContent, /Stop the server before installing\./);
  assert.equal(s.button('Install from a file').disabled, true);
  s.fake.state.servers = [s.fake.view({flavor: 'vanilla', licenseAccepted: true, state: 'stopped'})];
  s.module.refresh(); await flush();
  assert.match(s.host.textContent, /This flavor has no plugins or mods\./);
});

test('English, Cantonese and bilingual modes relabel the live panel, and an unreachable manager is reported calmly', async () => {
  let language = 'en';
  const s = scene({}, {getLanguage: () => language});
  await flush();
  assert.match(s.host.textContent, /Servers on every target/);
  language = 'yue'; s.module.setLanguage();
  assert.match(s.host.textContent, /各種目標上嘅伺服器/);
  assert.ok(!/Servers on every target/.test(s.host.textContent));
  language = 'bilingual'; s.module.setLanguage();
  assert.match(s.host.textContent, /Servers on every target \/ 各種目標上嘅伺服器/);
  const down = createAccessDocument(), host = down.createElement('div'); down.body.append(host);
  const module = mountServerTargets(host, {request: async () => { throw Error('offline'); }});
  await flush();
  assert.match(host.textContent, /The server manager could not be reached\./);
  module.destroy(); assert.equal(host.children.length, 0);
});

test('every translated source string has real Cantonese and the translator falls back to English', () => {
  const t = targetsTranslator(() => 'yue');
  assert.equal(t('Start'), '啟動');
  assert.equal(t('An unlisted sentence'), 'An unlisted sentence');
  for (const [en, yue] of Object.entries(TARGETS_COPY)) assert.ok(/[一-鿿]/.test(yue) && yue !== en, en);
  assert.equal(targetsTranslator(() => 'bilingual')('Stop'), 'Stop / 停止');
});

test('the stylesheet uses shared motion tokens and has a reduced-motion fallback', () => {
  const css = fs.readFileSync(new URL('../src/renderer/features/server-manager/server-manager.css', import.meta.url), 'utf8');
  assert.match(css, /\.server-card\{[^}]*transition:[^}]*var\(--md-sys-motion-duration-short4/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.server-card,\.server-state-chip\{transition:none;animation:none\}\}/);
});
