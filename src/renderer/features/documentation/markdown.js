// A DOM-only Markdown renderer: no source HTML, URL, or attribute is executed.
function node(tag, text) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; }
export function resolveCatalogUrl(catalog, source, href, image = false) {
  if (typeof href !== 'string' || /[\u0000-\u001f\u007f\\]/.test(href)) return null;
  let url; try { url = new URL(href, `https://documentation.invalid/${source}`); } catch { return null; }
  if (url.origin !== 'https://documentation.invalid') return !image && ['https:', 'http:'].includes(url.protocol) ? { external: true, href: url.href } : null;
  let file, anchor; try { file = decodeURIComponent(url.pathname).slice(1); anchor = decodeURIComponent(url.hash.slice(1)); } catch { return null; }
  if (image) { const asset = catalog.assets?.find(row => row.source === file); return asset && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(asset.dataUrl) ? { href: asset.dataUrl } : null; }
  const target = catalog.documents.find(row => row.source === file);
  if (!target || (anchor && !target.headings.some(row => row.anchor === anchor))) return null;
  return { id: target.id, anchor, href: `#${encodeURIComponent(target.id)}${anchor ? `::${encodeURIComponent(anchor)}` : ''}` };
}
function parseLink(text, offset) {
  const image = text[offset] === '!', start = offset + (image ? 1 : 0);
  if (text[start] !== '[') return null;
  const close = text.indexOf('](', start + 1); if (close < 0) return null;
  let end = close + 2, depth = 1;
  for (; end < text.length; end++) { if (text[end] === '(') depth++; if (text[end] === ')' && --depth === 0) break; }
  if (depth) return null;
  const destination = text.slice(close + 2, end).trim().replace(/^<|>$/g, '').replace(/\s+["'].*["']$/, '');
  return { image, label: text.slice(start + 1, close), destination, end: end + 1 };
}
export function appendInline(parent, text, context, depth = 0) {
  if (depth > 12) { parent.append(document.createTextNode(text)); return; }
  let offset = 0, plain = '';
  const flush = () => { if (plain) parent.append(document.createTextNode(plain)); plain = ''; };
  while (offset < text.length) {
    if (text[offset] === '\\' && offset + 1 < text.length) { plain += text[offset + 1]; offset += 2; continue; }
    const link = parseLink(text, offset);
    if (link) {
      flush(); const target = resolveCatalogUrl(context.catalog, context.source, link.destination, link.image);
      if (link.image) {
        if (target) { const img = node('img'); img.src = target.href; img.alt = link.label; img.loading = 'lazy'; img.style.maxWidth = '100%'; parent.append(img); }
        else { const fallback = node('span', `${link.label} (${context.translate('Image unavailable')})`); fallback.className = 'documentation-image-unavailable'; parent.append(fallback); }
      } else if (target) {
        const anchor = node('a'); anchor.href = target.href; appendInline(anchor, link.label, context, depth + 1);
        if (target.external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.dataset.external = 'true'; anchor.title = context.translate('Opens an external website'); }
        else anchor.addEventListener('click', event => { event.preventDefault(); context.open(target.id, target.anchor); });
        parent.append(anchor);
      } else { const unavailable = node('span'); appendInline(unavailable, link.label, context, depth + 1); unavailable.title = context.translate('Linked content is not bundled.'); parent.append(unavailable); }
      offset = link.end; continue;
    }
    const markers = [['`', 'code'], ['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']];
    let matched = false;
    for (const [marker, tag] of markers) {
      if (!text.startsWith(marker, offset)) continue;
      const end = text.indexOf(marker, offset + marker.length); if (end <= offset + marker.length) continue;
      flush(); const child = node(tag), inside = text.slice(offset + marker.length, end);
      if (tag === 'code') child.textContent = inside; else appendInline(child, inside, context, depth + 1);
      parent.append(child); offset = end + marker.length; matched = true; break;
    }
    if (!matched) { plain += text[offset]; offset++; }
  }
  flush();
}
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(value => value.trim().replaceAll('\\|', '|'));
const separator = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
export function renderMarkdown(host, markdown, context) {
  context = { ...context, headingCursor: context.headingCursor || { value: 0 } };
  host.replaceChildren(); const lines = markdown.replaceAll('\r\n', '\n').split('\n'); let i = 0;
  const append = (tag, text, into = host) => { const element = node(tag); appendInline(element, text, context); into.append(element); return element; };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*<details>\s*$/.test(line)) {
      const body = []; let nested = 1; i++; let summary = context.translate('Details');
      if (/^\s*<summary>.*<\/summary>\s*$/.test(lines[i] || '')) summary = lines[i++].replace(/^\s*<summary>|<\/summary>\s*$/g, '');
      while (i < lines.length) { const value = lines[i++]; if (/^\s*<details>\s*$/.test(value)) nested++; if (/^\s*<\/details>\s*$/.test(value) && --nested === 0) break; body.push(value); }
      const details = node('details'), label = node('summary'), content = node('div'); appendInline(label, summary, context); renderMarkdown(content, body.join('\n'), context); details.append(label, content); host.append(details); continue;
    }
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) { const buffer = []; i++; while (i < lines.length && !(new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`)).test(lines[i])) buffer.push(lines[i++]); i++; const pre = node('pre'), code = node('code', buffer.join('\n')); code.dataset.language = fence[2].trim(); pre.style.overflowX = 'auto'; pre.append(code); host.append(pre); continue; }
    const title = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (title) { const value = append(`h${title[1].length}`, title[2]); value.id = context.headings[context.headingCursor.value++]?.anchor || ''; i++; continue; }
    if (i + 1 < lines.length && separator(lines[i + 1])) {
      const wrapper = node('div'); wrapper.style.overflowX = 'auto'; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', context.translate('Documentation table')); wrapper.tabIndex = 0;
      const table = node('table'), head = node('thead'), row = node('tr');
      const alignment = cells(lines[i + 1]).map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      cells(line).forEach((cell, index) => { const th = append('th', cell, row); th.scope = 'col'; th.style.textAlign = alignment[index]; }); head.append(row); table.append(head); const body = node('tbody'); i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { const tr = node('tr'); cells(lines[i++]).forEach((cell, index) => { const td = append('td', cell, tr); td.style.textAlign = alignment[index] || 'left'; }); body.append(tr); }
      table.append(body); wrapper.append(table); host.append(wrapper); continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { host.append(node('hr')); i++; continue; }
    if (/^\s*>/.test(line)) { const buffer = []; while (i < lines.length && /^\s*>/.test(lines[i])) buffer.push(lines[i++].replace(/^\s*>\s?/, '')); const quote = node('blockquote'); renderMarkdown(quote, buffer.join('\n'), { ...context, headings: [] }); host.append(quote); continue; }
    const listMatch = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[2]), list = node(ordered ? 'ol' : 'ul'); if (ordered) list.start = parseInt(listMatch[2], 10);
      const indentation = listMatch[1].length;
      while (i < lines.length) { const item = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i]); if (!item || item[1].length !== indentation || /^\d/.test(item[2]) !== ordered) break; const li = node('li'); const task = /^\[([ xX])\]\s+(.*)$/.exec(item[3]); if (task) { const box = node('input'); box.type = 'checkbox'; box.disabled = true; box.checked = task[1] !== ' '; box.setAttribute('aria-label', task[2]); li.append(box); appendInline(li, task[2], context); } else appendInline(li, item[3], context); list.append(li); i++;
        const nested = []; while (i < lines.length && lines[i].trim() && /^\s+/.test(lines[i]) && lines[i].match(/^\s*/)[0].length > indentation) nested.push(lines[i++].slice(indentation + 2));
        if (nested.length) { const content = node('div'); renderMarkdown(content, nested.join('\n'), context); li.append(content); }
      }
      host.append(list); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|\s*```|\s*~~~|\s*>|\s*[-+*]\s|\s*\d+[.)]\s)/.test(lines[i]) && !(i + 1 < lines.length && separator(lines[i + 1]))) paragraph.push(lines[i++]);
    append('p', paragraph.join('\n'));
  }
}
