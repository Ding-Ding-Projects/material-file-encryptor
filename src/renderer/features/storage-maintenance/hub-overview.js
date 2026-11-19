import {localized, text} from '../../../shared/surface/registry.js';
import {openContextMenu} from '../../../shared/surface/overlay.js';
import {icon} from '../../icons.js';
import {AUTO_BACKUP_COPY} from './auto-backup/copy.js';
import {groupDrives, driveState, relativeTime, summary, shortId} from './auto-backup/model.js';
import {FILTERS, SORTS, PART_SIZE_MIB, bucketOf, sizeOf, filterCounts, visibleDrives, listSummary, runningStrip, avatarLetter} from './auto-backup/list-model.js';
import {formatBytes, formatDuration} from './registry-progress.js';

export const HUB_OVERVIEW_COPY = AUTO_BACKUP_COPY;
const POLL_MS = 4000;
const FILTER_LABELS = {all: 'All', attention: 'Needs attention', running: 'Running', queued: 'Queued', ok: 'Up to date'};
const SORT_LABELS = {attention: 'Needs attention first', name: 'Name', last: 'Last backup', size: 'Size'};
const STEP_LABELS = {discovering: 'Discovering', 'waiting-drive': 'Waiting for the drive', downloading: 'Downloading', applying: 'Applying', packing: 'Packing', preparing: 'Preparing', uploading: 'Uploading', verifying: 'Verifying', restoring: 'Restoring'};
const BUCKET_ICONS = {ok: 'cloud', running: 'cloud_upload', queued: 'sync', attention: 'error', off: 'offline'};
const BUCKET_LABELS = {ok: 'Up to date', running: 'Running', queued: 'Queued', attention: 'Needs attention', off: 'Backup off'};

/**
 * The Docker Hub backup page: toolbar, a pinned strip for the backup running now, a summary line, filter chips with live
 * counts, name search with a regular expression switch, a sort control and one dense row per drive that expands in place
 * to its actions. Every figure comes from the host's automatic backup status: whether backup is on, each drive's switch,
 * state, last backup, snapshot count, the repository's tag count and the last prune. The full storage, sign-in, snapshot
 * and conflict panels stay below.
 */
