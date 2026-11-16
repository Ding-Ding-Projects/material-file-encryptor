import {openContextMenu} from '../../../shared/surface/overlay.js';
import {text} from '../../../shared/surface/registry.js';
import {control} from '../../../shared/surface/controls.js';
import {icon} from '../../icons.js';
import {SHELL_COPY} from './copy.js';
import {buildFolderTree, flattenFolderTree, ancestorFolders, fileInFolder, relativeName, breadcrumbs, sortFiles, SORT_KEYS} from './folder-tree.js';

const PART_CELL_LIMIT = 96;
const VERSION_LIMIT = 5;
const AVAILABILITY_FILTERS = [['all', 'All files'], ['offline', 'Available offline'], ['storage', 'Encrypted storage only']];

/** "M:" for a stored drive letter such as "M:\\" or "M". */
export function driveLetterLabel(value) {
  const letter = String(value ?? '').replace(/[:\\/]+$/, '');
  return /^[A-Za-z]$/.test(letter) ? `${letter.toUpperCase()}:` : '';
}

/** The visual state of a drive tab, from one session summary. */
export function sessionTabState(session) {
  if (session?.recoveryRequired) return 'recovery';
  if (session?.operation) return 'busy';
  if (session?.locked) return 'locked';
  return session?.mounted ? 'mounted' : 'unlocked';
}

/** Builds the part map: one cell per encrypted part, capped so a huge file never floods the pane. */
export function partMapShape(partCount) {
  const count = Number.isFinite(Number(partCount)) ? Math.max(0, Math.floor(Number(partCount))) : 0;
  return {count, shown: Math.min(count, PART_CELL_LIMIT), truncated: count > PART_CELL_LIMIT};
}

/**
 * The workspace chrome: drive tabs in the title bar, the folder tree, breadcrumb and filters, the inspector,
 * the transfers strip and the status bar. It renders from the same state the file table already uses and holds
 * no vault data of its own beyond what is needed to draw the current frame.
 */
