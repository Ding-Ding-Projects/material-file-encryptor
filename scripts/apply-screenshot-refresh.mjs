// Points every reference at the images in a refresh folder and removes the superseded files.
//
// Usage: node scripts/apply-screenshot-refresh.mjs [--folder docs/images/captures/refresh-<short>]
//
// Reads <folder>/manifest.json (written by refresh-screenshots.mjs), then:
//  - rewrites docs/site/public-images.mjs with the new path, hash, size and dimensions of each replaced image;
//  - rewrites docs/site/extension-gallery.json from the extension captures;
//  - rewrites the old image paths in README.md;
//  - deletes the superseded image files (Git history keeps the originals).
// Desktop images are replaced only when the manifest holds a desktop capture with the same name; the rest are reported as pending.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {flags} from './extension-browser.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const CAPTURES = 'docs/images/captures/';

/** Old tracked image -> manifest entry (kind, name) that replaces it. */
export const REPLACEMENTS = {
  'site-guidance-normal-83e14d86.png': ['site', 'home-1280x900-light-en'],
  'site-guidance-narrow-83e14d86.png': ['site', 'home-320x800-dpr2-light-en'],
  'extension-site-9a78fd3/local-models-article-360-light-en.png': ['site', 'article-local-models-360x800-light-en'],
  'extension-home-cfc5e00/home-1280x900-light-en.png': ['extension', 'home-1280x900-light-en'],
  'extension-home-cfc5e00/home-360x780-dark-bilingual.png': ['extension', 'home-360x780-dark-bilingual'],
  'extension-home-cfc5e00/popup-380-light-en.png': ['extension', 'popup-380-light-en'],
  'extension-home-cfc5e00/popup-380-dark-bilingual.png': ['extension', 'popup-380-dark-bilingual'],
  'extension-home-cfc5e00/section-connection-1280x900-light-en.png': ['extension', 'section-connection-1280x900-light-en'],
  'extension-home-cfc5e00/section-personalization-360x780-dark-bilingual.png': ['extension', 'section-personalization-360x780-dark-bilingual'],
  'extension-models-45ccb91/models-connected-light-en.png': ['extension', 'models-connected-light-en'],
  'extension-models-45ccb91/models-chat-light-en.png': ['extension', 'models-chat-light-en'],
  'extension-status-78e606f/status-release-light-en.png': ['extension', 'status-release-light-en'],
  'extension-status-78e606f/status-coverage-narrow-light-en.png': ['extension', 'status-coverage-narrow-light-en'],
  'extension-status-d2c8b67/status-installer-link-light-en.png': ['extension', 'status-installer-link-light-en'],
  'extension-desktop-8b6d493/status-desktop-unpaired-light-en.png': ['extension', 'status-desktop-unpaired-light-en'],
  'extension-offline-0815968/offline-documentation-search-light-en.png': ['extension', 'offline-documentation-search-light-en'],
  'extension-matrix-cd51796/options-connection_minimum_1x_light_yue.png': ['extension', 'matrix-options-connection_minimum_1x_light_yue'],
  'extension-matrix-cd51796/options-models_minimum_2x_dark_bilingual.png': ['extension', 'matrix-options-models_minimum_2x_dark_bilingual'],
  'extension-matrix-cd51796/popup_minimum_2x_dark_bilingual.png': ['extension', 'matrix-popup_minimum_2x_dark_bilingual'],
  // Desktop images: replaced only when the desktop manifest holds a capture of the same name.
  'material-2a9cb388/drive-light-en.png': ['desktop', 'drive-locked-light-en'],
  'material-2a9cb388/converter-dark-en.png': ['desktop', 'tools-converter-dark-en'],
  'material-2a9cb388/workflow-light-yue.png': ['desktop', 'tools-documents-light-yue'],
  'material-2a9cb388/converter-light-bilingual.png': ['desktop', 'tools-converter-light-bilingual'],
  'material-2a9cb388/dialog-consent-light-en.png': ['desktop', 'force-lock-dialog-light-en'],
  'material-2a9cb388/dialog-consent-dark-en.png': ['desktop', 'force-lock-dialog-dark-en'],
};

