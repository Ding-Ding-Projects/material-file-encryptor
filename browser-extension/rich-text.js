// Turns a model response into a small, DOM-free token tree: paragraphs, headings, lists, fenced code,
// and inline code, bold, italics and links. Nothing here builds markup. Raw HTML in the input stays literal
// text, and only http and https links without embedded credentials become links.

export const MAX_CHARS = 200000;
const MAX_DEPTH = 3;
const FENCE_OPEN = /^ {0,3}```\s*([A-Za-z0-9_+#.-]{0,30})\s*$/, FENCE_CLOSE = /^ {0,3}```\s*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$/, BULLET = /^\s*[-*+][ \t]+(.+)$/, ORDERED = /^\s*\d{1,3}[.)][ \t]+(.+)$/;
const BARE_URL = /https?:\/\/[^\s<>"'`]+/y;

/** The normalised address of a link that is safe to open, or '' for anything else. */
export function safeLink(raw) {
  try { const url = new URL(String(raw)); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && url.hostname ? url.href : ''; } catch { return ''; }
}

const blank = char => char === undefined || /\s/.test(char);
const alnum = char => char !== undefined && /[A-Za-z0-9]/.test(char);

// The next place a closing marker can sit: not preceded by a space, and not part of a longer run.
function closer(source, marker, from) {
  for (let at = source.indexOf(marker, from); at >= 0; at = source.indexOf(marker, at + 1)) {
    if (blank(source[at - 1])) continue;
    if (marker.length === 1 && (source[at + 1] === marker || source[at - 1] === marker)) continue;
    if (marker === '_' && alnum(source[at + 1])) continue;
    return at;
  }
  return -1;
}

function inline(source, depth = 0) {
  const out = [];
  let buffer = '', i = 0;
  const flush = () => { if (buffer) { out.push({type: 'text', text: buffer}); buffer = ''; } };
  while (i < source.length) {
    const char = source[i];
    if (char === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) { flush(); out.push({type: 'code', text: source.slice(i + 1, end)}); i = end + 1; continue; }
    }
    if (depth < MAX_DEPTH && char === '*' && source[i + 1] === '*' && !blank(source[i + 2])) {
      const end = closer(source, '**', i + 2);
      if (end > i + 2) { flush(); out.push({type: 'bold', children: inline(source.slice(i + 2, end), depth + 1)}); i = end + 2; continue; }
    }
    if (depth < MAX_DEPTH && (char === '*' || char === '_') && source[i + 1] !== char && !blank(source[i + 1]) && !(char === '_' && alnum(source[i - 1]))) {
      const end = closer(source, char, i + 1);
      if (end > i + 1) { flush(); out.push({type: 'italic', children: inline(source.slice(i + 1, end), depth + 1)}); i = end + 1; continue; }
    }
    if (char === '[') {
      const close = source.indexOf(']', i + 1);
      if (close > i + 1 && source[close + 1] === '(' && !source.slice(i + 1, close).includes('\n')) {
        const end = source.indexOf(')', close + 2), target = end > close + 2 ? source.slice(close + 2, end) : '', href = /\s/.test(target) ? '' : safeLink(target);
        if (href) { flush(); out.push({type: 'link', href, text: source.slice(i + 1, close)}); i = end + 1; continue; }
      }
    }
    if (char === 'h' && !alnum(source[i - 1])) {
      BARE_URL.lastIndex = i;
      const match = BARE_URL.exec(source);
      if (match) {
        let raw = match[0].replace(/[.,;:!?]+$/, '');
        while (raw.endsWith(')') && (raw.match(/\)/g) || []).length > (raw.match(/\(/g) || []).length) raw = raw.slice(0, -1).replace(/[.,;:!?]+$/, '');
        const href = safeLink(raw);
        if (href) { flush(); out.push({type: 'link', href, text: raw}); i += raw.length; continue; }
      }
    }
    buffer += char; i++;
  }
  flush();
  return out;
}

/** Parses a response into block tokens. Unclosed code fences run to the end of the text. */
export function parseRichText(input) {
  const text = String(input ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return [];
  if (text.length > MAX_CHARS) return [{type: 'paragraph', children: [{type: 'text', text}]}];
  const lines = text.split('\n'), blocks = [];
  let paragraph = [], list = null;
  const endParagraph = () => { if (paragraph.length) { blocks.push({type: 'paragraph', children: inline(paragraph.join('\n'))}); paragraph = []; } };
  const endList = () => { if (list) { blocks.push({type: 'list', ordered: list.ordered, items: list.items.map(item => inline(item))}); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], fence = FENCE_OPEN.exec(line);
    if (fence) {
      endParagraph(); endList();
      const body = []; let closed = false;
      for (i++; i < lines.length; i++) { if (FENCE_CLOSE.test(lines[i])) { closed = true; break; } body.push(lines[i]); }
      blocks.push({type: 'code', lang: fence[1], text: body.join('\n'), closed});
      continue;
    }
    if (!line.trim()) { endParagraph(); endList(); continue; }
    const heading = HEADING.exec(line);
    if (heading) { endParagraph(); endList(); blocks.push({type: 'heading', level: heading[1].length, children: inline(heading[2])}); continue; }
    const bullet = BULLET.exec(line), ordered = bullet ? null : ORDERED.exec(line), item = bullet || ordered;
    if (item) {
      endParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) endList();
      if (!list) list = {ordered: isOrdered, items: []};
      list.items.push(item[1]);
      continue;
    }
    if (list && /^\s/.test(line)) { list.items[list.items.length - 1] += '\n' + line.trim(); continue; }
    endList();
    paragraph.push(line);
  }
  endParagraph(); endList();
  return blocks;
}
