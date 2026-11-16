// Flavors tab: what the engine here can and cannot do, and a static comparison of the current
// expression across target flavors. Converted patterns are shown for review, never executed here.
import { element } from '../../registry.js';
import { compareFlavors } from '../flavors.js';
import { capabilities } from '../../regex-workbench.js';
import { heading, panel, copyText } from './shared.js';

export const id = 'flavors';
export const label = ['Flavors', '風格'];

const STATUS = {
  native: ['Runs here (JavaScript engine)', '可在此執行（JavaScript 引擎）'],
  converted: ['Converted, no known differences (not executed here)', '已轉換，沒有已知差異（不會在此執行）'],
  'converted-with-differences': ['Converted with differences (not executed here)', '已轉換但有差異（不會在此執行）'],
  unsupported: ['Not supported here: cannot be converted safely', '此處不支援：無法安全轉換']
};

export function mount(ctx) {
  const t = ctx.t;
  const table = element('div', { class: 'stack' });
  const caps = element('div', { class: 'stack' });
  function refresh() {
    table.replaceChildren();
    if (!ctx.pattern) { table.append(element('p', { class: 'muted', text: t('Enter an expression to compare flavors.', '輸入表達式以比較風格。') })); }
    else for (const row of compareFlavors(ctx.pattern, ctx.flags, ctx.state.replacement)) {
      const c = row.converted;
      const [en, yue] = STATUS[c.status];
      const box = element('section', { class: 'flavor-card', 'aria-label': row.flavor.name }, [
        element('h5', { text: `${row.flavor.name} · ${t(en, yue)}` }),
        element('p', { class: 'muted', text: row.flavor.targets })]);
      if (c.pattern) box.append(element('pre', { class: 'code', text: c.pattern }), element('md-text-button', { text: t('Copy converted pattern', '複製轉換後表達式'), onclick: () => copyText(ctx, c.pattern) }));
      if (row.replacement) box.append(element('p', { class: 'muted', text: row.replacement.ok ? `${t('Replacement', '取代文字')}: ${row.replacement.text}` : `${t('Replacement not convertible', '取代文字無法轉換')}: ${row.replacement.unsupported.map(u => t(u.en, u.yue)).join(' ')}` }));
      for (const u of c.unsupported) box.append(element('p', { class: 'alert', text: t(u.en, u.yue) }));
      for (const w of c.warnings) box.append(element('p', { text: `${t('Difference', '差異')}: ${t(w.en, w.yue)}` }));
      for (const n of c.notes) box.append(element('p', { class: 'muted', text: t(n.en, n.yue) }));
      table.append(box);
    }
    caps.replaceChildren(element('p', { text: `ECMAScript RegExp · ${globalThis.navigator?.userAgent || t('Version unavailable', '無法取得版本')}` }));
    for (const cap of capabilities) caps.append(element('p', { text: `${t(cap.en, cap.yue)}: ${cap.supported ? t('Supported', '支援') : t('Unsupported by this engine', '此引擎不支援')} · ${cap.pattern}` }));
  }
  const node = panel(id, [heading(ctx, 'Compare and convert', '比較及轉換'),
    element('p', { class: 'muted', text: t('Conversion is a static rewrite of the JavaScript syntax. It lists known differences but cannot prove that another engine matches the same text. Only the JavaScript flavor is executed in this surface.', '轉換只是將 JavaScript 語法靜態改寫，會列出已知差異，但無法證明其他引擎的匹配結果相同。此處只會執行 JavaScript 風格。') }),
    table, heading(ctx, 'Engine capability matrix', '引擎功能表'), caps,
    element('p', { class: 'muted', text: t('The engine exposes no internal parse tree or backtracking trace. Samples are never saved or transmitted.', '引擎不提供內部語法樹或回溯追蹤。測試文字不會被儲存或傳送。') })]);
  return { node, refresh };
}
