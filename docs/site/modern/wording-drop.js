// Drop a personal wording JSON anywhere on a page. The file is validated here and read on this device only.
// A valid file is handed to the existing upload control, so the private-profile unlock rules and protected storage stay in force.
// Clearing goes through the existing reset control, which keeps its two-key confirmation and restores the original wording.
import {parseVocabulary, MAX_VOCABULARY_BYTES} from '../personal-vocabulary.js';
import {toast} from './toast.js';
import {playCue} from './sound.js';
import {pick} from './i18n.js';

let overlay = null;
const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
function showOverlay() {
 if (overlay) return;
 overlay = document.createElement('div');
 overlay.className = 'drop-overlay';
 overlay.setAttribute('aria-hidden', 'true');
 const box = document.createElement('div');
 box.textContent = pick('Drop your wording file to apply it on this device', '放低你嘅用字檔案，喺呢部裝置套用');
 overlay.append(box);
 document.body.append(overlay);
}
const hideOverlay = () => { overlay?.remove(); overlay = null; };
function celebrate() {
 const node = document.createElement('div');
 node.className = 'drop-celebrate';
 node.setAttribute('aria-hidden', 'true');
 node.textContent = '🎉';
 document.body.append(node);
 setTimeout(() => node.remove(), 1100);
}
const setStatus = message => { const node = document.getElementById('wording-status'); if (node) node.textContent = message; };
function fail(message) { playCue('invalid'); toast(message, {error: true}); setStatus(message); }

/** Validates and hands one file to the page's upload control. Exported for tests and the settings page chooser. */
export async function acceptWordingFile(file) {
 if (!file) return false;
 if (file.size > MAX_VOCABULARY_BYTES) { fail(pick('That file is larger than 256 KiB. Your current wording is unchanged.', '檔案超過 256 KiB，目前用字冇變。')); return false; }
 if (!/\.json$/i.test(file.name) && !/json/.test(file.type)) { fail(pick('Only a JSON wording file can be applied. Your current wording is unchanged.', '只可以套用 JSON 用字檔案，目前用字冇變。')); return false; }
 let text;
 try { text = await file.text(); parseVocabulary(text); }
 catch { fail(pick('That is not a valid wording file. Your current wording is unchanged.', '呢個唔係有效嘅用字檔案，目前用字冇變。')); return false; }
 const input = document.querySelector('#vocabulary-file');
 if (!input) { fail(pick('This page cannot apply wording.', '呢頁唔可以套用用字。')); return false; }
 try {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  // The upgraded file picker keeps its native input on .input; a plain input is used directly.
  (input.input || input).files = transfer.files;
  input.dispatchEvent(new Event('change', {bubbles: true}));
 } catch { fail(pick('The browser would not pass the file on.', '瀏覽器唔肯傳遞檔案。')); return false; }
 playCue('success');
 celebrate();
 const message = pick('Wording file accepted. It applies once your private profile is unlocked and stays on this device.', '用字檔案已接受。解鎖私人設定檔後即套用，只留喺呢部裝置。');
 toast(message);
 setStatus(message);
 return true;
}
export function mountWordingDrop() {
 let depth = 0;
 window.addEventListener('dragenter', event => { if (!hasFiles(event)) return; depth++; showOverlay(); });
 window.addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
 window.addEventListener('dragleave', event => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) hideOverlay(); });
 window.addEventListener('drop', event => {
  if (!hasFiles(event)) return;
  event.preventDefault(); depth = 0; hideOverlay();
  acceptWordingFile(event.dataTransfer.files[0]);
 });
 // Choosing a file opens the page's own upload control, which applies the same unlock rules as a drop.
 document.getElementById('wording-choose')?.addEventListener('click', () => {
  const host = document.querySelector('#vocabulary-file');
  (host?.input || host)?.click();
 });
 document.getElementById('wording-clear')?.addEventListener('click', () => { document.querySelector('#vocabulary-reset')?.click(); });
}
