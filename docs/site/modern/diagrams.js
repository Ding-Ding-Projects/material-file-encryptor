// Interactive examples. Each one changes its own explanation and picture; none of them runs the installed app.
import {pick} from './i18n.js';
const FILE_MB = 64;
function partSize(root) {
 const range = root.querySelector('[data-part-size]'), out = root.querySelector('[data-part-size-out]'), stage = root.querySelector('[data-part-stage]'), explain = root.querySelector('[data-part-explain]');
 const render = () => {
  const limit = Number(range.value), count = Math.ceil(FILE_MB / limit), last = FILE_MB - (count - 1) * limit;
  out.textContent = `${limit} MB`;
  const shown = Math.min(count, 64);
  const blocks = [...stage.children];
  while (blocks.length < shown) { const b = document.createElement('span'); b.className = 'diagram-block'; stage.append(b); blocks.push(b); }
  blocks.forEach((b, i) => { b.hidden = i >= shown; b.textContent = i < shown ? (i === count - 1 ? String(last) : String(limit)) : ''; });
  stage.setAttribute('aria-label', pick(`${count} encrypted parts`, `${count} 個加密分段`));
  explain.textContent = pick(`A ${FILE_MB} MB file with a ${limit} MB limit becomes ${count} part${count === 1 ? '' : 's'}; the last holds ${last} MB. Smaller parts suit sync services with upload limits, larger parts mean fewer files. Framing overhead is ignored in this picture.`, `${FILE_MB} MB 嘅檔案，上限 ${limit} MB，會變成 ${count} 個分段，最後一個係 ${last} MB。細啲嘅分段適合有上載限制嘅同步服務，大啲就檔案少啲。圖入面唔計額外開銷。`);
 };
 range.addEventListener('input', render); render();
}
function offline(root) {
 const storage = root.querySelector('[data-offline-storage]'), cache = root.querySelector('[data-offline-cache]'), stage = root.querySelector('[data-offline-stage]'), explain = root.querySelector('[data-offline-explain]');
 const blocks = Array.from({length: 8}, (_, i) => { const b = document.createElement('span'); b.className = 'diagram-block'; b.textContent = String(i + 1); stage.append(b); return b; });
 const render = () => {
  const online = storage.value === 'online', complete = cache.value === 'complete';
  let readable = 0;
  blocks.forEach((b, i) => {
   const cached = complete || i < 5;
   const ok = online || cached;
   b.classList.toggle('is-cached', !online && cached);
   b.classList.toggle('is-missing', !ok);
   if (ok) readable++;
  });
  explain.textContent = online
   ? pick('Storage is reachable, so every part can be fetched on demand. The cache only saves time.', '儲存位置連到，所以每個分段都可以即時攞。快取只係慳時間。')
   : complete ? pick('Storage is unreachable but the cache holds every part, so the file still opens. Parts stay encrypted on disk.', '儲存位置連唔到，但快取有齊所有分段，檔案仍然開到。分段喺磁碟上保持加密。')
   : pick(`Storage is unreachable and the cache is incomplete: ${readable} of 8 parts are available, so the file cannot open. Pinning cannot make missing bytes appear.`, `儲存位置連唔到而快取唔齊：8 個分段得 ${readable} 個，檔案開唔到。釘選唔可以變出欠缺嘅位元組。`);
 };
 storage.addEventListener('change', render); cache.addEventListener('change', render); render();
}
function unlock(root) {
 const method = root.querySelector('[data-unlock-method]'), toggle = root.querySelector('[data-unlock-toggle]'), stage = root.querySelector('[data-unlock-stage]'), explain = root.querySelector('[data-unlock-explain]');
 let open = false;
 const labels = [['Vault', '保險庫'], ['Key in memory', '記憶體入面嘅金鑰'], ['Drive in Explorer', '檔案總管入面嘅磁碟機']];
 const blocks = labels.map(([en, yue]) => { const b = document.createElement('span'); b.className = 'diagram-block'; b.style.minWidth = '150px'; b.textContent = pick(en, yue); stage.append(b); return b; });
 const render = () => {
  blocks[0].classList.toggle('is-cached', true);
  blocks[1].classList.toggle('is-cached', open); blocks[1].classList.toggle('is-missing', !open);
  blocks[2].classList.toggle('is-cached', open); blocks[2].classList.toggle('is-missing', !open);
  toggle.textContent = open ? pick('Lock (example)', '上鎖（示範）') : pick('Unlock (example)', '解鎖（示範）');
  const how = method.value === 'key' ? pick('a key file', '金鑰檔案') : pick('a password', '密碼');
  explain.textContent = open
   ? pick(`Unlocked with ${how}: the key lives in memory only, and Windows Explorer now shows the vault as a drive. The stored parts on disk stay encrypted.`, `用${how}解鎖：金鑰只喺記憶體，檔案總管而家將保險庫顯示做磁碟機。磁碟上嘅分段保持加密。`)
   : pick(`Locked: nothing is in memory and no drive is shown. Unlocking needs ${how}.`, `已上鎖：記憶體冇金鑰，亦唔顯示磁碟機。解鎖需要${how}。`);
 };
 toggle.addEventListener('click', () => { open = !open; render(); });
 method.addEventListener('change', render); render();
}
export function mountDiagrams() {
 for (const root of document.querySelectorAll('[data-diagram]')) ({parts: partSize, offline, unlock})[root.dataset.diagram]?.(root);
}
