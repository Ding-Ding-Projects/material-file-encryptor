import {localized, text} from '../../../shared/surface/registry.js';
import {openContextMenu} from '../../../shared/surface/overlay.js';
import {backupAllPlan} from './backup-all-model.js';

/** Cantonese wording for the Docker Hub backup overview. English source strings are the keys. */
export const HUB_OVERVIEW_COPY = Object.freeze({
  'Docker Hub backup commands': 'Docker Hub 備份指令', 'Back up all now': '立即全部備份', 'Restore…': '還原…', 'Refresh': '重新整理',
  'Backup settings': '備份設定', 'Drive': '磁碟', 'Last backup': '上次備份', 'Status': '狀態', 'Backup': '備份',
  'Not backed up': '未備份', 'Never': '從未', 'Backup on': '備份已開啟', 'Backup off': '備份已關閉', 'Locked': '已鎖定',
  'No encrypted storage': '冇加密儲存', 'Not a folder drive': '唔係資料夾磁碟', 'Backed up': '已備份', 'Waiting for the first backup': '等緊第一次備份',
  'Public': '公開', 'Private': '私人', '{count} drives': '{count} 個磁碟', '1 drive': '1 個磁碟', 'Back up now': '立即備份', 'Open this drive': '開啟呢個磁碟',
  'Show storage details': '顯示儲存詳情', 'Drive actions': '磁碟操作',
  'The drive list could not be read. The details below still work.': '讀唔到磁碟清單，下面嘅詳情仍然可以用。',
  'Loading the drive list…': '載入緊磁碟清單…', 'Retention, pruning and the tag count arrive in a later update.': '保留規則、清理同標籤數量會喺之後嘅更新推出。'
});

/**
 * The Docker Hub backup page header and drive table, grouped by repository. Every figure comes from the host's backup
 * plan (drive, repository, visibility, whether backup is on, last backup). Retention, pruning, tag counts and moving a
 * drive to its own repository need backend work that does not exist yet, so they are not shown as if they did.
 * The full storage, sign-in, snapshot and conflict panels stay below this overview.
 */
