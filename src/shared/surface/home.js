import {SurfaceElement, register, localized, text} from './registry.js';
import {localToolIds, LOCAL_TOOLS_ID} from './local-tools-catalog.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Filled 24-unit Material glyphs, one per destination. Unknown destinations fall back to the apps glyph. */
export const HOME_ICONS = Object.freeze({
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  drive: 'M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z',
  offline: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  recycle: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  help: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
  details: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  converter: 'M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
  ollama: 'M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z',
  access: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  personalization: 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  documentation: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  changelog: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  status: 'M3 13h2v8H3zm4-8h2v16H7zm4 4h2v12h-2zm4-2h2v14h-2zm4 6h2v8h-2z',
  workflow: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  updates: 'M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3v7.12z',
  storage: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z',
  'server-manager': 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  quicktype: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  'virtual-disks': 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h12V4H6zm6 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  connection: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  tools: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm11 0h2v2h2v2h-2v2h-2v-2h-2v-2h2z',
  'base64-tools': 'M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z',
  'live-charts': 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  'screen-recording': 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  drawing: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  dimsum: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  'browser-pairing': 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  apps: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z'
});

/** One line per destination, in English and Cantonese. Order is the order of the Home grid. */
export const HOME_CATALOG = Object.freeze([
  ['drive', text('Browse, add and open the files in your encrypted drive.', '瀏覽、新增同打開加密磁碟入面嘅檔案。')],
  ['offline', text('Files you keep available without a connection.', '無網絡都可以用嘅檔案。')],
  ['history', text('Earlier versions and activity of your files.', '檔案嘅舊版本同活動記錄。')],
  ['recycle', text('Restore or permanently remove deleted files.', '還原或者永久移除已刪除嘅檔案。')],
  ['converter', text('Convert documents and images between formats.', '喺不同格式之間轉換文件同圖片。')],
  ['workflow', text('Choose where documents and downloads are kept.', '揀選文件同下載內容存放嘅位置。')],
  ['ollama', text('Use language models that run on this computer.', '使用喺呢部電腦上面行嘅語言模型。')],
  ['server-manager', text('Prepare and manage game servers on this or another computer.', '喺本機或者其他電腦準備同管理遊戲伺服器。')],
  ['quicktype', text('Turn JSON samples or a JSON Schema into typed code in many languages.', '將 JSON 樣本或者 JSON Schema 轉成多種語言嘅有型別程式碼。')],
  ['virtual-disks', text('Create, attach, resize and mount VHD, VHDX and ISO files.', '建立、連接、調整同掛載 VHD、VHDX 同 ISO 檔案。')],
  ['storage', text('Sign in to Docker Hub, choose encrypted backup storage, synchronize and restore.', '登入 Docker Hub、選擇加密備份儲存、同步同還原。')],
  ['status', text('Version, build details and feature coverage.', '版本、建置資料同功能覆蓋。')],
  ['dimsum', text('Browse the public dim sum catalogue, load only when you ask.', '瀏覽公開點心目錄，只會喺你要求時先載入。')],
  ['details', text('Properties and metadata of the selected file.', '所選檔案嘅屬性同中繼資料。')],
  ['settings', text('Language, theme, notifications and everyday options.', '語言、主題、通知同日常選項。')],
  ['personalization', text('Colours, type, motion and your own wording.', '顏色、字體、動態同你自己嘅用字。')],
  ['access', text('Locks, sign-in and who can open the drive.', '鎖定、登入同邊個可以打開磁碟。')],
  ['updates', text('Check for and install new versions.', '檢查同安裝新版本。')],
  ['help', text('A short guide to how the encrypted drive works.', '簡短講解加密磁碟點樣運作。')],
  ['documentation', text('Read the full documentation offline.', '離線閱讀完整文件。')],
  ['changelog', text('See what changed in each release.', '睇每個版本改咗啲乜。')],
  ['browser-pairing', text('Show a one-time code to link the browser extension to this drive.', '顯示一次性代碼，將瀏覽器擴充功能連結到呢個磁碟。')],
  ['base64-tools', text('Encode and decode text and files as Base64, build data: URLs and inspect bytes.', '將文字同檔案編碼或解碼成 Base64，建立 data: URL 同檢視位元組。')],
  ['live-charts', text('Watch drive used space and operation progress change as it happens.', '即時查看磁碟已用空間同操作進度嘅變化。')],
  ['screen-recording', text('Record a screen or window to a local WebM file. Nothing is uploaded.', '將螢幕或視窗錄成本機 WebM 檔案，唔會上載。')],
  ['drawing', text('Sketch and annotate, then export PNG or SVG or save into the unlocked drive.', '繪圖同註解，再匯出 PNG 或 SVG，或儲存到已解鎖磁碟。')],
  ['onboarding', text('Set up language, requirements, your drive and a paired browser, step by step.', '逐步設定語言、系統需要、你嘅磁碟同已配對嘅瀏覽器。')],
  ['connection', text('Pair the browser extension and check the link.', '配對瀏覽器擴充功能同檢查連線。')],
  ['tools', text('Converters, developer helpers, media and system tools that run on this computer.', '喺呢部電腦上面運行嘅轉換、開發、媒體同系統工具。')]
]);

