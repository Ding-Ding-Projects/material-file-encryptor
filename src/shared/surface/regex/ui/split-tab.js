// Split tab: the test text split by the expression, one piece per row.
import { element } from '../../registry.js';
import { heading, panel, unsupportedFlavorNotice, copyText } from './shared.js';

export const id = 'split';
export const label = ['Split', '分割'];

export function mount(ctx) {
  const t = ctx.t;
  const info = element('p', { role: 'status', 'aria-live': 'polite' });
  const list = element('ol', { class: 'pieces' });
  const notice = unsupportedFlavorNotice(ctx);
  let token = 0, pieces = [];
  async function refresh() {
    const mine = ++token;
    notice.hidden = ctx.isJs();
    list.replaceChildren(); info.textContent = '';
    if (!ctx.isJs() || !ctx.pattern) return;
    const result = await ctx.run('split', {});
    if (mine !== token) return;
    if (result.error) { info.textContent = result.error; info.setAttribute('role', 'alert'); return; }
    info.setAttribute('role', 'status');
    pieces = result.pieces;
    info.textContent = t(`${result.count} piece${result.count === 1 ? '' : 's'}${result.truncated ? ' (first ' + result.pieces.length + ' shown)' : ''} · ${result.elapsedMs} ms. Captured groups appear as pieces, as JavaScript does.`,
      `${result.count} 段${result.truncated ? '（只顯示首 ' + result.pieces.length + ' 段）' : ''} · ${result.elapsedMs} 毫秒。擷取群組會如 JavaScript 一樣成為獨立片段。`);
    for (const piece of result.pieces) list.append(element('li', { text: piece === null ? t('(group did not participate)', '（群組沒有參與）') : (piece === '' ? t('(empty)', '（空白）') : piece) }));
  }
  const node = panel(id, [heading(ctx, 'Split the test text', '分割測試文字'), notice, info, list,
    element('md-text-button', { text: t('Copy pieces', '複製片段'), onclick: () => copyText(ctx, pieces.map(p => p ?? '').join('\n')) })]);
  return { node, refresh };
}
