// Replace tab: replacement template with every part explained, and a preview of the result.
import { element } from '../../registry.js';
import { heading, panel, unsupportedFlavorNotice, copyText } from './shared.js';

export const id = 'replace';
export const label = ['Replace', '取代'];

export function mount(ctx) {
  const t = ctx.t;
  const field = element('md-outlined-text-field', { label: t('Replacement text ($1, $<name>, $&, $`, $\', $$)', '取代文字 ($1, $<name>, $&, $`, $\', $$)'), maxLength: 512, value: ctx.state.replacement });
  const parts = element('div', { class: 'stack' });
  const output = element('pre', { class: 'code', 'aria-live': 'polite' });
  const info = element('p', { role: 'status', 'aria-live': 'polite' });
  let token = 0;
  field.addEventListener('input', () => { ctx.state.replacement = field.value; ctx.recordReplacement(); refresh(); });

  async function refresh() {
    const mine = ++token;
    notice.hidden = ctx.isJs();
    if (field.value !== ctx.state.replacement) field.value = ctx.state.replacement;
    if (!ctx.isJs() || !ctx.pattern) { output.textContent = ''; info.textContent = ''; parts.replaceChildren(); return; }
    const result = await ctx.run('test', { replacement: ctx.state.replacement });
    if (mine !== token) return;
    parts.replaceChildren(); info.textContent = '';
    if (result.error) { output.textContent = ''; info.textContent = result.error; info.setAttribute('role', 'alert'); return; }
    info.setAttribute('role', 'status');
    info.textContent = t(`${result.replaced} replacement${result.replaced === 1 ? '' : 's'} · ${result.elapsedMs} ms${result.truncated ? ' · preview limited to the first ' + result.matches.length + ' matches' : ''}`,
      `${result.replaced} 項取代 · ${result.elapsedMs} 毫秒${result.truncated ? ' · 預覽只涵蓋首 ' + result.matches.length + ' 個符合' : ''}`);
    for (const p of result.replacementParts) parts.append(element('p', { class: 'group-row', text: `${JSON.stringify(p.text)} → ${t(p.en, p.yue)}` }));
    output.textContent = result.replacement;
  }
  const notice = unsupportedFlavorNotice(ctx);
  const node = panel(id, [heading(ctx, 'Replacement', '取代'), notice, field, heading(ctx, 'How the replacement reads', '取代文字說明'), parts, info, heading(ctx, 'Preview', '預覽'), output,
    element('md-text-button', { text: t('Copy result', '複製結果'), onclick: () => copyText(ctx, output.textContent) })]);
  return { node, refresh };
}
