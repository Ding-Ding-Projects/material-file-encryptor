// Plain-language explanations (English and Cantonese) for every syntax tree node kind.

const CLASS_ESCAPES = {
  d: ['a digit (0-9)', '一個數字 (0-9)'], D: ['anything except a digit', '任何非數字字元'],
  w: ['a word character (letter, digit or underscore)', '一個文字字元（字母、數字或底線）'], W: ['anything except a word character', '任何非文字字元'],
  s: ['a whitespace character', '一個空白字元'], S: ['anything except whitespace', '任何非空白字元']
};

export function describeCodePoint(cp) {
  const names = { 0: 'NUL', 8: 'backspace', 9: 'tab', 10: 'line feed', 11: 'vertical tab', 12: 'form feed', 13: 'carriage return', 32: 'space', 127: 'delete' };
  if (names[cp]) return names[cp];
  if (cp < 32) return `control U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  return `"${String.fromCodePoint(cp)}" U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

function quantifierText(node) {
  const { min, max, lazy } = node;
  let en, yue;
  if (min === 0 && max === Infinity) { en = 'zero or more times'; yue = '零次或以上'; }
  else if (min === 1 && max === Infinity) { en = 'one or more times'; yue = '一次或以上'; }
  else if (min === 0 && max === 1) { en = 'optionally (zero or one time)'; yue = '可有可無（零次或一次）'; }
  else if (max === Infinity) { en = `${min} or more times`; yue = `${min} 次或以上`; }
  else if (min === max) { en = `exactly ${min} time${min === 1 ? '' : 's'}`; yue = `剛好 ${min} 次`; }
  else { en = `between ${min} and ${max} times`; yue = `${min} 至 ${max} 次`; }
  if (lazy) { en += ', as few as possible (lazy)'; yue += '，盡量少（惰性）'; }
  else { en += ', as many as possible (greedy)'; yue += '，盡量多（貪婪）'; }
  return { en, yue };
}

const GROUPS = {
  capture: n => [`Capturing group ${n.index}: remembers what its contents matched`, `擷取群組 ${n.index}：記住內容所符合的文字`],
  named: n => [`Named capturing group "${n.name}" (number ${n.index})`, `命名擷取群組「${n.name}」（編號 ${n.index}）`],
  noncapture: () => ['Non-capturing group: groups without remembering', '非擷取群組：只作分組，不記住內容'],
  lookahead: () => ['Positive lookahead: what follows must match, without consuming it', '正向前瞻：後面必須符合，但不佔用字元'],
  'negative-lookahead': () => ['Negative lookahead: what follows must not match', '負向前瞻：後面不可符合'],
  lookbehind: () => ['Positive lookbehind: what precedes must match, without consuming it', '正向後顧：前面必須符合，但不佔用字元'],
  'negative-lookbehind': () => ['Negative lookbehind: what precedes must not match', '負向後顧：前面不可符合'],
  modifiers: n => [`Inline modifiers: turn on "${n.modifiers.on}"${n.modifiers.off ? ` and off "${n.modifiers.off}"` : ''} inside this group only`, `行內修飾符：只在此群組內開啟「${n.modifiers.on}」${n.modifiers.off ? `及關閉「${n.modifiers.off}」` : ''}`]
};

export function explainNode(node) {
  switch (node.type) {
    case 'alternation': return { en: `Alternation: match any one of ${node.children.length} alternatives`, yue: `選項：符合 ${node.children.length} 個選項其中之一` };
    case 'sequence': return { en: node.children.length ? 'Sequence: each part must match in order' : 'Empty: matches the empty string', yue: node.children.length ? '序列：各部分須按次序符合' : '空白：符合空字串' };
    case 'literal': return { en: `Literal ${describeCodePoint(node.codePoint)}`, yue: `純文字 ${describeCodePoint(node.codePoint)}` };
    case 'escape-char': return { en: `${node.name[0].toUpperCase()}${node.name.slice(1)}: ${describeCodePoint(node.codePoint)}`, yue: `逸出字元：${describeCodePoint(node.codePoint)}` };
    case 'dot': return { en: 'Any character except a line break (or any character with the s flag)', yue: '除換行外的任何字元（有 s 旗標則包括換行）' };
    case 'anchor': return node.which === '^'
      ? { en: 'Start of the text (or of each line with the m flag)', yue: '文字開頭（有 m 旗標則為每行開頭）' }
      : { en: 'End of the text (or of each line with the m flag)', yue: '文字結尾（有 m 旗標則為每行結尾）' };
    case 'boundary': return node.which === 'b'
      ? { en: 'Word boundary', yue: '文字邊界' } : { en: 'Not a word boundary', yue: '非文字邊界' };
    case 'class-escape': { const [en, yue] = CLASS_ESCAPES[node.which]; return { en: `Matches ${en}`, yue: `符合${yue}` }; }
    case 'property': return {
      en: `Unicode property ${node.negated ? 'not ' : ''}"${node.property}"`, yue: `Unicode 屬性${node.negated ? '（排除）' : ''}「${node.property}」`
    };
    case 'backreference': return node.name !== undefined
      ? { en: `Backreference to group "${node.name}": repeats the text it matched`, yue: `反向參照群組「${node.name}」：重複其符合的文字` }
      : { en: `Backreference to group ${node.number}: repeats the text it matched`, yue: `反向參照群組 ${node.number}：重複其符合的文字` };
    case 'class': return node.negated
      ? { en: 'Negated character class: any one character not listed', yue: '排除字元類別：任何一個未列出的字元' }
      : { en: 'Character class: any one of the listed characters', yue: '字元類別：列出的任何一個字元' };
    case 'range': return { en: `Range from ${describeCodePoint(node.children[0].codePoint ?? 0)} to ${describeCodePoint(node.children[1].codePoint ?? 0)}`, yue: `範圍：由 ${describeCodePoint(node.children[0].codePoint ?? 0)} 至 ${describeCodePoint(node.children[1].codePoint ?? 0)}` };
    case 'class-operator': return node.op === '&&'
      ? { en: 'Class intersection (v flag): characters in both sets', yue: '類別交集（v 旗標）：同時屬於兩個集合' }
      : { en: 'Class subtraction (v flag): characters in the first set but not the second', yue: '類別相減（v 旗標）：屬於第一個集合但不屬於第二個' };
    case 'group': { const [en, yue] = GROUPS[node.subtype](node); return { en, yue }; }
    case 'quantifier': { const q = quantifierText(node); return { en: `Repeat the previous item ${q.en}`, yue: `重複前一項 ${q.yue}` }; }
    case 'error': return { en: `Syntax problem: ${node.message}`, yue: `語法問題：${node.message}` };
    default: return { en: node.type, yue: node.type };
  }
}

/** Heuristic risk notes. These are static hints, never a measured result. */
export function riskNotes(pattern) {
  const notes = [];
  if (/\((?:[^()\\]|\\.)*[*+](?:[^()\\]|\\.)*\)[*+{]/.test(pattern)) notes.push(['Nested repetition can cause exponential backtracking.', '巢狀重複可能造成指數級回溯。']);
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[*+{]/.test(pattern)) notes.push(['Repeated alternatives can cause heavy backtracking.', '重複的選項可能造成大量回溯。']);
  if (/\\[1-9]|\\k</.test(pattern)) notes.push(['Backreferences can make matching expensive.', '反向參照會令匹配變慢。']);
  if (/\.\*.*\.\*/.test(pattern)) notes.push(['Several ".*" parts can backtrack heavily on long text.', '多個 ".*" 在長文字上可能大量回溯。']);
  if (pattern.length > 256) notes.push(['Long expressions are harder to review and profile.', '過長的表達式較難檢視及分析。']);
  return notes;
}
