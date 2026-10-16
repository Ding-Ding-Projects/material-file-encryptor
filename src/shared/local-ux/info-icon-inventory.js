import {definePractice} from '../surface/guidance-playground.js';

/**
 * Builds the registered explanation, guided steps and isolated sample for one
 * control from a compact authored row. The row supplies the control-specific
 * facts (label, purpose, effect); the control kind supplies the shared wording
 * for options, validation, recovery and the sample. A row never reads a live
 * value, never starts the real operation and never copies private data.
 *
 * Row: [selector, kind, label, labelYue, purpose, purposeYue, effect, effectYue, extra?]
 * Kinds: button, toggle, text, search, number, choice, credential, file, link, navigation.
 */
export const INFO_ICON_ARTICLE = 'docs/features/interface/info-icon-guidance.md';
export const INFO_ICON_COPY = {};
const pair = (en, yue) => { INFO_ICON_COPY[en] = yue; return en; };
export const infoIconSlug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const INFO_ICON_KINDS = Object.freeze(['button', 'toggle', 'text', 'search', 'number', 'choice', 'credential', 'file', 'link', 'navigation']);

const KIND_WORDING = {
  button: {
    options: ['This action has no options. It runs once each time you press it.', '這個操作沒有選項，每按一次就執行一次。'],
    default: ['Not invoked', '尚未執行'],
    validation: ['The action stays unavailable until its required conditions are met. Its own message names anything missing.', '必要條件未齊備時，操作會保持無法使用，並由它自己的訊息指出缺少甚麼。'],
    recovery: ['Close any dialog the action opens, then check the result at the control before trying again.', '關閉操作開啟的對話框，先在控制項查看結果，再重新嘗試。']
  },
  file: {
    options: ['The system file or folder picker offers the choices. Nothing is chosen until you confirm in the picker.', '由系統的檔案或資料夾選擇器提供選項，在選擇器確認前不會選取任何項目。'],
    default: ['Nothing chosen', '未選擇任何項目'],
    validation: ['The chosen path is checked by the real control before it is used. A rejected path keeps the previous value.', '真正的控制項會先檢查所選路徑才使用，被拒絕的路徑會保留原有數值。'],
    recovery: ['Cancel the picker to keep the current value, or choose another location.', '取消選擇器即可保留目前數值，或另選位置。']
  },
  link: {
    options: ['This control only opens a page. It has no options.', '這個控制項只會開啟頁面，沒有選項。'],
    default: ['Not opened', '尚未開啟'],
    validation: ['Only the fixed project address behind this control can open. It cannot be edited.', '只可以開啟這個控制項背後固定的專案網址，不能修改。'],
    recovery: ['Close the page that opened and return to the app. Nothing in the app changes.', '關閉已開啟的頁面並返回程式，程式內不會有任何變更。']
  },
  navigation: {
    options: ['Pick one destination. Only one is shown at a time.', '選擇一個目的地，同一時間只會顯示一個。'],
    default: ['The first destination', '第一個目的地'],
    validation: ['A destination that is not available stays disabled. Choosing one never changes your data.', '無法使用的目的地會保持停用，選擇目的地不會改變你的資料。'],
    recovery: ['Choose another destination, or use the Home view to see every destination.', '選擇其他目的地，或到「首頁」查看所有目的地。']
  },
  toggle: {
    options: ['On or off.', '開或關。'],
    default: ['Off', '關'],
    validation: ['A switch has no invalid value. If it is unavailable, its adjacent text says why.', '開關沒有無效數值，若無法使用，旁邊的文字會說明原因。'],
    recovery: ['Switch it back to its previous position. The change applies as soon as you switch it.', '把開關撥回原來位置，撥動後會立即生效。']
  },
  text: {
    options: ['Any text within the length the field allows.', '符合欄位長度限制的任何文字。'],
    default: ['Empty', '空白'],
    validation: ['The field shows an error beside it when the text is too long, empty where a value is required, or in the wrong format.', '文字過長、必填欄位空白或格式不對時，欄位旁邊會顯示錯誤。'],
    recovery: ['Correct the text, or clear the field to start again. Nothing is saved until you confirm.', '修正文字，或清空欄位重新輸入；確認前不會儲存任何內容。']
  },
  search: {
    options: ['Any search text. The list narrows as you type.', '任何搜尋文字，輸入時清單會即時縮窄。'],
    default: ['Empty', '空白'],
    validation: ['An empty search shows everything. A search with no matches shows an empty list, not an error.', '空白搜尋會顯示全部內容；沒有符合項目時只會顯示空清單，不是錯誤。'],
    recovery: ['Clear the search text to see every entry again.', '清除搜尋文字即可重新看到所有項目。']
  },
  number: {
    options: ['A number within the minimum and maximum the control allows.', '控制項允許的最小至最大範圍內的數字。'],
    default: ['The control’s starting value', '控制項的起始數值'],
    validation: ['A value outside the allowed range or that is not a number is rejected with a message beside the control.', '超出範圍或不是數字的數值會被拒絕，並在控制項旁顯示訊息。'],
    recovery: ['Enter a value inside the range, or use the reset button where one is offered.', '輸入範圍內的數值，或使用提供的重設按鈕。']
  },
  choice: {
    options: ['Choose one entry from the list the control opens.', '從控制項展開的清單中選擇一項。'],
    default: ['The first entry in the list', '清單中的第一項'],
    validation: ['Only entries in the list can be chosen, so a choice cannot be invalid.', '只能選擇清單內的項目，所以選擇不會無效。'],
    recovery: ['Open the list again and choose the previous entry.', '再次展開清單，選回原來的項目。']
  },
  credential: {
    options: ['A secret you type once. It is hidden while you type.', '你只需輸入一次的機密內容，輸入時會隱藏。'],
    default: ['Empty', '空白'],
    validation: ['The secret is checked only when you submit it. A wrong or too short secret is rejected without hints about its content.', '機密內容只會在提交時檢查，錯誤或過短會被拒絕，而且不會透露任何內容提示。'],
    recovery: ['Clear the field and type it again. Nothing is shown, copied or kept by this explanation.', '清空欄位重新輸入；這個說明不會顯示、複製或保留任何內容。']
  }
};

