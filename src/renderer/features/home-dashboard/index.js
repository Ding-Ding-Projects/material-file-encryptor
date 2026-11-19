import {localized, text} from '../../../shared/surface/registry.js';
import {openContextMenu} from '../../../shared/surface/overlay.js';
import {HOME_DASHBOARD_COPY as C} from './copy.js';
import {withIcon} from '../../icons.js';

/**
 * Home as a status dashboard: a drives table with one action per drive, recent activity, what needs attention with
 * one fix each, and the quick ways to get a drive. It renders only what the shell already knows (the session
 * summaries, the status rows Home has always shown and the real activity rows); it never invents a figure.
 */
export function mountHomeDashboard(root, {hooks}) {
  const doc = root.ownerDocument;
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else if (key.startsWith('on')) node.addEventListener(key.slice(2), value); else node.setAttribute(key, value); } node.append(...children); return node; };
  const view = el('div', {class: 'home-dashboard'});
  root.append(view);
  let language = 'en';
  const L = key => localized(text(key, C[key] ?? key), language);
  const newMenu = (anchor, event) => openContextMenu({anchor, event, target: anchor, language, items: [
    {id: 'home:new-pc', label: text('New drive on this PC', C['New drive on this PC']), run: () => hooks.newOnThisPc()},
    {id: 'home:new-hub', label: text('New Docker Hub drive', C['New Docker Hub drive']), run: () => hooks.newHubDrive()},
    {id: 'home:open-hub', label: text('Open drive from Docker Hub', C['Open drive from Docker Hub']), run: () => hooks.openHubDrive()}
  ]});
  const panel = (title, extra = [], body = []) => el('section', {class: 'home-panel', 'aria-label': title}, [el('header', {class: 'home-panel-head'}, [el('h2', {text: title}), ...extra]), ...body]);
  const table = (columns, rows, label) => {
    const head = el('tr', {}, columns.map(column => el('th', {scope: 'col', text: L(column)})));
    return el('table', {class: 'home-table', 'aria-label': label}, [el('thead', {}, [head]), el('tbody', {}, rows)]);
  };
  let lastSignature = '';
  function render({language: next = 'en', state = null, status = {}, recent = null} = {}) {
    // Table rows animate in, so the view is rebuilt only when what it shows has changed.
    const signature = JSON.stringify([next, state?.sessionId, state?.offlineCount, (state?.sessions || []).map(session => [session.sessionId, session.driveName, session.driveLetter, session.locked, session.mounted, Boolean(session.recoveryRequired)]), state?.locked, state?.mounted, state?.driveName, status, recent]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    language = next;
    const sessions = state?.sessions?.length ? state.sessions : state ? [{sessionId: state.sessionId, driveName: state.driveName, driveLetter: state.driveLetter, locked: state.locked, mounted: state.mounted}] : [];
    const unlocked = sessions.filter(session => !session.locked).length;
    const toolbar = el('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': L('Home commands')}, [
      withIcon(el('md-filled-button', {id: 'home-new-menu', type: 'button', 'aria-haspopup': 'menu', onclick: event => newMenu(event.currentTarget, event)}, [el('span', {text: L('New')}), el('span', {class: 'caret', 'aria-hidden': 'true', text: '▾'})]), 'add'),
      withIcon(el('md-text-button', {id: 'home-backup-all', type: 'button', onclick: () => hooks.backupAll()}, [el('span', {text: L('Back up drives')})]), 'cloud_upload'),
      withIcon(el('md-text-button', {id: 'home-open-history', type: 'button', onclick: () => hooks.openView('history')}, [el('span', {text: L('Open history')})]), 'history')
    ]);
    if (!sessions.length) {
      const choices = el('div', {class: 'home-empty'}, [
        el('h2', {text: L('No drives yet')}), el('p', {text: L('Choose how to start. You can add more drives later.')}),
        el('div', {class: 'home-empty-actions'}, [
          withIcon(el('md-filled-button', {type: 'button', onclick: () => hooks.newHubDrive()}, [el('span', {text: L('New Docker Hub drive')})]), 'cloud'),
          withIcon(el('md-outlined-button', {type: 'button', onclick: () => hooks.newOnThisPc()}, [el('span', {text: L('New drive on this PC')})]), 'computer'),
          withIcon(el('md-outlined-button', {type: 'button', onclick: () => hooks.openHubDrive()}, [el('span', {text: L('Open drive from Docker Hub')})]), 'download')
        ])
      ]);
      view.replaceChildren(toolbar, el('div', {class: 'home-columns'}, [choices]));
      return;
    }
    const driveRows = sessions.map((session, index) => {
      const letter = /^[A-Za-z]/.test(String(session.driveLetter || '')) ? `${String(session.driveLetter)[0].toUpperCase()}:` : '';
      const name = session.driveName || `${L('Drive')} ${index + 1}`;
      const active = session.sessionId === state?.sessionId;
      const stateText = L(session.recoveryRequired ? 'Recovery required' : session.locked ? 'Locked' : session.mounted ? 'Mounted' : 'Unlocked');
      const offline = active && !session.locked ? String(Number(state?.offlineCount ?? 0) || 0) : '-';
      const action = withIcon(el('md-outlined-button', {type: 'button', class: 'row-action', onclick: () => hooks.openDrive(session.sessionId)}, [el('span', {text: L(session.locked ? 'Unlock' : 'Open')})]), session.locked ? 'lock_open' : 'open');
      return el('tr', {'data-state': session.locked ? 'locked' : session.mounted ? 'mounted' : 'unlocked'}, [
        el('td', {class: 'name'}, [el('strong', {text: letter ? `${letter} ` : ''}), doc.createTextNode(name)]),
        el('td', {class: 'state', text: stateText}), el('td', {class: 'numeric', text: offline}), el('td', {class: 'action'}, [action])
      ]);
    });
    const drives = panel(L('Drives'), [el('span', {class: 'muted', text: `${sessions.length} · ${L('{count} unlocked').replace('{count}', String(unlocked))}`})], [table(['Name', 'State', 'Offline', ''], driveRows, L('Drives'))]);
    const activityRows = (recent || []).slice(0, 12).map(row => {
      const when = row.time ? new Date(row.time) : null;
      const whenText = when && Number.isFinite(when.getTime()) ? when.toLocaleString(language === 'yue' ? 'zh-HK' : 'en', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
      const show = value => typeof value === 'object' && value ? localized(value, language) : String(value ?? '');
      return el('tr', {}, [el('td', {class: 'when', text: whenText}), el('td', {text: show(row.kind)}), el('td', {class: 'detail', text: show(row.what)})]);
    });
    const activity = panel(L('Recent activity'), [withIcon(el('md-text-button', {type: 'button', onclick: () => hooks.openView('history')}, [el('span', {text: L('Open history')})]), 'history')], [
      activityRows.length ? table(['When', 'Event', 'Detail'], activityRows, L('Recent activity')) : el('p', {class: 'home-note', text: recent === null ? L('Loading recent activity…') : L('No recent activity on this PC yet.')})
    ]);
    const attention = Object.entries(status).filter(([, row]) => row?.tone === 'warn' || row?.tone === 'error');
    const attentionList = el('ul', {class: 'home-attention'}, attention.map(([id, row]) => el('li', {}, [el('span', {class: 'attention-text', text: localized(row.text, language)}), withIcon(el('md-text-button', {type: 'button', onclick: () => hooks.openView(id === 'storage' ? 'storage' : 'drive')}, [el('span', {text: L('Fix')})]), 'settings')])));
    const needs = panel(L('Needs attention'), attention.length ? [el('span', {class: 'count', text: String(attention.length)})] : [], [attention.length ? attentionList : el('p', {class: 'home-note', text: L('Nothing needs attention.')})]);
    const statusRows = Object.entries(status).filter(([, row]) => row?.text).map(([id, row]) => el('div', {class: 'home-status-row', 'data-tone': row.tone || 'off'}, [el('span', {text: L(STATUS_LABELS[id] || id)}), el('span', {class: 'value', text: localized(row.text, language)})]));
    const statusPanel = panel(L('Status'), [], statusRows.length ? statusRows : [el('p', {class: 'home-note', text: L('Status appears once a drive is open.')})]);
    const quick = panel(L('Quick start'), [], [el('div', {class: 'home-quick'}, [
      withIcon(el('md-text-button', {type: 'button', onclick: () => hooks.newOnThisPc()}, [el('span', {text: L('New drive on this PC')})]), 'computer'),
      withIcon(el('md-text-button', {type: 'button', onclick: () => hooks.newHubDrive()}, [el('span', {text: L('New Docker Hub drive')})]), 'cloud'),
      withIcon(el('md-text-button', {type: 'button', onclick: () => hooks.openHubDrive()}, [el('span', {text: L('Open drive from Docker Hub')})]), 'download')
    ])]);
    view.replaceChildren(toolbar, el('div', {class: 'home-columns'}, [el('div', {class: 'home-main'}, [drives, activity]), el('div', {class: 'home-side'}, [needs, statusPanel, quick])]));
  }
  return {render, destroy() { view.remove(); }};
}
const STATUS_LABELS = {drive: 'Drive', offline: 'Available offline', history: 'History', storage: 'Encrypted storage'};
