// Builds the complete regex builder for ONE search field. Everything it creates (state, undo
// history, saved expressions, worker runner) belongs to that field, so two search bars never share
// builder state.
import { element } from '../../registry.js';
import { createWorkbenchStore } from '../../regex-workbench.js';
import { createEditHistory } from '../edit-history.js';
import { flavors } from '../flavors.js';
import { debounce } from './shared.js';
import * as create from './create-tab.js';
import * as analyze from './analyze-tab.js';
import * as test from './test-tab.js';
import * as replace from './replace-tab.js';
import * as split from './split-tab.js';
import * as grep from './grep-tab.js';
import * as debug from './debug-tab.js';
import * as library from './library-tab.js';
import * as use from './use-tab.js';
import * as flavorTab from './flavor-tab.js';

const FLAGS = [
  ['g', 'Global', '全域', 'Find every match instead of stopping at the first.', '找出全部符合，而非只找第一個。'],
  ['i', 'Ignore case', '忽略大小寫', 'Letters match in upper and lower case.', '字母不分大小寫。'],
  ['m', 'Multiline', '多行', '^ and $ match at every line break.', '^ 與 $ 在每個換行處符合。'],
  ['s', 'Dot matches line breaks', '點號符合換行', '. also matches line breaks.', '. 亦符合換行。'],
  ['u', 'Unicode', 'Unicode', 'Treats the text as Unicode code points and enables \\p{…}.', '以 Unicode 字碼處理文字，並啟用 \\p{…}。'],
  ['v', 'Unicode sets', 'Unicode 集合', 'Like u, plus class intersection and subtraction. Cannot combine with u.', '如 u，另支援類別交集及相減，不可與 u 並用。'],
  ['d', 'Match indices', '符合位置', 'Records the start and end of every group.', '記錄每個群組的起點及終點。']
];

export const tabs = [create, analyze, test, replace, split, grep, debug, library, use, flavorTab];