const STEP_WORDING = {
  find: ['Find the control directly below this icon.', '找到這個圖示正下方的控制項。'],
  read: ['Read what it does and what it changes.', '閱讀它的用途，以及它會改變甚麼。'],
  press: ['Use the real control yourself when you are ready. This guide never operates it for you.', '準備好後由你自己使用真正的控制項，這個指引不會替你操作。'],
  set: ['Decide the value you want, using the sample below to see how the field behaves.', '先決定你要的數值，並用下方樣本了解欄位的運作。'],
  choose: ['Decide which entry you want, using the sample below to see the result.', '先決定你要的項目，並用下方樣本查看結果。'],
  check: ['Check the result beside the control after you use it.', '使用後，請在控制項旁邊查看結果。']
};
for (const [en, yue] of Object.values(STEP_WORDING)) pair(en, yue);
for (const wording of Object.values(KIND_WORDING)) for (const [en, yue] of Object.values(wording)) pair(en, yue);

const STEPS = {
  button: ['find', 'read', 'press'], file: ['find', 'read', 'press'], link: ['find', 'read', 'press'], navigation: ['find', 'read', 'press'],
  toggle: ['find', 'read', 'press'], text: ['find', 'set', 'check'], search: ['find', 'set', 'check'], number: ['find', 'set', 'check'],
  choice: ['find', 'choose', 'check'], credential: ['find', 'set', 'check']
};

function sample(kind, key, label, labelYue, extra) {
  const id = `info-sample:${key}`;
  const q = (en, yue) => pair(en, yue);
  const base = {id, label: pair(label, labelYue)};
  if (['button', 'file', 'link', 'navigation'].includes(kind)) {
    const before = q(`Before running the sample`, `執行樣本之前`), after = q('Run the sample', '執行樣本');
    return definePractice({
      ...base, kind: 'choice', primitive: 'buttons', initial: 'ready',
      choices: [
        {value: 'ready', label: before, result: q(`The sample "${label}" has not run.`, `樣本「${labelYue}」尚未執行。`)},
        {value: 'ran', label: after, result: q(`The sample "${label}" finished. Nothing real changed.`, `樣本「${labelYue}」已完成，真實內容沒有任何改變。`)}
      ],
      input: q(`Sample of "${label}": it has not run yet.`, `「${labelYue}」樣本：尚未執行。`),
      action: q('Choose Run the sample.', '選擇「執行樣本」。'),
      expected: q('Only this sample reports a result. The real control and its data are untouched.', '只有這個樣本會顯示結果，真正的控制項和資料完全不受影響。')
    });
  }
  if (kind === 'toggle') {
    return definePractice({
      ...base, kind: 'toggle', initial: true,
      input: q(`Sample switch "${label}": on.`, `樣本開關「${labelYue}」：開。`),
      action: q('Turn the sample switch off, then on again.', '把樣本開關關閉，再重新開啟。'),
      expected: q('The sample caption changes. The real setting stays as it is.', '樣本說明會改變，真正的設定保持不變。')
    });
  }
  if (kind === 'number') {
    const min = extra.min ?? 1, max = extra.max ?? 10, initial = extra.sample ?? min;
    return definePractice({
      ...base, kind: 'number', initial, min, max, step: extra.step ?? 1, unit: extra.unit ?? '', integer: extra.integer !== false,
      input: q(`Sample number "${label}": ${initial}.`, `樣本數字「${labelYue}」：${initial}。`),
      action: q(`Enter another number from ${min} to ${max}.`, `輸入另一個 ${min} 至 ${max} 的數字。`),
      expected: q('The sample readout changes. The real value stays as it is.', '樣本讀數會改變，真正的數值保持不變。')
    });
  }
  if (kind === 'choice') {
    const first = q('First sample entry', '第一個樣本項目'), second = q('Second sample entry', '第二個樣本項目');
    return definePractice({
      ...base, kind: 'choice', primitive: 'select', initial: 'first',
      choices: [
        {value: 'first', label: first, result: q(`Sample "${label}": the first entry is chosen.`, `樣本「${labelYue}」：已選擇第一項。`)},
        {value: 'second', label: second, result: q(`Sample "${label}": the second entry is chosen.`, `樣本「${labelYue}」：已選擇第二項。`)}
      ],
      input: q(`Sample list "${label}": first entry.`, `樣本清單「${labelYue}」：第一項。`),
      action: q('Choose the second sample entry.', '選擇第二個樣本項目。'),
      expected: q('The sample result names the entry you chose. The real choice is unchanged.', '樣本結果會顯示你選的項目，真正的選項不會改變。')
    });
  }
  if (kind === 'credential') {
    return definePractice({
      ...base, kind: 'credential', initial: 'DEMO-ONLY',
      input: q('Fixed public demonstration text: DEMO-ONLY.', '固定公開示範文字：DEMO-ONLY。'),
      action: q('Change the text to see it rejected, then use Reset example.', '修改文字查看拒絕結果，再按「重設例子」。'),
      expected: q('Only DEMO-ONLY is accepted in this sample. Nothing is checked, stored or sent.', '這個樣本只接受 DEMO-ONLY，不會檢查、儲存或傳送任何內容。')
    });
  }
  // text and search
  return definePractice({
    ...base, kind: 'text', initial: 'Sample text',
    input: q(`Sample field "${label}": Sample text.`, `樣本欄位「${labelYue}」：Sample text。`),
    action: q('Type another short sample.', '輸入另一段簡短樣本文字。'),
    expected: q('Only the sample preview changes. Nothing is saved, searched or sent.', '只有樣本預覽會改變，不會儲存、搜尋或傳送任何內容。')
  });
}

