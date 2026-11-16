// JavaScript replacement template parser. It mirrors String.prototype.replace substitution rules:
// $$, $&, $`, $', $n / $nn (only when the group exists) and $<name> (only when named groups exist).

export function parseReplacement(template, { groupCount = 99, names = [], hasNamedGroups = names.length > 0 } = {}) {
  const parts = [];
  let literal = '';
  const flush = () => { if (literal) { parts.push({ kind: 'literal', text: literal, en: `Literal text "${literal}"`, yue: `純文字「${literal}」` }); literal = ''; } };
  for (let i = 0; i < template.length;) {
    const c = template[i];
    if (c !== '$' || i === template.length - 1) { literal += c; i++; continue; }
    const n = template[i + 1];
    if (n === '$') { flush(); parts.push({ kind: 'dollar', text: '$$', en: 'A literal dollar sign', yue: '一個 $ 符號' }); i += 2; continue; }
    if (n === '&') { flush(); parts.push({ kind: 'match', text: '$&', en: 'The whole match', yue: '整個符合的文字' }); i += 2; continue; }
    if (n === '`') { flush(); parts.push({ kind: 'before', text: '$`', en: 'The text before the match', yue: '符合文字之前的內容' }); i += 2; continue; }
    if (n === "'") { flush(); parts.push({ kind: 'after', text: "$'", en: 'The text after the match', yue: '符合文字之後的內容' }); i += 2; continue; }
    const two = /^\d\d/.exec(template.slice(i + 1, i + 3));
    if (two && Number(two[0]) >= 1 && Number(two[0]) <= groupCount) { flush(); parts.push({ kind: 'group', number: Number(two[0]), text: `$${two[0]}`, en: `Group ${Number(two[0])}`, yue: `群組 ${Number(two[0])}` }); i += 3; continue; }
    const one = /^[1-9]/.exec(n);
    if (one && Number(one[0]) <= groupCount) { flush(); parts.push({ kind: 'group', number: Number(one[0]), text: `$${one[0]}`, en: `Group ${one[0]}`, yue: `群組 ${one[0]}` }); i += 2; continue; }
    if (n === '<' && hasNamedGroups) {
      const end = template.indexOf('>', i + 2);
      if (end > 0) {
        const name = template.slice(i + 2, end);
        flush();
        parts.push({ kind: 'named', name, text: template.slice(i, end + 1), known: names.includes(name), en: `Named group "${name}"${names.includes(name) ? '' : ' (no such group: becomes empty)'}`, yue: `命名群組「${name}」${names.includes(name) ? '' : '（沒有此群組，會變為空白）'}` });
        i = end + 1; continue;
      }
    }
    literal += c; i++;
  }
  flush();
  return parts;
}