/** The flagship features shown as large cards on Home, in order: [id, benefit line, action label]. */
export const FLAGSHIP_CARDS = Object.freeze([
  ['drive', text('Work in File Explorer while every file stays encrypted on disk.', '喺檔案總管入面工作，所有檔案喺磁碟上面保持加密。'), text('Open', '打開')],
  ['offline', text('Keep chosen files available without a connection.', '揀選嘅檔案無網絡都可以用。'), text('Manage', '管理')],
  ['history', text('Every save is a version you can open or restore.', '每次儲存都係一個可以打開或者還原嘅版本。'), text('Browse', '瀏覽')],
  ['recycle', text('Deleted files wait here until you remove them for good.', '已刪除嘅檔案會留喺度，直至你永久移除。'), text('Review', '檢視')],
  ['storage', text('Back up the encrypted drive to Docker Hub and restore it anywhere.', '將加密磁碟備份到 Docker Hub，喺邊度都可以還原。'), text('Back up', '備份')],
  ['access', text('Who can open this drive, plus auto unlock and lock rules.', '邊個可以打開呢個磁碟，同自動解鎖同鎖定規則。'), text('Review', '檢視')]
]);

const DESCRIPTIONS = new Map(HOME_CATALOG);
const FALLBACK_DESCRIPTION = text('Open this section.', '打開呢個區段。');
export const HOME_ID = 'home';
export const HOME_LABEL = text('Home', '首頁');
export const HOME_DESCRIPTION = text('Every section in one place.', '所有區段集中喺一頁。');

const rank = id => { const index = HOME_CATALOG.findIndex(row => row[0] === id); return index < 0 ? HOME_CATALOG.length : index; };

/**
 * Builds the destinations shown on Home and in the new-tab menu from the shell's label map and tab state.
 * Home itself is never listed as a destination of Home.
 */
export function homeEntries(labels, state = {tabs: []}) {
  const open = new Set((state.tabs || []).map(tab => tab.id));
  return [...(labels?.keys?.() || [])]
    .filter(id => id !== HOME_ID)
    .map((id, order) => ({id, order, label: labels.get(id), description: DESCRIPTIONS.get(id) || FALLBACK_DESCRIPTION, icon: HOME_ICONS[id] ? id : 'apps', open: open.has(id)}))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.order - b.order)
    .map(({order, ...entry}) => entry);
}

/**
 * The large Home cards: only the flagship features that are registered, each with its benefit line, an action label
 * and an optional live status `{text, tone}` taken from `status[id]` (tone: ok, warn or off).
 */
export function flagshipEntries(labels, state = {tabs: []}, status = {}) {
  const open = new Set((state.tabs || []).map(tab => tab.id));
  return FLAGSHIP_CARDS.filter(([id]) => labels?.has?.(id)).map(([id, description, action]) => ({id, label: labels.get(id), description, action, icon: HOME_ICONS[id] ? id : 'apps', open: open.has(id), status: status?.[id] || null}));
}

