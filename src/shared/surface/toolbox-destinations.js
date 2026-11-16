// Destination descriptors for the toolbox views. The workspace registers each as a tool tab, a command palette
// entry and an entry in the New tab catalog inventory. Labels are bilingual and stay plain text.
const entry = (id, en, yue, descriptionEn, descriptionYue, keywords, icon) => Object.freeze({
  id, kind: 'tool', group: Object.freeze({ en: 'Tools', yue: '工具' }),
  label: Object.freeze({ en, yue }), description: Object.freeze({ en: descriptionEn, yue: descriptionYue }),
  keywords: Object.freeze(keywords), icon, requiresUnlock: false, feature: id,
});

export const TOOLBOX_DESTINATIONS = Object.freeze([
  entry('base64-tools', 'Base64 toolkit', 'Base64 工具', 'Encode and decode text and files, build data: URLs and inspect bytes.', '編碼同解碼文字同檔案，建立 data: URL 同檢視位元組。', ['base64', 'encode', 'decode', 'data url', 'hex', 'mime', '編碼'], 'code'),
  entry('live-charts', 'Live charts', '即時圖表', 'Drive used space and operation progress as they change.', '隨時間變化嘅磁碟用量同操作進度。', ['chart', 'graph', 'usage', 'throughput', 'progress', '圖表'], 'show_chart'),
  entry('screen-recording', 'Screen recording', '螢幕錄影', 'Record a screen or window to a local WebM file. Nothing is uploaded.', '將螢幕或視窗錄成本機 WebM 檔案，唔會上載。', ['record', 'video', 'webm', 'capture', 'microphone', '錄影'], 'videocam'),
  entry('drawing', 'Sketch board', '繪圖板', 'Draw, annotate and export PNG or SVG, or save into the unlocked drive.', '繪圖同註解，匯出 PNG 或 SVG，或儲存到已解鎖磁碟。', ['draw', 'sketch', 'annotate', 'pen', 'png', 'svg', '繪圖'], 'draw'),
]);

export const TOOLBOX_VIEW_LABELS = Object.freeze(Object.fromEntries(TOOLBOX_DESTINATIONS.map(d => [d.id, d.label.en])));