export function mountHubOverview(host, {services = {}, getLanguage = () => 'en', onBackupAll = () => {}, onRestore = () => {}, onShowDetails = () => {}, onOpenDrive = () => {}, onSettings = () => {}} = {}) {
  const doc = host.ownerDocument;
  const L = key => localized(text(key, HUB_OVERVIEW_COPY[key] ?? key), getLanguage());
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else node.setAttribute(key, value); } node.append(...children); return node; };
  const root = el('div', {class: 'hub-overview'});
  host.prepend(root);
  let plan = null, failed = false, generation = 0;
  const time = value => { if (!value) return L('Never'); const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString(getLanguage() === 'yue' ? 'zh-HK' : 'en', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : L('Never'); };
  const statusOf = drive => drive.ineligibleReason === 'locked' ? L('Locked') : drive.ineligibleReason === 'no-storage' ? L('No encrypted storage') : drive.ineligibleReason === 'not-folder' ? L('Not a folder drive') : !drive.configured ? L('Not backed up') : drive.lastSync ? L('Backed up') : L('Waiting for the first backup');
  function rowMenu(anchor, event, drive) {
    openContextMenu({anchor, event, target: anchor, language: getLanguage(), items: [
      {id: 'hub:backup', label: text('Back up now', HUB_OVERVIEW_COPY['Back up now']), disabled: Boolean(drive.ineligibleReason), run: () => onBackupAll()},
      {id: 'hub:open', label: text('Open this drive', HUB_OVERVIEW_COPY['Open this drive']), run: () => onOpenDrive(drive.sessionId)},
      {id: 'hub:details', label: text('Show storage details', HUB_OVERVIEW_COPY['Show storage details']), run: () => onShowDetails()}
    ]});
  }
  function driveRow(drive) {
    const menu = el('md-icon-button', {class: 'row-menu', 'aria-label': `${L('Drive actions')}: ${drive.name}`, title: L('Drive actions')}, [el('span', {text: '⋯', 'aria-hidden': 'true'})]);
    menu.addEventListener('click', event => rowMenu(menu, event, drive));
    const tr = el('tr', {'data-session-id': drive.sessionId, 'data-state': drive.ineligibleReason || (drive.configured?.enabled ? 'on' : 'off')}, [
      el('td', {class: 'name'}, [el('strong', {text: drive.letter ? `${drive.letter.replace(/[:\\]+$/, '')}: ` : ''}), doc.createTextNode(drive.name || drive.sessionId)]),
      el('td', {text: time(drive.lastSync)}), el('td', {class: 'status', text: statusOf(drive)}),
      el('td', {class: 'backup', text: drive.configured ? L(drive.configured.enabled ? 'Backup on' : 'Backup off') : '-'}), el('td', {class: 'menu'}, [menu])]);
    tr.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); rowMenu(tr, event, drive); });
    return tr;
  }
  function render() {
    const toolbar = el('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': L('Docker Hub backup commands')});
    const backupAll = el('md-filled-button', {id: 'hub-backup-all', type: 'button'}, [el('span', {text: L('Back up all now')})]);
    backupAll.addEventListener('click', () => onBackupAll());
    const restore = el('md-text-button', {id: 'hub-restore', type: 'button'}, [el('span', {text: L('Restore…')})]);
    restore.addEventListener('click', () => onRestore());
    const refresh = el('md-text-button', {id: 'hub-refresh', type: 'button'}, [el('span', {text: L('Refresh')})]);
    refresh.addEventListener('click', () => void load());
    const settings = el('md-text-button', {id: 'hub-settings', type: 'button', class: 'end'}, [el('span', {text: L('Backup settings')})]);
    settings.addEventListener('click', () => onSettings());
    toolbar.append(backupAll, restore, refresh, settings);
    const head = el('thead', {}, [el('tr', {}, ['Drive', 'Last backup', 'Status', 'Backup', ''].map(label => el('th', {scope: 'col', text: label ? L(label) : ''})))]);
    const body = el('tbody');
    if (!plan) body.append(el('tr', {}, [el('td', {colspan: '5', class: 'note', text: L(failed ? 'The drive list could not be read. The details below still work.' : 'Loading the drive list…')})]));
    else {
      const groups = new Map();
      for (const drive of plan.drives) { const key = drive.configured?.repository || ''; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(drive); }
      for (const [repository, drives] of [...groups].sort((a, b) => (a[0] === '') - (b[0] === '') || a[0].localeCompare(b[0]))) {
        const visibility = drives[0].configured?.visibility;
        body.append(el('tr', {class: 'group-row'}, [el('th', {scope: 'colgroup', colspan: '5'}, [el('span', {class: repository ? 'repository' : '', text: repository || L('Not backed up')}), ...(repository ? [el('span', {class: 'chip', text: L(visibility === 'private' ? 'Private' : 'Public')})] : []), el('span', {class: 'muted', text: drives.length === 1 ? L('1 drive') : L('{count} drives').replace('{count}', String(drives.length))})])]));
        for (const drive of drives) body.append(driveRow(drive));
      }
    }
    root.replaceChildren(toolbar, el('table', {class: 'hub-overview-table', 'aria-label': L('Backup')}, [head, body]), el('p', {class: 'hub-overview-note', text: L('Retention, pruning and the tag count arrive in a later update.')}));
  }
  async function load() {
    const request = ++generation;
    if (typeof services.backupAllPlan !== 'function') { failed = true; render(); return; }
    try { const value = backupAllPlan(await services.backupAllPlan()); if (request !== generation) return; plan = value; failed = false; }
    catch { if (request !== generation) return; failed = true; }
    render();
  }
  render(); void load();
  return {refresh: load, setLanguage: render, destroy() { generation++; root.remove(); }};
}
