// Create tab: token palette that inserts real syntax at the pattern editor's selection, with a
// plain-language explanation beside every token.
import { element } from '../../registry.js';
import { tokenCatalog, tokenGroups, insertToken, escapeLiteral } from '../tokens.js';
import { heading, panel } from './shared.js';

export const id = 'create';
export const label = ['Create', '建立'];

export function mount(ctx) {
  const t = ctx.t;
  const filter = element('md-outlined-text-field', { label: t('Filter tokens', '篩選語法'), maxLength: 80, 'aria-label': t('Filter tokens', '篩選語法') });
  const announce = element('p', { role: 'status', 'aria-live': 'polite', class: 'muted' });
  const literal = element('md-outlined-text-field', { label: t('Literal text to insert safely', '安全插入純文字'), maxLength: 256 });
  const list = element('div', { class: 'stack' });

  function insert(token) {
    const editor = ctx.editor;
    const selection = ctx.selection();
    const result = insertToken(ctx.pattern, selection.start, selection.end, token, 512);
    if (result.rejected) { announce.textContent = t('The expression would exceed 512 characters.', '表達式會超過 512 字元。'); return; }
    let flags = ctx.flags;
    let note = '';
    if (token.needs === 'u' && !/[uv]/.test(flags)) { flags += 'u'; note = t(' The u flag was added.', ' 已加入 u 旗標。'); }
    if (token.needs === 'v' && !flags.includes('v')) { flags = flags.replace('u', '') + 'v'; note = t(' The v flag was set.', ' 已設定 v 旗標。'); }
    ctx.setPattern(result.pattern, { flags, selection: [result.selectionStart, result.selectionEnd] });
    announce.textContent = `${t(token.en, token.yue)}: ${t(token.enDesc, token.yueDesc)}${note}`;
    editor.focus?.();
  }

  function render() {
    const q = String(filter.value || '').toLowerCase();
    list.replaceChildren();
    for (const [groupId, en, yue] of tokenGroups) {
      const tokens = tokenCatalog.filter(tok => tok.group === groupId && (!q || `${tok.en} ${tok.yue} ${tok.enDesc} ${tok.yueDesc} ${tok.insert}`.toLowerCase().includes(q)));
      if (!tokens.length) continue;
      list.append(element('h5', { text: t(en, yue) }));
      for (const tok of tokens) {
        list.append(element('div', { class: 'token-row' }, [
          element('md-outlined-button', { text: `${t(tok.en, tok.yue)}  ${tok.insert}`, 'aria-label': `${t('Insert', '插入')} ${t(tok.en, tok.yue)} ${tok.insert}`, onclick: () => insert(tok) }),
          element('span', { class: 'muted', text: t(tok.enDesc, tok.yueDesc) })
        ]));
      }
    }
    if (!list.children.length) list.append(element('p', { role: 'status', text: t('No token matches the filter.', '沒有符合篩選的語法。') }));
  }
  filter.addEventListener('input', render);

  const insertLiteral = element('md-outlined-button', { text: t('Insert escaped text', '插入已逸出文字'), onclick: () => {
    const s = ctx.selection();
    const text = escapeLiteral(literal.value);
    ctx.setPattern((ctx.pattern.slice(0, s.start) + text + ctx.pattern.slice(s.end)).slice(0, 512), { selection: [s.start + text.length, s.start + text.length] });
    announce.textContent = t('Inserted the text with every special character escaped.', '已插入文字，所有特殊字元均已逸出。');
  } });

  render();
  const node = panel(id, [
    heading(ctx, 'Guided construction', '引導式組合'),
    element('p', { class: 'muted', text: t('Place the cursor or select part of the expression in the editor above. Wrapping tokens surround the selection.', '在上方編輯器放置游標或選取部分表達式。包圍式語法會包住所選內容。') }),
    announce, filter, element('div', { class: 'row' }, [literal, insertLiteral]), list
  ]);
  return { node, refresh() {} };
}
