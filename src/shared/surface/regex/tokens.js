// Token palette for the Create tab. Every token inserts real syntax and carries a plain-language
// explanation. `wrap` tokens surround the current selection; the others replace it.

const T = (id, group, en, yue, insert, enDesc, yueDesc, extra = {}) => ({ id, group, en, yue, insert, enDesc, yueDesc, ...extra });

export const tokenGroups = Object.freeze([
  ['characters', 'Characters', '字元'], ['classes', 'Character classes', '字元類別'], ['anchors', 'Anchors and boundaries', '錨點及邊界'],
  ['groups', 'Groups', '群組'], ['quantifiers', 'Repetition', '重複'], ['lookaround', 'Lookaround', '前瞻及後顧'], ['references', 'References', '參照'],
  ['modifiers', 'Modifiers', '修飾符']
]);

export const tokenCatalog = Object.freeze([
  T('any', 'characters', 'Any character', '任何字元', '.', 'Matches any one character except a line break (every character with the s flag).', '符合任何一個字元，換行除外（加 s 旗標則包括換行）。'),
  T('codepoint', 'characters', 'Unicode code point', 'Unicode 字碼', '\\u{1F600}', 'Matches one code point by number. Needs the u or v flag.', '以編號符合一個字碼，需要 u 或 v 旗標。', { needs: 'u' }),
  T('hex', 'characters', 'Hexadecimal character', '十六進制字元', '\\x41', 'Matches the character with a two-digit hexadecimal code.', '以兩位十六進制碼符合字元。'),
  T('unit', 'characters', 'Unicode code unit', 'Unicode 字碼單位', '\\u0041', 'Matches a UTF-16 code unit by four hexadecimal digits.', '以四位十六進制符合 UTF-16 字碼單位。'),
  T('tab', 'characters', 'Tab', '製表符', '\\t', 'Matches a tab character.', '符合製表符。'),
  T('newline', 'characters', 'Line feed', '換行', '\\n', 'Matches a line feed.', '符合換行字元。'),
  T('return', 'characters', 'Carriage return', '回車', '\\r', 'Matches a carriage return.', '符合回車字元。'),
  T('unicode', 'classes', 'Unicode letters', 'Unicode 字母', '\\p{L}', 'Matches any letter in any script. Needs the u or v flag.', '符合任何文字系統的字母，需要 u 或 v 旗標。', { needs: 'u' }),
  T('unicodeNumber', 'classes', 'Unicode numbers', 'Unicode 數字', '\\p{N}', 'Matches any numeric character in any script. Needs the u or v flag.', '符合任何文字系統的數字，需要 u 或 v 旗標。', { needs: 'u' }),
  T('unicodeScript', 'classes', 'Unicode script', 'Unicode 文字系統', '\\p{Script=Han}', 'Matches characters from one script, here Han. Needs the u or v flag.', '符合某文字系統的字元，此處為漢字，需要 u 或 v 旗標。', { needs: 'u' }),
  T('digit', 'classes', 'Digit', '數字', '\\d', 'Matches one digit 0-9.', '符合一個數字 0-9。'),
  T('notDigit', 'classes', 'Not a digit', '非數字', '\\D', 'Matches one character that is not a digit.', '符合一個非數字字元。'),
  T('word', 'classes', 'Word character', '文字字元', '\\w', 'Matches a letter, digit or underscore (ASCII).', '符合字母、數字或底線（ASCII）。'),
  T('notWord', 'classes', 'Not a word character', '非文字字元', '\\W', 'Matches one character that is not a word character.', '符合一個非文字字元。'),
  T('space', 'classes', 'Whitespace', '空白', '\\s', 'Matches a space, tab, line break or other whitespace.', '符合空格、製表符、換行或其他空白。'),
  T('notSpace', 'classes', 'Not whitespace', '非空白', '\\S', 'Matches one character that is not whitespace.', '符合一個非空白字元。'),
  T('class', 'classes', 'Character class', '字元類別', '[a-z]', 'Matches one character from the listed set or ranges.', '符合所列集合或範圍內的一個字元。'),
  T('negated', 'classes', 'Negated class', '排除字元類別', '[^a-z]', 'Matches one character that is not in the set.', '符合不在集合內的一個字元。'),
  T('intersection', 'classes', 'Class intersection', '類別交集', '[\\p{L}&&\\p{ASCII}]', 'Characters present in both sets. Needs the v flag.', '同時屬於兩個集合的字元，需要 v 旗標。', { needs: 'v' }),
  T('subtraction', 'classes', 'Class subtraction', '類別相減', '[\\p{L}--[a-z]]', 'Characters of the first set that are not in the second. Needs the v flag.', '屬於第一個集合但不屬於第二個的字元，需要 v 旗標。', { needs: 'v' }),
  T('start', 'anchors', 'Start anchor', '開頭錨點', '^', 'Matches at the start of the text (each line with the m flag).', '符合文字開頭（加 m 旗標則為每行開頭）。'),
  T('end', 'anchors', 'End anchor', '結尾錨點', '$', 'Matches at the end of the text (each line with the m flag).', '符合文字結尾（加 m 旗標則為每行結尾）。'),
  T('boundary', 'anchors', 'Word boundary', '文字邊界', '\\b', 'Matches between a word character and a non-word character.', '符合文字字元與非文字字元之間的位置。'),
  T('notBoundary', 'anchors', 'Not a word boundary', '非文字邊界', '\\B', 'Matches where there is no word boundary.', '符合並非文字邊界的位置。'),
  T('capture', 'groups', 'Capture group', '擷取群組', '(text)', 'Groups and remembers the matched text as a numbered group.', '分組並將符合的文字記為編號群組。', { wrap: ['(', ')'] }),
  T('named', 'groups', 'Named group', '命名群組', '(?<name>text)', 'Groups and remembers the matched text under a name.', '分組並以名稱記住符合的文字。', { wrap: ['(?<name>', ')'] }),
  T('noncapture', 'groups', 'Non-capturing group', '非擷取群組', '(?:text)', 'Groups without remembering the text.', '只分組，不記住文字。', { wrap: ['(?:', ')'] }),
  T('alternative', 'groups', 'Alternative', '選項', '(?:one|two)', 'Matches either "one" or "two".', '符合「one」或「two」其中之一。', { wrap: ['(?:', '|alternative)'] }),
  T('alternation', 'groups', 'Alternation bar', '選項分隔', '|', 'Separates alternatives at the current level.', '在目前層級分隔選項。'),
  T('optional', 'quantifiers', 'Optional', '可選', '?', 'The previous item may appear once or not at all.', '前一項可出現一次或不出現。'),
  T('many', 'quantifiers', 'Zero or more', '零次或以上', '*', 'The previous item may repeat any number of times, including none.', '前一項可重複任何次數，包括零次。'),
  T('one', 'quantifiers', 'One or more', '一次或以上', '+', 'The previous item must appear at least once.', '前一項至少出現一次。'),
  T('lazy', 'quantifiers', 'Lazy repetition', '最少重複', '+?', 'Like +, but takes as few characters as possible.', '如 + 但盡量取少。'),
  T('bounded', 'quantifiers', 'Bounded repetition', '指定次數', '{1,3}', 'Repeats between 1 and 3 times. Use {n} for exactly n.', '重複 1 至 3 次，{n} 表示剛好 n 次。'),
  T('lookahead', 'lookaround', 'Positive lookahead', '正向前瞻', '(?=text)', 'Requires the text to follow, without consuming it.', '要求後面是此文字，但不佔用。', { wrap: ['(?=', ')'] }),
  T('negativeAhead', 'lookaround', 'Negative lookahead', '負向前瞻', '(?!text)', 'Requires that the text does not follow.', '要求後面不是此文字。', { wrap: ['(?!', ')'] }),
  T('lookbehind', 'lookaround', 'Positive lookbehind', '正向後顧', '(?<=text)', 'Requires the text to precede, without consuming it.', '要求前面是此文字，但不佔用。', { wrap: ['(?<=', ')'] }),
  T('negativeBehind', 'lookaround', 'Negative lookbehind', '負向後顧', '(?<!text)', 'Requires that the text does not precede.', '要求前面不是此文字。', { wrap: ['(?<!', ')'] }),
  T('reference', 'references', 'Numbered backreference', '編號反向參照', '\\1', 'Matches the same text that group 1 matched.', '符合與群組 1 相同的文字。'),
  T('namedReference', 'references', 'Named backreference', '命名反向參照', '\\k<name>', 'Matches the same text as the named group.', '符合與命名群組相同的文字。'),
  T('modifier', 'modifiers', 'Inline modifier group', '行內修飾符群組', '(?i:text)', 'Turns a flag on for this group only. Needs a recent engine.', '只在此群組開啟旗標，需要較新的引擎。', { wrap: ['(?i:', ')'], needs: 'modifiers' })
]);

