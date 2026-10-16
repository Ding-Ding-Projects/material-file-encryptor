// Points every reference at the images in a refresh folder and withdraws the superseded ones.
//
// Usage: node scripts/apply-screenshot-refresh.mjs [--folder docs/images/captures/refresh-<short>]
//
// Reads <folder>/manifest.json (written by refresh-screenshots.mjs), then:
//  - lists every earlier refresh folder's images as withdrawn (path and SHA-256) in docs/site/gallery-review.json and deletes the folder;
//  - rewrites docs/site/public-images.mjs, docs/site/gallery-additions.json, docs/site/gallery-review.json and docs/site/extension-gallery.json;
//  - rewrites the capture section of docs/site/index.html and the screenshot gallery of README.md;
//  - sets the intended capture source in docs/site/publication.mjs to the commit the installed application was built from.
// Withdrawn images stay in Git history unchanged and are never relabelled.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {flags} from './extension-browser.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const CAPTURES = 'docs/images/captures/';
const rel = file => file.replaceAll('\\', '/');

/** Desktop gallery: group title, then [file name without .png, caption] per frame. */
export const DESKTOP_GROUPS = [
  ['Home and navigation', [['home-light-en', 'Home'], ['home-dark-en', 'Home, dark'], ['home-light-yue', 'Home, Cantonese'], ['home-light-bilingual', 'Home, bilingual'],
    ['newtab-popover-light-en', 'New tab popover'], ['newtab-popover-dark-en', 'New tab popover, dark'], ['newtab-popover-light-bilingual', 'New tab popover, bilingual']]],
  ['Drive, offline and dialogs', [['drive-locked-light-en', 'Drive, locked'], ['drive-locked-light-bilingual', 'Drive, locked, bilingual'], ['drive-unlocked-files-light-en', 'Drive, unlocked, top of the page'], ['drive-unlocked-files-list-light-en', 'Drive, file list'], ['drive-unlocked-files-list-dark-en', 'Drive, file list, dark'],
    ['drive-file-selected-light-en', 'Drive, one file selected'], ['drive-unlocked-files-list-light-bilingual', 'Drive, file list, bilingual (the Availability text is cut off at the cell edge, a known issue being fixed)'], ['offline-light-en', 'Available offline'], ['offline-light-yue', 'Available offline, Cantonese'],
    ['create-drive-dialog-light-en', 'Create a drive dialog'], ['create-drive-dialog-dark-en', 'Create a drive dialog, dark'], ['create-drive-dialog-light-yue', 'Create a drive dialog, Cantonese'],
    ['unlock-drive-dialog-light-en', 'Unlock a drive dialog'], ['unlock-drive-dialog-light-bilingual', 'Unlock a drive dialog, bilingual'],
    ['lock-holder-message-light-en', 'Lock message when a program still has files open'], ['force-lock-confirm-light-en', 'Force Lock confirmation'], ['force-lock-confirm-dark-en', 'Force Lock confirmation, dark']]],
  ['History and Recycle Bin', [['history-light-en', 'History'], ['history-dark-en', 'History, dark'], ['history-light-yue', 'History, Cantonese'], ['recycle-bin-light-en', 'Recycle Bin'], ['recycle-bin-light-bilingual', 'Recycle Bin, bilingual']]],
  ['Tools: converter, documents and storage', [['tools-converter-light-en', 'Converter, Source files'], ['tools-converter-tab2-light-en', 'Converter, Formats'], ['tools-converter-tab3-light-en', 'Converter, Options'],
    ['tools-converter-tab4-light-en', 'Converter, Queue and result history'], ['tools-converter-dark-en', 'Converter, Queue and result history, dark'], ['tools-documents-light-en', 'Documents and downloads'],
    ['tools-storage-maintenance-light-en', 'Storage maintenance'], ['tools-status-light-en', 'Status'], ['tools-status-dark-en', 'Status, dark'], ['tools-status-light-bilingual', 'Status, bilingual'], ['tools-file-details-light-en', 'File details']]],
  ['Tools: local models', [['tools-local-models-light-en', 'Local models, Model Store'], ['tools-local-models-tab2-light-en', 'Local models, Pull cart'], ['tools-local-models-tab3-light-en', 'Local models, Local chat'],
    ['tools-local-models-tab4-light-en', 'Local models, Profiles'], ['tools-local-models-tab5-light-en', 'Local models, Help'], ['tools-local-models-dark-en', 'Local models, Help, dark'], ['tools-local-models-light-bilingual', 'Local models, Help, bilingual']]],
  ['Tools: server targets and server card', [['tools-server-targets-panel-light-en', 'Server preparation, create a server on any target'], ['tools-server-targets-panel-dark-en', 'Server preparation, scrolled to the server card, dark'],
    ['tools-server-preparation-light-yue', 'Server preparation, Cantonese'], ['tools-server-card-tab1-light-en', 'Server card, Overview'], ['tools-server-card-tab2-light-en', 'Server card, Logs'],
    ['tools-server-card-tab3-light-en', 'Server card, Settings'], ['tools-server-card-tab4-light-en', 'Server card, Plugins and mods']]],
  ['Settings, personalization and local access', [['settings-light-en', 'Settings'], ['settings-light-yue', 'Settings, Cantonese'], ['settings-personalization-light-en', 'Personalization, Language and voice'],
    ['settings-personalization-tab2-light-en', 'Personalization, Appearance'], ['settings-personalization-tab3-light-en', 'Personalization, Schedules'], ['settings-personalization-tab4-light-en', 'Personalization, Attention'],
    ['settings-personalization-tab5-light-en', 'Personalization, Private local history'], ['settings-personalization-dark-en', 'Personalization, Private local history, dark'],
    ['settings-local-access-light-en', 'Local access, Local profile'], ['settings-local-access-tab2-light-en', 'Local access, Element locks'], ['settings-local-access-tab3-light-en', 'Local access, Authenticator'],
    ['settings-local-access-tab4-light-en', 'Local access, Support Tickets'], ['settings-local-access-tab5-light-en', 'Local access, Access history'], ['settings-local-access-light-bilingual', 'Local access, Access history, bilingual'],
    ['update-page-light-en', 'Updates'], ['update-page-dark-en', 'Updates, dark']]],
  ['Pair a browser', [['pair-a-browser-light-en', 'Pair a browser'], ['pair-a-browser-dark-en', 'Pair a browser, dark']]],
  ['Server cards and server lifecycle', [['server-card-running-light-en', 'Server card, running'], ['server-card-running-dark-en', 'Server card, running, dark'],
    ['server-card-failed-light-en', 'Server card, failed, with the reason chip'], ['server-card-failed-dark-en', 'Server card, failed, with the reason chip, dark'],
    ['server-java25-needed-dark-bilingual', 'Server card needing Java 25 after the Java check, dark, bilingual'], ['server-java-check-refusal-dark-bilingual', 'Java-check refusal message, dark, bilingual'],
    ['server-running-card-dark-bilingual', 'Server running, dark, bilingual'], ['server-running-logs-dark-bilingual', 'Server logs ending with the Done line, dark, bilingual'],
    ['close-dialog-server-running-dark-bilingual', 'Close dialog while a server runs: keep in the tray, stop and quit, or cancel']]],
  ['Help', [['help-how-it-works-light-en', 'Help, How it works'], ['help-how-it-works-dark-en', 'Help, How it works, dark'], ['help-how-it-works-light-yue', 'Help, How it works, Cantonese'],
    ['help-documentation-light-en', 'Help, Documentation'], ['help-changelog-light-en', 'Help, Changelog']]],
];

