import {control} from '../../../shared/surface/controls.js';
import {targetsTranslator} from './targets-copy.js';

const TARGETS = ['local-process', 'local-container', 'ssh-process', 'ssh-container'];
const TARGET_LABEL = {'local-process': 'Local process', 'local-container': 'Local container', 'ssh-process': 'SSH process', 'ssh-container': 'SSH container'};
const FLAVORS = [['vanilla', 'Vanilla'], ['paper', 'Paper'], ['purpur', 'Purpur'], ['fabric', 'Fabric'], ['forge', 'Forge'], ['neoforge', 'NeoForge']];
const MEMORY = [1024, 2048, 4096, 8192];
const LIVE = new Set(['starting', 'running', 'stopping']);
const INTEGRITY = {
  'verified-sha256': 'Verified against the published SHA-256', 'verified-sha1': 'Verified against the published SHA-1', 'verified-md5-weak': 'Verified against a published MD5 only (weak)',
  'unverified-upstream': 'The source publishes no digest; the received bytes are pinned by their own SHA-256', 'delegated-to-image': 'The container image downloads the server; the desktop did not verify it',
};
const TABS = [['overview', 'Overview'], ['logs', 'Logs'], ['settings', 'Settings'], ['plugins', 'Plugins and mods']];

/** The multi-target server manager panel: target picker, flavor and version selects, live state chips, logs, a settings form
 * and plugin or mod installation. It only ever sends fixed identifiers and bounded values to the main process. Key files and
 * jar files are chosen by native choosers there; this panel never sees a path, a key or a password, and has no field for one. */
