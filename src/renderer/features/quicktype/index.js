import {createKit, errorText} from '../studio-kit.js';

const SOURCE_KINDS = ['json', 'schema'];
const DEBOUNCE_MS = 350;

/** Type generator: JSON samples or a JSON Schema in, typed code out. Inference runs in the main process, never on the interface thread. */
export function mountQuicktype(root, {request, onExport, getLanguage = () => 'en', subscribeLanguage} = {}) {
  if (typeof request !== 'function') throw new Error('The type generator host is required.');
  const kit = createKit(root, {getLanguage, subscribeLanguage});
  const {tr, plain} = kit;
  const state = {sourceKind: 'json', sources: ['{\n  "name": "Ada",\n  "age": 36,\n  "tags": ["math", "engines"],\n  "home": {"city": "London"}\n}'], active: 0, name: 'Person', language: 'typescript', options: {}, inference: {}, lenient: true, output: '', extension: 'txt', message: '', warnings: [], languages: null, inferenceDefaults: [], busy: false};
  let alive = true, timer = null, generation = 0, languageFilter = '';
  const section = plain('section', 'studio-suite quicktype-studio');
  section.setAttribute('aria-label', 'Type generator');
  root.append(section);

  async function load() {
    try {
      const listing = await request('languages', {});
      if (!alive) return;
      state.languages = listing.languages;
      state.inferenceDefaults = listing.inference;
      state.message = '';
      generate();
    } catch (error) { state.message = errorText(error); }
    render();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(generate, DEBOUNCE_MS);
  }

  async function generate() {
    if (!alive || !state.languages) return;
    const mine = ++generation;
    state.busy = true;
    try {
      const result = await request('generate', {sourceKind: state.sourceKind, sources: state.sources, name: state.name, language: state.language, rendererOptions: state.options, inference: state.inference, lenient: state.lenient});
      if (!alive || mine !== generation) return;
      state.output = result.code; state.extension = result.extension; state.warnings = result.warnings; state.message = '';
    } catch (error) {
      if (!alive || mine !== generation) return;
      state.output = ''; state.warnings = []; state.message = errorText(error);
    }
    state.busy = false;
    updateOutput();
  }

  const languageRow = () => state.languages?.find(row => row.id === state.language);

  function optionControl(option) {
    const current = Object.hasOwn(state.options, option.name) ? state.options[option.name] : option.defaultValue;
    const hint = option.description + ' (' + tr('default', '預設') + ': ' + String(option.defaultValue) + ')';
    const set = value => { if (value === option.defaultValue) delete state.options[option.name]; else state.options[option.name] = value; schedule(); };
    if (option.kind === 'boolean') return kit.toggle(option.name, option.name, current, set, {hint});
    if (option.kind === 'enum') {
      const node = kit.select(option.name, option.name, option.values.map(value => [value, value]), String(current), set);
      node.title = hint;
      return node;
    }
    const node = kit.textField(option.name, option.name, current === undefined ? '' : String(current), value => set(value || option.defaultValue), {hint: option.description});
    node.title = hint;
    return node;
  }

  function updateOutput() {
    const out = section.querySelector('[data-role="output"]');
    const note = section.querySelector('[data-role="note"]');
    if (out) out.value = state.output;
    if (note) note.textContent = state.message ? state.message : state.warnings.map(w => tr(w, '已經喺推斷之前移除註解或尾隨逗號。')).join(' ');
  }

  function render() {
    if (!alive) return;
    section.replaceChildren();
    section.setAttribute('aria-label', tr('Type generator', '型別產生器'));
    section.append(plain('h2', '', tr('Type generator', '型別產生器')), plain('p', 'studio-lede', tr('Paste JSON samples or a JSON Schema and get typed code. Everything runs on this computer, and nothing is sent anywhere.', '貼上 JSON 樣本或者 JSON Schema，即可得到有型別嘅程式碼。全部喺呢部電腦運行，唔會傳送去任何地方。')));
    if (!state.languages) { section.append(plain('p', '', state.message || tr('Loading languages…', '載入語言中…'))); return; }
    const grid = plain('div', 'studio-grid');
    const left = plain('div', 'studio-col'), right = plain('div', 'studio-col');
    grid.append(left, right);
    section.append(grid);

    left.append(kit.select('Source type', '來源類型', SOURCE_KINDS.map(kind => [kind, kind === 'json' ? tr('JSON samples', 'JSON 樣本') : tr('JSON Schema', 'JSON Schema')]), state.sourceKind, value => {
      state.sourceKind = value;
      if (value === 'schema') state.sources = [state.sources[state.active] ?? state.sources[0]];
      state.active = 0; render(); schedule();
    }));
    if (state.sourceKind === 'json') {
      const tabs = plain('div', 'studio-row');
      tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', tr('Samples', '樣本'));
      state.sources.forEach((_, index) => tabs.append(kit.button(tr('Sample ', '樣本 ') + (index + 1), tr('Sample ', '樣本 ') + (index + 1), () => { state.active = index; render(); }, {variant: index === state.active ? 'primary' : 'outlined', icon: 'file'})));
      tabs.append(kit.button('Add sample', '加入樣本', () => { if (state.sources.length < 8) { state.sources.push('{}'); state.active = state.sources.length - 1; render(); } }, {disabled: state.sources.length >= 8}));
      if (state.sources.length > 1) tabs.append(kit.button('Drop sample', '移走樣本', () => { state.sources.splice(state.active, 1); state.active = Math.max(0, state.active - 1); render(); schedule(); }));
      left.append(tabs);
    }
    left.append(kit.textField('JSON source', 'JSON 來源', state.sources[state.active] ?? '', value => { state.sources[state.active] = value; schedule(); }, {multiline: true, rows: 14}));
    left.append(kit.toggle('Accept comments and trailing commas', '接受註解同尾隨逗號', state.lenient, value => { state.lenient = value; schedule(); }));
    const input = kit.el('input', {type: 'file', accept: '.json,.schema,application/json', label: tr('Open JSON file', '開啟 JSON 檔案'), 'aria-label': tr('Open JSON file', '開啟 JSON 檔案')});
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 200 * 1024) { state.message = tr('That file is larger than 200 KB.', '個檔案大過 200 KB。'); updateOutput(); return; }
      state.sources[state.active] = await file.text(); input.value = ''; render(); schedule();
    });
    left.append(input);

    right.append(kit.textField('Top-level type name', '頂層型別名稱', state.name, value => { state.name = value; schedule(); }));
    const filter = kit.textField('Filter languages', '篩選語言', languageFilter, value => { languageFilter = value; renderLanguageSelect(); }, {});
    right.append(filter);
    const languageHost = plain('div', 'studio-language-host');
    right.append(languageHost);
    function renderLanguageSelect() {
      const needle = languageFilter.trim().toLowerCase();
      const rows = state.languages.filter(row => !needle || row.name.toLowerCase().includes(needle) || row.id.includes(needle) || row.id === state.language);
      languageHost.replaceChildren(kit.select('Target language', '目標語言', rows.map(row => [row.id, row.name]), state.language, value => { state.language = value; state.options = {}; render(); schedule(); }));
    }
    renderLanguageSelect();

    const inference = plain('fieldset', 'studio-fieldset');
    inference.append(plain('legend', '', tr('Inference', '推斷')));
    for (const item of state.inferenceDefaults) {
      const current = Object.hasOwn(state.inference, item.name) ? state.inference[item.name] : item.defaultValue;
      inference.append(kit.toggle(INFERENCE_LABELS[item.name]?.[0] ?? item.name, INFERENCE_LABELS[item.name]?.[1] ?? item.name, current, value => { state.inference[item.name] = value; schedule(); }));
    }
    right.append(inference);

    const options = plain('fieldset', 'studio-fieldset');
    options.append(plain('legend', '', tr('Language options', '語言選項')));
    for (const option of languageRow()?.options ?? []) options.append(optionControl(option));
    right.append(options);

    const outHead = plain('div', 'studio-row');
    outHead.append(
      kit.button('Copy', '複製', async () => { try { await navigator.clipboard.writeText(state.output); state.message = tr('Copied to the clipboard.', '已複製到剪貼簿。'); } catch (error) { state.message = errorText(error); } updateOutput(); }, {disabled: !state.output, variant: 'primary'}),
      kit.button('Save as file', '儲存成檔案', () => { if (typeof onExport === 'function') onExport({name: (state.name.replace(/[^A-Za-z0-9_-]+/g, '') || 'types') + '.' + state.extension, mime: 'text/plain', content: state.output}); }, {disabled: !state.output || typeof onExport !== 'function'}));
    section.append(outHead);
    const out = kit.textField('Generated code', '產生嘅程式碼', state.output, () => {}, {multiline: true, rows: 18, readOnly: true});
    out.dataset.role = 'output';
    const note = kit.status();
    note.dataset.role = 'note';
    section.append(out, note);
    updateOutput();
  }

  kit.onLanguage(() => render());
  render();
  void load();
  return {refresh: generate, setLanguage: render, destroy() { alive = false; clearTimeout(timer); kit.destroy(); section.remove(); }};
}

const INFERENCE_LABELS = {
  inferEnums: ['Infer enums', '推斷列舉'], inferMaps: ['Infer maps', '推斷對映'], inferDateTimes: ['Infer dates and times', '推斷日期同時間'],
  inferUuids: ['Infer UUIDs', '推斷 UUID'], inferIntegerStrings: ['Infer integers in strings', '推斷字串入面嘅整數'], inferBooleanStrings: ['Infer booleans in strings', '推斷字串入面嘅布林值'],
  combineClasses: ['Combine similar classes', '合併相似類別'], allPropertiesOptional: ['Make every property optional', '所有屬性設為可選']
};
