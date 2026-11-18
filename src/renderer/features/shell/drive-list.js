import {openContextMenu} from '../../../shared/surface/overlay.js';
import {text} from '../../../shared/surface/registry.js';
import {icon} from '../../icons.js';
import {SHELL_COPY} from './copy.js';
import {driveLetterLabel, sessionTabState} from './workspace-chrome.js';

/**
 * The drive list shown while the open drive is locked. Every drive stays visible as a table row; the locked drive
 * gets the unlock bar right under its row, so unlocking never hides the other drives. The toolbar carries one filled
 * primary, New, whose menu offers the three ways to get a drive: on this PC, on Docker Hub, or opened from Docker Hub.
 * It shows only what the session summaries hold; it never reads drive contents.
 */
export function mountDriveList({doc = document, translate, getLanguage, hooks}) {
  const $ = id => doc.getElementById(id);
  const t = source => translate(source);
  const host = $('locked-state'), card = $('unlock-card');
  if (!host || !card) return {update() {}, destroy() {}};
  const disposers = [];
  const listen = (target, type, handler) => { if (!target) return; target.addEventListener(type, handler); disposers.push(() => target.removeEventListener(type, handler)); };
  const node = (tag, props = {}, children = []) => { const el = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') el.textContent = value; else if (key === 'class') el.className = value; else el.setAttribute(key, value); } el.append(...children); return el; };

  host.classList.add('drive-list-view');
  const toolbar = node('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': t('Drive commands')});
  const newButton = node('md-filled-button', {id: 'drive-new-menu', 'aria-haspopup': 'menu', type: 'button'});
  const newLabel = node('span', {text: t('New')});
  newButton.append(icon('add'), newLabel, node('span', {class: 'caret', 'aria-hidden': 'true', text: '▾'}));
  const secondary = card.querySelector('.unlock-secondary');
  const settingsButton = node('md-text-button', {id: 'drive-list-settings', type: 'button'});
  const settingsLabel = node('span', {text: t('Drive settings')});
  settingsButton.append(icon('settings'), settingsLabel);
  toolbar.append(newButton);
  if (secondary) toolbar.append(...secondary.children);
  toolbar.append(settingsButton);
  secondary?.remove();
  const summary = node('p', {class: 'drive-list-summary', role: 'status'});
  const table = node('table', {class: 'drive-list-table', 'aria-label': t('Drives')});
  const head = node('thead');
  const headRow = node('tr');
  const columns = [['name', 'Name'], ['state', 'State'], ['letter', 'Drive letter'], ['folder', 'Encrypted storage']];
  const headCells = columns.map(([key, label]) => node('th', {scope: 'col', 'data-column': key, text: t(label)}));
  headRow.append(...headCells); head.append(headRow);
  const body = node('tbody', {id: 'drive-list-rows'});
  table.append(head, body);
  const details = node('aside', {class: 'drive-list-details', 'aria-label': t('Details')});
  const main = node('div', {class: 'drive-list-main'}, [summary, node('div', {class: 'drive-list-scroll'}, [table])]);
  const layout = node('div', {class: 'drive-list-layout'}, [main, details]);
  host.prepend(toolbar, layout);
  card.classList.add('unlock-bar');

  let state = null;
  const sessions = () => state?.sessions?.length ? state.sessions : state ? [{sessionId: state.sessionId, driveName: state.driveName, driveLetter: state.driveLetter, locked: state.locked, mounted: state.mounted}] : [];
  const stateLabel = session => t(session.recoveryRequired ? 'Recovery required' : session.operation ? 'Working…' : session.locked ? 'Locked' : session.mounted ? 'Mounted' : 'Unlocked · not mounted');

  function render() {
    const rows = sessions();
    const unlocked = rows.filter(session => !session.locked).length;
    summary.textContent = `${t('Drives')} · ${rows.length} · ${t('{count} unlocked').replace('{count}', String(unlocked))}`;
    body.replaceChildren();
    rows.forEach((session, index) => {
      const active = session.sessionId === state?.sessionId;
      const row = node('tr', {'data-session-id': session.sessionId || '', 'data-state': sessionTabState(session), tabindex: active ? '0' : '-1', 'aria-selected': String(active)});
      if (active) row.classList.add('selected');
      const letter = driveLetterLabel(session.driveLetter);
      const name = session.driveName || `${t('Vault')} ${index + 1}`;
      const nameCell = node('td', {class: 'drive-name'});
      nameCell.append(icon('drive'), node('strong', {text: letter ? `${letter} ` : ''}), doc.createTextNode(name));
      const stateCell = node('td', {class: 'drive-state', 'data-state': sessionTabState(session)});
      stateCell.append(icon(session.locked ? 'lock' : 'lock_open'), doc.createTextNode(stateLabel(session)));
      const folder = active ? (state?.storageDir || '') : '';
      row.append(nameCell, stateCell, node('td', {text: letter || '-'}), node('td', {class: 'drive-folder', text: folder || (active ? t('Not chosen yet') : t('Shown when selected')), title: folder}));
      body.append(row);
      if (active && session.locked) {
        const barRow = node('tr', {class: 'unlock-bar-row'});
        const cell = node('td', {colspan: String(columns.length)});
        cell.append(card);
        barRow.append(cell);
        body.append(barRow);
      }
    });
    if (!rows.some(session => session.sessionId === state?.sessionId && session.locked) && card.parentNode !== host) host.append(card);
    renderDetails(rows.find(session => session.sessionId === state?.sessionId));
  }
  function renderDetails(session) {
    details.replaceChildren(node('p', {class: 'pane-label', text: t('Details')}));
    if (!session) { details.append(node('p', {class: 'muted', text: t('Select a drive to see its details.')})); return; }
    const letter = driveLetterLabel(session.driveLetter);
    details.append(node('p', {class: 'inspector-name', text: [letter, session.driveName].filter(Boolean).join(' ')}), node('p', {class: 'muted', text: stateLabel(session)}));
    const list = node('dl', {class: 'drive-list-facts'});
    const fact = (label, value) => { if (!value) return; list.append(node('dt', {text: t(label)}), node('dd', {text: value, title: value})); };
    fact('Encrypted storage', state?.storageDir || '');
    fact('Encrypted cache', state?.cacheDir || '');
    fact('Drive letter', letter);
    details.append(list);
  }
  listen(body, 'click', event => {
    const row = event.target.closest?.('tr[data-session-id]');
    if (row && row.dataset.sessionId && row.dataset.sessionId !== state?.sessionId) hooks.selectSession(row.dataset.sessionId);
  });
  listen(body, 'keydown', event => {
    const row = event.target.closest?.('tr[data-session-id]');
    if (!row) return;
    const rows = [...body.querySelectorAll('tr[data-session-id]')], index = rows.indexOf(row);
    const move = {ArrowDown: 1, ArrowUp: -1}[event.key];
    if (move) { event.preventDefault(); const next = rows[index + move]; if (next) { rows.forEach(item => { item.tabIndex = -1; }); next.tabIndex = 0; next.focus(); } }
    else if (event.key === 'Enter' && row.dataset.sessionId !== state?.sessionId) { event.preventDefault(); hooks.selectSession(row.dataset.sessionId); }
  });
  listen(newButton, 'click', event => openContextMenu({anchor: newButton, event, target: newButton, language: getLanguage(), items: [
    {id: 'new:pc', label: text('New drive on this PC', SHELL_COPY['New drive on this PC']), description: text('Encrypted folder on this computer.', SHELL_COPY['Encrypted folder on this computer.']), run: () => hooks.newOnThisPc()},
    {id: 'new:hub', label: text('New Docker Hub drive', SHELL_COPY['New Docker Hub drive']), description: text('No folder to choose; backed up to Docker Hub.', SHELL_COPY['No folder to choose; backed up to Docker Hub.']), run: () => hooks.newHubDrive()},
    {id: 'new:open', label: text('Open drive from Docker Hub', SHELL_COPY['Open drive from Docker Hub']), description: text('Restore a drive that is already on Docker Hub.', SHELL_COPY['Restore a drive that is already on Docker Hub.']), run: () => hooks.openHubDrive()}
  ]}));
  listen(settingsButton, 'click', () => hooks.openSettings());
  return {
    update(next) { state = next; render(); },
    setLanguage() { newLabel.textContent = t('New'); settingsLabel.textContent = t('Drive settings'); toolbar.setAttribute('aria-label', t('Drive commands')); table.setAttribute('aria-label', t('Drives')); headCells.forEach((cell, index) => { cell.textContent = t(columns[index][1]); }); details.setAttribute('aria-label', t('Details')); render(); },
    destroy() { for (const dispose of disposers.splice(0)) dispose(); }
  };
}