export function mountWorkspaceChrome({doc = document, translate, getLanguage, hooks}) {
  const $ = id => doc.getElementById(id);
  const t = (source, values) => translate(source, values ? {values} : undefined);
  const copyFor = source => SHELL_COPY[source] || source;
  const scope = {folder: '', availability: 'all', sort: {key: 'name', direction: 'asc'}};
  const expanded = new Set();
  let snapshot = {state: null, files: [], selected: null, busy: false, hasMore: false};
  let treeSignature = '', versionsToken = 0, backupToken = 0, backupKey = '', backupText = '';
  let treeSection = null, treeHost = null, treeTitle = null;
  const disposers = [];
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };

  const menu = (anchor, event, entries) => openContextMenu({
    anchor, event, target: anchor, language: getLanguage(),
    items: entries.map(entry => ({id: entry.id, label: text(entry.label, copyFor(entry.label)), disabled: entry.disabled, run: entry.run}))
  });
  const scopeChanged = () => { renderBreadcrumb(); renderFilterLabel(); renderSortHeaders(); renderTreeSelection(); hooks.onScopeChange(); };

  /* ---------- drive tabs ---------- */
  const tabsHost = $('drive-tabs');
  function renderTabs() {
    if (!tabsHost) return;
    const {state} = snapshot;
    const sessions = state?.sessions?.length ? state.sessions : state ? [{sessionId: state.sessionId, driveName: state.driveName, driveLetter: state.driveLetter, locked: state.locked, mounted: state.mounted}] : [];
    const signature = JSON.stringify([state?.sessionId, getLanguage(), sessions.map(s => [s.sessionId, s.driveName, s.driveLetter, s.locked, s.mounted, Boolean(s.operation), Boolean(s.recoveryRequired)])]);
    if (tabsHost.dataset.signature !== signature) {
      tabsHost.dataset.signature = signature;
      tabsHost.setAttribute('aria-label', t('Drives'));
      const fragment = doc.createDocumentFragment();
      sessions.forEach((session, index) => {
        const tab = doc.createElement('div');
        const active = session.sessionId === state?.sessionId;
        tab.className = 'drive-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        tab.dataset.sessionId = session.sessionId;
        tab.dataset.state = sessionTabState(session);
        const name = session.driveName || `${t('Vault')} ${index + 1}`;
        const letter = driveLetterLabel(session.driveLetter);
        const status = t(session.recoveryRequired ? 'Recovery required' : session.operation ? 'Working…' : session.locked ? 'Locked' : session.mounted ? 'Mounted' : 'Unlocked · not mounted');
        tab.setAttribute('aria-label', [letter, name, status].filter(Boolean).join(' · '));
        tab.title = tab.getAttribute('aria-label');
        const dot = doc.createElement('span'); dot.className = 'drive-tab-dot'; dot.setAttribute('aria-hidden', 'true');
        const label = doc.createElement('span'); label.className = 'drive-tab-name';
        if (letter) { const strong = doc.createElement('strong'); strong.textContent = letter; label.append(strong, ' '); }
        label.append(name);
        tab.append(dot, label);
        fragment.append(tab);
      });
      tabsHost.replaceChildren(fragment);
    }
    const remove = $('drive-tab-remove');
    const removeSource = $('remove-vault-session');
    if (remove && removeSource) remove.hidden = removeSource.disabled !== false;
  }
  listen(tabsHost, 'click', event => {
    const tab = event.target.closest?.('[role=tab]');
    if (tab && tab.dataset.sessionId !== snapshot.state?.sessionId) hooks.selectSession(tab.dataset.sessionId);
  });
  listen(tabsHost, 'keydown', event => {
    const tab = event.target.closest?.('[role=tab]');
    if (!tab) return;
    const tabs = [...tabsHost.querySelectorAll('[role=tab]')];
    const index = tabs.indexOf(tab);
    const move = {ArrowRight: 1, ArrowLeft: -1}[event.key];
    if (move) { event.preventDefault(); const next = tabs[(index + move + tabs.length) % tabs.length]; next.tabIndex = 0; tab.tabIndex = -1; next.focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); (event.key === 'Home' ? tabs[0] : tabs.at(-1))?.focus(); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tab.click(); }
  });
  const addButton = $('drive-tab-add');
  if (addButton) {
    addButton.setAttribute('title', t('Add a drive'));
    addButton.setAttribute('aria-label', t('Open or create a drive'));
    listen(addButton, 'click', () => hooks.addSession());
    const remove = control('md-icon-button', {id: 'drive-tab-remove', class: 'drive-tab-remove', hidden: true, 'aria-label': t('Remove this locked drive from the list'), title: t('Remove this locked drive from the list'), 'data-icon': 'close'});
    addButton.after(remove);
    listen(remove, 'click', () => hooks.removeSession());
    remove.replaceChildren(icon('close'));
  }

  /* ---------- folder tree ---------- */
  function mountTree() {
    const sidebar = doc.querySelector('.sidebar');
    if (!sidebar || treeSection) return;
    treeSection = doc.createElement('section'); treeSection.className = 'folder-pane'; treeSection.setAttribute('aria-labelledby', 'folder-pane-title');
    treeTitle = doc.createElement('p'); treeTitle.id = 'folder-pane-title'; treeTitle.className = 'pane-label';
    treeHost = doc.createElement('div'); treeHost.id = 'folder-tree'; treeHost.className = 'folder-tree'; treeHost.setAttribute('role', 'tree');
    treeSection.append(treeTitle, treeHost);
    sidebar.prepend(treeSection);
    listen(treeHost, 'click', event => {
      const row = event.target.closest?.('[role=treeitem]');
      if (!row) return;
      const path = row.dataset.path;
      if (event.target.closest('.tree-caret') && row.dataset.hasChildren === 'true') toggleFolder(path);
      else selectFolder(path);
    });
    listen(treeHost, 'keydown', event => {
      const row = event.target.closest?.('[role=treeitem]');
      if (!row) return;
      const rows = [...treeHost.querySelectorAll('[role=treeitem]')];
      const index = rows.indexOf(row);
      const focusRow = target => { if (!target) return; rows.forEach(item => { item.tabIndex = -1; }); target.tabIndex = 0; target.focus(); };
      if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(rows[index + 1]); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(rows[index - 1]); }
      else if (event.key === 'ArrowRight' && row.dataset.hasChildren === 'true' && row.getAttribute('aria-expanded') === 'false') { event.preventDefault(); toggleFolder(row.dataset.path); }
      else if (event.key === 'ArrowLeft' && row.getAttribute('aria-expanded') === 'true') { event.preventDefault(); toggleFolder(row.dataset.path); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFolder(row.dataset.path); }
    });
  }
  function toggleFolder(path) {
    if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
    treeSignature = '';
    renderTree();
    queueMicrotask(() => treeHost?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.focus());
  }
  function selectFolder(path) {
    scope.folder = path;
    for (const ancestor of ancestorFolders(path + '/x')) expanded.add(ancestor);
    treeSignature = '';
    scopeChanged();
    renderTree();
    queueMicrotask(() => treeHost?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.focus());
  }
  function renderTree() {
    if (!treeHost) return;
    const {state, files} = snapshot;
    const unlocked = Boolean(state) && !state.locked;
    const signature = JSON.stringify([unlocked, scope.folder, [...expanded], getLanguage(), files.map(file => file.path)]);
    if (signature === treeSignature) return;
    treeSignature = signature;
    const letter = driveLetterLabel(state?.driveLetter);
    treeTitle.textContent = [letter, state?.driveName].filter(Boolean).join(' ') || t('FOLDERS');
    if (!unlocked) {
      const note = doc.createElement('p'); note.className = 'muted tree-note'; note.textContent = t('Folders appear after unlock. Nothing readable is stored on this PC while locked.');
      treeHost.replaceChildren(note);
      return;
    }
    const tree = buildFolderTree(files);
    const rows = [{path: '', name: t('All files'), depth: 0, count: tree.count, hasChildren: false, expanded: false}, ...flattenFolderTree(tree, expanded)];
    const fragment = doc.createDocumentFragment();
    rows.forEach((row, index) => {
      const item = doc.createElement('div');
      item.className = 'tree-row'; item.setAttribute('role', 'treeitem'); item.dataset.path = row.path; item.dataset.hasChildren = String(row.hasChildren);
      item.setAttribute('aria-level', String(row.depth + 1)); item.setAttribute('aria-selected', String(row.path === scope.folder));
      if (row.hasChildren) item.setAttribute('aria-expanded', String(row.expanded));
      item.tabIndex = row.path === scope.folder || (index === 0 && !scope.folder) ? 0 : -1;
      item.style.setProperty('--tree-depth', String(Math.max(0, row.depth - 1)));
      item.title = row.path || row.name;
      const caret = doc.createElement('span'); caret.className = 'tree-caret'; caret.setAttribute('aria-hidden', 'true'); caret.textContent = row.hasChildren ? (row.expanded ? '▾' : '▸') : '';
      const name = doc.createElement('span'); name.className = 'tree-name'; name.textContent = row.name;
      const count = doc.createElement('span'); count.className = 'tree-count'; count.textContent = String(row.count);
      item.append(caret, name, count);
      fragment.append(item);
    });
    treeHost.replaceChildren(fragment);
  }
  function renderTreeSelection() {
    if (!treeHost) return;
    for (const item of treeHost.querySelectorAll('[role=treeitem]')) item.setAttribute('aria-selected', String(item.dataset.path === scope.folder));
  }

  /* ---------- breadcrumb and filter ---------- */
  function renderBreadcrumb() {
    const host = $('breadcrumb');
    if (!host) return;
    const state = snapshot.state;
    const root = [driveLetterLabel(state?.driveLetter), state?.driveName].filter(Boolean).join(' ') || t('All files');
    const fragment = doc.createDocumentFragment();
    const add = (label, path, current) => {
      if (fragment.childNodes.length) { const sep = doc.createElement('span'); sep.className = 'crumb-sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = '›'; fragment.append(sep); }
      const crumb = doc.createElement(current ? 'strong' : 'a');
      crumb.className = 'crumb'; crumb.textContent = label;
      if (current) crumb.setAttribute('aria-current', 'page');
      else { crumb.href = '#'; crumb.dataset.path = path; crumb.title = t('Navigate to this folder'); }
      fragment.append(crumb);
    };
    const trail = breadcrumbs(scope.folder);
    add(root, '', trail.length === 0);
    trail.forEach((crumb, index) => add(crumb.name, crumb.path, index === trail.length - 1));
    host.replaceChildren(fragment);
  }
  listen($('breadcrumb'), 'click', event => {
    const crumb = event.target.closest?.('a[data-path]');
    if (!crumb) return;
    event.preventDefault();
    selectFolder(crumb.dataset.path);
  });
  function renderFilterLabel() {
    const label = $('filter-label');
    const [, name] = AVAILABILITY_FILTERS.find(([id]) => id === scope.availability) || AVAILABILITY_FILTERS[0];
    if (label) label.textContent = scope.availability === 'all' ? t('Filter') : t('Filter: {name}', {name: t(name)});
    $('filter-button')?.toggleAttribute('data-active', scope.availability !== 'all');
  }
  listen($('filter-button'), 'click', event => menu($('filter-button'), event, AVAILABILITY_FILTERS.map(([id, label]) => ({
    id, label, run: () => { scope.availability = id; scopeChanged(); }
  }))));

  /* ---------- sortable headers ---------- */
  function renderSortHeaders() {
    for (const header of doc.querySelectorAll('#view-drive th[data-sort]')) {
      const key = header.dataset.sort;
      const active = key === scope.sort.key;
      header.setAttribute('aria-sort', active ? (scope.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      header.title = t('Sort by {column}', {column: t(header.dataset.sourceLabel || header.textContent.replace(/[▴▾]/g, '').trim())});
      header.dataset.direction = active ? scope.sort.direction : '';
    }
  }
  function sortBy(key) {
    if (!SORT_KEYS.includes(key)) return;
    scope.sort = scope.sort.key === key ? {key, direction: scope.sort.direction === 'asc' ? 'desc' : 'asc'} : {key, direction: key === 'modified' || key === 'size' ? 'desc' : 'asc'};
    scopeChanged();
  }
  const headerRow = doc.querySelector('#view-drive thead tr');
  listen(headerRow, 'click', event => { const header = event.target.closest?.('th[data-sort]'); if (header) sortBy(header.dataset.sort); });
  listen(headerRow, 'keydown', event => { const header = event.target.closest?.('th[data-sort]'); if (header && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); sortBy(header.dataset.sort); } });

  /* ---------- commands: New, Copy path, More, backup, inspector toggle ---------- */
  listen($('new-button'), 'click', event => menu($('new-button'), event, [
    {id: 'create', label: 'Create a drive', run: () => $('create-button').click()},
    {id: 'unlock', label: 'Unlock existing drive', run: () => $('unlock-button').click()},
    {id: 'import', label: 'Import files', disabled: Boolean($('import-button').disabled), run: () => $('import-button').click()}
  ]));
  listen($('copy-path-button'), 'click', async () => {
    const file = snapshot.selected;
    if (!file) return;
    try { await hooks.copyText(String(file.path)); hooks.toast('Path copied.'); } catch { hooks.toast('Path could not be copied.'); }
  });
  listen($('backup-now-button'), 'click', () => doc.defaultView.dispatchEvent(new CustomEvent('mfe:open-cloud-backup', {detail: {sessionId: snapshot.state?.sessionId ?? null}})));
  listen($('inspector-backup-settings'), 'click', () => hooks.openView('storage'));
  const commandBar = $('command-bar');
  const commandButtons = () => [...doc.querySelectorAll('#command-bar .file-actions > :is(md-text-button,md-outlined-button,md-filled-button)')].filter(button => button.id !== 'more-button');
  const hiddenCommands = () => commandButtons().filter(button => !button.hidden && button.dataset.overflow === 'true');
  // The information icon in front of a command travels with it.
  const guideOf = button => (button.previousElementSibling?.localName === 'mfe-control-guidance' ? button.previousElementSibling : null);
  const setOverflow = (button, value) => { for (const node of [button, guideOf(button)]) { if (!node) continue; if (value) node.dataset.overflow = 'true'; else delete node.dataset.overflow; } };
  /**
   * Fits the commands to the bar: while they do not fit, the least important visible command moves into the More menu.
   * Higher priority numbers leave first; equal priorities leave from the end of the bar.
   */
  function renderOverflow() {
    const more = $('more-button');
    const bar = doc.querySelector('#command-bar .file-actions');
    if (!more || !bar) return;
    const buttons = commandButtons();
    for (const button of buttons) {
      if (button.id === 'force-lock-button') button.dataset.priority = '4';
      if (button.id === 'file-details-button') button.dataset.priority = '3';
      setOverflow(button, false);
    }
    more.setAttribute('aria-label', t('More commands'));
    more.hidden = false;
    const shown = buttons.filter(button => !button.hidden);
    const order = shown.map((button, index) => ({button, index, priority: Number(button.dataset.priority ?? 2)})).sort((a, b) => b.priority - a.priority || b.index - a.index);
    let guard = order.length;
    for (const entry of order) {
      if (bar.scrollWidth <= bar.clientWidth + 1 || guard-- <= 0) break;
      setOverflow(entry.button, true);
    }
    more.hidden = hiddenCommands().length === 0;
  }
  listen($('more-button'), 'click', event => {
    const entries = hiddenCommands().map(button => ({id: button.id, label: button.textContent.trim().replace(/\s+/g, ' '), disabled: button.disabled, run: () => button.click()}));
    menu($('more-button'), event, entries);
  });
  if (commandBar && typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => renderOverflow());
    observer.observe(commandBar);
    disposers.push(() => observer.disconnect());
  }

  /* ---------- inspector ---------- */
  const inspector = $('inspector');
  function setInspectorOpen(open) {
    if (!inspector) return;
    inspector.toggleAttribute('data-open', open);
    $('inspector-toggle')?.setAttribute('aria-expanded', String(open));
  }
  listen($('inspector-toggle'), 'click', () => setInspectorOpen(!inspector.hasAttribute('data-open')));
  listen(doc, 'keydown', event => { if (event.key === 'Escape' && inspector?.hasAttribute('data-open') && !doc.querySelector('mfe-dialog[open],md-dialog[open],dialog[open]')) { setInspectorOpen(false); $('inspector-toggle')?.focus(); } });
  const sectionTitle = $('inspector-title');
  let actionRow = null;
  function ensureInspectorActions() {
    if (actionRow || !sectionTitle) return;
    actionRow = doc.createElement('div'); actionRow.className = 'inspector-actions';
    const proxies = [['open-button', 'Open'], ['offline-button', 'Keep offline'], ['file-details-button', 'All versions and details']];
    const close = control('md-icon-button', {id: 'inspector-close', class: 'inspector-close', 'aria-label': t('Close details'), 'data-icon': 'close'});
    close.replaceChildren(icon('close'));
    listen(close, 'click', () => { setInspectorOpen(false); $('inspector-toggle')?.focus(); });
    $('inspector-meta').after(actionRow);
    sectionTitle.parentElement.prepend(close);
    actionRow.dataset.proxies = JSON.stringify(proxies);
  }
  function renderInspectorActions() {
    if (!actionRow) return;
    const proxies = JSON.parse(actionRow.dataset.proxies);
    const signature = JSON.stringify([getLanguage(), proxies.map(([id]) => [id, Boolean($(id)), $(id)?.disabled])]);
    if (actionRow.dataset.signature === signature) return;
    actionRow.dataset.signature = signature;
    const fragment = doc.createDocumentFragment();
    for (const [id, label] of proxies) {
      const source = $(id);
      if (!source) continue;
      const proxy = control('md-outlined-button', {class: 'inspector-action', type: 'button', disabled: Boolean(source.disabled)});
      proxy.textContent = id === 'file-details-button' ? t('All versions and details') : t(label);
      proxy.addEventListener('click', () => source.click());
      fragment.append(proxy);
    }
    actionRow.replaceChildren(fragment);
  }
  const formatDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(getLanguage() === 'yue' ? 'zh-HK' : 'en', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(date); };
  function renderInspector() {
    ensureInspectorActions();
    const file = snapshot.selected;
    const name = $('inspector-name'), meta = $('inspector-meta');
    if (!name) return;
    name.textContent = file ? relativeName(file, '') : t('Select a file to see its details.');
    const sizeText = file && Number.isFinite(file.size) ? hooks.formatBytes(file.size) : '';
    meta.textContent = file ? [sizeText, formatDate(file.modified), t(file.offline ? 'Available offline' : 'Encrypted storage only')].filter(Boolean).join(' · ') : '';
    const partsSection = $('inspector-parts-section'), grid = $('inspector-parts'), label = $('inspector-parts-label');
    const shape = partMapShape(file?.partCount);
    partsSection.hidden = shape.count === 0;
    const partsKey = `${file?.id}|${shape.count}|${shape.shown}|${file?.offline}`;
    if (grid.dataset.key !== partsKey) {
      grid.dataset.key = partsKey;
      const fragment = doc.createDocumentFragment();
      for (let index = 0; index < shape.shown; index += 1) { const cell = doc.createElement('span'); cell.className = 'part-cell'; cell.style.setProperty('--part-index', String(index)); fragment.append(cell); }
      grid.replaceChildren(fragment);
    }
    const description = shape.truncated ? t('{count} encrypted parts (first {shown} shown)', {count: shape.count, shown: shape.shown}) : shape.count === 1 ? t('1 encrypted part, authenticated before every read') : t('{count} encrypted parts, authenticated before every read', {count: shape.count});
    grid.setAttribute('role', 'img'); grid.setAttribute('aria-label', shape.count ? description : '');
    label.textContent = shape.count ? description : '';
    renderInspectorActions();
    renderVersions(file);
  }
  async function renderVersions(file) {
    const list = $('inspector-versions'), empty = $('inspector-versions-empty');
    const token = ++versionsToken;
    if (!file) { list.replaceChildren(); empty.hidden = false; empty.textContent = t('Select a file to see its versions.'); return; }
    empty.hidden = false; empty.textContent = t('Loading versions…');
    try {
      const rows = await hooks.listVersions(file.id);
      if (token !== versionsToken) return;
      const items = (Array.isArray(rows) ? rows : []).slice(0, VERSION_LIMIT);
      const fragment = doc.createDocumentFragment();
      items.forEach((version, index) => {
        const item = doc.createElement('li'); item.className = 'version-item'; item.dataset.current = String(index === 0);
        const dot = doc.createElement('span'); dot.className = 'version-dot'; dot.setAttribute('aria-hidden', 'true');
        const body = doc.createElement('span');
        const when = doc.createElement('strong'); when.textContent = formatDate(version.timestampUtc || version.modified || version.createdAt) || t('Version');
        const size = Number.isFinite(version.length) ? ' ' + hooks.formatBytes(version.length) : '';
        const note = doc.createElement('span'); note.className = 'muted'; note.textContent = size + (version.label ? ' · ' + version.label : '');
        const id = doc.createElement('span'); id.className = 'version-id'; id.textContent = String(version.id ?? '').slice(0, 8);
        body.append(when, note, doc.createElement('br'), id);
        item.append(dot, body); fragment.append(item);
      });
      list.replaceChildren(fragment);
      empty.hidden = items.length > 0; empty.textContent = t('No saved versions for this file yet.');
    } catch {
      if (token !== versionsToken) return;
      list.replaceChildren(); empty.hidden = false; empty.textContent = t('Versions could not be loaded.');
    }
  }
  async function renderBackup() {
    const host = $('inspector-backup');
    const state = snapshot.state;
    if (!host) return;
    const key = state?.sessionId + '|' + (state?.sync?.lastSync ?? '') + '|' + getLanguage();
    if (key === backupKey) { host.textContent = backupText; return; }
    backupKey = key;
    const token = ++backupToken;
    host.textContent = '';
    try {
      const status = await hooks.backupStatus();
      if (token !== backupToken) return;
      if (!status || status.configured !== true) backupText = t('Cloud backup is not set up for this drive.');
      else {
        const target = status.configuration?.repository || status.configuration?.reference || status.configuration?.image || '';
        backupText = [target, t('Cloud backup: {state}', {state: String(status.state)})].filter(Boolean).join(' · ');
      }
    } catch {
      if (token !== backupToken) return;
      backupText = t('Cloud backup status is unavailable.');
    }
    host.textContent = backupText;
  }

  /* ---------- status bar ---------- */
  function renderStatus() {
    const {state, files} = snapshot;
    const mountedLetter = driveLetterLabel(state?.driveLetter);
    const set = (id, value) => { const node = $(id); if (node && node.textContent !== value) node.textContent = value; };
    set('status-mounted', state?.mounted && mountedLetter ? t('{mounted} mounted', {mounted: mountedLetter}) : t('Not mounted'));
    const total = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    set('status-used', state && !state.locked ? `${snapshot.hasMore ? t('{count} files (more available)', {count: files.length}) : t('{count} files', {count: files.length})} · ${t('{size} used', {size: hooks.formatBytes(total) || '0 B'})}` : '');
    const sync = state?.sync;
    set('status-sync', !state || state.locked ? '' : sync?.running ? t('Syncing') : state.transport?.pendingSynchronization || sync?.pendingCommits ? t('Sync pending') : sync?.lastSync ? t('Synchronized') : t('Not synced yet'));
    set('status-cipher', t('Encrypted with AES-GCM'));
    const language = getLanguage();
    set('status-language', t('Language: {language}', {language: language === 'yue' ? '廣東話' : language === 'bilingual' ? 'English + 廣東話' : 'English'}));
  }

  mountTree();

  return {
    /** Feeds the chrome the latest vault state, the loaded files and the primary selection. */
    update(next) {
      snapshot = {...snapshot, ...next};
      renderTabs(); renderTree(); renderBreadcrumb(); renderFilterLabel(); renderSortHeaders(); renderInspector(); renderBackup(); renderStatus(); renderOverflow();
    },
    /** Applies the folder and availability scope to a file list. */
    scopeFiles(files) {
      return files.filter(file => fileInFolder(file, scope.folder) && (scope.availability === 'all' || (scope.availability === 'offline' ? Boolean(file.offline) : !file.offline)));
    },
    sortFiles: files => sortFiles(files, scope.sort, getLanguage() === 'yue' ? 'zh-HK' : 'en'),
    nameFor: file => relativeName(file, scope.folder),
    scopeKey: () => JSON.stringify(scope),
    getScope: () => ({folder: scope.folder, availability: scope.availability, sort: {...scope.sort}}),
    refreshOverflow: renderOverflow,
    destroy() { for (const dispose of disposers.splice(0)) dispose(); treeSection?.remove(); }
  };
}
