// The Local tools destination: every feature that is not one of the flagship Home cards, grouped by purpose.
// Pure data and helpers, so Home, the Local tools page and tests all count the same list. No count is written down
// here by hand; callers derive every number from the destinations that are actually registered.
import {text} from './registry.js';

export const LOCAL_TOOLS_ID = 'tools';
export const LOCAL_TOOLS_LABEL = text('Local tools', '本機工具');
export const LOCAL_TOOLS_DESCRIPTION = text('Converters, developer helpers, media and system tools that run on this computer.', '喺呢部電腦上面運行嘅轉換、開發、媒體同系統工具。');

/** Categories in display order. Each lists destination ids in display order. */
export const LOCAL_TOOL_CATEGORIES = Object.freeze([
  {id: 'files', label: text('Files and documents', '檔案同文件'), items: ['converter', 'workflow']},
  {id: 'development', label: text('Development', '開發'), items: ['quicktype', 'base64-tools']},
  {id: 'media', label: text('Media', '媒體'), items: ['screen-recording', 'drawing']},
  {id: 'system', label: text('System', '系統'), items: ['virtual-disks', 'split-storage', 'server-manager', 'ollama', 'live-charts', 'status', 'browser-pairing']},
  {id: 'fun', label: text('Fun', '趣味'), items: ['dimsum']},
]);

/** Short one-line summaries shown on the tool tiles. */
export const LOCAL_TOOL_SUMMARIES = Object.freeze({
  converter: text('Convert documents and images between formats.', '喺不同格式之間轉換文件同圖片。'),
  workflow: text('Choose where documents and downloads are kept.', '揀選文件同下載內容存放嘅位置。'),
  quicktype: text('Turn JSON samples or a schema into typed code.', '將 JSON 樣本或 schema 轉成有型別程式碼。'),
  'base64-tools': text('Encode and decode text and files as Base64.', '將文字同檔案編碼或解碼成 Base64。'),
  'screen-recording': text('Record a screen or window to a local file.', '將螢幕或視窗錄成本機檔案。'),
  drawing: text('Draw and annotate, then export PNG or SVG.', '繪圖同註解，再匯出 PNG 或 SVG。'),
  'virtual-disks': text('Create, attach and mount VHD, VHDX and ISO files.', '建立、連接同掛載 VHD、VHDX 同 ISO。'),
  'split-storage': text('Spread encrypted parts across disks, USB drives and Docker Hub, and keep mirrors.', '將加密分段分散放喺磁碟、USB 同 Docker Hub，並保留鏡像備份。'),
  'server-manager': text('Game servers and the world generator.', '遊戲伺服器同世界產生器。'),
  ollama: text('Language models that run on this computer.', '喺呢部電腦上面行嘅語言模型。'),
  'live-charts': text('Used space and transfer progress, live.', '即時顯示已用空間同傳輸進度。'),
  status: text('Version, build details and feature coverage.', '版本、建置資料同功能覆蓋。'),
  'browser-pairing': text('Link the browser extension to this drive.', '將瀏覽器擴充功能連結到呢個磁碟。'),
  dimsum: text('Browse the dim sum catalogue.', '瀏覽點心目錄。'),
});

/** Tool names, identical to the labels the workspace registers for each destination. */
export const LOCAL_TOOL_LABELS = Object.freeze({
  converter: text('Converter', '轉換工具'), workflow: text('Documents and downloads', '文件與下載'), quicktype: text('Type generator', '型別產生器'),
  'base64-tools': text('Base64 toolkit', 'Base64 工具'), 'screen-recording': text('Screen recording', '螢幕錄影'), drawing: text('Sketch board', '繪圖板'),
  'virtual-disks': text('Virtual disks', '虛擬磁碟'), 'split-storage': text('Split storage', '分散存放'), 'server-manager': text('Server preparation', '伺服器準備'), ollama: text('Local models', '本機模型'),
  'live-charts': text('Live charts', '即時圖表'), status: text('Status', '狀態'), 'browser-pairing': text('Pair a browser', '配對瀏覽器'), dimsum: text('Dim sum', '點心'),
});

/** Extra words the tools search matches, in both languages. */
export const LOCAL_TOOL_KEYWORDS = Object.freeze({
  converter: 'convert pdf image document format 轉換', workflow: 'download folder documents 下載', quicktype: 'json schema types code 型別',
  'base64-tools': 'base64 encode decode data url hex 編碼', 'screen-recording': 'record video webm capture 錄影', drawing: 'sketch draw annotate png svg 繪圖',
  'virtual-disks': 'vhd vhdx iso mount disk 虛擬磁碟', 'split-storage': 'split usb drive mirror backup redundancy docker hub 分散 鏡像 備份', 'server-manager': 'minecraft server world generator 伺服器', ollama: 'ai model llm language 模型',
  'live-charts': 'chart graph usage progress 圖表', status: 'version build coverage 狀態', 'browser-pairing': 'browser extension pair code 配對', dimsum: 'dim sum food catalogue 點心',
});

/** Ids of every tool that is registered, in category order. `has(id)` says whether a destination exists. */
export function localToolIds(has) {
  return LOCAL_TOOL_CATEGORIES.flatMap(category => category.items).filter(id => has(id));
}

/** Categories reduced to the registered tools, dropping empty categories. */
export function localToolGroups(has) {
  return LOCAL_TOOL_CATEGORIES.map(category => ({...category, items: category.items.filter(id => has(id))})).filter(category => category.items.length);
}