/** Extension gallery: group title, then [file name without .png, caption, record id, surface, scope]. */
export const EXTENSION_GROUPS = [
  ['Home and popup', [
    ['home-1280x900-light-en', 'Workspace Home', 'extension-home', 'options: Home', 'The workspace Home grid with one card per section. No desktop was paired, so connection states read as unavailable.'],
    ['home-1280x900-dark-en', 'Workspace Home, dark', 'extension-home-dark', 'options: Home', 'The Home grid in the dark theme.'],
    ['home-1280x900-light-yue', 'Workspace Home, Cantonese', 'extension-home-cantonese', 'options: Home', 'The Home grid in Cantonese.'],
    ['home-360x780-dark-bilingual', 'Workspace Home at 360 pixels, dark, bilingual', 'extension-home-narrow-dark-bilingual', 'options: Home', 'The Home grid at 360 CSS pixels in the dark theme with bilingual labels.'],
    ['popup-380-light-en', 'Popup with the section launcher', 'extension-popup', 'popup', 'Pairing controls above a launcher with one button per section. Not paired.'],
    ['popup-380-dark-bilingual', 'Popup, dark, bilingual', 'extension-popup-dark-bilingual', 'popup', 'The popup in the dark theme with bilingual labels. Not paired.'],
    ['popup-380-light-yue', 'Popup, Cantonese', 'extension-popup-cantonese', 'popup', 'The popup in Cantonese. Not paired.']]],
  ['Sections', [
    ['section-connection-1280x900-light-en', 'Connection', 'extension-connection', 'options: Connection', 'Connection section with no desktop paired; every observation reads as unavailable.'],
    ['section-personalization-1280x900-light-en', 'Personalization', 'extension-personalization', 'options: Personalization', 'Language, theme and playfulness controls.'],
    ['section-personalization-360x780-dark-bilingual', 'Personalization at 360 pixels, dark, bilingual', 'extension-personalization-narrow-dark-bilingual', 'options: Personalization', 'The same controls at 360 CSS pixels in the dark theme with bilingual labels.'],
    ['section-changelog-1280x900-light-en', 'Changelog', 'extension-changelog', 'options: Changelog', 'The offline changelog with its filter and export controls.'],
    ['section-notes-1280x900-light-en', 'Notes', 'extension-notes', 'options: Notes', 'The notes section with no notes yet.'],
    ['section-documentation-1280x900-light-en', 'Documentation', 'extension-documentation', 'options: Documentation', 'The bundled offline documentation list and reader.'],
    ['offline-documentation-search-light-en', 'Documentation search while offline', 'extension-offline-documentation', 'options: Documentation', 'All network traffic sent to an unreachable proxy; the bundled font, components and bundled articles still worked.'],
    ['section-support-1280x900-light-en', 'Support', 'extension-support', 'options: Support', 'The local support ticket form; nothing is sent.'],
    ['section-dimsum-1280x900-light-en', 'Dim sum', 'extension-dimsum', 'options: Dim sum', 'The dim sum catalogue before it is loaded.'],
    ['section-publishing-1280x900-light-en', 'Progress and publication', 'extension-publishing', 'options: Progress and publication', 'Progress note form with the send action disabled until the preview is reviewed. Nothing was sent.'],
    ['section-servers-1280x900-light-en', 'Servers', 'extension-servers', 'options: Servers', 'Servers section before pairing; reads and changes are disabled and no server data is shown.'],
    ['section-servers-1280x900-dark-bilingual', 'Servers, dark, bilingual', 'extension-servers-dark-bilingual', 'options: Servers', 'The Servers section before pairing in the dark theme with bilingual labels.']]],
  ['Models', [
    ['models-connected-light-en', 'Models connected to a local server', 'extension-models-connected', 'options: Models', 'Connected to a fake local model server; the permission prompt was stubbed for this capture. Not a real Ollama server or an installed copy.'],
    ['models-chat-light-en', 'Models chat with a streamed reply', 'extension-models-chat', 'options: Models', 'Streamed reply from a fake local model server rendered as safe rich text; a javascript: address stays plain text. Not a real Ollama server.']]],
  ['Status', [
    ['status-release-light-en', 'Status with the published release', 'extension-status-release', 'options: Status', 'Read the live published releases at capture time and shows the newest one with its dish photo and coverage inventory.'],
    ['status-installer-link-light-en', 'Status with the installer link', 'extension-status-installer-link', 'options: Status', 'Desktop installer link offered only for the verified uploaded setup asset of the found release.'],
    ['status-coverage-narrow-light-en', 'Status coverage list at 360 pixels', 'extension-status-coverage-narrow', 'options: Status', 'Feature coverage list filtered by a search at 360 CSS pixels; records, not proof of delivery.'],
    ['status-desktop-unpaired-light-en', 'Status without a paired desktop', 'extension-status-desktop-unpaired', 'options: Status', 'Desktop section after Refresh without a paired desktop; nothing was sent before the click. No installed desktop was involved.']]],
  ['Layout tuples', [
    ['matrix-options-connection_minimum_1x_light_yue', 'Connection at the 360 pixel minimum, Cantonese', 'extension-matrix-connection-cantonese', 'options: Connection', 'One tuple at the 360 CSS pixel minimum in Cantonese; not the full layout matrix.'],
    ['matrix-options-models_minimum_2x_dark_bilingual', 'Models at the 360 pixel minimum, 2x, dark, bilingual', 'extension-matrix-models-dark-bilingual', 'options: Models', 'One tuple at the 360 CSS pixel minimum at 2x in the dark theme, bilingual; not connected to a model server.'],
    ['matrix-popup_minimum_2x_dark_bilingual', 'Popup at 360 by 640, 2x, dark, bilingual', 'extension-matrix-popup-dark-bilingual', 'popup', 'One popup tuple at 360 by 640 CSS pixels at 2x in the dark theme, bilingual.']]],
];

