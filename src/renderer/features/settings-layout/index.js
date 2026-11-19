import {localized, text} from '../../../shared/surface/registry.js';
import {SETTINGS_LAYOUT_COPY as C} from './copy.js';
import {withIcon} from '../../icons.js';

// One icon per settings category, in page order, so the category list reads like the redesign.
const CATEGORY_ICONS = {'section-0': 'lock', 'storage-settings': 'drive', 'section-2': 'palette', 'section-3': 'sync', 'section-4': 'text', 'sound-settings': 'play', 'section-6': 'book', backup: 'cloud_upload', updates: 'update'};

/**
 * Settings as a real settings layout: a category list (with the settings search above it) and one category of dense
 * rows at a time. The categories are the existing settings sections, plus Backup and Updates, plus links to the pages
 * that own their own settings (Personalization, Local access). While the search has text every section is shown, so
 * the search still reaches every setting.
 *
 * Backup rows read and save the automatic backup settings. Backing up while the app is closed still needs a decision
 * about a Windows scheduled task, so that one row stays disabled with "Coming in a later update";
 * nothing here pretends to save a value it cannot keep.
 */
const IDLE = [30, 60, 120, 300, 600, 1800];
const INTERVALS = [15, 30, 60, 120, 360, 720, 1440];
export function mountSettingsLayout(view, {getLanguage = () => 'en', openView = () => {}, getBackupStatus = async () => null, backupService = {}, embedUpdates = false} = {}) {
  let backupMessage = '';
  const doc = view.ownerDocument;
  const L = key => localized(text(key, C[key] ?? key), getLanguage());
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else if (key === 'disabled') node.disabled = value; else node.setAttribute(key, value); } node.append(...children); return node; };
  const header = view.querySelector('.page-header');
  const search = [...view.children].find(node => node.localName === 'mfe-search');
  const sections = [...view.querySelectorAll(':scope > .settings-section')];
  const backup = el('div', {class: 'settings-section settings-generated', id: 'backup-settings', 'data-settings-category': 'backup'});
  const updates = el('div', {class: 'settings-section settings-generated', id: 'updates-settings', 'data-settings-category': 'updates'});
  // The full update panel lives in this category, so there is one Updates place instead of a page and a category.
  const updatesHost = el('div', {class: 'settings-updates-panel', id: 'settings-updates-panel'});
  const nav = el('nav', {class: 'settings-categories'});
  const list = el('div', {class: 'settings-category-list', role: 'tablist', 'aria-orientation': 'vertical'});
  const content = el('div', {class: 'settings-content'});
  const layout = el('div', {class: 'settings-layout'}, [nav, content]);
  if (search) nav.append(search);
  nav.append(list);
  view.insertBefore(layout, header?.nextSibling || view.firstChild);
  // The settings page heading moves into the content column, above the selected category.
  const categoryTitle = el('h2', {class: 'settings-category-title'});
  content.append(categoryTitle, ...sections, backup, updates);
  if (header) header.classList.add('settings-page-header');
  sections.forEach((section, index) => { if (!section.dataset.settingsCategory) section.dataset.settingsCategory = section.id || `section-${index}`; });

  let active = sections[0]?.dataset.settingsCategory || 'backup', searching = false, status = null;
  const categories = () => [
    ...sections.map(section => ({id: section.dataset.settingsCategory, label: section.querySelector('h2')?.textContent?.trim() || section.id})),
    {id: 'backup', label: L('Backup')}, {id: 'updates', label: L('Updates')}
  ];
  // Personalization and Local access are pages of their own, reached from the tree under Settings, so they are not
  // repeated here as categories that leave the page.
  function row(label, description, control, {comingLater = false} = {}) {
    const copy = el('div', {class: 'setting-copy'}, [el('span', {class: 'setting-label', text: label})]);
    if (description) copy.append(el('span', {class: 'setting-description', text: description}));
    const end = el('div', {class: 'setting-control'}, [control]);
    if (comingLater) end.append(el('span', {class: 'coming-later', text: L('Coming in a later update')}));
    return el('div', {class: 'setting-row v2-setting-row'}, [copy, end]);
  }
  function disabledSwitch(label) { const node = el('md-switch', {'aria-label': label}); node.disabled = true; return node; }
  const withHelp = (node, description) => { if (description) { node.setAttribute('data-help-text', description); node.setAttribute('aria-description', description); } return node; };
  async function change(patch) {
    if (typeof backupService.update !== 'function') return;
    try { status = await backupService.update(patch); backupMessage = L('Saved.'); }
    catch (error) { backupMessage = String(error?.message || L('The setting could not be saved.')); }
    renderBackup(); apply();
  }
  function backupSwitch(label, description, key, value, disabled = false) {
    const node = withHelp(el('md-switch', {'aria-label': label, id: `settings-backup-${key}`}), description);
    node.selected = Boolean(value); node.disabled = disabled;
    node.addEventListener('change', () => void change({[key]: node.selected}));
    return node;
  }
  function backupSelect(label, description, key, value, options, disabled = false) {
    const node = withHelp(el('md-outlined-select', {'aria-label': label, id: `settings-backup-${key}`}), description);
    for (const [optionValue, optionLabel] of options) { const option = el('md-select-option', {value: String(optionValue)}, [el('div', {slot: 'headline', text: optionLabel})]); option.selected = String(optionValue) === String(value); node.append(option); }
    node.disabled = disabled;
    node.addEventListener('change', () => { const raw = node.value; void change({[key]: typeof value === 'number' ? Number(raw) : raw}); });
    return node;
  }
  const minutes = count => count < 60 ? L('{count} minutes').replace('{count}', count) : count === 60 ? L('1 hour') : count % 1440 === 0 ? (count === 1440 ? L('1 day') : L('{count} days').replace('{count}', count / 1440)) : L('{count} hours').replace('{count}', count / 60);
  const seconds = count => count < 60 ? L('{count} seconds after the drive goes idle').replace('{count}', count) : count === 60 ? L('1 minute after the drive goes idle') : L('{count} minutes after the drive goes idle').replace('{count}', count / 60);
  function retentionFields(settings, disabled) {
    const wrap = el('div', {class: 'setting-inline retention-fields'});
    const field = (key, label, min, max) => {
      const input = withHelp(el('md-outlined-text-field', {type: 'number', min: String(min), max: String(max), 'aria-label': label, id: `settings-retention-${key}`, class: 'retention-field'}), L('Only that drive\'s own snapshots from this PC are removed.'));
      input.value = String(settings.retention[key]); input.disabled = disabled;
      input.addEventListener('change', () => {
        const next = Number(input.value);
        if (!Number.isInteger(next) || next < min || next > max) { backupMessage = L('Enter a whole number from {min} to {max}.').replace('{min}', min).replace('{max}', max); renderBackup(); apply(); return; }
        void change({retention: {...settings.retention, [key]: next}});
      });
      return input;
    };
    const total = settings.retention.keepLatest + settings.retention.keepDaily + settings.retention.keepWeekly;
    wrap.append(el('span', {text: L('Latest')}), field('keepLatest', L('Latest snapshots to keep'), 1, 100), el('span', {text: L('· 1 per day for')}), field('keepDaily', L('Days to keep one snapshot per day'), 0, 60),
      el('span', {text: L('days · 1 per week for')}), field('keepWeekly', L('Weeks to keep one snapshot per week'), 0, 104), el('span', {text: L('weeks')}),
      el('span', {class: 'chip', text: L('{count} max per drive').replace('{count}', total)}));
    return wrap;
  }
  function renderBackup() {
    const signedIn = Boolean(status?.signedIn ?? status?.account);
    const account = status?.account || status?.username || '';
    const settings = status?.settings || null;
    const openStorage = el('md-outlined-button', {type: 'button', id: 'settings-open-backup'}, [el('span', {text: L('Open Docker Hub backup')})]);
    openStorage.addEventListener('click', () => openView('storage'));
    const backupNow = el('md-filled-button', {type: 'button', id: 'settings-backup-now'}, [el('span', {text: L('Back up all now')})]);
    backupNow.addEventListener('click', () => openView('storage'));
    const accountValue = el('span', {class: 'setting-value', text: signedIn && account ? account : L('Sign in on the Docker Hub backup page.')});
    const rows = [el('h2', {text: L('Backup')}), el('div', {class: 'settings-section-actions'}, [backupNow]),
      row(L('Docker Hub account'), '', el('div', {class: 'setting-inline'}, [accountValue, openStorage]))];
    if (!settings) {
      rows.push(row(L('Back up drives automatically'), L('Open the Docker Hub backup page to sign in and turn on automatic backup.'), disabledSwitch(L('Back up drives automatically'))));
    } else {
      const off = !settings.enabled;
      const autoDescription = L('New and existing drives back up to Docker Hub after changes. Turn off one drive on its row in Docker Hub backup.');
      rows.push(
        row(L('Back up drives automatically'), autoDescription, backupSwitch(L('Back up drives automatically'), autoDescription, 'enabled', settings.enabled && !status.noticeRequired, status.noticeRequired)),
        row(L('Back up after changes'), L('Waits until the drive is quiet, then uploads only what changed.'), backupSelect(L('Back up after changes'), L('Waits until the drive is quiet, then uploads only what changed.'), 'idleDelaySeconds', settings.idleDelaySeconds, IDLE.map(value => [value, seconds(value)]), off)),
        row(L('Also check every'), L('Catches anything missed, like changes made while offline.'), backupSelect(L('Also check every'), L('Catches anything missed, like changes made while offline.'), 'intervalMinutes', settings.intervalMinutes, INTERVALS.map(value => [value, minutes(value)]), off)),
        row(L('Back up when a drive locks'), L('Also runs when the app closes with changes waiting.'), backupSwitch(L('Back up when a drive locks'), L('Also runs when the app closes with changes waiting.'), 'onLock', settings.onLock, off)),
        row(L('Keep backing up when the app is closed'), L('Uses a Windows scheduled task under your account.'), disabledSwitch(L('Keep backing up when the app is closed')), {comingLater: true}),
        row(L('Repository layout'), L('Shared: up to 1,000 snapshots in total. One per drive: each drive gets its own repository.'), backupSelect(L('Repository layout'), L('Shared: up to 1,000 snapshots in total. One per drive: each drive gets its own repository.'), 'repositoryLayout', settings.repositoryLayout, [['shared', L('One shared repository')], ['per-drive', L('One repository per drive')]], off)),
        row(L('Default repository'), L('New drives back up here. It is created as public if it does not exist.'), el('div', {class: 'setting-inline'}, [el('code', {class: 'setting-value', text: account ? (settings.repositoryLayout === 'shared' ? `${account}/material-file-encryptor-storage` : `${account}/mfe-<drive>`) : '-'}), el('span', {class: 'chip', text: L('Public')})])),
        row(L('Keep snapshots for each drive'), L('Older ones are removed after each successful backup. Only that drive\'s own snapshots are touched.'), retentionFields(settings, false)),
        row(L('When a backup fails'), '', el('span', {class: 'setting-value', text: L('Retries by itself: 1, 5, 15 minutes, then every hour. Resumes when the connection returns.')}))
      );
    }
    rows.push(el('p', {class: 'setting-description', role: 'status', 'aria-live': 'polite', id: 'settings-backup-message', text: backupMessage}));
    backup.replaceChildren(...rows);
  }
  function renderUpdates() {
    const open = el('md-filled-button', {type: 'button', id: 'settings-open-updates'}, [el('span', {text: L('Check for updates')})]);
    open.addEventListener('click', () => openView('updates'));
    updates.replaceChildren(
      el('h2', {text: L('Updates')}),
      embedUpdates ? updatesHost : row(L('Check for updates'), L('See the installed version, check for a new one and choose when it installs.'), open),
      row(L('Signature'), L('This app is not code-signed, so Windows may ask before the first launch of an update.'), el('span', {class: 'setting-value muted', text: L('Unsigned')}))
    );
  }
  function renderNav() {
    list.replaceChildren(...categories().map(category => {
      const button = el('md-text-button', {type: 'button', role: 'tab', class: 'settings-category', 'data-category': category.id, 'aria-selected': String(!searching && category.id === active)});
      button.classList.toggle('is-selected', !searching && category.id === active);
      button.append(el('span', {text: category.label}));
      withIcon(button, CATEGORY_ICONS[category.id] || 'settings');
      button.addEventListener('click', () => { if (category.view) openView(category.view); else select(category.id); });
      button.addEventListener('keydown', event => {
        const buttons = [...list.querySelectorAll('.settings-category')], index = buttons.indexOf(button);
        const move = {ArrowDown: 1, ArrowUp: -1}[event.key];
        if (move) { event.preventDefault(); buttons[(index + move + buttons.length) % buttons.length]?.focus(); }
      });
      return button;
    }));
  }
  function apply() {
    const all = [...sections, backup, updates];
    for (const section of all) section.classList.toggle('settings-category-hidden', !searching && section.dataset.settingsCategory !== active);
    const current = categories().find(category => category.id === active);
    categoryTitle.textContent = searching ? L('Search results') : current?.label || '';
    if (searching) content.dataset.searching = ''; else delete content.dataset.searching;
    for (const button of list.querySelectorAll('.settings-category')) { const on = !searching && button.dataset.category === active; button.setAttribute('aria-selected', String(on)); button.classList.toggle('is-selected', on); }
  }
  // The backup status changes while the app runs (sign-in, the notice, every backup), so opening Backup reads it again.
  function refreshBackup() { return Promise.resolve().then(getBackupStatus).then(value => { if (value) { status = value; renderBackup(); apply(); } }, () => {}); }
  function select(id) { active = id; apply(); content.scrollTop = 0; if (id === 'backup') void refreshBackup(); }
  search?.addEventListener('search-change', () => { searching = Boolean(search.query); apply(); });
  function render() { renderBackup(); renderUpdates(); renderNav(); apply(); }
  render();
  void refreshBackup();
  return {setLanguage: render, select, updatesHost, destroy() { layout.remove(); }};
}
