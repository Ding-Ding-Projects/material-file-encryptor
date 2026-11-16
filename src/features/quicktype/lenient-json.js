/**
 * Lenient JSON import: accepts line and block comments and trailing commas, and returns strict JSON text.
 * String contents are never touched, so a comment marker inside a string is preserved.
 */
export function stripLenientJson(source) {
  if (typeof source !== 'string') throw new TypeError('JSON text is required.');
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('Unterminated block comment.');
      i = end + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return removeTrailingCommas(out);
}

function removeTrailingCommas(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === ',') {
      let j = i + 1;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') { i++; continue; }
      out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Parse lenient JSON and return the strict text, or throw a SyntaxError that names the problem. */
export function normalizeLenientJson(source) {
  const strict = stripLenientJson(source);
  JSON.parse(strict);
  return strict;
}