/** Site pages: file name without .png and caption. */
export const SITE_GROUP = ['Documentation site', [['home-1280x900-light-en', 'Home page'], ['home-320x800-dpr2-light-en', 'Home page at 320 pixels, DPR 2'], ['library-1280x900-light-en', 'Documentation library'],
  ['wiki-1280x900-light-en', 'Wiki'], ['gallery-1280x900-light-en', 'Capture gallery'], ['article-local-models-360x800-light-en', 'Browser extension local models article at 360 pixels']]];

const WORKFLOW = name => /^(history|recycle-bin)-/.test(name) ? 'history-recovery'
  : /^(drive-|offline-|create-drive|unlock-drive|lock-holder|force-lock|pair-a-browser)/.test(name) ? 'drive-access'
  : /^(settings|update-page|help)-/.test(name) ? 'preferences-help' : 'workspace-tools';

const HOME_FIGURES = ['drive-unlocked-files-light-en', 'home-light-en', 'history-light-en', 'recycle-bin-light-en', 'tools-local-models-light-en', 'tools-server-targets-panel-light-en', 'settings-local-access-light-en', 'help-how-it-works-dark-en'];

const WITHDRAWN_REASON = 'Withdrawn: replaced by a refreshed capture of the same surface. The original was removed from the current tree and deployment and remains unchanged in Git history; it is not relabelled.';

