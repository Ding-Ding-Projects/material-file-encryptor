// Library tab: named expressions saved locally for this search field, with description,
// replacement and flavor, parameter substitution, JSON import/export and optional history.
import { element } from '../../registry.js';
import { listParameters, applyParameters } from '../library.js';
import { heading, panel, downloadText, copyText } from './shared.js';

export const id = 'library';
export const label = ['Library', '資料庫'];

export function mount(ctx) {
  const t = ctx.t;
  const store = ctx.store;
  const name = element('md-outlined-text-field', { label: t('Name', '名稱'), maxLength: 80 });
  const description = element('md-outlined-text-field', { label: t('Description', '說明'), maxLength: 500 });
  const find = element('md-outlined-text-field', { label: t('Search saved expressions', '搜尋已儲存表達式'), maxLength: 120 });
  const list = element('div', { class: 'stack' });
  const params = element('div', { class: 'stack' });
  const recent = element('div', { class: 'stack' });
  const status = element('p', { role: 'status', 'aria-live': 'polite' });
  const file = element('input', { type: 'file', hidden: true, accept: 'application/json,.json', onchange: async () => {
    const picked = file.files?.[0]; file.value = '';
    if (!picked) return;
    try { if (picked.size > 131072) throw Error(t('Import exceeds 128 KiB.', '匯入超過 128 KiB。')); store.import(JSON.parse(await picked.text())); status.textContent = t('Imported.', '已匯入。'); }
    catch (error) { status.textContent = error.message || t('Invalid snippet document.', '範本檔案無效。'); }
    render();
  } });
  const history = element('md-switch', { selected: store.get().rememberHistory, 'aria-label': t('Remember expression history', '記住表達式記錄'), onchange: () => { store.setHistory(history.selected); render(); } });

  function load(entry, pattern) {
    ctx.setPattern(pattern, { flags: entry.flags });
    if (entry.replacement !== undefined) { ctx.state.replacement = entry.replacement; ctx.recordReplacement(); }
    if (entry.flavor) ctx.setFlavor(entry.flavor);
    status.textContent = t(`Loaded "${entry.name}".`, `已載入「${entry.name}」。`);
  }

  function parameterForm(entry) {
    params.replaceChildren();
    const names = listParameters(entry.pattern);
    const fields = names.map(p => element('md-outlined-text-field', { label: p.name, value: p.default, maxLength: 128 }));
    names.forEach((p, i) => { fields[i].dataset.name = p.name; });
    params.append(element('p', { text: t(`Fill in the parameters for "${entry.name}". Values are inserted as literal text.`, `請填寫「${entry.name}」的參數，數值會以純文字插入。`) }), ...fields,
      element('md-filled-button', { text: t('Apply parameters', '套用參數'), onclick: () => {
        const values = {}; for (const f of fields) values[f.dataset.name] = f.value;
        params.replaceChildren(); load(entry, applyParameters(entry.pattern, values));
      } }));
  }

  function render() {
    const state = store.get();
    list.replaceChildren(); recent.replaceChildren();
    const matches = store.search(find.value);
    for (const entry of matches) {
      const index = state.snippets.findIndex(s => s.name === entry.name && s.pattern === entry.pattern);
      const parameters = listParameters(entry.pattern).length > 0;
      list.append(element('div', { class: 'row' }, [
        element('md-outlined-button', { text: entry.name, 'aria-label': `${t('Load', '載入')} ${entry.name}`, onclick: () => parameters ? parameterForm(entry) : load(entry, entry.pattern) }),
        element('span', { class: 'muted', text: [entry.description, entry.flavor && entry.flavor !== 'javascript' ? entry.flavor : '', parameters ? t('has parameters', '含參數') : ''].filter(Boolean).join(' · ') }),
        element('md-text-button', { text: t('Copy', '複製'), onclick: () => copyText(ctx, JSON.stringify({ pattern: entry.pattern, flags: entry.flags })) }),
        element('md-text-button', { text: t('Remove', '移除'), onclick: () => { store.remove(index); render(); } })]));
    }
    if (!matches.length) list.append(element('p', { class: 'muted', text: t('No saved expressions match.', '沒有符合的已儲存表達式。') }));
    for (const entry of ctx.history.recent(10)) {
      if (!entry.pattern) continue;
      recent.append(element('md-text-button', { text: `${entry.pattern.slice(0, 60)} /${entry.flags}`, onclick: () => ctx.setPattern(entry.pattern, { flags: entry.flags }) }));
    }
    for (const entry of state.history) recent.append(element('md-text-button', { text: `${entry.pattern.slice(0, 60)} /${entry.flags}`, onclick: () => ctx.setPattern(entry.pattern, { flags: entry.flags }) }));
  }
  find.addEventListener('input', render);

  const node = panel(id, [heading(ctx, 'Saved expressions', '已儲存表達式'),
    element('p', { class: 'muted', text: t('Use {{name}} or {{name|default}} inside a saved expression to make a parameter. Test text is never saved.', '在已儲存表達式內使用 {{name}} 或 {{name|default}} 建立參數。測試文字不會被儲存。') }),
    name, description,
    element('div', { class: 'row' }, [
      element('md-filled-button', { text: t('Save expression', '儲存表達式'), onclick: () => {
        const ok = store.add(name.value || t('Expression', '表達式'), ctx.pattern, ctx.flags, { description: description.value, replacement: ctx.state.replacement, flavor: ctx.state.flavor });
        status.textContent = ok ? t('Saved locally.', '已儲存在本機。') : t('That expression is invalid and was not saved.', '表達式無效，未有儲存。'); render();
      } }),
      element('md-text-button', { text: t('Import', '匯入'), onclick: () => file.click() }), file,
      element('md-text-button', { text: t('Export', '匯出'), onclick: () => downloadText('regex-library.json', store.export()) }),
      element('md-text-button', { text: t('Clear saved expressions', '清除已儲存表達式'), onclick: () => { store.clear(); render(); } })]),
    find, params, list, status,
    element('label', { class: 'row' }, [history, document.createTextNode(t('Remember expression history on this device (no test text)', '在此裝置記住表達式記錄（不包括測試文字）'))]),
    heading(ctx, 'Recent expressions', '最近使用的表達式'), recent]);
  return { node, refresh: render };
}
