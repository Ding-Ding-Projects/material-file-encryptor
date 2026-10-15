// Servers section. The extension is a client of the desktop server manager: it never runs a server, and it never holds a
// target credential. Every request names a fixed target id, a server id and bounded values; the desktop owns the rest.
// background.js and src/main/browser-server-mediation.js carry the same reviewed lists, and a test compares them.
export const SERVER_TARGETS = Object.freeze(['local-process', 'local-container', 'ssh-process', 'ssh-container']);
export const SERVER_ACTIONS = Object.freeze(['create', 'start', 'stop', 'restart', 'change-setting', 'install-plugin']);
export const SERVER_STATES = Object.freeze(['preparing', 'prepared', 'starting', 'running', 'stopping', 'stopped', 'failed', 'unavailable']);
export const SERVER_RESULTS = Object.freeze(['changed', 'unchanged', 'rejected', 'busy', 'unavailable']);
export const SERVER_CHANNELS = Object.freeze(['release', 'snapshot', 'old_beta', 'old_alpha']);
// State groups drive the filter chips; every state belongs to exactly one group.
export const STATE_GROUPS = Object.freeze({running: ['running'], idle: ['prepared', 'stopped'], working: ['preparing', 'starting', 'stopping'], attention: ['failed', 'unavailable']});

const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, list) => plain(value) && Reflect.ownKeys(value).length === list.length && list.every(key => Object.hasOwn(value, key));
const control = /[\u0000-\u001f\u007f-\u009f]/;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !control.test(value);
export const serverId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export const flavorId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,23}$/.test(value);
export const versionId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/.test(value);
export const settingKey = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
const cursorValid = value => value === null || typeof value === 'string' && /^\d{1,5}$/.test(value);
const settingValue = value => typeof value === 'boolean' || Number.isSafeInteger(value) || typeof value === 'string' && value.length <= 256 && !control.test(value);

export const stateGroup = state => Object.keys(STATE_GROUPS).find(group => STATE_GROUPS[group].includes(state)) ?? 'attention';

/** Parses the text of a setting value: true/false and whole numbers become typed values, anything else stays text. */
export function parseSettingValue(raw) {
  if (typeof raw !== 'string' || raw.length > 256 || control.test(raw)) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d{1,15}$/.test(raw)) return Number(raw);
  return raw;
}

/** The exact message the page sends to the background for a server action, or null when it is not well formed. Nothing here can
 * express a path, URL, address, key or password. */
export function buildManageMessage(action, server, options) {
  const message = {type: 'server-manage', action, server: server ?? null, options: options ?? null};
  if (!SERVER_ACTIONS.includes(action)) return null;
  if (action === 'create') return message.server === null && keys(options, ['target', 'flavor', 'version']) && SERVER_TARGETS.includes(options.target) && flavorId(options.flavor) && versionId(options.version) ? message : null;
  if (!serverId(server)) return null;
  if (action === 'change-setting') return keys(options, ['key', 'value']) && settingKey(options.key) && settingValue(options.value) ? message : null;
  if (action === 'install-plugin') return keys(options, ['plugin']) && settingKey(options.plugin) ? message : null;
  return options === null || options === undefined ? {...message, options: null} : null;
}

export function validateServersResponse(value) {
  return keys(value, ['schemaVersion', 'manager', 'targets', 'servers']) && value.schemaVersion === 1 && ['available', 'unavailable'].includes(value.manager)
    && Array.isArray(value.targets) && value.targets.length === SERVER_TARGETS.length && SERVER_TARGETS.every((id, index) => keys(value.targets[index], ['id', 'available']) && value.targets[index].id === id && typeof value.targets[index].available === 'boolean')
    && Array.isArray(value.servers) && value.servers.length <= 100
    && value.servers.every(row => keys(row, ['id', 'name', 'target', 'flavor', 'version', 'state']) && serverId(row.id) && text(row.name, 80) && SERVER_TARGETS.includes(row.target) && flavorId(row.flavor) && versionId(row.version) && SERVER_STATES.includes(row.state))
    && new Set(value.servers.map(row => row.id)).size === value.servers.length;
}