/** One descriptor per authored row, in the shape mountControlGuidance and assertGuidanceCoverage read. */
export function infoIconDescriptor(row, {surface}) {
  const [selector, kind, label, labelYue, purposeEn, purposeYue, effectEn, effectYue, extra = {}] = row;
  if (!INFO_ICON_KINDS.includes(kind)) throw Error(`Unknown information icon kind: ${kind}`);
  const wording = KIND_WORDING[kind], key = `${surface}.${infoIconSlug(extra.key || selector)}`;
  const options = extra.options ? pair(...extra.options) : pair(...wording.options);
  const defaultText = extra.default ? pair(...extra.default) : pair(...wording.default);
  const purpose = pair(purposeEn, purposeYue), effects = pair(effectEn, effectYue);
  pair(label, labelYue);
  const example = pair(`Example for "${label}": ${effectEn.charAt(0).toLowerCase()}${effectEn.slice(1)}`, `「${labelYue}」例子：${effectYue}`);
  return {
    id: key, concept: infoIconSlug(key), surface, selector, label, labelYue, capable: true, kind, runtime: extra.runtime === true,
    reason: 'Operates one explicit control through its original handler.',
    help: `#${infoIconSlug(key)}`, sourceId: INFO_ICON_ARTICLE,
    purpose, options, default: defaultText, effects, example,
    validation: pair(...wording.validation), recovery: pair(...wording.recovery),
    steps: STEPS[kind].map(name => pair(...STEP_WORDING[name])),
    practice: sample(kind, key, label, labelYue, extra),
    unavailableReason: pair('This control is unavailable right now. Read its explanation here, then return to it when it is available.', '這個控制項暫時無法使用，請先在這裡閱讀說明，待它可用時再回到控制項。'),
    group: Boolean(extra.covers || extra.group), noPair: extra.noPair === true,
    ...(extra.covers ? {covers: extra.covers} : {})
  };
}

/** The shared mounting chrome wording. */
Object.assign(INFO_ICON_COPY, {
  'Information could not be shown for this control.': '無法顯示這個控制項的說明。'
});

/** Controls that deliberately have no icon, each with the reason. */
export function exemptRow(selector, reason, reasonYue) {
  return {selector, capable: false, reason: pair(reason, reasonYue)};
}

/**
 * Builds a complete surface inventory: descriptors for capable controls and
 * explicit exemptions. Identities must be unique so one control can never
 * hide behind another's explanation.
 */
export function buildSurfaceInventory(surface, rows, exemptions = []) {
  const descriptors = rows.map(row => infoIconDescriptor(row, {surface}));
  const ids = descriptors.map(row => row.id);
  if (new Set(ids).size !== ids.length) throw Error(`Duplicate information icon identity on ${surface}.`);
  const selectors = [...descriptors.map(row => row.selector), ...exemptions.map(row => row.selector)];
  if (new Set(selectors).size !== selectors.length) throw Error(`A control appears twice in the ${surface} inventory.`);
  const purposes = descriptors.map(row => row.purpose);
  if (new Set(purposes).size !== purposes.length) throw Error(`Repeated purpose text on ${surface}.`);
  return Object.freeze({surface, descriptors: Object.freeze(descriptors), exemptions: Object.freeze([...exemptions])});
}
