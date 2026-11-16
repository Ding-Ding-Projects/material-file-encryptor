// Flavor catalogue and static JavaScript-to-flavor syntax conversion.
//
// Only the JavaScript flavor executes in this surface. Every other flavor is reached by converting
// the parsed JavaScript pattern into that flavor's syntax with explicit incompatibility reports.
// Converted patterns are never executed here, and a conversion never promises equivalent matching
// beyond the differences it lists.
import { parsePattern } from './parser.js';
import { parseReplacement } from './replacement.js';

export const flavors = Object.freeze([
  { id: 'javascript', name: 'JavaScript (ECMAScript)', yue: 'JavaScript (ECMAScript)', executes: true, targets: 'JavaScript, TypeScript, Node.js' },
  { id: 'python', name: 'Python re', yue: 'Python re', executes: false, targets: 'Python 3 re module' },
  { id: 'dotnet', name: '.NET', yue: '.NET', executes: false, targets: 'C#, PowerShell, VB.NET' },
  { id: 'java', name: 'Java', yue: 'Java', executes: false, targets: 'java.util.regex' },
  { id: 'pcre', name: 'PCRE2', yue: 'PCRE2', executes: false, targets: 'PHP, R, many tools' },
  { id: 'ruby', name: 'Ruby (Onigmo)', yue: 'Ruby (Onigmo)', executes: false, targets: 'Ruby' },
  { id: 'go', name: 'Go (RE2)', yue: 'Go (RE2)', executes: false, targets: 'Go regexp' },
  { id: 'rust', name: 'Rust regex', yue: 'Rust regex', executes: false, targets: 'Rust regex crate' }
]);

const FACTS = {
  python: { lookahead: true, lookbehind: 'fixed', backrefs: true, namedOpen: n => `(?P<${n}>`, namedRef: n => `(?P=${n})`, shorthand: 'unicode', props: false },
  dotnet: { lookahead: true, lookbehind: 'any', backrefs: true, namedOpen: n => `(?<${n}>`, namedRef: n => `\\k<${n}>`, shorthand: 'unicode', props: 'categories' },
  java: { lookahead: true, lookbehind: 'bounded', backrefs: true, namedOpen: n => `(?<${n}>`, namedRef: n => `\\k<${n}>`, shorthand: 'ascii', props: 'java' },
  pcre: { lookahead: true, lookbehind: 'alternatives', backrefs: true, namedOpen: n => `(?<${n}>`, namedRef: n => `\\k<${n}>`, shorthand: 'ascii', props: 'pcre' },
  ruby: { lookahead: true, lookbehind: 'alternatives', backrefs: true, namedOpen: n => `(?<${n}>`, namedRef: n => `\\k<${n}>`, shorthand: 'ascii', props: 'pcre' },
  go: { lookahead: false, lookbehind: false, backrefs: false, namedOpen: n => `(?P<${n}>`, namedRef: null, shorthand: 'ascii', props: 'pcre' },
  rust: { lookahead: false, lookbehind: false, backrefs: false, namedOpen: n => `(?P<${n}>`, namedRef: null, shorthand: 'unicode', props: 'rust' }
};

const GENERAL_CATEGORY = /^(?:L[ultmo]?|M[nce]?|N[dlo]?|P[cdseifo]?|S[mcko]?|Z[slp]?|C[cfson]?)$/;
const SCRIPT = /^(?:Script|sc|Script_Extensions|scx)=([A-Za-z_]+)$/;

function width(node) {
  const sum = (a, b) => [a[0] + b[0], a[1] + b[1]];
  switch (node.type) {
    case 'sequence': return node.children.reduce((acc, c) => sum(acc, width(c)), [0, 0]);
    case 'alternation': { const ws = node.children.map(width); return [Math.min(...ws.map(w => w[0])), Math.max(...ws.map(w => w[1]))]; }
    case 'quantifier': { const [lo, hi] = width(node.children[0]); return [node.min * lo, node.max === Infinity ? (hi === 0 ? 0 : Infinity) : node.max * hi]; }
    case 'group': return /lookahead|lookbehind/.test(node.subtype) ? [0, 0] : width(node.children[0]);
    case 'anchor': case 'boundary': return [0, 0];
    case 'backreference': return [0, Infinity];
    default: return [1, 1];
  }
}

