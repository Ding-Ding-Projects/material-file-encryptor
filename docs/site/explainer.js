export function clearExampleLimit(input) {
  if (input.disabled || input.readOnly) return false;
  input.value = '';
  input.setCustomValidity('');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus({ preventScroll: true });
  return true;
}
export const EXAMPLE_FILE_BYTES = 16 * 1024 ** 2;
export const EXAMPLE_OVERHEAD = 36;
export function exampleParts(value, unit) {
  const units = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  if (!/^\d+(?:\.\d+)?$/u.test(String(value).trim()) || !Object.hasOwn(units, unit)) return null;
  const limit = Number(value) * units[unit];
  if (!Number.isSafeInteger(limit) || limit < units.KB || limit > 90000000) return null;
  const chunkSize = limit - EXAMPLE_OVERHEAD;
  const parts = Math.ceil(EXAMPLE_FILE_BYTES / chunkSize);
  return { limit, parts, records: parts, total: EXAMPLE_FILE_BYTES + parts * EXAMPLE_OVERHEAD };
}
const copy = {
'Interactive architecture':'互動架構圖',
'Clear maximum encrypted part size':'清除加密分割檔最大大小',
'Follow the files, step by step.':'一步一步睇檔案點樣流動。',
'Conceptual demonstration only. This website does not mount a drive or process your files.':'只係概念示範。呢個網站唔會掛載磁碟或者處理你嘅檔案。',
'Choose a workflow operation':'選擇流程操作',
'Conceptual encrypted file flow':'加密檔案流程概念圖',
'Write':'寫入','Read':'讀取','Offline':'離線','Startup':'啟動','Resplit':'重新分割',
'Mounted drive':'掛載磁碟','Readable while unlocked':'解鎖後可以讀取',
'Encryption boundary':'加密邊界','Encrypt writes · decrypt reads':'寫入時加密 · 讀取時解密',
'Storage folder':'儲存資料夾','Encrypted parts':'加密分割檔','Offline cache':'離線快取','Encrypted pinned bytes':'已釘選嘅加密資料',
'Example availability':'示例可用狀態','Maximum encrypted part size':'加密分割檔最大大小',
'Storage reachable':'可以連到儲存位置','Offline, complete cache':'離線，快取完整','Offline, cache incomplete':'離線，快取唔完整',
'Next step':'下一步','Part size unit':'分割大小單位','Play walkthrough':'播放流程','Pause walkthrough':'暫停流程','Replay':'重新播放',
'Size illustration: a 16 MiB file split into fixed ciphertext chunks with 36 bytes of framing each. The final chunk may be shorter. Maximum physical chunk: 90,000,000 bytes. Counts describe this example, not your files.':'大小示例：一個 16 MiB 檔案分成固定密文分塊，每塊包含 36 位元組框架資料，最後一塊可以較短。每塊實體上限為 90,000,000 位元組。計算只描述示例，唔係你嘅檔案。',
'Enter a whole-byte limit from 1 KiB to 90,000,000 bytes, inclusive.':'請輸入以完整位元組計算、由 1 KiB 至 90,000,000 位元組嘅上限，包括兩個端點。',
'Write: encrypt changed file bytes':'寫入：加密改動過嘅檔案資料',
'An edit through the unlocked drive is encrypted into parts in the chosen storage folder. Uploading those parts, if needed, is the sync provider’s separate job.':'透過已解鎖磁碟編輯檔案後，資料會加密成分割檔，存喺指定資料夾。需要上載嘅話，由同步服務另外處理。',
'The example storage folder is unreachable. A cached copy permits reads; it does not establish that a write has reached its storage destination.':'示例儲存資料夾無法連接。快取副本可以供讀取，但唔代表寫入已經到達儲存目的地。',
'Read: decrypt only when needed':'讀取：有需要先解密',
'The mounted drive retrieves encrypted parts from reachable storage and decrypts the requested bytes for the application opening the file.':'掛載磁碟會由可連接嘅儲存位置取得加密部分，再解密所需資料，交畀開啟檔案嘅應用程式。',
'The stored copy is unreachable, so this example reads a complete encrypted cache through the unlocked drive.':'儲存副本無法連接，所以呢個示例會透過已解鎖磁碟讀取完整加密快取。',
'Neither reachable storage nor a complete cache is available. The example cannot supply the requested file bytes.':'既連唔到儲存位置，又冇完整快取。呢個示例無法提供所需檔案資料。',
'Offline: retain encrypted bytes':'離線：保留加密資料',
'While storage is reachable, pinning can retrieve the encrypted parts needed for later offline reads. Wait for all required bytes before disconnecting.':'連到儲存位置嗰陣，釘選可以取得之後離線讀取所需嘅加密部分。等齊所有需要嘅資料先好斷線。',
'The complete pinned cache supplies encrypted parts locally. File contents become readable only through the unlocked mounted drive.':'完整釘選快取會喺本機提供加密部分。檔案內容只會透過已解鎖嘅掛載磁碟變成可讀。',
'The cache is incomplete and storage is unreachable. Pinning alone cannot recover the missing bytes while offline.':'快取唔完整，而且連唔到儲存位置。離線嗰陣，單靠釘選唔會取得欠缺嘅資料。',
'Startup: start separately from unlock':'啟動：程式啟動同解鎖分開處理',
'Starting with Windows is enabled by default. Automatic unlock is optional and uses the current Windows user’s DPAPI protection. Keep the original password or key file for recovery.':'預設會隨 Windows 啟動。自動解鎖係自選設定，會用目前 Windows 使用者嘅 DPAPI 保護。請保留原本密碼或金鑰檔案作復原之用。',
'Resplit: rewrite existing parts explicitly':'重新分割：主動重寫現有分割檔',
'Changing the size limit affects new or edited files. Explicitly choosing Resplit recreates existing encrypted parts with the new limit and can require extra space and provider uploads.':'改變大小上限會影響新建或編輯過嘅檔案。主動選擇重新分割，先會按新上限重建現有加密分割檔，可能需要額外空間同同步服務上載。',
'This example has no reachable storage destination. It does not show resplitting as completed; a complete cached copy alone is not proof that replacement parts were stored.':'呢個示例冇可連接嘅儲存目的地，所以唔會顯示重新分割完成。單靠完整快取副本，唔代表替換分割檔已經儲存。',
};
if (typeof document !== 'undefined') {
  const root = document.querySelector('#interactive-workflow');
  if (root) {
    let language = document.documentElement.dataset.language || 'en';
    let operation = 'write'; let timer = null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const operations = ['write', 'read', 'offline', 'startup', 'resplit'];
    const buttons = [...root.querySelectorAll('[data-operation]')];
    const availability = root.querySelector('#access-mode');
    const limit = root.querySelector('#part-limit');
    const unit = root.querySelector('#part-unit');
    const clearLimit = root.querySelector('#part-limit-clear');
    clearLimit.addEventListener('click', () => clearExampleLimit(limit));
    const play = root.querySelector('#workflow-play');
    const replay = root.querySelector('#workflow-replay');
    const translated = text => language === 'yue' ? copy[text] || text : language === 'bilingual' && copy[text] ? `${text} / ${copy[text]}` : text;
    const pair = (en, yue) => language === 'yue' ? yue : language === 'bilingual' ? `${en} / ${yue}` : en;
    const labels = buttons.map(button => [button, button.textContent]);
    const options = [...availability.options].map(option => [option, option.textContent]);
    const attrs = [...root.querySelectorAll('[aria-label]')].map(element => [element, element.getAttribute('aria-label')]);
    function stop() { if (timer) clearInterval(timer); timer = null; root.classList.remove('is-playing'); play.textContent = translated(reduced.matches ? 'Next step' : 'Play walkthrough'); }
    function render() {
      root.dataset.step = operation;
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.operation === operation));
      const mode = availability.value;
      const messages = {
        write: ['Write: encrypt changed file bytes', mode === 'online' ? 'An edit through the unlocked drive is encrypted into parts in the chosen storage folder. Uploading those parts, if needed, is the sync provider’s separate job.' : 'The example storage folder is unreachable. A cached copy permits reads; it does not establish that a write has reached its storage destination.'],
        read: ['Read: decrypt only when needed', mode === 'online' ? 'The mounted drive retrieves encrypted parts from reachable storage and decrypts the requested bytes for the application opening the file.' : mode === 'cached' ? 'The stored copy is unreachable, so this example reads a complete encrypted cache through the unlocked drive.' : 'Neither reachable storage nor a complete cache is available. The example cannot supply the requested file bytes.'],
        offline: ['Offline: retain encrypted bytes', mode === 'online' ? 'While storage is reachable, pinning can retrieve the encrypted parts needed for later offline reads. Wait for all required bytes before disconnecting.' : mode === 'cached' ? 'The complete pinned cache supplies encrypted parts locally. File contents become readable only through the unlocked mounted drive.' : 'The cache is incomplete and storage is unreachable. Pinning alone cannot recover the missing bytes while offline.'],
        startup: ['Startup: start separately from unlock', 'Starting with Windows is enabled by default. Automatic unlock is optional and uses the current Windows user’s DPAPI protection. Keep the original password or key file for recovery.'],
        resplit: ['Resplit: rewrite existing parts explicitly', mode === 'online' ? 'Changing the size limit affects new or edited files. Explicitly choosing Resplit recreates existing encrypted parts with the new limit and can require extra space and provider uploads.' : 'This example has no reachable storage destination. It does not show resplitting as completed; a complete cached copy alone is not proof that replacement parts were stored.'],
      };
      const destinationBlocked = mode !== 'online' && ['write', 'resplit'].includes(operation);
      const active = operation === 'startup' ? ['drive', 'crypto'] : destinationBlocked ? ['drive', 'crypto'] : mode === 'missing' ? [] : mode === 'cached' ? ['drive', 'crypto', 'cache'] : operation === 'offline' ? ['storage', 'cache'] : ['drive', 'crypto', 'storage'];
      for (const node of root.querySelectorAll('[data-node]')) node.classList.toggle('is-active', active.includes(node.dataset.node));
      root.dataset.flowActive = String(Boolean(timer) && mode !== 'missing' && operation !== 'startup' && !destinationBlocked);
      root.querySelector('#operation-title').textContent = translated(messages[operation][0]);
      root.querySelector('#operation-description').textContent = translated(messages[operation][1]);
      const parts = exampleParts(limit.value, unit.value);
      root.querySelector('#part-error').hidden = Boolean(parts);
      root.querySelector('#part-error').textContent = parts ? '' : translated('Enter a whole-byte limit from 1 KiB to 90,000,000 bytes, inclusive.');
      limit.setAttribute('aria-invalid', String(!parts));
      root.querySelector('#part-result').textContent = parts ? pair(`Illustrative result: ${parts.parts.toLocaleString('en')} encrypted parts for the 16 MB example; each physical part stays within ${limit.value} ${unit.value}, including encryption framing.`, `示例結果：16 MB 檔案會分成 ${parts.parts.toLocaleString('en')} 個加密部分；計埋加密框架資料，每個實際分割檔都唔會超過 ${limit.value} ${unit.value}。`) : '';
    }
    function translate() {
      for (const element of root.querySelectorAll('[data-copy]')) element.textContent = translated(element.dataset.copy);
      for (const [element, original] of [...labels, ...options]) element.textContent = translated(original);
      for (const [element, original] of attrs) element.setAttribute('aria-label', translated(original));
      play.textContent = translated(timer ? 'Pause walkthrough' : reduced.matches ? 'Next step' : 'Play walkthrough'); replay.textContent = translated('Replay'); render();
    }
    function start(reset = false) {
      stop(); if (reset) operation = 'write';
      if (reduced.matches) { operation = reset ? 'write' : operations[(operations.indexOf(operation) + 1) % operations.length]; render(); return; }
      root.classList.add('is-playing');
      timer = setInterval(() => { const index = operations.indexOf(operation); if (index === operations.length - 1) { stop(); render(); } else { operation = operations[index + 1]; render(); } }, 2600);
      play.textContent = translated('Pause walkthrough'); render();
    }
    for (const button of buttons) button.addEventListener('click', () => { stop(); operation = button.dataset.operation; render(); });
    root.querySelector('.workflow-steps').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const current = operations.indexOf(operation);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? operations.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + operations.length) % operations.length;
      stop(); operation = operations[index]; buttons[index].focus(); render();
    });
    for (const control of [availability, limit, unit]) control.addEventListener('input', () => { stop(); render(); });
    play.addEventListener('click', () => { if (timer) { stop(); render(); } else start(operation === 'resplit'); });
    replay.addEventListener('click', () => start(true));
    reduced.addEventListener('change', () => { stop(); render(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); render(); } });
    new IntersectionObserver(entries => { if (!entries[0].isIntersecting) { stop(); render(); } }, { threshold: .1 }).observe(root);
    window.addEventListener('site-language', event => { language = event.detail.language; translate(); });
    translate();
  }
}
