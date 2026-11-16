// Structural parser for JavaScript regular expression source. It builds a real syntax tree
// (alternation, sequence, groups, classes, quantifiers, escapes) with source positions, so the
// Analyze tab can explain a pattern node by node and the converter can re-serialize it.
// It tolerates invalid input and reports errors instead of throwing; the engine itself remains
// the authority on validity (see engine.js validate()).

const SIMPLE_ESCAPES = { t: ['tab', 9], n: ['line feed', 10], r: ['carriage return', 13], f: ['form feed', 12], v: ['vertical tab', 11] };

export function parsePattern(src, flags = '') {
  const unicode = flags.includes('u') || flags.includes('v');
  const vmode = flags.includes('v');
  const errors = [];
  let i = 0;
  let captureCount = 0;
  const names = [];

  const mk = (type, start, extra = {}) => ({ type, start, end: i, text: src.slice(start, i), ...extra });
  const fail = (message, position, yue) => { errors.push({ message, yue, position }); };

  function parseAlternation(depth) {
    const start = i;
    const alts = [parseSequence(depth)];
    while (src[i] === '|') { i++; alts.push(parseSequence(depth)); }
    if (alts.length === 1) return alts[0];
    return mk('alternation', start, { children: alts });
  }

  function parseSequence(depth) {
    const start = i;
    const children = [];
    while (i < src.length && src[i] !== '|') {
      if (src[i] === ')') {
        if (depth > 0) break;
        const s = i++;
        fail('Unmatched closing parenthesis', s, '多餘的右括號');
        children.push(mk('error', s, { message: 'unmatched )' }));
        continue;
      }
      children.push(parseQuantified(depth));
    }
    return mk('sequence', start, { children });
  }

  function parseQuantified(depth) {
    const start = i;
    const atom = parseAtom(depth);
    const q = parseQuantifier();
    if (!q) return atom;
    return mk('quantifier', start, { min: q.min, max: q.max, lazy: q.lazy, quantText: q.text, children: [atom] });
  }

  function parseQuantifier() {
    const c = src[i];
    const from = i;
    let min, max;
    if (c === '*') { min = 0; max = Infinity; i++; }
    else if (c === '+') { min = 1; max = Infinity; i++; }
    else if (c === '?') { min = 0; max = 1; i++; }
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
      if (!m) return null;
      min = Number(m[1]);
      max = m[2] === undefined ? min : (m[3] === '' ? Infinity : Number(m[3]));
      i += m[0].length;
      if (max < min) fail('Quantifier range is out of order', from, '重複次數範圍次序相反');
    } else return null;
    let lazy = false;
    if (src[i] === '?') { lazy = true; i++; }
    return { min, max, lazy, text: src.slice(from, i) };
  }

  function parseAtom(depth) {
    const start = i;
    const c = src[i];
    if (c === '(') return parseGroup(depth);
    if (c === '[') return parseClass();
    if (c === '\\') return parseEscape(false);
    if (c === '.') { i++; return mk('dot', start); }
    if (c === '^' || c === '$') { i++; return mk('anchor', start, { which: c }); }
    if (c === '*' || c === '+' || c === '?') {
      i++;
      fail('Nothing to repeat', start, '前面沒有可重複的內容');
      return mk('error', start, { message: 'nothing to repeat' });
    }
    if (c === '{') {
      const m = /^\{\d+(,\d*)?\}/.exec(src.slice(i));
      if (m) { i += m[0].length; fail('Nothing to repeat', start, '前面沒有可重複的內容'); return mk('error', start, { message: 'nothing to repeat' }); }
    }
    const cp = src.codePointAt(i);
    i += cp > 0xffff ? 2 : 1;
    return mk('literal', start, { codePoint: cp });
  }

  function parseGroup(depth) {
    const start = i;
    i++; // (
    let subtype = 'capture', name, index, modifiers;
    if (src[i] === '?') {
      const rest = src.slice(i);
      let m;
      if (rest.startsWith('?:')) { subtype = 'noncapture'; i += 2; }
      else if (rest.startsWith('?=')) { subtype = 'lookahead'; i += 2; }
      else if (rest.startsWith('?!')) { subtype = 'negative-lookahead'; i += 2; }
      else if (rest.startsWith('?<=')) { subtype = 'lookbehind'; i += 3; }
      else if (rest.startsWith('?<!')) { subtype = 'negative-lookbehind'; i += 3; }
      else if ((m = /^\?<([^>]*)>/.exec(rest))) {
        subtype = 'named'; name = m[1]; i += m[0].length;
        if (!/^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u.test(name)) fail(`Invalid group name "${name}"`, start, `群組名稱「${name}」無效`);
        if (names.includes(name)) fail(`Duplicate group name "${name}"`, start, `群組名稱「${name}」重複`);
        names.push(name);
      } else if ((m = /^\?([a-z]*)(?:-([a-z]*))?:/.exec(rest)) && (m[1] || m[2])) {
        subtype = 'modifiers'; modifiers = { on: m[1], off: m[2] || '' }; i += m[0].length;
      } else { fail('Unrecognized group syntax', start, '無法辨識的群組語法'); i++; }
    }
    if (subtype === 'capture' || subtype === 'named') index = ++captureCount;
    const openEnd = i;
    const body = parseAlternation(depth + 1);
    let closed = false;
    if (src[i] === ')') { i++; closed = true; } else fail('Missing closing parenthesis', start, '缺少右括號');
    return mk('group', start, { subtype, name, index, modifiers, open: src.slice(start, openEnd), closed, children: [body] });
  }

  function parseClassItem() {
    const start = i;
    if (src[i] === '\\') return parseEscape(true);
    if (vmode && src[i] === '[') return parseClass();
    const cp = src.codePointAt(i);
    i += cp > 0xffff ? 2 : 1;
    return mk('literal', start, { codePoint: cp });
  }

  function parseClass() {
    const start = i;
    i++; // [
    let negated = false;
    if (src[i] === '^') { negated = true; i++; }
    const children = [];
    let closed = false;
    while (i < src.length) {
      if (src[i] === ']') { i++; closed = true; break; }
      if (vmode && (src.startsWith('&&', i) || src.startsWith('--', i))) {
        const s = i; const op = src.slice(i, i + 2); i += 2;
        children.push(mk('class-operator', s, { op }));
        continue;
      }
      const itemStart = i;
      const item = parseClassItem();
      if (src[i] === '-' && src[i + 1] !== undefined && src[i + 1] !== ']' && !(vmode && src[i + 1] === '-')) {
        i++;
        const hi = parseClassItem();
        const comparable = (n) => n.type === 'literal' || n.type === 'escape-char';
        if (comparable(item) && comparable(hi) && item.codePoint > hi.codePoint) fail('Range out of order in character class', itemStart, '字元範圍次序相反');
        children.push(mk('range', itemStart, { children: [item, hi] }));
      } else children.push(item);
    }
    if (!closed) fail('Missing closing bracket', start, '缺少右方括號');
    return mk('class', start, { negated, closed, children });
  }

  function parseEscape(inClass) {
    const start = i;
    i++; // backslash
    if (i >= src.length) {
      fail('Pattern ends with a backslash', start, '表達式以反斜線結尾');
      return mk('error', start, { message: 'trailing backslash' });
    }
    const c = src[i];
    if ('dDwWsS'.includes(c)) { i++; return mk('class-escape', start, { which: c }); }
    if (!inClass && (c === 'b' || c === 'B')) { i++; return mk('boundary', start, { which: c }); }
    if (inClass && c === 'b') { i++; return mk('escape-char', start, { codePoint: 8, name: 'backspace' }); }
    if (inClass && c === '-') { i++; return mk('escape-char', start, { codePoint: 45, name: 'hyphen' }); }
    if (!inClass && /[1-9]/.test(c)) {
      const m = /^\d+/.exec(src.slice(i));
      i += m[0].length;
      return mk('backreference', start, { number: Number(m[0]) });
    }
    if (c === '0') { i++; return mk('escape-char', start, { codePoint: 0, name: 'null character' }); }
    if (c === 'k' && src[i + 1] === '<') {
      const m = /^k<([^>]*)>/.exec(src.slice(i));
      if (m) { i += m[0].length; return mk('backreference', start, { name: m[1] }); }
    }
    if ((c === 'p' || c === 'P') && src[i + 1] === '{') {
      const m = /^[pP]\{([^}]*)\}/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        if (!unicode) fail('\\p{…} needs the u or v flag', start, '\\p{…} 需要 u 或 v 旗標');
        return mk('property', start, { negated: c === 'P', property: m[1] });
      }
    }
    if (c === 'u') {
      let m = /^u\{([0-9a-fA-F]+)\}/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        if (!unicode) fail('\\u{…} needs the u or v flag', start, '\\u{…} 需要 u 或 v 旗標');
        return mk('escape-char', start, { codePoint: parseInt(m[1], 16), name: 'Unicode code point', braced: true });
      }
      m = /^u([0-9a-fA-F]{4})/.exec(src.slice(i));
      if (m) { i += 5; return mk('escape-char', start, { codePoint: parseInt(m[1], 16), name: 'Unicode code unit' }); }
    }
    if (c === 'x') {
      const m = /^x([0-9a-fA-F]{2})/.exec(src.slice(i));
      if (m) { i += 3; return mk('escape-char', start, { codePoint: parseInt(m[1], 16), name: 'hexadecimal character' }); }
    }
    if (c === 'c' && /[A-Za-z]/.test(src[i + 1] || '')) {
      const code = src.charCodeAt(i + 1) % 32;
      i += 2;
      return mk('escape-char', start, { codePoint: code, name: 'control character' });
    }
    if (SIMPLE_ESCAPES[c]) { i++; return mk('escape-char', start, { codePoint: SIMPLE_ESCAPES[c][1], name: SIMPLE_ESCAPES[c][0] }); }
    const cp = src.codePointAt(i);
    i += cp > 0xffff ? 2 : 1;
    return mk('escape-char', start, { codePoint: cp, name: 'escaped literal', identity: true });
  }

  const tree = parseAlternation(0);
  if (i < src.length) fail('Unexpected input', i, '未預期的內容');
  (function walk(node) {
    if (node.type === 'backreference' && node.number !== undefined && node.number > captureCount && unicode) {
      fail(`Backreference \\${node.number} refers to a group that does not exist`, node.start, `反向參照 \\${node.number} 指向不存在的群組`);
    }
    if (node.type === 'backreference' && node.name !== undefined && !names.includes(node.name)) {
      fail(`Backreference to unknown group "${node.name}"`, node.start, `反向參照指向不存在的群組「${node.name}」`);
    }
    (node.children || []).forEach(walk);
  })(tree);
  return { tree, errors, captureCount, names, unicode, vmode };
}

/** Deepest node whose range contains the caret position (source-to-tree selection sync). */
export function nodeAt(tree, position) {
  let best = null;
  (function visit(node) {
    if (position >= node.start && position <= node.end && node.end > node.start) {
      best = node;
      for (const child of node.children || []) visit(child);
    }
  })(tree);
  return best;
}

/** Depth-first rows for tree rendering. */
export function flattenTree(tree) {
  const rows = [];
  (function visit(node, depth) {
    if (!(node.type === 'sequence' && node.children.length === 0 && depth > 0)) rows.push({ node, depth });
    for (const child of node.children || []) visit(child, depth + 1);
  })(tree, 0);
  return rows;
}
