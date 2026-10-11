import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const documentId = value => value.replaceAll('\\', '/').replace(/\.md$/i, '');
export function headingAnchor(text) {
  return text.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}
export function documentHeadings(markdown) {
  const seen = new Map(); let fenced = false;
  return markdown.split(/\r?\n/).flatMap(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return []; }
    const match = !fenced && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return [];
    const base = headingAnchor(match[2]), duplicate = seen.get(base) || 0; seen.set(base, duplicate + 1);
    return [{ level: match[1].length, text: match[2], anchor: base + (duplicate ? `-${duplicate}` : '') }];
  });
}
export async function buildDocumentationCatalog(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(relative);
      else if (/\.md$/i.test(entry.name)) files.push(relative);
    }
  }
  await walk('docs');
  for (const file of ['README.md', 'GOAL.md', 'ROADMAP.md', 'HANDOFF.md', 'CHANGELOG.md']) {
    try { if ((await stat(path.join(root, file))).isFile()) files.push(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const documents = await Promise.all(files.map(async source => {
    const markdown = await readFile(path.join(root, source), 'utf8');
    const headings = documentHeadings(markdown);
    return { id: documentId(source), source, title: headings[0]?.text || path.basename(source), category: source.includes('/wiki/') ? 'wiki' : source.startsWith('docs/features/') ? source.split('/')[2] : 'project', markdown, headings, sha256: createHash('sha256').update(markdown).digest('hex') };
  }));
  const assets = [], referenced = new Set(), rootReal = await realpath(root);
  for (const document of documents) for (const match of document.markdown.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(match[1]) || match[1].includes('\\')) continue;
    let decoded; try { decoded = decodeURIComponent(match[1].split('#')[0]); } catch { continue; }
    const source = path.posix.normalize(path.posix.join(path.posix.dirname(document.source), decoded));
    if (source.startsWith('../') || referenced.has(source)) continue;
    referenced.add(source);
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' })[path.extname(source).toLowerCase()];
    if (!mime) continue;
    try {
      const absolute = await realpath(path.join(root, source));
      if (!absolute.startsWith(`${rootReal}${path.sep}`)) continue;
      const info = await stat(absolute); if (!info.isFile() || info.size > 5 * 1024 * 1024) continue;
      const bytes = await readFile(absolute);
      assets.push({ source, mime, sha256: createHash('sha256').update(bytes).digest('hex'), dataUrl: `data:${mime};base64,${bytes.toString('base64')}` });
    } catch (error) { if (!['ENOENT', 'EACCES'].includes(error.code)) throw error; }
  }
  const changelog = parseChangelog(documents.find(document => document.source === 'CHANGELOG.md')?.markdown || '');
  return { schemaVersion: 1, documents, assets, changelog };
}
export function resolveDocumentLink(catalog, currentId, href) {
  if (typeof href !== 'string' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null;
  const [relative, rawAnchor = ''] = href.split('#');
  let decoded; try { decoded = decodeURIComponent(relative); } catch { return null; }
  const source = catalog.documents.find(row => row.id === currentId)?.source;
  if (!source) return null;
  const target = decoded ? path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded)) : source;
  const document = catalog.documents.find(row => row.source === target);
  let anchor; try { anchor = decodeURIComponent(rawAnchor); } catch { return null; }
  if (!document || (anchor && !document.headings.some(row => row.anchor === anchor))) return null;
  return { id: document.id, anchor };
}

export function parseChangelog(markdown = '') {
  const entries = []; let current;
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) { current = { title: match[1], date: match[1].match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || null, markdown: '' }; entries.push(current); }
    else if (current) current.markdown += `${line}\n`;
  }
  return entries;
}