export function validateCatalogResponse(value) {
  return keys(value, ['schemaVersion', 'catalogue', 'flavors', 'versions', 'total', 'next']) && value.schemaVersion === 1 && ['ready', 'not-loaded', 'unavailable'].includes(value.catalogue)
    && Array.isArray(value.flavors) && value.flavors.length <= 32 && value.flavors.every(row => keys(row, ['id', 'name', 'targets']) && flavorId(row.id) && text(row.name, 40) && Array.isArray(row.targets) && row.targets.every(id => SERVER_TARGETS.includes(id)) && new Set(row.targets).size === row.targets.length)
    && new Set(value.flavors.map(row => row.id)).size === value.flavors.length
    && Array.isArray(value.versions) && value.versions.length <= 100 && value.versions.every(row => keys(row, ['id', 'channel']) && versionId(row.id) && SERVER_CHANNELS.includes(row.channel))
    && Number.isSafeInteger(value.total) && value.total >= 0 && cursorValid(value.next);
}

export function validateManageResponse(value, action, server) {
  return keys(value, ['schemaVersion', 'state', 'action', 'server']) && value.schemaVersion === 1 && SERVER_RESULTS.includes(value.state) && value.action === action
    && (value.server === null || serverId(value.server) && (action === 'create' || value.server === server));
}

/** Filters a server list. Empty filter sets mean "show all". */
export function filterServers(servers, {targets = new Set(), groups = new Set()} = {}) {
  return servers.filter(row => (!targets.size || targets.has(row.target)) && (!groups.size || groups.has(stateGroup(row.state))));
}

const TARGET_NAMES = {'local-process': ['Local process', '本機程序'], 'local-container': ['Local container', '本機容器'], 'ssh-process': ['SSH process', 'SSH 程序'], 'ssh-container': ['SSH container', 'SSH 容器']};
const STATE_NAMES = {preparing: ['Preparing', '準備緊'], prepared: ['Ready to start', '準備好可以啟動'], starting: ['Starting', '啟動緊'], running: ['Running', '運行中'], stopping: ['Stopping', '停止緊'], stopped: ['Stopped', '已停止'], failed: ['Failed', '失敗'], unavailable: ['Unavailable', '未可用']};
const GROUP_NAMES = {running: ['Running', '運行中'], idle: ['Idle', '閒置'], working: ['Working', '處理中'], attention: ['Needs attention', '需要留意']};
const CHANNEL_NAMES = {release: ['Release', '正式版'], snapshot: ['Snapshot', '快照版'], old_beta: ['Old beta', '舊測試版'], old_alpha: ['Old alpha', '舊 alpha 版']};
const ACTION_NAMES = {create: ['Create server', '建立伺服器'], start: ['Start', '啟動'], stop: ['Stop', '停止'], restart: ['Restart', '重新啟動'], 'change-setting': ['Change setting', '更改設定'], 'install-plugin': ['Install plugin', '安裝外掛']};
const RESULT_TEXT = {
  changed: ['The desktop accepted the request. Read the servers again to see the real state.', '桌面已接受要求。請重新讀取伺服器睇實際狀態。'],
  unchanged: ['The desktop reports nothing needed to change.', '桌面表示毋須更改。'],
  rejected: ['The request was rejected on the desktop. Nothing changed.', '桌面已拒絕要求，冇任何更改。'],
  busy: ['The desktop is already asking a question. Answer it, then try again.', '桌面已經喺度問緊另一條問題。請先回答，再試一次。'],
  unavailable: ['The desktop server manager cannot do this yet, or the desktop is locked. Nothing changed.', '桌面伺服器管理器暫時做唔到，或者桌面已鎖定。冇任何更改。'],
};
const MESSAGES = {
  pair: ['Pair the browser again, then retry.', '請重新配對瀏覽器，再試一次。'],
  failed: ['The request did not complete. Open and unlock the desktop, pair again and retry.', '要求未完成。請開啟並解鎖桌面，重新配對再試。'],
  waiting: ['Waiting for the desktop. Approve the request there; Reject is the default and the prompt is withdrawn after 30 seconds.', '等待桌面。請喺桌面批准要求；預設係拒絕，30 秒後提示會撤回。'],
  notRead: ['Servers have not been read in this session.', '今次連線未讀取伺服器。'],
  noServers: ['The desktop reports no servers.', '桌面冇報告任何伺服器。'],
  noMatch: ['No server matches these filters.', '冇伺服器符合呢啲篩選。'],
  unreachable: ['The desktop has no server manager available. Nothing is listed and nothing can be changed.', '桌面冇可用嘅伺服器管理器，所以冇列出任何嘢，亦唔可以更改。'],
  catalogueNone: ['The desktop has not loaded its version catalogue yet. Load it on the desktop, then read versions again.', '桌面未載入版本目錄。請喺桌面載入，再讀取版本。'],
  catalogueGone: ['The version catalogue is unavailable.', '版本目錄未可用。'],
  connect: ['Pair the browser to begin.', '配對瀏覽器先可以開始。'],
};