export function mountServerTargets(host, services = {}) {
  const doc = host.ownerDocument, t = targetsTranslator(services.getLanguage);
  const root = doc.createElement('section');
  root.className = 'server-targets';
  host.append(root);
  let alive = true, overview = null, loadingTargets = false, versions = null, versionsFor = '', busy = false, message = '';
  const form = {target: 'local-process', flavor: 'paper', version: '', name: '', port: '25565', memoryMb: '2048', containerMode: 'itzg', host: '', sshPort: '22', user: '', keyId: null, keyLabel: ''};
  const ui = new Map();
  const available = () => alive && host.isConnected !== false;
  const request = (action, payload = {}) => { if (!available() || typeof services.request !== 'function') throw Error('The server manager could not be reached.'); return services.request(action, payload); };
  const el = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined && text !== null && text !== '') node.textContent = text; if (className) node.className = className; return node; };
  const state = id => { if (!ui.has(id)) ui.set(id, {tab: 'overview', logs: null, settings: null, drafts: {}, query: '', results: null}); return ui.get(id); };

  function button(parent, label, onClick, {kind = 'outlined', disabled = false, title = ''} = {}) {
    const node = control('button', {class: kind === 'primary' ? 'primary' : kind === 'text' ? '' : 'outlined', text: t(label)}, [], doc);
    node.type = 'button'; node.disabled = disabled; node.setAttribute('aria-label', t(label)); if (title) node.title = t(title);
    node.addEventListener('click', () => { if (node.disabled || !available()) return; void attempt(onClick); });
    parent.append(node); return node;
  }
  async function attempt(work) {
    if (busy) return;
    busy = true; message = '';
    try { await work(); } catch (error) { if (available()) { message = t('The action was not completed.') + ' ' + String(error?.message ?? '').replace(/[A-Za-z]:\\[^\s]+/g, '').slice(0, 160); } } finally { busy = false; if (available()) render(); }
  }
  function field(parent, label, value, onInput, {type = 'text', maxLength = 80, disabled = false} = {}) {
    const node = control('input', {type: type === 'number' ? 'text' : type, label: t(label)}, [], doc);
    node.value = value; node.disabled = disabled; node.maxLength = maxLength; node.setAttribute('aria-label', t(label));
    if (type === 'number') node.setAttribute('inputmode', 'numeric');
    node.addEventListener('input', () => onInput(String(node.value ?? '')));
    parent.append(node); return node;
  }
  function select(parent, label, choices, value, onChange, {disabled = false} = {}) {
    const node = control('select', {}, [], doc);
    node.label = t(label); node.setAttribute('aria-label', t(label)); node.disabled = disabled;
    for (const [optionValue, optionLabel] of choices) { const option = control('option', {}, [], doc); option.value = optionValue; option.textContent = optionLabel; node.append(option); }
    node.value = value;
    node.addEventListener('change', () => onChange(String(node.value)));
    parent.append(node); return node;
  }
  function chip(label, stateName) { const node = el('span', t(label), 'server-state-chip'); node.dataset.state = stateName; node.setAttribute('role', 'img'); node.setAttribute('aria-label', t(label)); return node; }

  async function refreshTargets() {
    if (loadingTargets) return;
    loadingTargets = true; if (available()) render();
    try { const value = await request('targets'); if (!Array.isArray(value?.targets) || !Array.isArray(value?.servers)) throw Error('Unexpected answer.'); if (available()) overview = value; } catch { if (available()) { overview = null; message = t('The server manager could not be reached.'); } } finally { loadingTargets = false; if (available()) render(); }
  }
  async function refreshServers() {
    if (!overview || !available()) return;
    try { await reloadServers(); if (available()) renderList(); } catch { /* the next explicit refresh reports it */ }
  }
  async function loadVersions() {
    versions = null; versionsFor = form.flavor; render();
    const flavor = form.flavor, result = await request('flavorVersions', {flavor});
    if (!available() || flavor !== form.flavor) return;
    versions = result.versions.slice(0, 500); versionsFor = flavor;
    if (!versions.some(item => item.id === form.version)) form.version = versions.find(item => item.channel === 'release')?.id ?? versions[0]?.id ?? '';
  }
  async function create() {
    const port = Number.parseInt(form.port, 10);
    if (!/^\d{4,5}$/.test(form.port) || !Number.isSafeInteger(port) || port < 1024 || port > 65535) { message = t('Enter a valid port between 1024 and 65535.'); return; }
    if (!form.version || versionsFor !== form.flavor) { message = t('Choose a flavor and load its versions first.'); return; }
    const payload = {target: form.target, flavor: form.flavor, version: form.version, port, memoryMb: Number(form.memoryMb)};
    if (form.name.trim()) payload.name = form.name.trim();
    if (form.target.endsWith('container')) payload.containerMode = form.target === 'local-container' ? form.containerMode : 'itzg';
    if (form.target.startsWith('ssh')) {
      payload.ssh = {host: form.host.trim(), user: form.user.trim()};
      if (/^\d{1,5}$/.test(form.sshPort)) payload.ssh.port = Number(form.sshPort);
      if (form.keyId) payload.ssh.keyId = form.keyId;
    }
    await request('createServer', payload);
    message = t('Server created. Preparation is running.');
    await reloadServers();
  }
  async function reloadServers() { const value = await request('servers'); if (!Array.isArray(value?.servers)) throw Error('Unexpected answer.'); if (available() && overview) overview = {...overview, servers: value.servers}; }

  function renderForm(parent) {
    const section = el('div', '', 'server-targets-form');
    section.append(el('h3', t('Create a server')));
    const picker = doc.createElement('md-chip-set'); picker.setAttribute('aria-label', t('Target')); picker.setAttribute('role', 'radiogroup');
    for (const id of TARGETS) {
      const row = overview?.targets.find(item => item.id === id);
      const node = doc.createElement('md-filter-chip'); node.setAttribute('label', t(TARGET_LABEL[id])); node.setAttribute('role', 'radio'); node.setAttribute('aria-checked', String(form.target === id)); node.setAttribute('aria-label', t(TARGET_LABEL[id]) + ': ' + t(row?.available ? 'Available' : 'Unavailable'));
      node.selected = form.target === id; if (row && row.available === false) node.title = row.reason; node.dataset.target = id; node.dataset.available = String(row?.available === true);
      node.addEventListener('click', () => { form.target = id; render(); });
      picker.append(node);
    }
    section.append(picker);
    const reason = overview?.targets.find(item => item.id === form.target);
    section.append(el('p', reason ? t(reason.available ? 'Available' : 'Unavailable') + ': ' + reason.reason : t('Checking targets'), 'server-target-reason'));
    button(section, 'Refresh targets', () => refreshTargets(), {kind: 'text'});
    const grid = el('div', '', 'server-form-grid');
    select(grid, 'Flavor', FLAVORS, form.flavor, value => { form.flavor = value; form.version = ''; versions = null; versionsFor = ''; render(); });
    if (versions && versionsFor === form.flavor) select(grid, 'Minecraft version', versions.map(item => [item.id, item.id + (item.channel === 'release' ? '' : ' · ' + item.channel)]), form.version, value => { form.version = value; });
    else button(grid, versions === null && versionsFor === form.flavor ? 'Loading versions' : 'Load versions', () => loadVersions(), {disabled: versions === null && versionsFor === form.flavor});
    field(grid, 'Server name', form.name, value => { form.name = value; });
    field(grid, 'Port', form.port, value => { form.port = value; }, {type: 'number', maxLength: 5});
    select(grid, 'Memory', MEMORY.map(mb => [String(mb), mb + ' MB']), form.memoryMb, value => { form.memoryMb = value; });
    if (form.target === 'local-container') select(grid, 'Container mode', [['itzg', t('Official image')], ['jar', t('Mounted verified jar')]], form.containerMode, value => { form.containerMode = value; }, {disabled: ['forge', 'neoforge'].includes(form.flavor)});
    section.append(grid);
    if (form.target.startsWith('ssh')) {
      const ssh = el('div', '', 'server-form-grid');
      field(ssh, 'SSH host', form.host, value => { form.host = value; }, {maxLength: 253});
      field(ssh, 'SSH port', form.sshPort, value => { form.sshPort = value; }, {type: 'number', maxLength: 5});
      field(ssh, 'SSH user', form.user, value => { form.user = value; }, {maxLength: 32});
      button(ssh, 'Choose SSH key file', () => chooseKey(), {});
      section.append(ssh, el('p', form.keyId ? t('Key file chosen') + ': ' + form.keyLabel : t('No key chosen. The ssh-agent will be used.')), el('p', t('Passwords are never used. The host key must already be trusted by ssh.')));
    }
    const ready = !busy && !!form.version && versionsFor === form.flavor && overview?.targets.find(item => item.id === form.target)?.available === true && (!form.target.startsWith('ssh') || !!form.host.trim() && !!form.user.trim());
    button(section, 'Create server', () => create(), {kind: 'primary', disabled: !ready});
    parent.append(section);
  }
  async function chooseKey() { const result = await request('chooseSshKey'); if (result.chosen) { form.keyId = result.keyId; form.keyLabel = result.label; } }

  function renderServer(parent, server) {
    const ctx = state(server.serverId), live = LIVE.has(server.state);
    const card = el('article', '', 'server-card'); card.dataset.state = server.state;
    const head = el('div', '', 'server-card-head');
    head.append(el('h3', server.name), chip(server.state, server.state), chip(server.licenseAccepted ? 'License accepted' : 'License not accepted', server.licenseAccepted ? 'accepted' : 'pending'));
    card.append(head);
    const actions = el('div', '', 'server-card-actions');
    if (server.state === 'preparing') button(actions, 'Cancel', () => request('cancelServer', {serverId: server.serverId}), {kind: 'text'});
    if (!server.licenseAccepted && ['prepared', 'stopped'].includes(server.state)) button(actions, 'Accept server license', async () => { await request('acceptServerLicense', {serverId: server.serverId}); await reloadServers(); });
    button(actions, 'Start', async () => { await request('startServer', {serverId: server.serverId}); await reloadServers(); }, {kind: 'primary', disabled: !server.licenseAccepted || !['prepared', 'stopped', 'failed'].includes(server.state)});
    button(actions, 'Stop', async () => { await request('stopServer', {serverId: server.serverId}); await reloadServers(); }, {disabled: !live && server.state !== 'failed'});
    button(actions, 'Restart', async () => { await request('restartServer', {serverId: server.serverId}); await reloadServers(); }, {disabled: server.state !== 'running'});
    button(actions, 'Refresh state', async () => { await request('serverStatus', {serverId: server.serverId}); await reloadServers(); }, {kind: 'text', disabled: server.state === 'preparing'});
    card.append(actions);
    if (server.state === 'preparing') { const bar = control('progress', {}, [], doc); bar.setAttribute('indeterminate', ''); bar.setAttribute('aria-label', server.name + ' ' + t('preparing')); card.append(bar); }
    const tabs = doc.createElement('md-tabs'); tabs.setAttribute('aria-label', server.name); tabs.setAttribute('role', 'tablist');
    for (const [id, label] of TABS) { const tab = doc.createElement('md-primary-tab'); tab.textContent = t(label); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(ctx.tab === id)); tab.active = ctx.tab === id; tab.addEventListener('click', () => { ctx.tab = id; render(); void loadTab(server, ctx); }); tabs.append(tab); }
    card.append(tabs);
    const panel = el('div', '', 'server-card-panel'); panel.setAttribute('role', 'tabpanel'); card.append(panel);
    if (ctx.tab === 'overview') renderOverview(panel, server);
    if (ctx.tab === 'logs') renderLogs(panel, server, ctx);
    if (ctx.tab === 'settings') renderSettings(panel, server, ctx);
    if (ctx.tab === 'plugins') renderPlugins(panel, server, ctx, live);
    parent.append(card);
  }
  function renderOverview(panel, server) {
    const facts = [['Flavor and version', server.flavor + ' ' + server.version], ['Target', t(TARGET_LABEL[server.target]) + (server.ssh ? ' · ' + server.ssh.user + '@' + server.ssh.host : '')], ['Build', server.build ?? '-'], ['Port', String(server.port)], ['Memory', server.memoryMb + ' MB'], ['Integrity', t(INTEGRITY[server.distribution.integrity] ?? server.distribution.integrity)], ['License', t(server.licenseAccepted ? 'License accepted' : 'License not accepted')]];
    for (const [label, value] of facts) panel.append(el('p', t(label) + ': ' + value));
    if (server.error) { const note = el('p', server.error); note.setAttribute('role', 'alert'); panel.append(note); }
  }
  function renderLogs(panel, server, ctx) {
    button(panel, 'Refresh logs', async () => { ctx.logs = (await request('serverLogs', {serverId: server.serverId, lines: 100})).lines; }, {kind: 'text', disabled: server.state === 'preparing'});
    panel.append(el('p', t('Showing the most recent lines.')));
    const log = el('pre', ctx.logs?.length ? ctx.logs.join('\n') : t('No log lines yet.')); log.setAttribute('tabindex', '0'); log.setAttribute('aria-label', t('Logs')); panel.append(log);
  }
  function renderSettings(panel, server, ctx) {
    if (!ctx.settings) { button(panel, 'Load settings', () => loadTab(server, ctx, true), {kind: 'primary'}); return; }
    if (ctx.settings.restartRequired) panel.append(el('p', t('Restart required')));
    for (const descriptor of ctx.settings.descriptors) {
      const row = el('div', '', 'server-setting-row'); const current = ctx.drafts[descriptor.key] ?? ctx.settings.values[descriptor.key] ?? '';
      const label = t(descriptor.key);
      if (descriptor.type === 'boolean') {
        const toggle = control('md-switch', {}, [], doc); toggle.selected = String(current) === 'true'; toggle.setAttribute('aria-label', label); toggle.addEventListener('change', () => { ctx.drafts[descriptor.key] = toggle.selected ? 'true' : 'false'; }); row.append(el('span', label), toggle);
      } else if (descriptor.type === 'enum') select(row, descriptor.key, descriptor.choices.map(choice => [choice, choice]), String(current) || descriptor.choices[0], value => { ctx.drafts[descriptor.key] = value; });
      else field(row, descriptor.key, String(current), value => { ctx.drafts[descriptor.key] = value; }, {type: descriptor.type === 'integer' ? 'number' : 'text', maxLength: descriptor.max ?? 64});
      button(row, 'Apply', async () => {
        const raw = ctx.drafts[descriptor.key] ?? ctx.settings.values[descriptor.key] ?? '';
        const value = descriptor.type === 'boolean' ? String(raw) === 'true' : descriptor.type === 'integer' ? Number.parseInt(String(raw), 10) : String(raw);
        const result = await request('changeServerSetting', {serverId: server.serverId, key: descriptor.key, value});
        delete ctx.drafts[descriptor.key]; ctx.settings = await request('serverSettings', {serverId: server.serverId});
        message = t(result.applied === 'after-restart' ? 'Applies after a restart.' : 'Applies on the next start.');
      }, {kind: 'text'});
      panel.append(row);
    }
  }
  function renderPlugins(panel, server, ctx, live) {
    if (server.flavor === 'vanilla') { panel.append(el('p', t('This flavor has no plugins or mods.'))); return; }
    if (live) panel.append(el('p', t('Stop the server before installing.')));
    const search = el('div', '', 'server-form-grid');
    field(search, 'Search Modrinth', ctx.query, value => { ctx.query = value; }, {maxLength: 64});
    button(search, 'Search', async () => { ctx.results = (await request('searchExtensions', {serverId: server.serverId, query: ctx.query})).results; }, {});
    button(search, 'Install from a file', async () => { await request('installExtension', {serverId: server.serverId, source: 'file'}); await reloadServers(); message = t('Installed. Start the server to load it.'); }, {disabled: live});
    panel.append(search);
    for (const hit of ctx.results ?? []) {
      const row = el('div', '', 'server-plugin-row'); row.append(el('p', hit.title + ' · ' + hit.summary));
      button(row, 'Install', async () => { await request('installExtension', {serverId: server.serverId, source: 'modrinth', project: hit.project}); await reloadServers(); message = t('Installed. Start the server to load it.'); }, {disabled: live, kind: 'text'});
      panel.append(row);
    }
    panel.append(el('h4', t('Installed')));
    if (!server.extensions.length) panel.append(el('p', t('Nothing installed yet.')));
    for (const item of server.extensions) panel.append(el('p', item.directory + '/' + item.fileName + ' · ' + t(item.upstreamVerified ? 'Verified against the publisher SHA-512' : 'Local file, not verified against a publisher')));
  }
  async function loadTab(server, ctx, force = false) {
    if (ctx.tab === 'settings' && (force || !ctx.settings)) await attempt(async () => { ctx.settings = await request('serverSettings', {serverId: server.serverId}); });
    if (ctx.tab === 'logs' && !ctx.logs && server.state !== 'preparing') await attempt(async () => { ctx.logs = (await request('serverLogs', {serverId: server.serverId, lines: 100})).lines; });
  }

  let listBox = null;
  function renderList() {
    if (!listBox) return;
    listBox.replaceChildren();
    listBox.append(el('h3', t('Servers')));
    if (!overview || !overview.servers.length) { listBox.append(el('p', t('No servers yet.'))); return; }
    for (const server of overview.servers) renderServer(listBox, server);
  }
  function render() {
    if (!available()) return;
    root.setAttribute('aria-label', t('Servers on every target'));
    root.replaceChildren();
    root.append(el('h2', t('Servers on every target')), el('p', t('Create and manage Minecraft servers as a local process, a local container, an SSH process or an SSH container.')));
    const status = el('p', message); status.setAttribute('role', 'status'); root.append(status);
    if (loadingTargets) { const bar = control('progress', {}, [], doc); bar.setAttribute('indeterminate', ''); bar.setAttribute('aria-label', t('Checking targets')); root.append(bar); }
    renderForm(root);
    listBox = el('div', '', 'server-list'); root.append(listBox); renderList();
  }
  render();
  void refreshTargets();
  return {
    refresh: refreshServers,
    setLanguage() { render(); },
    destroy() { if (!alive) return; alive = false; root.remove(); },
  };
}
