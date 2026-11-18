import {localized, text} from '../../../shared/surface/registry.js';
import {SETTINGS_LAYOUT_COPY as C} from './copy.js';

/**
 * Settings as a real settings layout: a category list (with the settings search above it) and one category of dense
 * rows at a time. The categories are the existing settings sections, plus Backup and Updates, plus links to the pages
 * that own their own settings (Personalization, Local access). While the search has text every section is shown, so
 * the search still reaches every setting.
 *
 * Backup rows that need backend support that does not exist yet are shown disabled with "Coming in a later update";
 * nothing here pretends to save a value it cannot keep.
 */
export function mountSettingsLayout(view, {getLanguage = () => 'en', openView = () => {}, getBackupStatus = async () => null} = {}) {
  const doc = view.ownerDocument;
  const L = key => localized(text(key, C[key] ?? key), getLanguage());
  const el = (tag, props = {}, children = []) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key === 'class') node.className = value; else if (key === 'disabled') node.disabled = value; else node.setAttribute(key, value); } node.append(...children); return node; };
  const header = view.querySelector('.page-header');
  const search = [...view.children].find(node => node.localName === 'mfe-search');
  const sections = [...view.querySelectorAll(':scope > .settings-section')];
  const backup = el('div', {class: 'settings-section settings-generated', id: 'backup-settings', 'data-settings-category': 'backup'});
  const updates = el('div', {class: 'settings-section settings-generated', id: 'updates-settings', 'data-settings-category': 'updates'});
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
    {id: 'backup', label: L('Backup')}, {id: 'updates', label: L('Updates')},
    {id: 'link:personalization', label: L('Personalization'), view: 'personalization'},
    {id: 'link:access', label: L('Local access'), view: 'access'}
  ];
  function row(label, description, control, {comingLater = false} = {}) {
    const copy = el('div', {class: 'setting-copy'}, [el('span', {class: 'setting-label', text: label})]);
    if (description) copy.append(el('span', {class: 'setting-description', text: description}));
    const end = el('div', {class: 'setting-control'}, [control]);
    if (comingLater) end.append(el('span', {class: 'coming-later', text: L('Coming in a later update')}));
    return el('div', {class: 'setting-row v2-setting-row'}, [copy, end]);
  }
  function disabledSwitch(label) { const node = el('md-switch', {'aria-label': label}); node.disabled = true; return node; }
  function renderBackup() {
    const signedIn = status?.signedIn ?? status?.account ? true : false;
    const account = status?.account || status?.username || '';
    const openStorage = el('md-outlined-button', {type: 'button', id: 'settings-open-backup'}, [el('span', {text: L('Open Docker Hub backup')})]);
    openStorage.addEventListener('click', () => openView('storage'));
    const backupNow = el('md-filled-button', {type: 'button', id: 'settings-backup-now'}, [el('span', {text: L('Back up drives now')})]);
    backupNow.addEventListener('click', () => openView('storage'));
    const accountValue = el('span', {class: 'setting-value', text: signedIn && account ? account : L('Sign in on the Docker Hub backup page.')});
    backup.replaceChildren(
      el('h2', {text: L('Backup')}),
      el('div', {class: 'settings-section-actions'}, [backupNow]),
      row(L('Docker Hub account'), '', el('div', {class: 'setting-inline'}, [accountValue, openStorage])),
      row(L('Back up drives automatically'), L('New and existing drives back up to Docker Hub after changes.'), disabledSwitch(L('Back up drives automatically')), {comingLater: true}),
      row(L('Back up after changes'), L('Waits until the drive is quiet, then uploads only what changed.'), el('span', {class: 'setting-value muted', text: L('1 minute after the drive goes idle')}), {comingLater: true}),
      row(L('Back up when a drive locks'), L('Also runs when the app closes with changes waiting.'), disabledSwitch(L('Back up when a drive locks')), {comingLater: true}),
      row(L('Keep snapshots for each drive'), L('Older snapshots are removed after each successful backup.'), el('span', {class: 'setting-value muted', text: L('Latest 10, 1 per day for 7 days, 1 per week for 8 weeks')}), {comingLater: true}),
      row(L('Back up now'), L('Back up every drive that has changes from the Docker Hub backup page.'), el('span', {class: 'setting-value', text: L('Available today')}))
    );
  }
  function renderUpdates() {
    const open = el('md-filled-button', {type: 'button', id: 'settings-open-updates'}, [el('span', {text: L('Check for updates')})]);
    open.addEventListener('click', () => openView('updates'));
    updates.replaceChildren(
      el('h2', {text: L('Updates')}),
      row(L('Check for updates'), L('See the installed version, check for a new one and choose when it installs.'), open),
      row(L('Signature'), L('This app is not code-signed, so Windows may ask before the first launch of an update.'), el('span', {class: 'setting-value muted', text: L('Unsigned')}))
    );
  }
  function renderNav() {
    list.replaceChildren(...categories().map(category => {
      const button = el('md-text-button', {type: 'button', role: 'tab', class: 'settings-category', 'data-category': category.id, 'aria-selected': String(!searching && category.id === active)});
      button.append(el('span', {text: category.label}));
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
    for (const button of list.querySelectorAll('.settings-category')) button.setAttribute('aria-selected', String(!searching && button.dataset.category === active));
  }
  function select(id) { active = id; apply(); content.scrollTop = 0; }
  search?.addEventListener('search-change', () => { searching = Boolean(search.query); apply(); });
  function render() { renderBackup(); renderUpdates(); renderNav(); apply(); }
  render();
  Promise.resolve().then(getBackupStatus).then(value => { status = value; renderBackup(); apply(); }, () => {});
  return {setLanguage: render, select, destroy() { layout.remove(); }};
}