function lookbehindProblem(node, mode) {
  const body = node.children[0];
  const [lo, hi] = width(body);
  if (mode === 'any') return null;
  if (mode === 'fixed') return lo === hi ? null : ['Python needs a fixed-width lookbehind, but this one varies in width.', 'Python 的後顧必須是固定長度，但此後顧長度不固定。'];
  if (mode === 'bounded') return hi !== Infinity ? null : ['Java needs a bounded lookbehind, but this one has no maximum width.', 'Java 的後顧必須有長度上限，但此後顧沒有上限。'];
  const alternatives = body.type === 'alternation' ? body.children : [body];
  return alternatives.every(a => { const [l, h] = width(a); return l === h; }) ? null : ['This engine needs every lookbehind alternative to have a fixed width.', '此引擎要求後顧的每個選項都是固定長度。'];
}

const hex = (cp, min = 2) => cp.toString(16).toUpperCase().padStart(min, '0');

function escapeForTarget(cp, target, braced) {
  if (cp === 0) return '\\x00';
  if (cp <= 0xff) return `\\x${hex(cp)}`;
  if (cp <= 0xffff) return ['pcre', 'go', 'rust'].includes(target) ? `\\x{${hex(cp, 4)}}` : `\\u${hex(cp, 4)}`;
  if (target === 'python') return `\\U${hex(cp, 8)}`;
  if (target === 'dotnet') { const s = String.fromCodePoint(cp); return `\\u${hex(s.charCodeAt(0), 4)}\\u${hex(s.charCodeAt(1), 4)}`; }
  if (target === 'ruby') return `\\u{${hex(cp, 1)}}`;
  return `\\x{${hex(cp, 1)}}`;
}