export function mountRegexBuilder(owner, { enabled }) {
  const t = (en, yue) => owner.t(en, yue);
  let storage; try { storage = globalThis.localStorage; } catch { /* storage unavailable */ }
  const store = createWorkbenchStore(storage, `mfe.regex.${owner.getAttribute('scope') || owner.getAttribute('label') || 'search'}`);
  const history = createEditHistory({ initial: { pattern: owner.query, flags: owner.flags, replacement: '' } });
  const state = { sample: '', replacement: '', flavor: 'javascript' };
  const selectionListeners = new Set();

  const editor = element('md-outlined-text-field', { type: 'textarea', rows: 2, maxLength: 512, label: t('Expression (512 characters maximum)', '表達式（最多 512 字元）'), value: owner.query, spellcheck: false, 'aria-label': t('Expression editor', '表達式編輯器') });
  const sample = element('md-outlined-text-field', { type: 'textarea', rows: 3, maxLength: 65536, label: t('Test text (65536 characters maximum, never saved)', '測試文字（最多 65536 字，不會儲存）'), 'aria-label': t('Test text', '測試文字') });
  const flavorSelect = element('md-outlined-select', { label: t('Flavor', '風格') }, flavors.map((f, i) => element('md-select-option', { value: f.id, selected: i === 0 }, [element('div', { slot: 'headline', text: f.executes ? f.name : `${f.name} · ${t('not executed here', '不會在此執行')}` })])));
  const undo = element('md-outlined-button', { text: t('Undo', '還原'), onclick: () => step('undo') });
  const redo = element('md-outlined-button', { text: t('Redo', '重做'), onclick: () => step('redo') });
  const flavorNote = element('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const validity = element('p', { role: 'status', 'aria-live': 'polite' });
  const message = owner.status;

  const flagBoxes = new Map();
  const flagList = element('div', { class: 'stack' });
  for (const [flag, en, yue, descEn, descYue] of FLAGS) {
    const box = element('md-checkbox', { 'aria-label': `${flag} ${t(en, yue)}`, checked: owner.flags.includes(flag) });
    box.addEventListener('change', () => {
      let next = owner.flags.replace(flag, '');
      if (box.checked ?? box.selected) { next += flag; if (flag === 'u') next = next.replace('v', ''); if (flag === 'v') next = next.replace('u', ''); }
      ctx.setPattern(owner.query, { flags: next });
    });
    flagBoxes.set(flag, box);
    flagList.append(element('label', { class: 'flag-row' }, [box, element('span', {}, [element('strong', { text: `${flag}  ${t(en, yue)}  ` }), element('span', { class: 'muted', text: t(descEn, descYue) })])]));
  }

  const record = debounce(() => { if (history.push({ pattern: owner.query, flags: owner.flags, replacement: state.replacement })) updateUndo(); if (owner.query) store.remember(owner.query, owner.flags); }, 500);

  const ctx = {
    owner, t, store, state, history, editor,
    get pattern() { return owner.query; },
    get flags() { return owner.flags; },
    isJs: () => state.flavor === 'javascript',
    notice(text) { if (message) message.textContent = text; },
    selection() { const n = owner.query.length; return { start: Math.min(editor.selectionStart ?? n, n), end: Math.min(editor.selectionEnd ?? n, n) }; },
    selectRange(start, end) { try { editor.focus(); editor.setSelectionRange(start, end); } catch { /* not focusable yet */ } fireSelection(); },
    onSelection(fn) { selectionListeners.add(fn); },
    recordReplacement() { record(); },
    setFlavor(id) { if (!flavors.some(f => f.id === id)) return; state.flavor = id; flavorSelect.value = id; changed(true); },
    setPattern(pattern, { flags, selection } = {}) {
      owner.query = pattern.slice(0, 512);
      if (flags !== undefined) { owner.flags = flags; if (owner.flagsControl) owner.flagsControl.value = flags; }
      owner.regex = true; if (enabled) enabled.selected = true;
      if (owner.input) owner.input.value = owner.query;
      owner.emitChange();
      if (selection) { try { editor.setSelectionRange(selection[0], selection[1]); } catch { /* ignore */ } fireSelection(); }
      if (history.push({ pattern: owner.query, flags: owner.flags, replacement: state.replacement })) updateUndo();
    },
    run(op, payload = {}) { return owner.evaluate({ op, sample: state.sample, ...payload }); }
  };

  function fireSelection() { for (const fn of selectionListeners) fn(); }
  function updateUndo() { undo.disabled = !history.canUndo(); redo.disabled = !history.canRedo(); }
  function step(kind) { const s = history[kind](); state.replacement = s.replacement ?? ''; ctx.setPattern(s.pattern, { flags: s.flags }); updateUndo(); }

  const tabsControl = element('md-tabs', { 'aria-label': t('Regex builder sections', '正則表達式工具分頁') });
  const mounted = tabs.map(module => ({ module, ...module.mount(ctx) }));
  mounted.forEach(({ module }, i) => tabsControl.append(element('md-primary-tab', { text: t(...module.label), 'aria-controls': `panel-${module.id}`, 'aria-label': t(...module.label) })));
  let active = 0;
  function showActive() { mounted.forEach(({ node }, i) => { node.hidden = i !== active; }); mounted[active].refresh(); }
  tabsControl.addEventListener('change', () => { active = Math.max(0, tabsControl.activeTabIndex ?? 0); showActive(); });

  const refreshLater = debounce(() => mounted[active]?.refresh(), 200);
  function changed(immediate) {
    if (editor.value !== owner.query) editor.value = owner.query;
    for (const [flag, box] of flagBoxes) { const on = owner.flags.includes(flag); if ('checked' in box) box.checked = on; else box.selected = on; }
    const flavor = flavors.find(f => f.id === state.flavor);
    flavorNote.textContent = flavor.executes ? t('JavaScript runs here in a worker with a 1000 ms limit.', 'JavaScript 在此以 worker 執行，上限 1000 毫秒。')
      : t(`${flavor.name}: not supported for execution here. Conversion and generated code are available in Flavors and Use.`, `${flavor.name}：此處不支援執行，可在「風格」及「程式碼」查看轉換及程式碼。`);
    try { new RegExp(owner.query, owner.flags); validity.textContent = owner.query ? t('The expression is valid for the JavaScript engine.', '表達式對 JavaScript 引擎有效。') : ''; validity.className = 'muted'; }
    catch (error) { validity.textContent = `${t('Invalid expression', '表達式無效')}: ${error.message}`; validity.className = 'alert'; }
    record(); updateUndo();
    if (immediate) mounted[active].refresh(); else refreshLater();
  }

  editor.addEventListener('input', () => { owner.query = editor.value; owner.regex = true; if (enabled) enabled.selected = true; if (owner.input) owner.input.value = owner.query; owner.emitChange(); fireSelection(); });
  for (const type of ['keyup', 'click', 'focus']) editor.addEventListener(type, fireSelection);
  sample.addEventListener('input', () => { state.sample = sample.value; refreshLater(); });
  flavorSelect.addEventListener('change', () => { state.flavor = flavorSelect.value || 'javascript'; changed(true); });
  owner.addEventListener('search-change', () => changed(false));

  const node = element('div', { class: 'stack' }, [
    element('div', { class: 'row' }, [flavorSelect, undo, redo]), flavorNote,
    editor, validity,
    element('details', {}, [element('summary', { text: t('Flags explained', '旗標說明') }), flagList]),
    sample, tabsControl, ...mounted.map(m => m.node)
  ]);
  owner.builder.append(node);
  changed(true); showActive();
  return { store, ctx, explain() { /* refreshed through search-change */ }, refresh: () => changed(true) };
}