/** Summary of the Local tools card. Every number is the real count of registered tool destinations. */
export function toolsSummary(labels) {
  const ids = localToolIds(id => labels?.has?.(id));
  const names = ids.slice(0, 4).map(id => labels.get(id));
  return {count: ids.length, names, more: Math.max(0, ids.length - names.length), available: labels?.has?.(LOCAL_TOOLS_ID) === true};
}

/** Short local date and time for the Recent activity list. */
export function formatActivityTime(value, language = 'en', now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'yue' ? 'zh-HK' : 'en';
  const sameDay = date.toDateString() === now.toDateString();
  const options = sameDay ? {hour: '2-digit', minute: '2-digit'} : {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'};
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** True for the new-tab shortcut: Control or Command with T, and no Shift or Alt (Shift+T restores a closed tab). */
export function isNewTabShortcut(event) {
  return Boolean(event && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && String(event.key).toLowerCase() === 't');
}

/** Arrow-key navigation over a grid of `count` cards laid out in `columns` columns. Returns the new index or -1. */
export function moveHomeFocus(index, key, columns, count) {
  if (!count) return -1;
  const cols = Math.max(1, columns || 1);
  const last = count - 1;
  const current = index < 0 ? 0 : index;
  switch (key) {
    case 'ArrowRight': return Math.min(last, current + 1);
    case 'ArrowLeft': return Math.max(0, current - 1);
    case 'ArrowDown': return Math.min(last, current + cols);
    case 'ArrowUp': return Math.max(0, current - cols);
    case 'Home': return 0;
    case 'End': return last;
    default: return -1;
  }
}

function glyph(path) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('fill', 'currentColor');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}
export const homeGlyph = id => glyph(HOME_ICONS[id] || HOME_ICONS.apps);

const GRID_CSS = `
:host{display:block;container-type:inline-size}
h2{margin:0 0 16px;font:500 22px/28px var(--mfe-font,system-ui)}
.grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr));gap:12px}
.grid>li{display:flex;min-inline-size:0;margin:0}
.card{position:relative;isolation:isolate;overflow:hidden;box-sizing:border-box;inline-size:100%;min-block-size:128px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon state" "name name" "desc desc";align-content:start;gap:4px 12px;padding:16px;margin:0;border:1px solid var(--md-sys-color-outline-variant,#c4c6d0);border-radius:16px;background:var(--md-sys-color-surface-container-low,var(--md-sys-color-surface,#fff));color:var(--md-sys-color-on-surface,#1b1b1f);font:inherit;text-align:start;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color var(--md-sys-motion-duration-short4,200ms) var(--md-sys-motion-easing-standard,ease)}
.card::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--md-sys-color-on-surface,#1b1b1f);opacity:0;transition:opacity var(--md-sys-motion-duration-short4,200ms) var(--md-sys-motion-easing-standard,ease)}
.card:hover{border-color:var(--md-sys-color-outline,#74777f)}.card:hover::before{opacity:.08}.card:focus-visible::before{opacity:.1}.card:active::before{opacity:.12}
.card:focus-visible{outline:3px solid var(--md-sys-color-primary,#5466a8);outline-offset:2px}
.icon{grid-area:icon;display:grid;place-items:center;inline-size:40px;block-size:40px;margin-block-end:8px;border-radius:12px;background:var(--md-sys-color-secondary-container,#dce2f9);color:var(--md-sys-color-on-secondary-container,#151b2c)}
.name{grid-area:name;font-size:16px;font-weight:600;line-height:24px;overflow-wrap:anywhere}
.desc{grid-area:desc;color:var(--md-sys-color-on-surface-variant,#44474f);overflow-wrap:anywhere}
.state{grid-area:state;justify-self:end;align-self:start;padding:2px 10px;border-radius:8px;background:var(--md-sys-color-tertiary-container,#ffd8ec);color:var(--md-sys-color-on-tertiary-container,#31111d);font-size:12px;line-height:16px}
.empty{padding:16px;color:var(--md-sys-color-on-surface-variant,#44474f)}
@keyframes mfe-home-card-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.card{animation:mfe-home-card-in var(--md-sys-motion-duration-medium2,300ms) var(--md-sys-motion-easing-emphasized-decelerate,ease-out) both}
@media(prefers-reduced-motion:reduce){.card{animation:none;transition:none}.card::before{transition:none}}
.lead{margin:0 0 16px;color:var(--md-sys-color-on-surface-variant,#44474f)}
.flagship{grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))}
.card.big{min-block-size:156px;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon name" "desc desc" "foot foot";gap:8px 12px;padding:18px;border-radius:20px;animation-delay:calc(var(--i,0)*55ms)}
.card.big .icon{margin:0;inline-size:44px;block-size:44px;border-radius:14px}
.card.big .name{align-self:center;font-size:17px}
.foot{grid-area:foot;align-self:end;display:flex;align-items:center;gap:8px;min-inline-size:0;margin-block-start:auto;padding-block-start:10px;border-block-start:1px solid var(--md-sys-color-outline-variant,#c4c6d0)}
.dot{flex:none;inline-size:8px;block-size:8px;border-radius:50%;background:var(--md-sys-color-outline,#74777f)}
.dot[data-tone=ok]{background:var(--md-sys-color-primary,#5466a8)}.dot[data-tone=warn]{background:var(--md-sys-color-error,#ba1a1a)}
.status{font-weight:600;overflow-wrap:anywhere;min-inline-size:0}
.action{margin-inline-start:auto;flex:none;color:var(--md-sys-color-primary,#5466a8);font-weight:600}
.strip{position:relative;isolation:isolate;overflow:hidden;box-sizing:border-box;inline-size:100%;display:flex;align-items:center;gap:14px;margin-block-start:12px;padding:14px 18px;border:1px solid var(--md-sys-color-outline-variant,#c4c6d0);border-radius:16px;background:var(--md-sys-color-surface-container-low,var(--md-sys-color-surface,#fff));color:inherit;font:inherit;text-align:start;cursor:pointer;animation:mfe-home-card-in var(--md-sys-motion-duration-medium2,300ms) var(--md-sys-motion-easing-emphasized-decelerate,ease-out) both;animation-delay:calc(var(--i,6)*55ms)}
.strip:hover{border-color:var(--md-sys-color-outline,#74777f)}.strip:focus-visible{outline:3px solid var(--md-sys-color-primary,#5466a8);outline-offset:2px}
.strip .icon{flex:none;margin:0}.strip .text{flex:1;min-inline-size:0;display:grid;gap:2px}.strip .name{grid-area:auto;font-size:15px}.strip .desc{grid-area:auto}
.recent{margin-block-start:12px;border:1px solid var(--md-sys-color-outline-variant,#c4c6d0);border-radius:16px;overflow:hidden}
.recent h3{margin:0;padding:10px 16px;font:700 11px/16px var(--mfe-font,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--md-sys-color-on-surface-variant,#44474f);background:var(--md-sys-color-surface-container-low,transparent);border-block-end:1px solid var(--md-sys-color-outline-variant,#c4c6d0)}
.recent ul{list-style:none;margin:0;padding:0}
.recent li{display:grid;grid-template-columns:minmax(6.5rem,8rem) minmax(0,1fr) minmax(5rem,10rem);gap:12px;align-items:center;min-block-size:38px;padding:6px 16px;border-block-end:1px solid var(--md-sys-color-outline-variant,#c4c6d0)}
.recent li:last-child{border-block-end:0}
.recent .when{color:var(--md-sys-color-on-surface-variant,#44474f);font-variant-numeric:tabular-nums}
.recent .what{overflow-wrap:anywhere;min-inline-size:0}.recent .kind{text-align:end;color:var(--md-sys-color-on-surface-variant,#44474f)}
.recent p{margin:0;padding:14px 16px;color:var(--md-sys-color-on-surface-variant,#44474f)}
@media(max-width:600px){.recent li{grid-template-columns:minmax(0,1fr);gap:2px}.recent .kind{text-align:start}}
:host-context([data-motion=reduced]) .card,:host-context([data-low-stimulation=true]) .card,:host-context([data-motion=reduced]) .strip,:host-context([data-low-stimulation=true]) .strip{animation:none;transition:none}
@media(prefers-reduced-motion:reduce){.strip{animation:none}}
`;

/** Home: one Material card per destination. Choosing a card asks the owner to open or focus that tab. */
export class HomeGrid extends SurfaceElement {
  configure({entries = [], language = 'en', onOpen, layout = 'all', tools = null, recent = null} = {}) {
    Object.assign(this, {entries, language, onOpen, layout, tools, recent});
    this.render();
  }

  /** Replaces only the Recent activity list: `null` while loading, otherwise an array of {time, what, kind}. */
  setRecent(rows) {
    this.recent = rows;
    if (this.layout !== 'flagship' || !this.shadowRoot) return;
    const next = this.recentSection();
    if (this.recentNode) this.recentNode.replaceWith?.(next);
    else this.shadowRoot.append(next);
    this.recentNode = next;
  }

  recentSection() {
    const section = document.createElement('section');
    section.className = 'recent';
    section.setAttribute('aria-labelledby', 'home-recent-heading');
    const heading = document.createElement('h3');
    heading.id = 'home-recent-heading';
    heading.textContent = this.t('Recent activity', '最近活動');
    section.append(heading);
    const rows = Array.isArray(this.recent) ? this.recent : [];
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.setAttribute('role', 'status');
      empty.textContent = this.recent === null ? this.t('Loading recent activity…', '正在載入最近活動…') : this.t('No activity yet. Saves, uploads, backups and restores will appear here.', '暫時未有活動。儲存、上載、備份同還原會顯示喺度。');
      section.append(empty);
      return section;
    }
    const list = document.createElement('ul');
    for (const row of rows) {
      const item = document.createElement('li');
      const when = document.createElement('span'), what = document.createElement('span'), kind = document.createElement('span');
      when.className = 'when'; what.className = 'what'; kind.className = 'kind';
      when.textContent = formatActivityTime(row.time, this.language);
      what.textContent = typeof row.what === 'object' ? localized(row.what, this.language) : String(row.what ?? '');
      kind.textContent = typeof row.kind === 'object' ? localized(row.kind, this.language) : String(row.kind ?? '');
      item.append(when, what, kind);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  renderFlagship() {
    this.cards = [];
    const heading = document.createElement('h2');
    heading.id = 'home-heading';
    heading.textContent = this.t('Home', '首頁');
    const lead = document.createElement('p');
    lead.className = 'lead';
    lead.textContent = this.t('Your encrypted drive at a glance', '一眼睇晒你嘅加密磁碟');
    const list = document.createElement('ul');
    list.className = 'grid flagship';
    list.setAttribute('aria-labelledby', 'home-heading');
    (this.entries || []).forEach((entry, index) => {
      const item = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card big';
      card.dataset.tabId = entry.id;
      card.style?.setProperty('--i', String(index));
      const name = localized(entry.label, this.language), desc = localized(entry.description, this.language);
      const status = entry.status ? localized(entry.status.text, this.language) : '';
      card.setAttribute('aria-label', status ? `${name}, ${status}` : name);
      card.setAttribute('aria-description', desc);
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(glyph(HOME_ICONS[entry.icon] || HOME_ICONS.apps));
      const title = document.createElement('span');
      title.className = 'name';
      title.textContent = name;
      const description = document.createElement('span');
      description.className = 'desc';
      description.textContent = desc;
      const foot = document.createElement('span');
      foot.className = 'foot';
      if (status) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.dataset.tone = entry.status.tone || 'off';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'status';
        label.textContent = status;
        foot.append(dot, label);
      }
      const action = document.createElement('span');
      action.className = 'action';
      action.setAttribute('aria-hidden', 'true');
      action.textContent = `${localized(entry.action || text('Open', '打開'), this.language)} →`;
      foot.append(action);
      card.append(icon, title, description, foot);
      card.addEventListener('click', () => this.onOpen?.(entry));
      card.addEventListener('keydown', event => this.keydown(event, card));
      item.append(card);
      list.append(item);
      this.cards.push(card);
    });
    this.shadowRoot.append(heading, lead, list);
    const tools = this.tools;
    if (tools?.available) {
      const strip = document.createElement('button');
      strip.type = 'button';
      strip.className = 'strip';
      strip.dataset.tabId = LOCAL_TOOLS_ID;
      strip.style?.setProperty('--i', String(this.cards.length));
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(glyph(HOME_ICONS.tools));
      const body = document.createElement('span');
      body.className = 'text';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = this.t('Local tools', '本機工具');
      const names = tools.names.map(label => localized(label, this.language));
      const summary = document.createElement('span');
      summary.className = 'desc';
      summary.textContent = tools.more > 0 ? this.t(`${names.join(', ')} and ${tools.more} more`, `${names.join('、')}同其他 ${tools.more} 個工具`) : names.join(this.language === 'yue' ? '、' : ', ');
      body.append(name, summary);
      const action = document.createElement('span');
      action.className = 'action';
      action.setAttribute('aria-hidden', 'true');
      action.textContent = `${this.t('Open', '打開')} →`;
      strip.setAttribute('aria-label', `${this.t('Local tools', '本機工具')}, ${this.t(`${tools.count} tools`, `${tools.count} 個工具`)}`);
      strip.append(icon, body, action);
      strip.addEventListener('click', () => this.onOpen?.({id: LOCAL_TOOLS_ID}));
      strip.addEventListener('keydown', event => this.keydown(event, strip));
      this.shadowRoot.append(strip);
      this.cards.push(strip);
    }
    this.recentNode = this.recentSection();
    this.shadowRoot.append(this.recentNode);
  }

  render() {
    this.style(GRID_CSS);
    if (this.layout === 'flagship') { this.renderFlagship(); return; }
    this.cards = [];
    const entries = this.entries || [];
    const heading = document.createElement('h2');
    heading.id = 'home-heading';
    heading.textContent = this.t('Open a section', '打開功能');
    const list = document.createElement('ul');
    list.className = 'grid';
    list.setAttribute('aria-labelledby', 'home-heading');
    for (const entry of entries) {
      const item = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.tabId = entry.id;
      const name = localized(entry.label, this.language), desc = localized(entry.description, this.language);
      const state = entry.open ? this.t('Open', '已開啟') : '';
      card.setAttribute('aria-label', state ? `${name}, ${state}` : name);
      card.setAttribute('aria-description', desc);
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(glyph(HOME_ICONS[entry.icon] || HOME_ICONS.apps));
      const title = document.createElement('span');
      title.className = 'name';
      title.textContent = name;
      const description = document.createElement('span');
      description.className = 'desc';
      description.textContent = desc;
      card.append(icon, title, description);
      if (state) {
        const badge = document.createElement('span');
        badge.className = 'state';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = state;
        card.append(badge);
      }
      card.addEventListener('click', () => this.onOpen?.(entry));
      card.addEventListener('keydown', event => this.keydown(event, card));
      item.append(card);
      list.append(item);
      this.cards.push(card);
    }
    this.shadowRoot.append(heading, list);
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.setAttribute('role', 'status');
      empty.textContent = this.t('No sections are available yet.', '暫時未有可用嘅區段。');
      this.shadowRoot.append(empty);
    }
  }

  columns() {
    const first = this.cards?.[0]?.getBoundingClientRect?.();
    if (!first) return 1;
    return Math.max(1, this.cards.filter(card => Math.abs(card.getBoundingClientRect().top - first.top) < 2).length);
  }

  keydown(event, card) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = moveHomeFocus(this.cards.indexOf(card), event.key, this.columns(), this.cards.length);
    if (next < 0) return;
    event.preventDefault();
    this.cards[next].focus();
  }

  focusFirst() {
    this.cards?.[0]?.focus?.();
  }
}
register('mfe-home-grid', HomeGrid);