async function pngInfo(file) {
  const bytes = await fs.readFile(file);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${file} is not a PNG.`);
  return {bytes, sha256: digest(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

async function describe(folder, row) {
  const file = path.join(folder, row.file), info = await pngInfo(file);
  if (info.sha256 !== row.sha256) throw new Error(`${row.file} differs from the manifest hash.`);
  const repoPath = rel(path.relative(process.cwd(), file));
  return {source: repoPath, route: repoPath.replace(/^docs\//, ''), sha256: row.sha256, bytes: info.bytes.length, width: info.width, height: info.height};
}

async function walk(directory) {
  const found = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(file)); else found.push(file);
  }
  return found;
}

/** Lists every image in the earlier refresh folders, then removes those folders. */
async function withdrawEarlier(currentFolders) {
  const base = path.resolve(CAPTURES), withdrawn = [];
  for (const entry of await fs.readdir(base, {withFileTypes: true})) {
    if (!entry.isDirectory() || !/^refresh-[a-f0-9]+$/.test(entry.name) || currentFolders.some(current => path.join(base, entry.name) === path.resolve(current))) continue;
    const folder = path.join(base, entry.name);
    for (const file of (await walk(folder)).filter(item => item.endsWith('.png'))) {
      const info = await pngInfo(file);
      withdrawn.push({path: rel(path.relative(path.resolve('docs'), file)), sha256: info.sha256});
    }
    await fs.rm(folder, {recursive: true, force: true});
  }
  return withdrawn;
}

const tableRows = (items, entries) => {
  const lines = [];
  for (let index = 0; index < items.length; index += 3) {
    const chunk = items.slice(index, index + 3);
    lines.push('| ' + chunk.map(([, caption]) => caption).join(' | ') + ' |', '|' + chunk.map(() => '---').join('|') + '|',
      '| ' + chunk.map(([name, caption]) => `![${caption}](${entries.get(name).source})`).join(' | ') + ' |', '');
  }
  return lines;
};

function readmeSection({manifest, byKind, desktopCount}) {
  const desktop = manifest.desktopSource, first = byKind.desktop[0];
  const extension = byKind.extension[0], site = byKind.site[0];
  const lines = ['### Current captures', '',
    `Every image below is a genuine capture of a real build; none is a mock, design preview or edited image. Each group is collapsed: choose its heading to open it. Capture times are unavailable because no validated timestamp was recorded, and earlier captures were withdrawn when these replaced them. They remain unchanged in Git history and are listed with their hashes in [the gallery review](docs/site/gallery-review.json).`, '',
    '#### Desktop application', '',
    `${desktopCount} captures of the installed desktop application, version ${first.appVersion}, built from source \`${first.sourceCommit.slice(0, 7)}\`. Each was taken by window handle on a task-owned hidden desktop at 150 percent display scale (a 1280 by 800 window, saved at 1920 by 1200 pixels) with an isolated profile and a throwaway vault that holds test files only and uses neutral folder names. The capture host reported no frame showing a private path. The run captured ${desktop.count} frames in all, covering 52 screens in light and dark themes and in English, Cantonese and bilingual modes; these are the ones published. A tabbed screen's own frame shows the tab named in its caption, and a few dark and bilingual frames show the last tab visited. Home is the first group. The drive, Pair a browser and server frames were retaken from a later installed release, listed with its own manifest below. The [capture manifest](docs/images/captures/${path.basename(manifest.folder)}/desktop-capture-manifest.json) records every frame's hash.`, ''];
  for (const [title, items] of DESKTOP_GROUPS) lines.push('<details>', `<summary>${title} (${items.length})</summary>`, '', ...tableRows(items, byKind.desktopEntries), '</details>', '');
  lines.push('#### Browser extension', '',
    `Headless Microsoft Edge with the staged extension from source \`${extension.sourceCommit.slice(0, 7)}\`, loaded unpacked into a disposable profile. No desktop was paired, so connection states read as unavailable; the Models captures use a fake local model server and the Status captures read the live published releases.`, '');
  for (const [title, items] of EXTENSION_GROUPS) lines.push('<details>', `<summary>${title} (${items.length})</summary>`, '', ...tableRows(items.map(([name, caption]) => [name, caption]), byKind.extensionEntries), '</details>', '');
  lines.push('#### Documentation site', '',
    `Captures of the documentation site staged from source \`${site.sourceCommit.slice(0, 7)}\` and served from loopback in a disposable headless Microsoft Edge profile, light theme, English. They show public pages only, not native-product or installed acceptance. The workspace page was not captured because its article list renders unstyled.`, '',
    '<details>', `<summary>${SITE_GROUP[0]} (${SITE_GROUP[1].length})</summary>`, '', ...tableRows(SITE_GROUP[1], byKind.siteEntries), '</details>', '',
    `The refresh folder holds a [manifest](docs/images/captures/${path.basename(manifest.folder)}/manifest.json) with each image's hash, size, viewport and source commit${manifest.laterFolders ? `; the later installed round has its own [manifest](docs/images/captures/${manifest.laterFolders[0]}/manifest.json)` : ''}. \`node scripts/refresh-screenshots.mjs capture\` and \`node scripts/refresh-screenshots.mjs desktop\` regenerate it, and \`node scripts/apply-screenshot-refresh.mjs\` rewrites every reference. The earlier original captures, including the history-guidance and packaged Windows images, were removed from the current tree and remain in Git history; their records stay in the [preview inventory](docs/images/captures/preview/inventory.json), [preview verification summary](docs/images/captures/preview/verification-summary.json), [Linux capture provenance](docs/images/captures/provenance.json) and [Windows capture provenance](docs/images/captures/windows/provenance.json). The diagrams here explain behavior; they are not screenshots or runtime evidence.`, '');
  return lines.join('\n');
}