/** Compatible shape with the original palette: [id, English, Cantonese, pattern]. */
export const guidedTokens = Object.freeze(tokenCatalog.map(t => Object.freeze([t.id, t.en, t.yue, t.insert])));

export function escapeLiteral(text) { return String(text).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

/**
 * Insert a token into a pattern at the selection. Wrapping tokens surround the selection; with no
 * selection they keep their placeholder text selected for replacement. Returns the new pattern and
 * the resulting selection range.
 */
export function insertToken(pattern, selStart, selEnd, token, maxLength = 512) {
  const start = Math.max(0, Math.min(selStart ?? pattern.length, pattern.length));
  const end = Math.max(start, Math.min(selEnd ?? start, pattern.length));
  const selected = pattern.slice(start, end);
  let insertion, caretStart, caretEnd;
  if (token.wrap && selected) {
    insertion = `${token.wrap[0]}${selected}${token.wrap[1]}`;
    caretStart = start + insertion.length; caretEnd = caretStart;
  } else if (token.wrap) {
    insertion = token.insert;
    const placeholder = token.id === 'named' ? 'name' : token.id === 'alternative' ? 'one' : 'text';
    const at = insertion.indexOf(placeholder);
    caretStart = start + (at >= 0 ? at : insertion.length);
    caretEnd = caretStart + (at >= 0 ? placeholder.length : 0);
  } else {
    insertion = token.insert;
    caretStart = start + insertion.length; caretEnd = caretStart;
  }
  const next = pattern.slice(0, start) + insertion + pattern.slice(end);
  if (next.length > maxLength) return { pattern, selectionStart: start, selectionEnd: end, rejected: true };
  return { pattern: next, selectionStart: caretStart, selectionEnd: caretEnd, rejected: false };
}