export function mountBrowserServers(root, {send, getLanguage = () => 'en', acquire = () => true, release = () => {}, isExternallyBusy = () => false} = {}) {
  const doc = root.ownerDocument;
  let connected = false, busy = false, generation = 0, read = false, manager = 'unknown', targets = [], servers = [], flavors = [], versions = [], catalogue = 'unknown', total = 0, next = null;
  let message = null, outcome = null;
  const targetFilter = new Set(), groupFilter = new Set(), channelFilter = new Set(['release']);
  let dialogMode = null, dialogServer = null, form = {target: 'local-process', flavor: '', version: '', key: '', value: '', plugin: ''};
  const t = pair => getLanguage() === 'yue' ? pair[1] : getLanguage() === 'bilingual' ? pair.join(' · ') : pair[0];
  const node = (tag, pair) => { const n = doc.createElement(tag); if (pair) n.textContent = t(pair); return n; };
  const copy = (element, pair) => { element.textContent = t(pair); };
  const heading = node('h3'), help = node('p'), status = node('p'), outcomeLine = node('p');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); outcomeLine.setAttribute('role', 'status'); outcomeLine.setAttribute('aria-live', 'polite');
  const actions = node('div'), readButton = node('md-outlined-button'), versionsButton = node('md-outlined-button'), moreButton = node('md-text-button'), createButton = node('md-filled-button');
  actions.className = 'actions'; actions.append(readButton, versionsButton, moreButton, createButton);
  const targetChips = node('md-chip-set'), groupChips = node('md-chip-set'), list = node('div'), versionLine = node('p'), cancel = node('md-text-button');
  list.className = 'server-list'; targetChips.setAttribute('role', 'group'); groupChips.setAttribute('role', 'group');
  // Create / setting / plugin dialog. Only fixed ids and bounded values are collected here.
  const dialog = node('md-dialog'), dialogTitle = node('div'), dialogBody = node('div'), dialogActions = node('div'), dialogCancel = node('md-text-button'), dialogConfirm = node('md-filled-button'), dialogError = node('p');
  dialogTitle.setAttribute('slot', 'headline'); dialogBody.setAttribute('slot', 'content'); dialogActions.setAttribute('slot', 'actions'); dialogActions.className = 'dialog-actions'; dialogError.setAttribute('role', 'alert');
  const flavorSelect = node('md-outlined-select'), targetSelect = node('md-outlined-select'), versionSelect = node('md-outlined-select'), channelChips = node('md-chip-set');
  const keyField = node('md-outlined-text-field'), valueField = node('md-outlined-text-field'), pluginField = node('md-outlined-text-field');
  keyField.setAttribute('maxlength', '64'); valueField.setAttribute('maxlength', '256'); pluginField.setAttribute('maxlength', '64');
  dialogActions.append(dialogCancel, dialogConfirm); dialog.append(dialogTitle, dialogBody, dialogActions);
  root.replaceChildren(heading, help, actions, status, outcomeLine, targetChips, groupChips, versionLine, list, cancel, dialog);

  const ready = () => connected && !busy && !isExternallyBusy();
  const targetAvailable = id => targets.find(row => row.id === id)?.available === true;
  const flavorTargets = id => flavors.find(row => row.id === id)?.targets ?? [];
  const visibleVersions = () => versions.filter(row => channelFilter.has(row.channel === 'old_beta' || row.channel === 'old_alpha' ? 'old' : row.channel));

  async function request(message2, validate) {
    if (!connected || busy || isExternallyBusy() || !acquire()) return null;
    const own = ++generation; busy = true; outcome = null; render();
    try {
      const result = await send(message2);
      if (own !== generation) return null;
      if (result?.paired === false && Object.keys(result).length === 1) { message = MESSAGES.pair; return null; }
      if (result?.error || !validate(result)) { message = MESSAGES.failed; return null; }
      message = null;
      return result;
    } catch { if (own === generation) message = MESSAGES.failed; return null; }
    finally { if (own === generation) { busy = false; release(); render(); } }
  }
  async function readServers() {
    const result = await request({type: 'servers-read'}, validateServersResponse);
    if (result) { read = true; manager = result.manager; targets = result.targets; servers = result.servers; render(); }
  }
  async function readVersions(cursor) {
    const result = await request({type: 'server-catalog-read', cursor}, validateCatalogResponse);
    if (!result) return;
    catalogue = result.catalogue; flavors = result.flavors; total = result.total; next = result.next;
    versions = cursor === null ? result.versions : [...versions, ...result.versions].slice(0, 2000);
    if (!form.flavor && flavors.length) form.flavor = flavors[0].id;
    render();
  }
  async function manage(action, server, options) {
    if (!ready()) return;
    const built = buildManageMessage(action, server, options);
    if (!built) { message = MESSAGES.failed; render(); return; }
    message = MESSAGES.waiting; outcome = null; render();
    const result = await request(built, value => validateManageResponse(value, action, server ?? null));
    if (result) { outcome = [ACTION_NAMES[action], RESULT_TEXT[result.state]]; message = null; }
    render();
  }

  function chips(host, entries, selected, toggle, labelOf) {
    host.replaceChildren();
    for (const entry of entries) {
      const chip = node('md-filter-chip'); chip.setAttribute('label', t(labelOf(entry))); chip.label = t(labelOf(entry)); chip.selected = selected.has(entry);
      chip.addEventListener('click', () => { if (selected.has(entry)) selected.delete(entry); else selected.add(entry); toggle(); });
      host.append(chip);
    }
  }
  function row(server) {
    const item = node('article'); item.className = 'server-row'; item.setAttribute('data-state', server.state);
    const title = node('h4'); title.textContent = server.name;
    const meta = node('p'); meta.textContent = t(TARGET_NAMES[server.target]) + ' · ' + server.flavor + ' · ' + server.version;
    const chip = node('span', STATE_NAMES[server.state]); chip.className = 'server-state'; chip.setAttribute('data-state', server.state);
    item.append(title, meta, chip);
    for (const action of ['start', 'stop', 'restart', 'change-setting', 'install-plugin']) {
      const button = node('md-text-button', ACTION_NAMES[action]);
      const running = server.state === 'running' || server.state === 'starting';
      button.disabled = !ready() || server.state === 'preparing' || action === 'start' && running || action === 'stop' && !running && server.state !== 'stopping';
      button.setAttribute('aria-label', t(ACTION_NAMES[action]) + ': ' + server.name);
      button.addEventListener('click', () => {
        if (action === 'start' || action === 'stop' || action === 'restart') void manage(action, server.id, null);
        else openDialog(action === 'change-setting' ? 'setting' : 'plugin', server.id);
      });
      item.append(button);
    }
    return item;
  }

  function openDialog(mode, server) {
    dialogMode = mode; dialogServer = server ?? null; dialogError.textContent = '';
    if (mode === 'create') { form.target = SERVER_TARGETS.find(id => targetAvailable(id) && flavorTargets(form.flavor).includes(id)) ?? 'local-process'; form.version = visibleVersions()[0]?.id ?? ''; }
    renderDialog(); void dialog.show?.();
  }
  function closeDialog() { dialogMode = null; dialogServer = null; dialog.close?.(); }
  function selectOptions(select, entries, current) {
    select.replaceChildren();
    for (const entry of entries) { const option = node('md-select-option'); option.value = entry.value; option.textContent = entry.text; option.disabled = entry.disabled === true; if (entry.value === current) option.selected = true; select.append(option); }
    select.value = current;
  }
  function renderDialog() {
    const mode = dialogMode ?? 'create';
    copy(dialogTitle, mode === 'create' ? ACTION_NAMES.create : mode === 'setting' ? ACTION_NAMES['change-setting'] : ACTION_NAMES['install-plugin']);
    copy(dialogCancel, ['Cancel', '取消']); copy(dialogConfirm, mode === 'create' ? ['Create on the desktop', '喺桌面建立'] : ['Send to the desktop', '傳送到桌面']);
    dialogBody.replaceChildren();
    const note = node('p', ['No password, key or address is entered here. The desktop asks you to confirm, and target credentials stay in the desktop.', '呢度唔會輸入密碼、金鑰或地址。桌面會請你確認，目標憑證只留喺桌面。']);
    dialogBody.append(note);
    if (mode === 'create') {
      flavorSelect.setAttribute('label', t(['Server type', '伺服器類型'])); targetSelect.setAttribute('label', t(['Target', '目標'])); versionSelect.setAttribute('label', t(['Version', '版本']));
      selectOptions(flavorSelect, flavors.map(row => ({value: row.id, text: row.name})), form.flavor);
      selectOptions(targetSelect, SERVER_TARGETS.map(id => ({value: id, text: t(TARGET_NAMES[id]) + (targetAvailable(id) && flavorTargets(form.flavor).includes(id) ? '' : ' · ' + t(['unavailable', '未可用'])), disabled: !(targetAvailable(id) && flavorTargets(form.flavor).includes(id))})), form.target);
      chips(channelChips, ['release', 'snapshot', 'old'], channelFilter, () => renderDialog(), entry => entry === 'old' ? ['Old', '舊版'] : CHANNEL_NAMES[entry]);
      const shown = visibleVersions();
      selectOptions(versionSelect, shown.map(row => ({value: row.id, text: row.id + ' · ' + t(CHANNEL_NAMES[row.channel])})), shown.some(row => row.id === form.version) ? form.version : shown[0]?.id ?? '');
      dialogBody.append(flavorSelect, targetSelect, channelChips, versionSelect);
    } else if (mode === 'setting') {
      keyField.setAttribute('label', t(['Setting name', '設定名稱'])); valueField.setAttribute('label', t(['Value', '值']));
      dialogBody.append(keyField, valueField);
    } else {
      pluginField.setAttribute('label', t(['Plugin identifier', '外掛識別碼']));
      dialogBody.append(pluginField);
    }
    dialogBody.append(dialogError);
  }

  function render() {
    copy(heading, ['Servers', '伺服器']);
    copy(help, ['A rich client of the desktop server manager. This page never runs a server and never sees a password or key. Reads need only a pairing; changes need your confirmation in the desktop.', '桌面伺服器管理器嘅客戶端。呢頁唔會運行伺服器，亦睇唔到密碼或金鑰。讀取只需要配對；更改要喺桌面確認。']);
    copy(readButton, ['Read servers', '讀取伺服器']); copy(versionsButton, ['Read versions', '讀取版本']); copy(moreButton, ['More versions', '更多版本']); copy(createButton, ['Create server', '建立伺服器']); copy(cancel, ['Stop waiting', '停止等候']);
    readButton.disabled = !ready(); versionsButton.disabled = !ready(); moreButton.disabled = !ready() || next === null; createButton.disabled = !ready() || manager !== 'available' || catalogue !== 'ready' || !flavors.length;
    createButton.setAttribute('aria-label', t(ACTION_NAMES.create)); cancel.hidden = !busy;
    chips(targetChips, SERVER_TARGETS, targetFilter, render, id => [TARGET_NAMES[id][0] + (read && !targetAvailable(id) ? ' (unavailable)' : ''), TARGET_NAMES[id][1] + (read && !targetAvailable(id) ? '（未可用）' : '')]);
    chips(groupChips, Object.keys(STATE_GROUPS), groupFilter, render, id => GROUP_NAMES[id]);
    targetChips.setAttribute('aria-label', t(['Filter by target', '按目標篩選'])); groupChips.setAttribute('aria-label', t(['Filter by state', '按狀態篩選']));
    copy(status, busy ? MESSAGES.waiting : message ?? (!connected ? MESSAGES.connect : !read ? MESSAGES.notRead : manager === 'unavailable' ? MESSAGES.unreachable : servers.length ? [servers.length + ' servers listed.', '已列出 ' + servers.length + ' 個伺服器。'] : MESSAGES.noServers));
    if (outcome) { outcomeLine.textContent = t(outcome[0]) + ': ' + t(outcome[1]); } else outcomeLine.textContent = '';
    copy(versionLine, catalogue === 'unknown' ? ['Versions have not been read.', '未讀取版本。'] : catalogue === 'not-loaded' ? MESSAGES.catalogueNone : catalogue === 'unavailable' ? MESSAGES.catalogueGone : [versions.length + ' of ' + total + ' versions loaded; ' + flavors.length + ' server type(s) offered by the desktop.', '已載入 ' + versions.length + ' / ' + total + ' 個版本；桌面提供 ' + flavors.length + ' 種伺服器類型。']);
    list.replaceChildren();
    const shown = filterServers(servers, {targets: targetFilter, groups: groupFilter});
    if (read && manager === 'available' && servers.length && !shown.length) list.append(node('p', MESSAGES.noMatch));
    for (const server of shown) list.append(row(server));
    if (dialogMode) renderDialog();
  }

  readButton.addEventListener('click', () => void readServers());
  versionsButton.addEventListener('click', () => void readVersions(null));
  moreButton.addEventListener('click', () => { if (next !== null) void readVersions(next); });
  createButton.addEventListener('click', () => openDialog('create', null));
  cancel.addEventListener('click', () => { generation++; busy = false; release(); message = [ 'Stopped waiting. Check the desktop; nothing was cancelled there.', '已停止等候。請喺桌面檢查，呢個動作冇取消桌面嘅任何嘢。']; render(); });
  dialogCancel.addEventListener('click', closeDialog);
  flavorSelect.addEventListener('change', () => { form.flavor = flavorSelect.value; renderDialog(); });
  targetSelect.addEventListener('change', () => { form.target = targetSelect.value; });
  versionSelect.addEventListener('change', () => { form.version = versionSelect.value; });
  keyField.addEventListener('input', () => { form.key = keyField.value ?? ''; }); valueField.addEventListener('input', () => { form.value = valueField.value ?? ''; }); pluginField.addEventListener('input', () => { form.plugin = pluginField.value ?? ''; });
  dialogConfirm.addEventListener('click', () => {
    const mode = dialogMode, server = dialogServer;
    let action, options;
    if (mode === 'create') { action = 'create'; options = {target: targetSelect.value || form.target, flavor: flavorSelect.value || form.flavor, version: versionSelect.value || form.version}; }
    else if (mode === 'setting') { action = 'change-setting'; const value = parseSettingValue(valueField.value ?? form.value); options = {key: keyField.value ?? form.key, value: value === undefined ? '' : value}; }
    else if (mode === 'plugin') { action = 'install-plugin'; options = {plugin: pluginField.value ?? form.plugin}; }
    else return;
    if (!buildManageMessage(action, mode === 'create' ? null : server, options)) { dialogError.textContent = t(['Check the fields: names use lower-case letters, digits, dots, dashes and underscores only.', '請檢查欄位：名稱只可以用小寫字母、數字、點、連字號同底線。']); return; }
    if (mode === 'create' && (!targetAvailable(options.target) || !flavorTargets(options.flavor).includes(options.target))) { dialogError.textContent = t(['That target is unavailable on the desktop.', '桌面暫時冇提供呢個目標。']); return; }
    closeDialog(); void manage(action, mode === 'create' ? null : server, options);
  });
  render();
  return {
    setConnection(value) {
      if (connected === value) return;
      connected = value;
      if (!value) { generation++; busy = false; release(); read = false; manager = 'unknown'; targets = []; servers = []; flavors = []; versions = []; catalogue = 'unknown'; total = 0; next = null; message = null; outcome = null; closeDialog(); }
      render();
    },
    refreshLabels: render,
  };
}
