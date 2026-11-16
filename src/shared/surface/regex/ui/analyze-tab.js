// Analyze tab: the pattern as a syntax tree, explained node by node, synchronized with the editor
// selection in both directions.
import { element } from '../../registry.js';
import { parsePattern, flattenTree, nodeAt } from '../parser.js';
import { explainNode, riskNotes } from '../explain.js';
import { heading, panel, copyText, downloadText, codeBlock } from './shared.js';

export const id = 'analyze';
export const label = ['Analyze', '分析'];

const OVERVIEW_HIDDEN = new Set(['literal', 'escape-char', 'range', 'class-escape', 'sequence']);

export function analysisText(ctx, parsed, detail) {
  return flattenTree(parsed.tree).filter(({ node }) => detail === 'full' || !OVERVIEW_HIDDEN.has(node.type) || node === parsed.tree)
    .map(({ node, depth }) => `${'  '.repeat(depth)}${node.text || '(empty)'}  -  ${explainNode(node).en}`).join('\n');
}

export function mount(ctx) {
  const t = ctx.t;
  const tree = element('div', { role: 'tree', class: 'tree', 'aria-label': t('Syntax tree', '語法樹') });
  const messages = element('div', { class: 'stack' });
  const detail = element('md-outlined-select', { label: t('Explanation detail', '說明詳細程度') }, [
    element('md-select-option', { value: 'overview', selected: true }, [element('div', { slot: 'headline', text: t('Overview (structure only)', '概覽（只顯示結構）') })]),
    element('md-select-option', { value: 'full' }, [element('div', { slot: 'headline', text: t('Every node', '每個節點') })])
  ]);
  let nodeButtons = [];
  let parsed;

  function render() {
    parsed = parsePattern(ctx.pattern, ctx.flags);
    tree.replaceChildren(); nodeButtons = [];
    messages.replaceChildren();
    const level = detail.value || 'overview';
    for (const { node, depth } of flattenTree(parsed.tree)) {
      if (level === 'overview' && OVERVIEW_HIDDEN.has(node.type) && node !== parsed.tree) continue;
      const e = explainNode(node);
      // A plain element, not a button: the shared control factory maps buttons to Material buttons.
      const select = () => ctx.selectRange(node.start, node.end);
      const button = element('div', { tabindex: '0', role: 'treeitem', class: 'tree-node', style: `padding-inline-start:${8 + depth * 16}px`, 'aria-level': String(depth + 1),
        onclick: select, onkeydown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } } }, [
        element('code', { text: node.text || t('(empty)', '（空白）') }), element('span', { class: 'muted', text: ` ${t(e.en, e.yue)}` })
      ]);
      button.dataset.start = node.start; button.dataset.end = node.end;
      nodeButtons.push({ node, button });
      tree.append(button);
    }
    for (const err of parsed.errors) messages.append(element('p', { role: 'alert', class: 'alert', text: `${t(err.message, err.yue || err.message)} (${t('position', '位置')} ${err.position})` }));
    for (const [en, yue] of riskNotes(ctx.pattern)) messages.append(element('p', { role: 'status', text: t(en, yue) }));
    if (!ctx.pattern) tree.append(element('p', { class: 'muted', text: t('Enter an expression to see its structure.', '輸入表達式以查看結構。') }));
    syncCaret();
  }

  function syncCaret() {
    if (!parsed) return;
    const { start } = ctx.selection();
    const hit = nodeAt(parsed.tree, start);
    for (const { node, button } of nodeButtons) button.classList.toggle('current', node === hit);
  }
  ctx.onSelection(syncCaret);
  detail.addEventListener('change', render);

  const exports = element('div', { class: 'row' }, [
    element('md-text-button', { text: t('Copy as text', '複製為文字'), onclick: () => copyText(ctx, analysisText(ctx, parsed, 'full')) }),
    element('md-text-button', { text: t('Download Markdown', '下載 Markdown'), onclick: () => downloadText('regex-analysis.md', `# Regex analysis\n\n\`${ctx.pattern}\` (flags: ${ctx.flags || 'none'})\n\n\`\`\`\n${analysisText(ctx, parsed, 'full')}\n\`\`\`\n`, 'text/markdown') }),
    element('md-text-button', { text: t('Download JSON', '下載 JSON'), onclick: () => downloadText('regex-analysis.json', JSON.stringify({ pattern: ctx.pattern, flags: ctx.flags, errors: parsed.errors, tree: JSON.parse(JSON.stringify(parsed.tree, (k, v) => v === Infinity ? 'Infinity' : v)) }, null, 2)) })
  ]);
  const node = panel(id, [heading(ctx, 'Syntax tree', '語法樹'),
    element('p', { class: 'muted', text: t('Select a node to select its text in the editor. Moving the cursor in the editor highlights the matching node.', '選取節點會在編輯器選取對應文字；在編輯器移動游標會標示對應節點。') }),
    detail, messages, tree, exports]);
  return { node, refresh: render };
}