/** New images that older documentation did not show; they are added to the public image allowlist when they exist. */
export const ADDITIONS = [['site', 'home-1280x900-light-en'], ['site', 'article-local-models-360x800-light-en'], ['site', 'library-1280x900-light-en'], ['extension', 'section-publishing-1280x900-light-en'], ['extension', 'section-servers-1280x900-light-en']];

/** Gallery metadata per extension capture: the stable record id, the surface label and what the image does and does not show. */
export const GALLERY = {
  'home-1280x900-light-en': ['extension-home', 'options: Home', 'The workspace Home grid with one card per section. No desktop was paired, so connection states read as unavailable.'],
  'home-360x780-dark-bilingual': ['extension-home-narrow-dark-bilingual', 'options: Home', 'The Home grid at 360 CSS pixels in the dark theme with bilingual labels.'],
  'popup-380-light-en': ['extension-popup', 'popup', 'Pairing controls above a launcher with one button per section. Not paired.'],
  'popup-380-dark-bilingual': ['extension-popup-dark-bilingual', 'popup', 'The popup in the dark theme with bilingual labels. Not paired.'],
  'section-connection-1280x900-light-en': ['extension-connection', 'options: Connection', 'Connection section with no desktop paired; every observation reads as unavailable.'],
  'section-personalization-360x780-dark-bilingual': ['extension-personalization-narrow-dark-bilingual', 'options: Personalization', 'Language, theme and playfulness controls at 360 CSS pixels in the dark theme.'],
  'section-publishing-1280x900-light-en': ['extension-publishing', 'options: Progress and publication', 'Progress note form with the send action disabled until the preview is reviewed. Nothing was sent.'],
  'section-servers-1280x900-light-en': ['extension-servers', 'options: Servers', 'Servers section before pairing; reads and changes are disabled and no server data is shown.'],
  'models-connected-light-en': ['extension-models-connected', 'options: Models', 'Connected to a fake local model server; the permission prompt was stubbed for this capture. Not a real Ollama server or an installed copy.'],
  'models-chat-light-en': ['extension-models-chat', 'options: Models', 'Streamed reply from a fake local model server rendered as safe rich text; a javascript: address stays plain text. Not a real Ollama server.'],
  'status-release-light-en': ['extension-status-release', 'options: Status', 'Read the live published releases at capture time and shows the newest one with its dish photo and coverage inventory.'],
  'status-coverage-narrow-light-en': ['extension-status-coverage-narrow', 'options: Status', 'Feature coverage list filtered by a search at 360 CSS pixels; records, not proof of delivery.'],
  'status-installer-link-light-en': ['extension-status-installer-link', 'options: Status', 'Desktop installer link offered only for the verified uploaded setup asset of the found release.'],
  'status-desktop-unpaired-light-en': ['extension-status-desktop-unpaired', 'options: Status', 'Desktop section after Refresh without a paired desktop; nothing was sent before the click. No installed desktop was involved.'],
  'offline-documentation-search-light-en': ['extension-offline-documentation', 'options: Documentation', 'All network traffic sent to an unreachable proxy; the bundled font, components and bundled articles still worked.'],
  'matrix-options-connection_minimum_1x_light_yue': ['extension-matrix-connection-cantonese', 'options: Connection', 'One tuple at the 360 CSS pixel minimum in Cantonese; not the full layout matrix.'],
  'matrix-options-models_minimum_2x_dark_bilingual': ['extension-matrix-models-dark-bilingual', 'options: Models', 'One tuple at the 360 CSS pixel minimum at 2x in the dark theme, bilingual; not connected to a model server.'],
  'matrix-popup_minimum_2x_dark_bilingual': ['extension-matrix-popup-dark-bilingual', 'popup', 'One popup tuple at 360 by 640 CSS pixels at 2x in the dark theme, bilingual.'],
};

