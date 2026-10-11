import { filterVersions, compareText, selectedVersions } from './model.js';
import { createVersionSearch } from './version-search.js';

export function mountFileDetails(root, { services, translate = value => value } = {}) {
 if (!root || !services) throw new TypeError('File details requires a root and services.');
 let entry = null, tab = 'versions', versions = [], visibleVersions = [], activity = [], cursor = null, generation = 0, destroyed = false, busy = false;
 const versionSearch = createVersionSearch();
 const chosen = new Set(), filters = { from: '', to: '', pattern: '', action: '' };
 const doc = root.ownerDocument;
 const element = (tag, text, attributes = {}) => {
  const node = doc.createElement(tag); if (text != null) node.textContent = translate(text);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
 };
 const shell = element('section', null, { class: 'file-details', 'aria-label': translate('Selected file details') });
 const title = element('h2', 'Select a file');
 const tabs = element('div', null, { role: 'tablist', 'aria-label': translate('File details') });
 const versionTab = element('button', 'Versions', { type: 'button', role: 'tab' });
 const activityTab = element('button', 'Activity', { type: 'button', role: 'tab' });
 tabs.append(versionTab, activityTab);
 const controls = element('div', null, { class: 'file-details-filters' });
 function input(label, type, key) {
  const wrapper = element('label', label), field = element('input', null, { type });
  field.addEventListener('change', () => { filters[key] = field.value; void refresh(); }); wrapper.append(field); controls.append(wrapper); return field;
 }
 input('From date (UTC)', 'date', 'from'); input('Through date (UTC)', 'date', 'to');
 input('Regular expression', 'search', 'pattern').maxLength = 256;
 const action = element('select', null, { 'aria-label': translate('Activity type') });
 for (const type of ['', 'import', 'edit', 'rename', 'restore', 'cancel', 'sync', 'delete', 'create', 'export', 'label']) action.append(element('option', type || 'All activity', { value: type }));
 action.addEventListener('change', () => { filters.action = action.value; void refresh(); }); controls.append(action);
 const toolbar = element('div', null, { class: 'file-details-actions' });
 const status = element('p', '', { role: 'status', 'aria-live': 'polite' });
 const list = element('div', null, { role: 'tabpanel', tabindex: '0' });
 const preview = element('pre', '', { class: 'file-details-preview', tabindex: '0', 'aria-label': translate('Version preview') });
 const more = element('button', 'Load more activity', { type: 'button' });
 shell.append(title, tabs, controls, toolbar, status, list, preview, more); root.replaceChildren(shell);
 function fail(error) { status.textContent = error instanceof Error ? error.message : String(error); }
 function button(label, callback, enabled = true) {
  const node = element('button', label, { type: 'button' }); node.disabled = !enabled || busy;
  node.addEventListener('click', () => void perform(callback)); return node;
 }
 async function perform(callback) {
  if (busy || !entry) return;
  busy = true; render();
  try { await callback(); } catch (error) { fail(error); } finally { busy = false; if (!destroyed) render(); }
 }
 async function showPreview() {
  const request = generation;
  const selected = selectedVersions(visibleVersions, chosen);
  const texts = await Promise.all(selected.map(row => services.previewVersion(row.id)));
  if (destroyed || request !== generation) return;
  preview.textContent = texts.length === 2 ? compareText(texts[0].text ?? texts[0], texts[1].text ?? texts[1]) : String(texts[0]?.text ?? texts[0] ?? '');
 }
 function render() {
  if (destroyed) return;
  title.textContent = entry ? `${translate('File details')}: ${entry.path || entry.name || entry.entryId}` : translate('Select a file');
  versionTab.setAttribute('aria-selected', String(tab === 'versions')); activityTab.setAttribute('aria-selected', String(tab === 'activity'));
  action.hidden = tab !== 'activity'; toolbar.replaceChildren(); list.replaceChildren();
  more.hidden = tab !== 'activity' || !cursor; more.disabled = busy;
  if (!entry) { status.textContent = translate('Select a file to view its recorded versions and activity.'); return; }
  if (tab === 'versions') {
   const rows = visibleVersions;
   const selected = selectedVersions(rows, chosen);
   toolbar.append(button('Select visible', () => { rows.forEach(row => chosen.add(row.id)); }), button('Clear selection', () => chosen.clear()));
   toolbar.append(button('Preview / compare', showPreview, !!services.previewVersion && selected.length > 0 && selected.length <= 2));
   toolbar.append(button('Export selected', async () => { for (const row of selected) await services.exportVersion(row.id); }, !!services.exportVersion && selected.length > 0));
   toolbar.append(button('Restore selected', async () => { for (const row of selected) await services.restoreVersion(row.id); await refresh(); }, !!services.restoreVersion && selected.length > 0));
   for (const row of rows) {
    const item = element('article', null, { class: 'file-details-row' });
    const label = element('label'), check = element('input', null, { type: 'checkbox' }); check.checked = chosen.has(row.id); check.disabled = busy;
    check.addEventListener('change', () => { if (check.checked) chosen.add(row.id); else chosen.delete(row.id); render(); });
    label.append(check, doc.createTextNode(`${new Date(row.timestampUtc).toLocaleString()} · ${row.path} · ${row.length} ${translate('bytes')}${row.isAvailable === false ? ` · ${translate('Content unavailable')}` : ''}`)); item.append(label);
    if (services.labelVersion) {
     const field = element('input', null, { type: 'text', maxlength: '120', 'aria-label': translate('Version label') }); field.value = row.label || '';
     item.append(field, button('Save label', async () => { await services.labelVersion(row.id, field.value); await refresh(); }));
    }
    list.append(item);
   }
   if (!rows.length) list.append(element('p', 'No recorded versions match these filters.'));
  } else {
   for (const row of activity) list.append(element('p', `${new Date(row.timestampUtc).toLocaleString()} · ${translate(row.action)} · ${row.path || ''}${row.detail ? ` · ${row.detail}` : ''}`));
   if (!activity.length) list.append(element('p', 'No recorded activity matches these filters.'));
  }
 }
 async function refresh(append = false) {
  const request = ++generation;
  versionSearch.cancel();
  if (!entry || destroyed) return;
  const id = entry.entryId || entry.id; status.textContent = translate('Loading…');
  if (tab === 'versions') { visibleVersions = []; render(); }
  try {
   if (tab === 'versions') {
    const result = await services.listVersions(id);
    if (request !== generation || destroyed) return;
    versions = result.filter(row => row.entryId === id);
    const filtered = await filterVersions(versions, filters, versionSearch);
    if (request !== generation || destroyed || filtered === null) return;
    visibleVersions = filtered;
   } else {
    const page = await services.listActivity({ entryId: id, action: filters.action || null, fromUtc: filters.from ? `${filters.from}T00:00:00Z` : null, toUtc: filters.to ? `${filters.to}T23:59:59.999Z` : null, pattern: filters.pattern || null, cursor: append ? cursor : null, limit: 100 });
    if (request !== generation || destroyed) return;
    activity = append ? [...activity, ...page.items] : page.items; cursor = page.nextCursor;
   }
   status.textContent = ''; render();
  } catch (error) { if (request === generation && !destroyed) fail(error); }
 }
 versionTab.addEventListener('click', () => { tab = 'versions'; preview.textContent = ''; render(); void refresh(); });
 activityTab.addEventListener('click', () => { tab = 'activity'; preview.textContent = ''; render(); void refresh(); });
 more.addEventListener('click', () => void refresh(true)); render();
 return { selectEntry(value) { generation++; versionSearch.cancel(); entry = value; chosen.clear(); versions = []; visibleVersions = []; activity = []; cursor = null; preview.textContent = ''; render(); return refresh(); }, refresh, destroy() { destroyed = true; generation++; versionSearch.cancel(); root.replaceChildren(); } };
}
