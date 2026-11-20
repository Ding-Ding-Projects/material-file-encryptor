import {openContextMenu} from '../../../shared/surface/overlay.js';
import {text} from '../../../shared/surface/registry.js';
import {icon, withIcon} from '../../icons.js';
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

  const slotIcon = name => { const glyph = icon(name); glyph.setAttribute('slot', 'icon'); return glyph; };
  host.classList.add('drive-list-view');
  const toolbar = node('div', {class: 'v2-toolbar', role: 'toolbar', 'aria-label': t('Drive commands')});
  const newButton = node('md-filled-button', {id: 'drive-new-menu', 'aria-haspopup': 'menu', type: 'button', 'has-icon': ''});
  const newLabel = node('span', {text: t('New')});
  newButton.append(slotIcon('add'), newLabel, node('span', {class: 'caret', 'aria-hidden': 'true', text: '▾'}));
  const secondary = card.querySelector('.unlock-secondary');
  const settingsButton = node('md-text-button', {id: 'drive-list-settings', type: 'button', 'has-icon': ''});
  const settingsLabel = node('span', {text: t('Drive settings')});
  settingsButton.append(slotIcon('settings'), settingsLabel);
  toolbar.append(newButton);
  // Unlock existing drive and Create a drive stay as the real controls their dialogs are wired to, but the toolbar shows
  // only New: its menu reaches both, so the toolbar keeps one primary and no duplicates.
  const hiddenActions = node('div', {class: 'drive-list-hidden-actions', hidden: ''});
  if (secondary) hiddenActions.append(...secondary.children);
  toolbar.append(settingsButton);
  secondary?.remove();
  host.append(hiddenActions);
  const unlockExisting = () => $('unlock-button')?.click();
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
  const missing = node('div', {class: 'unlock-missing', hidden: ''});
  const chooseStorage = node('md-outlined-button', {id: 'unlock-choose-storage', type: 'button'});
  const chooseLabel = node('span', {text: t('Choose storage folder…')});
  chooseStorage.append(chooseLabel);
  withIcon(chooseStorage, 'folder');
  const missingNote = node('span', {class: 'unlock-missing-note', text: t('or use New to make a drive.')});
  missing.append(chooseStorage, missingNote);
  card.querySelector('.unlock-head')?.after(missing);
  listen(chooseStorage, 'click', () => unlockExisting());
  // Show or hide the password while typing it.
  const passwordField = $('unlock-password');
  const showPassword = node('md-text-button', {id: 'unlock-show-password', type: 'button', 'aria-pressed': 'false'});
  const showLabel = node('span', {text: t('Show')});
  showPassword.append(showLabel);
  passwordField?.after(showPassword);
  listen(showPassword, 'click', () => { const shown = passwordField.type === 'text'; passwordField.type = shown ? 'password' : 'text'; showPassword.setAttribute('aria-pressed', String(!shown)); showLabel.textContent = t(shown ? 'Show' : 'Hide'); });

  let state = null, lastSignature = '';
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
      const art = hooks.appearance?.(session.sessionId);
      let mark = icon('drive');
      if (art?.icon) { mark = doc.createElement('img'); mark.className = 'drive-icon'; mark.src = art.icon; mark.alt = ''; mark.width = 24; mark.height = 24; }
      if (art?.banner) { row.classList.add('has-banner'); row.style.setProperty('--drive-banner', `url("${art.banner}")`); }
      nameCell.append(mark, node('strong', {text: letter ? `${letter} ` : ''}), doc.createTextNode(name));
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
    missing.hidden = Boolean(state?.storageDir) || !state?.locked;
    renderDetails(rows.find(session => session.sessionId === state?.sessionId));
  }
  function renderDetails(session) {
    details.replaceChildren(node('p', {class: 'pane-label', text: t('Details')}));
    if (!session) { details.append(node('p', {class: 'muted', text: t('Select a drive to see its details.')})); return; }
    const letter = driveLetterLabel(session.driveLetter);
    details.append(node('p', {class: 'inspector-name', text: [letter, session.driveName].filter(Boolean).join(' ')}), node('p', {class: 'muted', text: stateLabel(session)}));
    if (hooks.openAppearance) { const change = node('md-outlined-button', {text: t('Icon and banner…'), class: 'drive-appearance-button'}); withIcon(change, 'image'); change.addEventListener('click', () => hooks.openAppearance(session.sessionId)); details.append(change); }
    if (hooks.openStorage) { const open = node('md-outlined-button', {text: t('Open encrypted storage folder'), class: 'drive-appearance-button'}); withIcon(open, 'folder'); open.addEventListener('click', () => hooks.openStorage(session.sessionId)); details.append(open); }
    const list = node('dl', {class: 'drive-list-facts'});
    const fact = (label, value, which) => {
      if (!value) return;
      const dd = node('dd', {class: which ? 'drive-list-path' : '', title: value}, [node('span', {class: 'drive-list-path-text', text: value})]);
      // Each folder has its own Open button beside its path, so the path is never just text to copy by hand.
      if (which && hooks.openStorage) { const open = node('md-text-button', {class: 'drive-list-path-open', 'data-open': which, 'aria-label': t(which === 'cache' ? 'Open encrypted cache folder' : 'Open encrypted storage folder')}, [node('span', {text: t('Open')})]); withIcon(open, 'folder'); open.addEventListener('click', () => hooks.openStorage(session.sessionId, which)); dd.append(open); }
      list.append(node('dt', {text: t(label)}), dd);
    };
    fact('Encrypted storage', state?.storageDir || '', 'storage');
    fact('Encrypted cache', state?.cacheDir || '', 'cache');
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
    {id: 'new:open', label: text('Open drive from Docker Hub', SHELL_COPY['Open drive from Docker Hub']), description: text('Restore a drive that is already on Docker Hub.', SHELL_COPY['Restore a drive that is already on Docker Hub.']), run: () => hooks.openHubDrive()},
    {id: 'new:existing', label: text('Unlock existing drive', SHELL_COPY['Unlock existing drive'] || '解鎖現有磁碟'), description: text('Choose the encrypted storage folder of a drive made earlier.', SHELL_COPY['Choose the encrypted storage folder of a drive made earlier.']), run: unlockExisting}
  ]}));
  listen(settingsButton, 'click', () => hooks.openSettings());
  return {
    // Rows animate in, so they are rebuilt only when what they show changes, not on every state tick.
    update(next) { state = next; const signature = JSON.stringify([hooks.appearanceVersion?.() ?? 0, state?.sessionId, state?.storageDir, state?.cacheDir, sessions().map(session => [session.sessionId, session.driveName, session.driveLetter, session.locked, session.mounted, Boolean(session.operation), Boolean(session.recoveryRequired)])]); if (signature === lastSignature) return; lastSignature = signature; render(); },
    setLanguage() { lastSignature = ''; chooseLabel.textContent = t('Choose storage folder…'); missingNote.textContent = t('or use New to make a drive.'); showLabel.textContent = t(passwordField?.type === 'text' ? 'Hide' : 'Show'); newLabel.textContent = t('New'); settingsLabel.textContent = t('Drive settings'); toolbar.setAttribute('aria-label', t('Drive commands')); table.setAttribute('aria-label', t('Drives')); headCells.forEach((cell, index) => { cell.textContent = t(columns[index][1]); }); details.setAttribute('aria-label', t('Details')); render(); },
    destroy() { for (const dispose of disposers.splice(0)) dispose(); }
  };
}
