// Use tab: ready-to-paste code for the current expression in JavaScript, Python, C# and PowerShell.
import { element } from '../../registry.js';
import { languages, actions, generateCode } from '../codegen.js';
import { heading, panel, codeBlock, copyText, downloadText } from './shared.js';

export const id = 'use';
export const label = ['Use', '程式碼'];

const select = (ctx, labelText, options, onChange) => {
  const control = element('md-outlined-select', { label: labelText }, options.map(([value, text], i) => element('md-select-option', { value, selected: i === 0 }, [element('div', { slot: 'headline', text })])));
  control.addEventListener('change', onChange);
  return control;
};

export function mount(ctx) {
  const t = ctx.t;
  const language = select(ctx, t('Language', '語言'), languages.map(l => [l.id, l.name]), () => refresh());
  const action = select(ctx, t('Action', '動作'), actions.map(a => [a.id, t(a.en, a.yue)]), () => refresh());
  const output = codeBlock('');
  const messages = element('div', { class: 'stack' });
  let current = '';
  function refresh() {
    messages.replaceChildren(); output.textContent = '';
    if (!ctx.pattern) { messages.append(element('p', { class: 'muted', text: t('Enter an expression to generate code.', '輸入表達式以產生程式碼。') })); return; }
    let result;
    try { result = generateCode({ language: language.value || 'javascript', action: action.value || 'test', pattern: ctx.pattern, flags: ctx.flags, replacement: ctx.state.replacement }); }
    catch (error) { messages.append(element('p', { role: 'alert', class: 'alert', text: error.message })); return; }
    current = result.code;
    if (!result.ok) {
      messages.append(element('p', { role: 'alert', class: 'alert', text: t('Not supported here: code cannot be generated for this target.', '此處不支援：無法為此目標產生程式碼。') }));
      for (const u of result.unsupported) messages.append(element('p', { text: t(u.en, u.yue) }));
      return;
    }
    output.textContent = result.code;
    for (const w of result.warnings) messages.append(element('p', { role: 'status', text: `${t('Difference', '差異')}: ${t(w.en, w.yue)}` }));
    for (const n of result.notes) messages.append(element('p', { class: 'muted', text: n }));
    messages.append(element('p', { class: 'muted', text: t('Generated code is not executed here. The test text is not included.', '產生的程式碼不會在此執行，亦不包括測試文字。') }));
  }
  const ext = { javascript: 'js', python: 'py', csharp: 'cs', powershell: 'ps1' };
  const node = panel(id, [heading(ctx, 'Generate code', '產生程式碼'), element('div', { class: 'row' }, [language, action]), messages, output,
    element('div', { class: 'row' }, [
      element('md-filled-button', { text: t('Copy code', '複製程式碼'), onclick: () => copyText(ctx, current) }),
      element('md-text-button', { text: t('Download', '下載'), onclick: () => downloadText(`regex-snippet.${ext[language.value] || 'txt'}`, current, 'text/plain') })])]);
  return { node, refresh };
}