const rel = file => file.replaceAll('\\', '/');

async function describe(folder, row) {
  const file = path.join(folder, row.file), bytes = await fs.readFile(file);
  if (digest(bytes) !== row.sha256) throw new Error(`${row.file} differs from the manifest hash.`);
  const repoPath = rel(path.relative(process.cwd(), file));
  return {source: repoPath, route: repoPath.replace(/^docs\//, ''), sha256: row.sha256, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

export async function applyRefresh({folder}) {
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  const find = (kind, name) => manifest.captures.find(row => row.kind === kind && row.name === name);
  const {publicImages} = await import(pathToFileURL(path.resolve('docs/site/public-images.mjs')).href + '?' + Date.now());
  const pending = [], replaced = new Map();
  for (const [oldName, [kind, name]] of Object.entries(REPLACEMENTS)) {
    const row = find(kind, name);
    if (!row) { pending.push(CAPTURES + oldName); continue; }
    replaced.set(CAPTURES + oldName, await describe(folder, row));
  }
  // public-images.mjs: swap replaced entries in place, then add the new ones.
  const entries = [];
  for (const image of publicImages) entries.push(replaced.get(image.source) || image);
  for (const [kind, name] of ADDITIONS) { const row = find(kind, name); if (row) { const entry = await describe(folder, row); if (!entries.some(item => item.source === entry.source)) entries.push(entry); } }
  const line = e => ` {source:'${e.source}',route:'${e.route}',sha256:'${e.sha256}',bytes:${e.bytes},width:${e.width},height:${e.height}},`;
  const file = 'docs/site/public-images.mjs';
  const text = await fs.readFile(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const marker = 'Object.freeze([' + eol;
  const start = text.indexOf(marker) + marker.length, end = text.indexOf('].map(Object.freeze)');
  if (start < marker.length || end < 0) throw new Error('The public image list was not found.');
  await fs.writeFile(file, text.slice(0, start) + entries.map(line).join(eol) + eol + text.slice(end));
  // README.md: old paths become new paths.
  let readme = await fs.readFile('README.md', 'utf8');
  for (const [oldPath, entry] of replaced) readme = readme.replaceAll(oldPath, entry.source);
  await fs.writeFile('README.md', readme);
  // Extension gallery inventory.
  const galleryFile = 'docs/site/extension-gallery.json';
  const gallery = JSON.parse(await fs.readFile(galleryFile, 'utf8'));
  gallery.records = [];
  for (const row of manifest.captures.filter(item => item.kind === 'extension')) {
    const meta = GALLERY[row.name];
    if (!meta) throw new Error(`No gallery entry for ${row.name}`);
    const entry = await describe(folder, row);
    gallery.records.push({id: meta[0], path: entry.route, sourceCommit: row.sourceCommit, sha256: row.sha256, width: entry.width, height: entry.height, surface: meta[1], theme: row.theme, language: row.language, scale: row.scale, capturedAt: null, timeZone: null,
      method: 'Staged browser extension loaded unpacked in headless Microsoft Edge with a throwaway profile, captured through the DevTools protocol.', scope: meta[2], privacy: 'public-safe', inspectionStatus: 'inspected'});
  }
  gallery.records.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(galleryFile, JSON.stringify(gallery, null, 2) + '\n');
  // Delete the superseded files that were replaced.
  let removed = 0;
  for (const oldPath of replaced.keys()) { try { await fs.unlink(oldPath); removed++; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return {replaced: replaced.size, removed, pending};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = flags(process.argv.slice(2));
  const folder = path.resolve(options.folder || 'docs/images/captures/refresh-e96a0f0');
  const result = await applyRefresh({folder});
  console.log(`${result.replaced} images repointed, ${result.removed} superseded files deleted.`);
  if (result.pending.length) { console.log('Pending (no replacement in the manifest yet):'); for (const item of result.pending) console.log('- ' + item); }
}