const SAFE_IN_CLASS = /[\[&~|]/;

export function convertPattern(pattern, flags, targetId) {
  const flavor = flavors.find(f => f.id === targetId);
  if (!flavor) throw Error('Unknown flavor');
  if (flavor.id === 'javascript') return { flavor: flavor.id, status: 'native', pattern, prefix: '', body: pattern, flags, warnings: [], unsupported: [], notes: [] };
  const facts = FACTS[targetId];
  const parsed = parsePattern(pattern, flags);
  const warnings = [], unsupported = [], notes = [];
  const warn = (en, yue) => { if (!warnings.some(w => w.en === en)) warnings.push({ en, yue }); };
  const refuse = (en, yue) => { if (!unsupported.some(w => w.en === en)) unsupported.push({ en, yue }); };
  if (parsed.errors.length) { for (const e of parsed.errors) refuse(`Pattern is not valid JavaScript syntax: ${e.message}`, `表達式不是有效的 JavaScript 語法：${e.yue || e.message}`); return finish(); }
  const multiline = flags.includes('m');
  const usage = { dot: false, shorthand: false, anchorsM: false, backref: false };

  function ser(node, inClass = false) {
    switch (node.type) {
      case 'sequence': return node.children.map(c => ser(c, inClass)).join('');
      case 'alternation': return node.children.map(c => ser(c, inClass)).join('|');
      case 'literal': {
        const ch = String.fromCodePoint(node.codePoint);
        if (inClass) return SAFE_IN_CLASS.test(ch) ? `\\${ch}` : ch;
        if (ch === '{' || ch === '}') return `\\${ch}`;
        return ch;
      }
      case 'escape-char': {
        if (node.identity) return /[A-Za-z0-9]/.test(String.fromCodePoint(node.codePoint)) ? String.fromCodePoint(node.codePoint) : node.text;
        if (['tab', 'line feed', 'carriage return', 'form feed'].includes(node.name)) return node.text;
        if (node.name === 'hyphen') return '\\-';
        return escapeForTarget(node.codePoint, targetId, node.braced);
      }
      case 'dot': usage.dot = true; return '.';
      case 'anchor':
        if (multiline) { usage.anchorsM = true; return node.which; }
        if (node.which === '^') return targetId === 'ruby' ? '\\A' : '^';
        return targetId === 'python' ? '\\Z' : ['go', 'rust'].includes(targetId) ? '$' : '\\z';
      case 'boundary': usage.shorthand = true; return node.text;
      case 'class-escape': usage.shorthand = true; return node.text;
      case 'property': return property(node);
      case 'backreference': {
        usage.backref = true;
        if (!facts.backrefs) { refuse(`${flavor.name} has no backreferences.`, `${flavor.yue} 不支援反向參照。`); return node.text; }
        return node.name !== undefined ? facts.namedRef(node.name) : node.text;
      }
      case 'class': {
        if (node.children.some(c => c.type === 'class' || c.type === 'class-operator')) { refuse('Class set operations (v flag) have no safe direct equivalent.', '字元類別集合運算（v 旗標）沒有可靠的直接對應。'); return node.text; }
        if (!node.negated && node.children.length === 0) { refuse('The empty class [] is JavaScript-specific.', '空類別 [] 只適用於 JavaScript。'); return node.text; }
        if (node.negated && node.children.length === 0) { refuse('The class [^] is JavaScript-specific.', '類別 [^] 只適用於 JavaScript。'); return node.text; }
        return `[${node.negated ? '^' : ''}${node.children.map(c => ser(c, true)).join('')}]`;
      }
      case 'range': return `${ser(node.children[0], true)}-${ser(node.children[1], true)}`;
      case 'group': {
        const inner = ser(node.children[0]);
        let open;
        if (node.subtype === 'capture') open = '(';
        else if (node.subtype === 'named') open = facts.namedOpen(node.name);
        else if (node.subtype === 'noncapture' || node.subtype === 'modifiers') open = node.open;
        else {
          const behind = node.subtype.includes('lookbehind');
          if (behind ? !facts.lookbehind : !facts.lookahead) { refuse(`${flavor.name} does not support ${behind ? 'lookbehind' : 'lookahead'}.`, `${flavor.yue} 不支援${behind ? '後顧' : '前瞻'}。`); return node.text; }
          if (behind) { const problem = lookbehindProblem(node, facts.lookbehind); if (problem) refuse(problem[0], problem[1]); }
          open = node.open;
        }
        return `${open}${inner})`;
      }
      case 'quantifier': return ser(node.children[0]) + node.quantText;
      default: refuse(`Cannot convert syntax node "${node.type}".`, `無法轉換語法節點「${node.type}」。`); return node.text;
    }
  }

  function property(node) {
    const mode = facts.props;
    const p = node.property, neg = node.negated ? 'P' : 'p';
    if (!mode) { refuse('Python re does not support \\p{…} Unicode properties (the third-party regex module does).', 'Python re 不支援 \\p{…} Unicode 屬性（第三方 regex 模組才支援）。'); return node.text; }
    if (GENERAL_CATEGORY.test(p)) return `\\${neg}{${p}}`;
    const script = SCRIPT.exec(p);
    if (script && mode !== 'categories') {
      const name = script[1];
      if (mode === 'java') return `\\${neg}{Is${name}}`;
      if (mode === 'rust') return `\\${neg}{Script=${name}}`;
      return `\\${neg}{${name}}`;
    }
    refuse(`The property "${p}" has no verified mapping for ${flavor.name}.`, `屬性「${p}」在 ${flavor.yue} 沒有已驗證的對應。`);
    return node.text;
  }

  const body = ser(parsed.tree);
  if (usage.backref) warn('A backreference to a group that did not participate fails to match here but matches the empty string in JavaScript.', '如反向參照的群組沒有參與匹配，在此引擎會失敗，但在 JavaScript 會符合空字串。');
  if (usage.dot) warn('"." also excludes \\r, \\u2028 and \\u2029 in JavaScript; here it excludes only \\n (or differs by engine).', '"." 在 JavaScript 還會排除 \\r、\\u2028、\\u2029；此引擎只排除 \\n（或因引擎而異）。');
  if (usage.anchorsM) warn('With multiline, ^ and $ also treat \\r and Unicode line separators as line breaks in JavaScript; here only \\n (or differs by engine).', '多行模式下，JavaScript 的 ^ 與 $ 也視 \\r 及 Unicode 行分隔符為換行；此引擎只視 \\n（或因引擎而異）。');
  if (usage.shorthand) {
    if (facts.shorthand === 'unicode') warn('\\d, \\w and \\b also cover non-ASCII characters here; JavaScript limits them to ASCII.', '\\d、\\w 及 \\b 在此引擎也涵蓋非 ASCII 字元；JavaScript 只限 ASCII。');
    else warn('\\s matches only ASCII whitespace here; JavaScript also matches Unicode spaces.', '\\s 在此引擎只符合 ASCII 空白；JavaScript 亦符合 Unicode 空白。');
  }
  for (const flag of flags) {
    if (flag === 'y') refuse('The sticky flag (y) has no pattern-level equivalent; use the engine API.', '黏著旗標（y）沒有表達式層級的對應，須用引擎 API。');
    if (flag === 'd') notes.push({ en: 'Flag d (match indices) is JavaScript-only and was dropped.', yue: '旗標 d（符合位置）只屬 JavaScript，已略去。' });
    if (flag === 'g') notes.push({ en: 'Flag g (global) becomes a call choice: find-all or replace-all.', yue: '旗標 g（全域）改為呼叫方式：尋找全部或取代全部。' });
    if (flag === 'u' || flag === 'v') notes.push({ en: `Flag ${flag} is JavaScript-specific; Unicode handling here is the engine default.`, yue: `旗標 ${flag} 只屬 JavaScript，此引擎的 Unicode 處理依引擎預設。` });
  }
  let inline = '';
  if (flags.includes('i')) inline += 'i';
  if (flags.includes('s')) inline += targetId === 'ruby' ? 'm' : 's';
  if (flags.includes('m') && targetId !== 'ruby') inline += 'm';
  return finish(body, inline);

  function finish(bodyText = '', inline = '') {
    const prefix = inline ? `(?${inline})` : '';
    const status = unsupported.length ? 'unsupported' : (warnings.length ? 'converted-with-differences' : 'converted');
    return { flavor: flavor.id, status, pattern: unsupported.length ? '' : prefix + bodyText, prefix, body: bodyText, flags: '', warnings, unsupported, notes };
  }
}

/** Convert a JavaScript replacement template to the target flavor's syntax. */
export function convertReplacement(template, targetId, { groupCount = 99, names = [] } = {}) {
  const parts = parseReplacement(template, { groupCount, names });
  if (targetId === 'javascript') return { ok: true, text: template, unsupported: [] };
  const unsupported = [];
  let text = '';
  const literalEscape = { python: s => s.replace(/\\/g, '\\\\'), dotnet: s => s.replace(/\$/g, '$$$$'), java: s => s.replace(/[\\$]/g, '\\$&'), pcre: s => s.replace(/[\\$]/g, '\\$&'), ruby: s => s.replace(/\\/g, '\\\\'), go: s => s.replace(/\$/g, '$$$$'), rust: s => s.replace(/\$/g, '$$$$') }[targetId];
  parts.forEach((part, i) => {
    const next = parts[i + 1];
    switch (part.kind) {
      case 'literal': text += literalEscape(part.text); break;
      case 'dollar': text += { python: '$', ruby: '$', dotnet: '$$', go: '$$', rust: '$$', java: '\\$', pcre: '\\$' }[targetId]; break;
      case 'match': text += { python: '\\g<0>', dotnet: '$&', java: '$0', pcre: '${0}', ruby: '\\0', go: '${0}', rust: '${0}' }[targetId]; break;
      case 'before': if (targetId === 'dotnet') text += '$`'; else if (targetId === 'ruby') text += '\\`'; else unsupported.push({ en: 'The text before the match ($`) has no equivalent in this flavor.', yue: '符合文字之前的內容（$`）在此引擎沒有對應。' }); break;
      case 'after': if (targetId === 'dotnet') text += "$'"; else if (targetId === 'ruby') text += "\\'"; else unsupported.push({ en: "The text after the match ($') has no equivalent in this flavor.", yue: "符合文字之後的內容（$'）在此引擎沒有對應。" }); break;
      case 'group':
        if (targetId === 'java' && next?.kind === 'literal' && /^\d/.test(next.text)) unsupported.push({ en: 'A group reference followed by a digit is ambiguous in Java replacements.', yue: 'Java 取代文字中，群組參照後面緊接數字會有歧義。' });
        text += { python: `\\g<${part.number}>`, dotnet: `\${${part.number}}`, java: `$${part.number}`, pcre: `\${${part.number}}`, ruby: `\\${part.number}`, go: `\${${part.number}}`, rust: `\${${part.number}}` }[targetId];
        break;
      case 'named':
        if (targetId === 'pcre') unsupported.push({ en: 'Named group references are not supported in PHP preg_replace templates.', yue: 'PHP preg_replace 取代文字不支援命名群組參照。' });
        else text += { python: `\\g<${part.name}>`, dotnet: `\${${part.name}}`, java: `\${${part.name}}`, ruby: `\\k<${part.name}>`, go: `\${${part.name}}`, rust: `\${${part.name}}` }[targetId];
        break;
      default: break;
    }
  });
  return { ok: unsupported.length === 0, text: unsupported.length ? '' : text, unsupported };
}

/** Side-by-side comparison of the current pattern across every flavor. */
export function compareFlavors(pattern, flags, replacement = '') {
  return flavors.map(f => {
    const converted = convertPattern(pattern, flags, f.id);
    const info = parsePattern(pattern, flags);
    const rep = replacement ? convertReplacement(replacement, f.id, { groupCount: info.captureCount, names: info.names }) : null;
    return { flavor: f, converted, replacement: rep };
  });
}
