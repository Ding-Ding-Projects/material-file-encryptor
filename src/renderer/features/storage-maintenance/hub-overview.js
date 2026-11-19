import {localized, text} from '../../../shared/surface/registry.js';
import {openContextMenu} from '../../../shared/surface/overlay.js';
import {AUTO_BACKUP_COPY} from './auto-backup/copy.js';
import {groupDrives, driveState, relativeTime, summary, shortId} from './auto-backup/model.js';

export const HUB_OVERVIEW_COPY = AUTO_BACKUP_COPY;
const POLL_MS = 4000;

/**
 * The Docker Hub backup page header and drive table, grouped by repository. Every figure comes from the host's
 * automatic backup status: whether backup is on, each drive's switch, state, last backup, snapshot count, the
 * repository's tag count and the last prune. The full storage, sign-in, snapshot and conflict panels stay below.
 */
export function mountHubOverview(host, {services = {}, getLanguage = () => 'en', onBackupAll = () => {}, onRestore = () => {}, onShowDetails = () => {}, onOpenDrive = () => {}, onSettings = () => {}, now = () => Date.now()} = {}) {
  const doc = host.ownerDocument;
  const L = (key, values = {}) => Object.entries(values).reduce((value, [name, item]) => value.replaceAll(`{${name}}`, String(item)), localized(text(key, AUTO_BACKUP_COPY[key] ?? key), getLanguage()));
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else if (key === 'checked' || key === 'selected' || key === 'disabled') node[key] = value; else node.setAttribute(key, value); } node.append(...children); return node; };
  const help = (node, key) => { const value = L(key); node.setAttribute('data-help-text', value); node.setAttribute('aria-description', value); return node; };
  const root = el('div', {class: 'hub-overview'});
  host.prepend(root);
  let status = null, backingUpAll = false, failed = false, generation = 0, message = '', timer = null, disposed = false, settled = false, lastJson = '', removal = null;
  const when = value => { const relative = relativeTime(value, now()); if (relative.key === 'date') return new Date(relative.time).toLocaleString(getLanguage() === 'yue' ? 'zh-HK' : 'en', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}); return L(relative.key, {count: relative.count}); };
  const delayText = seconds => seconds === 60 ? L('1 minute') : seconds % 60 === 0 ? L('{count} minutes', {count: seconds / 60}) : L('{count} seconds', {count: seconds});

  async function act(work, done) {
    try { const result = await work(); message = done ? done(result) : ''; }
    catch (error) { message = String(error?.message || error); }
    await load();
  }
  function rowMenu(anchor, event, drive) {
    const run = (method, ...args) => () => void act(() => services[method](...args), method === 'autoBackupPrune' ? result => L('Removed {count} old snapshots.', {count: result?.pruned ?? 0}) : method === 'autoBackupMove' ? () => L('This drive now backs up to its own repository.') : null);
    const usable = drive.phase !== 'unavailable';
    openContextMenu({anchor, event, target: anchor, language: getLanguage(), items: [
      {id: 'hub:backup', label: text('Back up now', AUTO_BACKUP_COPY['Back up now']), disabled: !usable || !status?.signedIn || typeof services.autoBackupNow !== 'function', run: run('autoBackupNow', drive.sessionId)},
      {id: 'hub:restore', label: text('Restore…', AUTO_BACKUP_COPY['Restore…']), run: () => onRestore()},
      {id: 'hub:prune', label: text('Prune old snapshots now', AUTO_BACKUP_COPY['Prune old snapshots now']), disabled: !drive.lastBackup || typeof services.autoBackupPrune !== 'function', run: run('autoBackupPrune', drive.sessionId)},
      {id: 'hub:move', label: text('Move to its own repository', AUTO_BACKUP_COPY['Move to its own repository']), disabled: !usable || !drive.repository || !status?.signedIn, run: run('autoBackupMove', drive.sessionId)},
      {id: 'hub:switch', label: drive.enabled ? text('Stop backing up', AUTO_BACKUP_COPY['Stop backing up']) : text('Start backing up', AUTO_BACKUP_COPY['Start backing up']), disabled: !usable, run: run('autoBackupSetDrive', drive.sessionId, !drive.enabled)},
      {id: 'hub:open', label: text('Open this drive', AUTO_BACKUP_COPY['Open this drive']), run: () => onOpenDrive(drive.sessionId)},
      {id: 'hub:remove', label: text('Remove this drive’s backups…', AUTO_BACKUP_COPY['Remove this drive’s backups…']), disabled: !drive.repository || typeof services.autoBackupListOwn !== 'function', run: () => void askRemove(drive)}
    ]});
  }
  function driveRow(drive) {
    const state = driveState(drive);
    const menu = el('md-icon-button', {class: 'row-menu', 'aria-label': `${L('Drive actions')}: ${drive.name || drive.sessionId}`, title: L('Drive actions')}, [el('span', {text: '⋯', 'aria-hidden': 'true'})]);
    menu.addEventListener('click', event => rowMenu(menu, event, drive));
    const toggle = help(el('md-switch', {'aria-label': `${L('Back up this drive')}: ${drive.name || drive.sessionId}`, class: 'drive-switch', selected: drive.enabled, disabled: drive.phase === 'unavailable'}), 'Backs up this drive automatically after changes and every hour. Turn it off to keep this drive on this PC only.');
    toggle.addEventListener('change', () => void act(() => services.autoBackupSetDrive(drive.sessionId, toggle.selected)));
    const label = state.percent !== undefined && state.percent !== null ? `${L(state.key)} ${state.percent}%` : L(state.key, state.values);
    const tr = el('tr', {'data-session-id': drive.sessionId, 'data-state': drive.enabled ? drive.phase : 'off', 'data-tone': state.tone}, [
      el('td', {class: 'name'}, [doc.createTextNode(drive.name || drive.sessionId), ...(shortId(drive.deviceId) ? [el('code', {class: 'short-id', text: shortId(drive.deviceId)})] : [])]),
      el('td', {text: L('This PC')}), el('td', {text: when(drive.lastBackup)}), el('td', {class: 'number', text: Number.isSafeInteger(drive.snapshots) ? String(drive.snapshots) : '-'}),
      el('td', {class: 'status', title: drive.lastError || ''}, [el('span', {class: 'dot', 'aria-hidden': 'true'}), doc.createTextNode(label)]),
      el('td', {class: 'backup'}, [toggle]), el('td', {class: 'menu'}, [menu])]);
    tr.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); rowMenu(tr, event, drive); });
    return tr;
  }
  function groupRow(group) {
    const cells = [el('span', {class: group.repository ? 'repository' : '', text: group.repository || L('Not backed up')})];
    if (group.repository) cells.push(el('span', {class: 'chip', text: L(group.visibility === 'private' ? 'Private' : 'Public')}));
    cells.push(el('span', {class: 'muted', text: group.drives.length === 1 ? L('1 drive') : L('{count} drives', {count: group.drives.length})}));
    const end = el('span', {class: 'group-end'});
    if (group.repository && Number.isSafeInteger(group.tagCount)) {
      const meter = help(el('meter', {min: '0', max: '1000', low: '800', high: '800', optimum: '0', value: String(group.tagCount), 'aria-label': L('{count} of 1,000 tags', {count: group.tagCount})}), 'Number of snapshot tags in this repository. Docker Hub use by this app is limited to 1,000 tags per repository, shared by every drive in it.');
      end.append(el('span', {class: 'tag-count', text: L('{count} of 1,000 tags', {count: group.tagCount})}), meter);
      if (group.nearLimit && group.drives.length > 1) {
        const move = el('md-text-button', {type: 'button', class: 'move-all'}, [el('span', {text: L('Move drives to their own repositories')})]);
        move.addEventListener('click', () => void act(async () => { for (const drive of group.drives) if (drive.enabled) await services.autoBackupMove(drive.sessionId); }));
        end.append(move);
      }
    }
    return el('tr', {class: 'group-row', 'data-near-limit': String(group.nearLimit)}, [el('th', {scope: 'colgroup', colspan: '7'}, [...cells, end])]);
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
  function render() {
    const toolbar = el('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': L('Docker Hub backup commands')});
    const backupAll = el('md-filled-button', {id: 'hub-backup-all', type: 'button', disabled: backingUpAll}, [el('span', {text: L('Back up all now')})]);
    backupAll.addEventListener('click', () => void backUpAll());
    const restore = el('md-text-button', {id: 'hub-restore', type: 'button'}, [el('span', {text: L('Restore…')})]);
    restore.addEventListener('click', () => onRestore());
    const refresh = el('md-text-button', {id: 'hub-refresh', type: 'button'}, [el('span', {text: L('Refresh')})]);
    refresh.addEventListener('click', () => void load());
    const settings = el('md-text-button', {id: 'hub-settings', type: 'button', class: 'end'}, [el('span', {text: L('Backup settings')})]);
    settings.addEventListener('click', () => onSettings());
    toolbar.append(backupAll, restore, refresh, settings);
    const line = summary(status, now());
    const lineText = line.key === 'Backed up {ago}' ? L(line.key, {ago: L(line.ago.key, {count: line.ago.count})}) : line.key === 'Backing up… {percent}%' ? (line.percent === null ? L('Backing up…') : L(line.key, {percent: line.percent})) : L(line.key);
    const parts = [el('strong', {class: 'summary-state', text: lineText})];
    if (status?.signedIn && !status.noticeRequired && status.settings.enabled) parts.push(el('span', {class: 'muted', text: L('changes back up {delay} after a drive goes idle', {delay: delayText(status.settings.idleDelaySeconds)})}));
    const summaryRow = el('div', {class: 'hub-summary', role: 'status', 'aria-live': 'polite', 'data-tone': line.tone}, parts);
    const head = el('thead', {}, [el('tr', {}, ['Drive', 'From', 'Last backup', 'Snapshots', 'Status', 'Backup', ''].map(label => el('th', {scope: 'col', text: label ? L(label) : ''})))]);
    const body = el('tbody');
    if (!status) body.append(el('tr', {}, [el('td', {colspan: '7', class: 'note', text: L(failed ? 'The drive list could not be read. The details below still work.' : 'Loading the drive list…')})]));
    else for (const group of groupDrives(status.drives)) { body.append(groupRow(group)); for (const drive of group.drives) body.append(driveRow(drive)); }
    const children = [toolbar, summaryRow];
    if (status?.signedIn && status.noticeRequired) children.push(notice());
    if (removal) children.push(removalPanel());
    // Rows enter with the list motion once; the refreshes that follow replace them in place without replaying it.
    children.push(el('table', {class: 'hub-overview-table', 'aria-label': L('Backup'), ...(settled ? {'data-settled': ''} : {})}, [head, body]));
    if (status) settled = true;
    const pruneNote = status?.drives?.some(drive => drive.lastPrune?.failed > 0) ? L('Some old snapshots could not be removed; they are tried again after the next backup.') : '';
    children.push(el('p', {class: 'hub-overview-note', role: 'status', text: [message, pruneNote].filter(Boolean).join(' ')}));
    root.replaceChildren(...children);
  }
  async function load() {
    const request = ++generation;
    if (typeof services.autoBackupStatus !== 'function') { failed = true; render(); return; }
    try { const value = await services.autoBackupStatus(); if (request !== generation || disposed) return; const json = JSON.stringify(value) + Math.floor(now() / 60000); if (json === lastJson && !failed && !message) return; lastJson = json; status = value; failed = false; }
    catch { if (request !== generation || disposed) return; failed = true; }
    render();
  }
  // While anything is moving the table refreshes itself; the poll stops with the page.
  const poll = () => { if (disposed) return; timer = setTimeout(async () => { if (!doc.hidden) await load().catch(() => {}); poll(); }, POLL_MS); };
  render(); void load(); poll();
  return {refresh: load, backUpAll, setLanguage: render, destroy() { disposed = true; generation++; clearTimeout(timer); root.remove(); }};
}