export async function applyRefresh({folder, extraFolders = []}) {
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  manifest.folder = folder;
  manifest.laterFolders = extraFolders.map(item => path.basename(item));
  if (!manifest.laterFolders.length) delete manifest.laterFolders;
  const rowsOf = kind => manifest.captures.filter(row => row.kind === kind);
  const extraManifests = [];
  for (const extra of extraFolders) { const m = JSON.parse(await fs.readFile(path.join(extra, 'manifest.json'), 'utf8')); extraManifests.push({folder: extra, manifest: m}); }
  const baseDesktop = rowsOf('desktop').map(row => ({...row, _folder: folder, _desktopSource: manifest.desktopSource}));
  const laterDesktop = extraManifests.flatMap(({folder: f, manifest: m}) => m.captures.filter(row => row.kind === 'desktop').map(row => ({...row, _folder: f, _desktopSource: m.desktopSource})));
  const desktopRows = [...baseDesktop, ...laterDesktop], extensionRows = rowsOf('extension'), siteRows = rowsOf('site');
  if (!desktopRows.length || !manifest.desktopSource) throw new Error('The folder holds no imported desktop captures.');
  if (new Set(desktopRows.map(row => row.name)).size !== desktopRows.length) throw new Error('Two folders publish a desktop capture of the same name.');
  const entriesFor = async rows => new Map(await Promise.all(rows.map(async row => [row.name, await describe(row._folder || folder, row)])));
  const desktopEntries = await entriesFor(desktopRows), extensionEntries = await entriesFor(extensionRows), siteEntries = await entriesFor(siteRows);
  const covered = (groups, rows, label) => {
    const named = new Set(groups.flatMap(([, items]) => items.map(item => item[0])));
    for (const row of rows) if (!named.has(row.name)) throw new Error(`${label} capture ${row.name} is missing from the README groups.`);
    for (const name of named) if (!rows.some(row => row.name === name)) throw new Error(`${label} group names a capture that was not taken: ${name}`);
  };
  covered(DESKTOP_GROUPS, desktopRows, 'Desktop'); covered(EXTENSION_GROUPS, extensionRows, 'Extension'); covered([SITE_GROUP], siteRows, 'Site');
  const captionOf = new Map(DESKTOP_GROUPS.flatMap(([, items]) => items));

  const withdrawn = await withdrawEarlier([folder, ...extraFolders]);
  for (const source of [manifest, ...extraManifests.map(item => item.manifest)]) for (const item of source.withdrawn || []) withdrawn.push({path: item.path, sha256: item.sha256, reason: item.reason});

  // public-images.mjs
  const entries = [...desktopRows, ...extensionRows, ...siteRows].map(row => (row.kind === 'desktop' ? desktopEntries : row.kind === 'extension' ? extensionEntries : siteEntries).get(row.name));
  const line = e => ` {source:'${e.source}',route:'${e.route}',sha256:'${e.sha256}',bytes:${e.bytes},width:${e.width},height:${e.height}},`;
  const imagesFile = 'docs/site/public-images.mjs';
  const imagesText = await fs.readFile(imagesFile, 'utf8');
  const eol = imagesText.includes('\r\n') ? '\r\n' : '\n', marker = 'Object.freeze([' + eol;
  const start = imagesText.indexOf(marker) + marker.length, end = imagesText.indexOf('].map(Object.freeze)');
  if (start < marker.length || end < 0) throw new Error('The public image list was not found.');
  await fs.writeFile(imagesFile, imagesText.slice(0, start) + entries.map(line).join(eol) + eol + imagesText.slice(end));

  // publication.mjs: the intended capture source and the Markdown details block.
  const intended = baseDesktop[0].sourceCommit, additional = [...new Set(laterDesktop.map(row => row.sourceCommit))].filter(commit => commit !== intended);
  let publication = await fs.readFile('docs/site/publication.mjs', 'utf8');
  publication = publication.replace(/INTENDED_CAPTURE_UI_SOURCE = '[a-f0-9]{40}'/, `INTENDED_CAPTURE_UI_SOURCE = '${intended}'`)
    .replace(/ADDITIONAL_CAPTURE_UI_SOURCES = Object\.freeze\(\[[^\]]*\]\)/, `ADDITIONAL_CAPTURE_UI_SOURCES = Object.freeze([${additional.map(commit => `'${commit}'`).join(', ')}])`);
  await fs.writeFile('docs/site/publication.mjs', publication);
  const {projectGalleryRecord} = await import(pathToFileURL(path.resolve('docs/site/publication.mjs')).href + '?' + Date.now());

  // gallery additions and review
  const records = desktopRows.map(row => {
    const entry = desktopEntries.get(row.name), caption = captionOf.get(row.name);
    return {id: 'desktop-' + row.name, path: entry.route, sourceCommit: row.sourceCommit, sha256: row.sha256, width: entry.width, height: entry.height, state: row.name, theme: row.theme, scale: row.scale, capturedAt: null, timeZone: null,
      method: row.numbered ? `Installed desktop application v${row.appVersion} captured on a hidden desktop with an isolated profile; the display scale of this numbered frame was not recorded.` : `Installed desktop application v${row.appVersion} captured by window handle on a hidden desktop at 150 percent display scale with an isolated profile.`,
      scope: `${caption}. ${row.numbered ? 'Neutral folder names; the saved image is ' + entry.width + ' by ' + entry.height + ' pixels and has no manifest entry. ' : 'Throwaway vault with neutral folder names and test files only. '}Capture time unavailable.`, ...(row.numbered ? {} : {viewportWidth: 1280, viewportHeight: 800}),
      promotionReceiptSha256: row._desktopSource.manifestSha256, approval: 'approved', privacy: 'public-safe', inspectionStatus: 'inspected'};
  });
  await fs.writeFile('docs/site/gallery-additions.json', JSON.stringify({version: 1, records,
    pending: 'New runtime captures are not accepted by this catalogue. They require reviewed original pixels, public-safe provenance, source and image hashes, dimensions, capture method, and explicit approval before addition.'}, null, 2) + '\n');
  const review = JSON.parse(await fs.readFile('docs/site/gallery-review.json', 'utf8'));
  const withheld = new Map(review.withheld.map(item => [item.path, item]));
  for (const oldPath of review.approvedOriginals) if (!withheld.has(oldPath) && review.reviewedBindings[oldPath]) withheld.set(oldPath, {path: oldPath, sha256: review.reviewedBindings[oldPath].sha256, reason: WITHDRAWN_REASON});
  for (const item of withdrawn) if (!withheld.has(item.path)) withheld.set(item.path, {path: item.path, sha256: item.sha256, reason: item.reason || WITHDRAWN_REASON});
  review.withheld = [...withheld.values()].filter(item => !records.some(record => record.path === item.path));
  review.approvedOriginals = records.map(record => record.path);
  review.reviewedBindings = {};
  for (const record of records) {
    const projected = projectGalleryRecord({...record, workflow: WORKFLOW(record.state), historical: false});
    review.reviewedBindings[record.path] = {sourceCommit: record.sourceCommit, sha256: record.sha256, workflow: WORKFLOW(record.state), metadataSha256: digest(Buffer.from(JSON.stringify(projected)))};
  }
  if (!review.workflows.some(item => item.id === 'workspace-tools')) review.workflows.push({id: 'workspace-tools', title: 'Workspace and tools'});
  await fs.writeFile('docs/site/gallery-review.json', JSON.stringify(review, null, 2) + '\n');

  // extension gallery
  const galleryFile = 'docs/site/extension-gallery.json';
  const gallery = JSON.parse(await fs.readFile(galleryFile, 'utf8'));
  const metaByName = new Map(EXTENSION_GROUPS.flatMap(([, items]) => items.map(item => [item[0], item])));
  gallery.records = extensionRows.map(row => {
    const meta = metaByName.get(row.name), entry = extensionEntries.get(row.name);
    return {id: meta[2], path: entry.route, sourceCommit: row.sourceCommit, sha256: row.sha256, width: entry.width, height: entry.height, surface: meta[3], theme: row.theme, language: row.language, scale: row.scale, capturedAt: null, timeZone: null,
      method: 'Staged browser extension loaded unpacked in headless Microsoft Edge with a throwaway profile, captured through the DevTools protocol.', scope: meta[4], privacy: 'public-safe', inspectionStatus: 'inspected'};
  }).sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(galleryFile, JSON.stringify(gallery, null, 2) + '\n');

  // index.html capture section
  const figures = HOME_FIGURES.map(name => {
    const row = desktopRows.find(item => item.name === name), entry = desktopEntries.get(name), caption = captionOf.get(name);
    return `<figure data-gallery-role="current"><a href="${entry.route}" aria-label="Open the ${caption.toLowerCase()} capture at full size"><img src="${entry.route}" alt="Installed desktop application: ${caption}" width="${entry.width}" height="${entry.height}" loading="lazy"></a><figcaption><strong>${caption}</strong><span>Installed desktop application v${row.appVersion} · source <code>${row.sourceCommit.slice(0, 7)}</code></span></figcaption></figure>`;
  });
  const first = desktopRows[0], later = desktopRows.find(row => row._folder !== folder);
  const section = `<section class="section container" id="screenshots" aria-labelledby="screenshots-heading"><div class="section-heading"><p class="eyebrow">Inside the application</p><div><h2 id="screenshots-heading">Interface captures.</h2><p>These captures show the installed desktop application, version ${first.appVersion}, built from source <code>${first.sourceCommit.slice(0, 7)}</code>. Each was taken by window handle on a hidden desktop at 150 percent display scale with a throwaway vault holding test files only. The <a href="gallery.html">capture gallery</a> lists all ${records.length} with their provenance. Installer and native-operation verification are separate.${later ? ` The drive, Pair a browser and server frames come from version ${later.appVersion} (source <code>${later.sourceCommit.slice(0, 7)}</code>).` : ''}</p></div></div><div class="capture-gallery">${figures.join('')}</div><p class="development-note">Earlier packaged Windows interface and native-drive checks (source <code>c74b3a68</code>, 34 native checks and the packaged desktop workflow passed; installer verification stopped at <code>INSTALL_REGISTRATION_MISSING</code>) are recorded in <a href="gallery-inventory.json">the capture inventory</a>. Their original images were replaced by these captures and remain in Git history.</p></section>`;
  let home = await fs.readFile('docs/site/index.html', 'utf8');
  const homeStart = home.indexOf('<section class="section container" id="screenshots"'), homeEnd = home.indexOf('</section>', homeStart) + '</section>'.length;
  if (homeStart < 0 || homeEnd < homeStart) throw new Error('The home page capture section was not found.');
  await fs.writeFile('docs/site/index.html', home.slice(0, homeStart) + section + home.slice(homeEnd));

  // README
  const readmeText = await fs.readFile('README.md', 'utf8');
  const readmeEol = readmeText.includes('\r\n') ? '\r\n' : '\n';
  const lines = readmeText.replace(/\r\n/g, '\n');
  const readmeStart = lines.indexOf('### Current captures');
  const readmeEnd = lines.indexOf('## Build, package and verify', readmeStart);
  if (readmeStart < 0 || readmeEnd < 0) throw new Error('The README capture section was not found.');
  const generated = readmeSection({manifest, byKind: {desktop: desktopRows, extension: extensionRows, site: siteRows, desktopEntries, extensionEntries, siteEntries}, desktopCount: desktopRows.length});
  await fs.writeFile('README.md', (lines.slice(0, readmeStart) + generated + '\n' + lines.slice(readmeEnd)).replace(/\n/g, readmeEol));
  return {desktop: desktopRows.length, extension: extensionRows.length, site: siteRows.length, withdrawn: withdrawn.length, records: records.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = flags(process.argv.slice(2));
  const folder = path.resolve(options.folder || 'docs/images/captures/refresh-b4cbf0e');
  const extraFolders = options['extra-folder'] ? String(options['extra-folder']).split(',').map(item => path.resolve(item)) : [];
  console.log(JSON.stringify(await applyRefresh({folder, extraFolders})));
}
