// The New tab catalog dialog: one searchable list of every destination, tool, settings page and menu option.
//
// Search keeps its own state (query, pattern, flags and mode) in the embedded search control, which carries the
// full regular expression builder. The dialog only supplies rows and renders whatever the control keeps.
import { SurfaceElement, element, register, localized } from './registry.js';
import './search.js';
import { homeGlyph } from './home.js';
import { catalogRows, groupCatalog } from './new-tab-catalog-model.js';

export class NewTabCatalog extends SurfaceElement {
  constructor() { super(); this.entries = []; this.generation = 0; }
  connectedCallback() { this.render(); }
  /** entries: catalog entries; onChoose(entry) runs the chosen one; onOpenAll() opens every destination tab. */
  configure({ language, entries, onChoose, onOpenAll }) {
    Object.assign(this, { language: language || this.language, entries: entries || [], onChoose, onOpenAll });
    if (this.dialog?.open) this.refresh();
  }
  open(request = {}) {
    if (request.entries) this.configure({ ...request, language: request.language || this.language });
    if (!this.dialog) this.render();
    this.dialog.show();
    this.refresh();
    // Focus follows the dialog's own open animation, so move it after the first frame.
    const focus = () => this.search?.shadowRoot?.querySelector?.('md-outlined-text-field')?.focus?.();
    (globalThis.requestAnimationFrame || (fn => setTimeout(fn, 0)))(focus);
  }
  close() { this.dialog?.close(); }
  setLanguage(language) { this.language = language; if (this.dialog) { const open = this.dialog.open; this.render(); if (open) { this.dialog.show(); this.refresh(); } } }

  render() {
    this.style('md-dialog{width:min(720px,calc(100vw - 24px));max-height:90vh}.catalog{display:grid;gap:12px;min-width:0}h3{margin:12px 0 4px;font:500 14px/20px var(--mfe-font,system-ui);color:var(--md-sys-color-on-surface-variant,#555)}md-list{background:transparent;padding:0}.icon{display:inline-flex;inline-size:24px;block-size:24px;color:var(--md-sys-color-primary,#5466a8)}.badge{font-size:12px;color:var(--md-sys-color-on-surface-variant,#555)}.empty{margin:16px 0}.count{margin:0}md-list-item{--md-list-item-one-line-container-height:56px}');
    this.dialog = element('md-dialog', { 'aria-label': this.t('New tab catalog', '新分頁目錄') });
    this.search = element('mfe-search', { label: this.t('Search every page, tool and setting', '搜尋所有頁面、工具同設定'), scope: 'new-tab-catalog' });
    this.search.language = this.language;
    this.count = element('p', { class: 'count muted', role: 'status', 'aria-live': 'polite' });
    this.list = element('div', { class: 'groups' });
    const openAll = element('md-text-button', { text: this.t('Open every tab', '開啟所有分頁'), onclick: () => { this.onOpenAll?.(); this.refresh(); } });
    const close = element('md-text-button', { text: this.t('Close', '關閉'), onclick: () => this.close() });
    this.dialog.append(
      element('span', { slot: 'headline', text: this.t('New tab', '新分頁') }),
      element('div', { slot: 'content', class: 'catalog' }, [this.search, this.count, this.list]),
      element('div', { slot: 'actions' }, [openAll, close]));
    this.shadowRoot.append(this.dialog);
    this.search.addEventListener('search-change', () => this.refresh());
    this.refresh();
  }

  async refresh() {
    if (!this.list) return;
    const generation = ++this.generation;
    const found = await this.search.filter(catalogRows(this.entries));
    // A newer keystroke or a closed dialog supersedes this result, and null means the search itself was superseded.
    if (!found || generation !== this.generation) return;
    const keep = new Set(found.map(row => row.id));
    const groups = groupCatalog(this.entries.filter(entry => keep.has(entry.key)));
    const shown = groups.reduce((total, group) => total + group.entries.length, 0);
    this.count.textContent = shown
      ? this.t(`${shown} of ${this.entries.length} shown`, `顯示 ${shown} / ${this.entries.length} 項`)
      : this.t('Nothing matches your search.', '冇符合搜尋嘅項目。');
    const nodes = [];
    for (const group of groups) {
      nodes.push(element('h3', { text: localized(group.heading, this.language) }));
      const list = element('md-list', { 'aria-label': localized(group.heading, this.language) });
      for (const entry of group.entries) list.append(this.row(entry));
      nodes.push(list);
    }
    this.list.replaceChildren(...nodes);
  }

  row(entry) {
    const name = localized(entry.label, this.language);
    const description = entry.description ? localized(entry.description, this.language) : '';
    const item = element('md-list-item', { type: 'button', 'data-entry': entry.key, 'aria-label': entry.open ? `${name}, ${this.t('Opened', '已開啟')}` : name });
    if (entry.disabled === true) item.disabled = true;
    item.append(element('span', { slot: 'start', class: 'icon', 'aria-hidden': 'true' }, [homeGlyph(entry.icon)]));
    item.append(element('div', { slot: 'headline', text: name }));
    if (description) item.append(element('div', { slot: 'supporting-text', text: description }));
    const trailing = entry.open ? this.t('Opened', '已開啟') : entry.shortcut || '';
    if (trailing) item.append(element('span', { slot: 'trailing-supporting-text', class: 'badge', text: trailing }));
    item.addEventListener('click', () => { if (entry.disabled) return; this.close(); this.onChoose?.(entry); });
    return item;
  }
}
register('mfe-new-tab-catalog', NewTabCatalog);