export function mountHubOverview(host, {services = {}, getLanguage = () => 'en', onBackupAll = () => {}, onRestore = () => {}, onShowDetails = () => {}, onOpenDrive = () => {}, onSettings = () => {}, now = () => Date.now()} = {}) {
  const doc = host.ownerDocument;
  const L = (key, values = {}) => Object.entries(values).reduce((value, [name, item]) => value.replaceAll(`{${name}}`, String(item)), localized(text(key, AUTO_BACKUP_COPY[key] ?? key), getLanguage()));
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'value') node[key] = value; else node.setAttribute(key, value); } node.append(...children); return node; };
  const glyph = name => el('span', {'data-icon': name, class: 'hub-icon'}, [icon(name)]);
  const button = (props, name, label, tag = 'button') => el(tag, {type: 'button', ...props}, [glyph(name), el('span', {class: 'label', text: label})]);
  const help = (node, key) => { const value = L(key); node.setAttribute('data-help-text', value); node.setAttribute('aria-description', value); return node; };
  const root = el('div', {class: 'hub-overview'});
  host.prepend(root);
  let status = null, backingUpAll = false, failed = false, generation = 0, message = '', timer = null, disposed = false, lastJson = '', removal = null;
  const view = {filter: 'all', query: '', regex: false, sort: 'attention', sortOpen: false};
  const expanded = new Set();
  const clock = value => new Date(value).toLocaleString(getLanguage() === 'yue' ? 'zh-HK' : 'en', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const when = value => { const relative = relativeTime(value, now()); if (relative.key === 'date') return clock(relative.time); return L(relative.key, {count: relative.count}); };
  const delayText = seconds => seconds === 60 ? L('1 minute') : seconds % 60 === 0 ? L('{count} minutes', {count: seconds / 60}) : L('{count} seconds', {count: seconds});
  const bytesText = value => formatBytes(value, getLanguage() === 'yue' ? 'zh-HK' : 'en');

  async function act(work, done) {
    try { const result = await work(); message = done ? done(result) : ''; }
    catch (error) { message = String(error?.message || error); }
    await load();
  }
  /** The per-drive actions, shared by the expanded row and the right-click menu. */
  function driveActions(drive) {
    const run = (method, ...args) => () => void act(() => services[method](...args), method === 'autoBackupPrune' ? result => L('Removed {count} old snapshots.', {count: result?.pruned ?? 0}) : method === 'autoBackupMove' ? () => L('This drive now backs up to its own repository.') : null);
    const usable = drive.phase !== 'unavailable';
    return {
      backup: {label: 'Back up now', disabled: !usable || !status?.signedIn || typeof services.autoBackupNow !== 'function', run: run('autoBackupNow', drive.sessionId)},
      restore: {label: 'Restore…', disabled: false, run: () => onRestore()},
      prune: {label: 'Prune old snapshots now', disabled: !drive.lastBackup || typeof services.autoBackupPrune !== 'function', run: run('autoBackupPrune', drive.sessionId)},
      move: {label: 'Move to its own repository', disabled: !usable || !drive.repository || !status?.signedIn, run: run('autoBackupMove', drive.sessionId)},
      switch: {label: drive.enabled ? 'Stop backing up' : 'Start backing up', disabled: !usable, run: run('autoBackupSetDrive', drive.sessionId, !drive.enabled)},
      open: {label: 'Open this drive', disabled: false, run: () => onOpenDrive(drive.sessionId)},
      remove: {label: 'Remove this drive’s backups…', disabled: !drive.repository || typeof services.autoBackupListOwn !== 'function', run: () => void askRemove(drive)}
    };
  }
  function rowMenu(anchor, event, drive) {
    const actions = driveActions(drive);
    openContextMenu({anchor, event, target: anchor, language: getLanguage(), items: ['backup', 'restore', 'prune', 'move', 'switch', 'open', 'remove'].map(id => ({id: `hub:${id === 'switch' ? 'switch' : id}`, label: text(actions[id].label, AUTO_BACKUP_COPY[actions[id].label]), disabled: actions[id].disabled, run: actions[id].run}))});
  }
  function driveRow(drive) {
    const bucket = bucketOf(drive), state = driveState(drive), open = expanded.has(drive.sessionId), name = drive.name || drive.sessionId;
    const stateLabel = state.percent !== undefined && state.percent !== null ? `${L(state.key)} ${state.percent}%` : L(state.key, state.values);
    const size = sizeOf(drive);
    const sub = drive.lastError ? String(drive.lastError) : shortId(drive.deviceId) ? `${L('This PC')} · ${shortId(drive.deviceId)}` : L('This PC');
    const head = el('button', {type: 'button', class: 'drive-head', 'aria-expanded': String(open), 'aria-label': `${name}: ${stateLabel}. ${L(open ? 'Hide details' : 'Show details')}`}, [
      el('span', {class: 'avatar', 'aria-hidden': 'true', text: avatarLetter(drive)}),
      el('span', {class: 'who'}, [el('span', {class: 'name', text: name}), el('span', {class: 'note', text: sub, title: drive.lastError || ''})]),
      el('span', {class: 'state-chip', 'data-bucket': bucket, title: drive.lastError || ''}, [glyph(BUCKET_ICONS[bucket]), el('span', {text: stateLabel})]),
      el('span', {class: 'last', text: when(drive.lastBackup), title: drive.lastBackup ? clock(Date.parse(drive.lastBackup)) : ''}),
      el('span', {class: 'size', text: size === null ? '–' : bytesText(size)}),
      el('span', {class: 'snaps', text: Number.isSafeInteger(drive.snapshots) ? String(drive.snapshots) : '–'}),
      el('span', {class: 'chevron', 'data-open': String(open), 'aria-hidden': 'true'}, [glyph('add')])]);
    const row = el('div', {class: 'drive-row', role: 'listitem', 'data-session-id': drive.sessionId, 'data-state': drive.enabled ? drive.phase : 'off', 'data-bucket': bucket, 'data-open': String(open)}, [head]);
    head.addEventListener('click', () => { if (expanded.has(drive.sessionId)) expanded.delete(drive.sessionId); else expanded.add(drive.sessionId); renderList(); });
    row.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); rowMenu(row, event, drive); });
    if (open) {
      const actions = driveActions(drive);
      const act1 = (id, name2, variant) => { const spec = actions[id]; const node = button({class: `hub-btn ${variant}`, 'data-action': id, disabled: spec.disabled}, name2, L(spec.label)); node.addEventListener('click', () => { if (!node.disabled) spec.run(); }); return node; };
      const fact = (label, value) => el('span', {class: 'fact'}, [el('span', {class: 'fact-label', text: L(label)}), el('b', {text: value})]);
      const toggle = act1('switch', drive.enabled ? 'close' : 'add', 'danger');
      const tags = Number.isSafeInteger(drive.tagCount) ? L('{used} of {limit} tags used', {used: drive.tagCount, limit: '1,000'}) : L('Not reported');
      row.append(el('div', {class: 'drive-detail'}, [
        el('div', {class: 'facts'}, [fact('Repository', drive.repository || L('Not backed up')), ...(drive.repository && drive.visibility ? [fact('Status', L(drive.visibility === 'private' ? 'Private' : 'Public'))] : []), fact('Part size', `${PART_SIZE_MIB} MiB`), fact('Tags used', tags)]),
        el('div', {class: 'actions'}, [act1('backup', 'cloud_upload', 'tonal'), act1('restore', 'export', 'outlined'), act1('prune', 'delete', 'outlined'), toggle])]));
    }
    return row;
  }
  /** Lists this computer's snapshots of the drive and asks before removing exactly those tags. */
  async function askRemove(drive) {
    try { const listed = await services.autoBackupListOwn(drive.sessionId); removal = {drive, repository: listed.repository, snapshots: listed.snapshots}; message = ''; }
    catch (error) { removal = null; message = String(error?.message || error); }
    lastJson = ''; render(); root.querySelector('#hub-remove-cancel')?.focus();
  }
  function removalPanel() {
    const tags = removal.snapshots.map(item => item.tag);
    const list = el('pre', {class: 'tag-list', tabindex: '0', 'aria-label': L('Tags that will be removed')}, [doc.createTextNode(tags.join('\n') || L('This computer has no snapshots of this drive in the repository.'))]);
    const copy = el('md-text-button', {type: 'button', id: 'hub-remove-copy'}, [el('span', {text: L('Copy list')})]);
    copy.addEventListener('click', () => void doc.defaultView.navigator.clipboard?.writeText(tags.join('\n')).catch(() => {}));
    const cancel = el('md-text-button', {type: 'button', id: 'hub-remove-cancel'}, [el('span', {text: L('Cancel')})]);
    cancel.addEventListener('click', () => { removal = null; lastJson = ''; render(); });
    const remove = el('md-filled-button', {type: 'button', id: 'hub-remove-confirm', class: 'danger', disabled: !tags.length}, [el('span', {text: tags.length === 1 ? L('Remove 1 snapshot') : L('Remove {count} snapshots', {count: tags.length})})]);
    remove.addEventListener('click', () => { const target = removal; removal = null; void act(async () => { const result = await services.autoBackupRemove(target.drive.sessionId, tags); await services.autoBackupSetDrive(target.drive.sessionId, false); return result; }, result => L('Removed {removed} snapshots; {failed} could not be confirmed.', {removed: result?.removed ?? 0, failed: result?.failed ?? 0})); });
    return el('div', {class: 'hub-notice hub-remove', role: 'alertdialog', 'aria-label': L('Remove this drive’s backups…')}, [
      el('strong', {text: L(tags.length === 1 ? 'Remove 1 snapshot of {drive} from {repository}?' : 'Remove {count} snapshots of {drive} from {repository}?', {count: tags.length, drive: removal.drive.name || removal.drive.sessionId, repository: removal.repository})}),
      el('p', {text: L('Only snapshots this computer uploaded for this drive are removed. Encrypted layers shared with other drives stay. Backup for this drive is turned off afterwards. This cannot be undone.')}),
      list, el('div', {class: 'actions'}, [copy, cancel, remove])]);
  }
  function notice() {
    const turnOn = el('md-filled-button', {type: 'button', id: 'hub-auto-backup-on'}, [el('span', {text: L('Turn on automatic backup')})]);
    turnOn.addEventListener('click', () => void act(() => services.autoBackupUpdate({noticeAcknowledged: true, enabled: true})));
    return el('div', {class: 'hub-notice', role: 'region', 'aria-label': L('Backups go to a public Docker Hub repository')}, [
      el('strong', {text: L('Backups go to a public Docker Hub repository')}),
      el('p', {text: L('Only encrypted data is uploaded. Anyone can see that the repository exists, how many drives and snapshots it holds, their sizes, backup times and drive labels, but never file names or contents.')}),
      turnOn]);
  }
  /**
   * Backs up every drive automatic backup covers, one after another, through the same path as each row's Back up now.
   * Before automatic backup is ready (signed out, notice unread, switched off) it opens the one-off backup tools instead.
   */
  async function backUpAll() {
    if (backingUpAll) return;
    if (!status?.signedIn || status.noticeRequired || !status.settings?.enabled || typeof services.autoBackupNow !== 'function') { onBackupAll(); return; }
    const drives = status.drives.filter(drive => drive.enabled && drive.phase !== 'unavailable');
    backingUpAll = true; lastJson = ''; render();
    try {
      await act(async () => {
        let done = 0, failed = 0;
        for (const drive of drives) { if (disposed) break; try { await services.autoBackupNow(drive.sessionId); done++; } catch { failed++; } }
        return {done, failed};
      }, result => result.failed ? L('Backed up {done} drives; {failed} need attention.', result) : L('Backed up {done} drives.', result));
    } finally { backingUpAll = false; lastJson = ''; if (!disposed) render(); }
  }

  // The search field, regex switch and sort control are built once so typing never loses focus across list refreshes.
  const searchInput = el('input', {type: 'search', class: 'hub-search-input', autocomplete: 'off', spellcheck: 'false'});
  const searchLabel = el('label', {class: 'hub-search'}, [glyph('search'), searchInput]);
  const regexButton = button({class: 'hub-btn toggle', id: 'hub-regex'}, 'search', '');
  const sortButton = button({class: 'hub-btn tonal', id: 'hub-sort', 'aria-haspopup': 'menu'}, 'menu', '');
  const sortMenu = el('div', {class: 'hub-menu', role: 'menu', hidden: ''});
  const regexNote = el('p', {class: 'hub-regex-note', role: 'alert', hidden: ''});
  const controls = el('div', {class: 'hub-controls'}, [searchLabel, regexButton, el('div', {class: 'hub-sort'}, [sortButton, sortMenu])]);
  searchInput.addEventListener('input', () => { view.query = searchInput.value; renderList(); });
  regexButton.addEventListener('click', () => { view.regex = !view.regex; renderList(); });
  sortButton.addEventListener('click', () => { view.sortOpen = !view.sortOpen; renderControls(); });
  const onEscape = event => { if (event.key === 'Escape' && view.sortOpen) { view.sortOpen = false; renderControls(); sortButton.focus?.(); } };
  doc.addEventListener?.('keydown', onEscape);
  const chipsHost = el('div', {class: 'hub-chips', role: 'group'});
  const stripHost = el('div', {class: 'hub-strip-host'});
  const summaryHost = el('div', {class: 'hub-summary-host'});
  const listHost = el('div', {class: 'hub-list', role: 'list'});
  const listShell = el('section', {class: 'hub-list-shell'}, [listHost]);

  function renderControls() {
    searchInput.placeholder = L('Search drives by name'); searchInput.setAttribute('aria-label', L('Search drives by name'));
    regexButton.querySelector('.label').textContent = L('Regex'); regexButton.setAttribute('aria-pressed', String(view.regex)); regexButton.setAttribute('aria-label', L('Use a regular expression')); regexButton.title = L('Use a regular expression');
    sortButton.querySelector('.label').textContent = L('Sort: {name}', {name: L(SORT_LABELS[view.sort])}); sortButton.setAttribute('aria-expanded', String(view.sortOpen)); sortButton.setAttribute('aria-label', L('Sort drives'));
    sortMenu.hidden = !view.sortOpen;
    sortMenu.replaceChildren(...SORTS.map(id => { const item = el('button', {type: 'button', role: 'menuitemradio', 'aria-checked': String(view.sort === id), class: 'hub-menu-item', 'data-sort': id}, [el('span', {class: 'tick', 'aria-hidden': 'true', text: view.sort === id ? '✓' : ''}), el('span', {text: L(SORT_LABELS[id])})]); item.addEventListener('click', () => { view.sort = id; view.sortOpen = false; renderList(); }); return item; }));
    chipsHost.setAttribute('aria-label', L('Filter drives'));
  }
  function renderChips(counts) {
    chipsHost.replaceChildren(...FILTERS.map(id => { const on = view.filter === id; const chip = el('button', {type: 'button', class: 'hub-chip', 'aria-pressed': String(on), 'data-filter': id}, [...(on ? [el('span', {class: 'tick', 'aria-hidden': 'true', text: '✓'})] : []), el('span', {text: `${L(FILTER_LABELS[id])} ${counts[id]}`})]); chip.addEventListener('click', () => { view.filter = id; renderList(); }); return chip; }));
  }
  /** Re-renders only what depends on the filter, search and sort: chips, controls and the list. */
  function renderList() {
    renderControls();
    const drives = status?.drives ?? [];
    renderChips(filterCounts(drives));
    const {rows, error} = visibleDrives(drives, view);
    regexNote.hidden = !error; regexNote.textContent = error ? L('That regular expression is not valid.') : '';
    searchInput.setAttribute('aria-invalid', String(error));
    listShell.setAttribute('aria-label', L('Drive list'));
    const header = el('div', {class: 'hub-list-head', 'aria-hidden': 'true'}, ['Drive', 'Status', 'Last backup', 'Size', 'Snapshots'].map((label, index) => el('span', {class: `col-${index}`, text: L(label)})));
    if (!status) listHost.replaceChildren(el('p', {class: 'hub-empty', role: 'status', text: L(failed ? 'The drive list could not be read. The details below still work.' : 'Loading the drive list…')}));
    else if (!rows.length) listHost.replaceChildren(el('p', {class: 'hub-empty', role: 'status', text: L('No drives match this filter.')}));
    else listHost.replaceChildren(...rows.map(driveRow));
    listShell.replaceChildren(header, listHost);
  }
  function renderStrip() {
    const run = runningStrip(status, now());
    if (!run) { stripHost.replaceChildren(); return; }
    const parts = [];
    if (run.step) parts.push(L(STEP_LABELS[run.step]));
    if (run.done !== null) parts.push(run.total !== null ? L('{done} of {total} {unit}', {done: run.done, total: run.total, unit: L(run.unit || 'files')}) : `${run.done} ${L(run.unit || 'files')}`);
    parts.push(`${PART_SIZE_MIB} MiB`);
    const bar = el('md-linear-progress', {'aria-label': L('Backing up now'), ...(run.percent === null ? {indeterminate: ''} : {})});
    if (run.percent !== null) bar.value = run.percent / 100;
    const cancel = button({class: 'hub-btn outlined', id: 'hub-strip-cancel'}, 'close', L('Cancel'));
    cancel.disabled = typeof services.cancelRegistryStorage !== 'function'; cancel.hidden = cancel.disabled;
    cancel.addEventListener('click', () => void act(() => services.cancelRegistryStorage(), null));
    const facts = [el('span', {class: 'percent', text: run.percent === null ? '' : `${run.percent}%`})];
    if (run.rate) facts.push(el('span', {class: 'fact-quiet', text: `${bytesText(Math.round(run.rate))}/s`}));
    if (run.remainingMs !== null) facts.push(el('span', {class: 'fact-quiet', text: L('{time} left', {time: formatDuration(run.remainingMs)})}));
    stripHost.replaceChildren(el('section', {class: 'hub-strip', 'aria-label': L('Backing up now')}, [
      el('span', {class: 'avatar', 'aria-hidden': 'true', text: avatarLetter({name: run.name})}),
      el('span', {class: 'who'}, [el('span', {class: 'name', text: run.name}), el('span', {class: 'note', text: parts.join(' · ')})]),
      el('span', {class: 'bar'}, [bar]), ...facts, cancel]));
  }
  function renderSummary() {
    const line = summary(status, now());
    const lineText = line.key === 'Backed up {ago}' ? L(line.key, {ago: L(line.ago.key, {count: line.ago.count})}) : line.key === 'Backing up… {percent}%' ? (line.percent === null ? L('Backing up…') : L(line.key, {percent: line.percent})) : L(line.key);
    const parts = [el('strong', {class: 'summary-state', text: lineText})];
    if (status?.signedIn && !status.noticeRequired && status.settings.enabled) parts.push(el('span', {class: 'muted', text: L('changes back up {delay} after a drive goes idle', {delay: delayText(status.settings.idleDelaySeconds)})}));
    const figures = listSummary(status?.drives ?? []);
    if (status?.drives?.length) {
      parts.push(el('span', {class: 'muted', text: L('{count} drives · {ok} up to date', {count: figures.drives, ok: figures.upToDate})}));
      if (figures.storedBytes !== null) parts.push(el('span', {class: 'muted', text: L('{size} stored', {size: bytesText(figures.storedBytes)})}));
      if (figures.tagsUsed !== null) parts.push(el('span', {class: 'muted', text: L('{used} of {limit} tags used', {used: figures.tagsUsed.toLocaleString('en'), limit: figures.tagLimit.toLocaleString('en')})}));
    }
    summaryHost.replaceChildren(el('div', {class: 'hub-summary', role: 'status', 'aria-live': 'polite', 'data-tone': line.tone}, parts));
  }
  function render() {
    const toolbar = el('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': L('Docker Hub backup commands')});
    const backupAll = button({id: 'hub-backup-all', class: 'hub-btn filled', disabled: backingUpAll}, 'cloud_upload', L('Back up all now'));
    backupAll.addEventListener('click', () => void backUpAll());
    const restore = button({id: 'hub-restore', class: 'hub-btn outlined'}, 'export', L('Restore…'));
    restore.addEventListener('click', () => onRestore());
    const refresh = button({id: 'hub-refresh', class: 'hub-btn outlined'}, 'sync', L('Refresh'));
    refresh.addEventListener('click', () => void load());
    const settings = button({id: 'hub-settings', class: 'hub-btn outlined end'}, 'settings', L('Backup settings'));
    settings.addEventListener('click', () => onSettings());
    toolbar.append(backupAll, restore, refresh, settings);
    renderStrip(); renderSummary(); renderList();
    const near = groupDrives(status?.drives ?? []).filter(group => group.repository && group.nearLimit);
    const children = [toolbar, stripHost, summaryHost];
    if (status?.signedIn && status.noticeRequired) children.push(notice());
    if (removal) children.push(removalPanel());
    if (near.length) {
      const move = button({class: 'hub-btn tonal move-all'}, 'cloud_upload', L('Move drives to their own repositories'));
      move.addEventListener('click', () => void act(async () => { for (const group of near) if (group.drives.length > 1) for (const drive of group.drives) if (drive.enabled) await services.autoBackupMove(drive.sessionId); }));
      children.push(el('div', {class: 'hub-notice hub-near', role: 'status'}, [el('span', {text: L('Backup is nearly at the tag limit in {count} repositories.', {count: near.length})}), ...(near.some(group => group.drives.length > 1) ? [move] : [])]));
    }
    children.push(el('div', {class: 'hub-filters'}, [chipsHost, controls]), regexNote, listShell);
    const pruneNote = status?.drives?.some(drive => drive.lastPrune?.failed > 0) ? L('Some old snapshots could not be removed; they are tried again after the next backup.') : '';
    children.push(el('p', {class: 'hub-overview-note', role: 'status', text: [message, pruneNote].filter(Boolean).join(' ')}));
    root.replaceChildren(...children);
    for (const node of root.querySelectorAll?.('[data-icon]') ?? []) if (!node.firstChild) node.replaceChildren(icon(node.dataset.icon));
  }
  async function load() {
    const request = ++generation;
    if (typeof services.autoBackupStatus !== 'function') { failed = true; render(); return; }
    try { const value = await services.autoBackupStatus(); if (request !== generation || disposed) return; const json = JSON.stringify(value) + Math.floor(now() / 60000); if (json === lastJson && !failed && !message) return; lastJson = json; status = value; failed = false; }
    catch { if (request !== generation || disposed) return; failed = true; }
    render();
  }
  // While anything is moving the list refreshes itself; the poll stops with the page.
  const poll = () => { if (disposed) return; timer = setTimeout(async () => { if (!doc.hidden) await load().catch(() => {}); poll(); }, POLL_MS); };
  render(); void load(); poll();
  return {refresh: load, backUpAll, setLanguage: render, destroy() { disposed = true; generation++; clearTimeout(timer); doc.removeEventListener?.('keydown', onEscape); root.remove(); }};
}
