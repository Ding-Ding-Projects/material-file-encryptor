import { parseSecret, unwrapKey, openShareStream, ShareOpenError } from './share-open.js';

const TEXT = {
  en: {
    brand: 'Encrypted file download', encryptedFile: 'Encrypted file', expires: 'Link expires', left: 'Downloads left', passLabel: 'This file needs its passphrase', unlock: 'Unlock',
    downloading: 'Downloading and decrypting in your browser', saved: 'Saved. Every part passed its integrity check.', download: 'Download', again: 'Download again', cancel: 'Cancel',
    note: 'The file is decrypted on this device with the key in your link. The server only stores the encrypted copy and never sees the key.',
    endedTitle: 'This link has ended', endedBody: 'It expired or reached its download limit, and the file was removed from this server. Ask the person who sent it for a new link.',
    missingBody: 'The person who shared this file removed it. Ask them to share it again.', notFoundTitle: 'This link does not exist', notFoundBody: 'Check that you opened the whole link you were sent.',
    checking: 'Checking the link…', footer: 'Hosted with Material File Encryptor', noLimit: 'No limit', unlocking: 'Checking the passphrase…', encryptedSize: '{size}, encrypted end to end',
    INVALID_LINK: 'This link is incomplete. Open the whole link you were sent, including the part after #.', WRONG_PASSPHRASE: 'That passphrase does not open this file.',
    PASSPHRASE_REQUIRED: 'Type the passphrase first.', INVALID_KEY: 'The key in this link does not open the file. Check that the whole link was copied.',
    TAMPERED: 'The file failed its integrity check. Nothing was kept.', TRUNCATED: 'The file arrived incomplete. Nothing was kept. Try again.',
    UNKNOWN_VERSION: 'This file was made by a newer app version. The person who sent it can share it again.', INVALID_METADATA: 'The file description could not be read.',
    NETWORK: 'The download stopped. Check your connection and try again.', UNSUPPORTED: 'This browser cannot decrypt files. Use a current version of Chrome, Edge, Firefox or Safari.'
  },
  'zh-HK': {
    brand: '加密檔案下載', encryptedFile: '加密檔案', expires: '連結到期', left: '剩低下載次數', passLabel: '呢個檔案要密語', unlock: '解鎖',
    downloading: '喺你嘅瀏覽器下載同解密緊', saved: '已經儲存，每一段都通過咗完整性檢查。', download: '下載', again: '再下載', cancel: '取消',
    note: '檔案用連結入面嘅金鑰喺呢部裝置解密。伺服器只係存加密副本，從來見唔到金鑰。',
    endedTitle: '呢條連結已經完咗', endedBody: '佢過咗期或者用晒下載次數，檔案已經喺呢個伺服器刪咗。請搵傳俾你嘅人要條新連結。',
    missingBody: '分享呢個檔案嘅人已經刪咗佢。請佢再分享一次。', notFoundTitle: '冇呢條連結', notFoundBody: '請確認你打開咗成條連結。',
    checking: '檢查緊連結…', footer: '由 Material File Encryptor 託管', noLimit: '冇上限', unlocking: '檢查緊密語…', encryptedSize: '{size}，全程加密',
    INVALID_LINK: '條連結唔完整。請打開成條連結，包括 # 後面嗰段。', WRONG_PASSPHRASE: '呢個密語開唔到呢個檔案。', PASSPHRASE_REQUIRED: '請先輸入密語。',
    INVALID_KEY: '連結入面嘅金鑰開唔到呢個檔案。請確認成條連結都複製咗。', TAMPERED: '檔案過唔到完整性檢查，乜都冇保留。', TRUNCATED: '檔案收唔齊，乜都冇保留。請再試。',
    UNKNOWN_VERSION: '呢個檔案由較新版本整出嚟，請對方再分享一次。', INVALID_METADATA: '讀唔到檔案描述。', NETWORK: '下載停咗。請檢查網絡再試。', UNSUPPORTED: '呢個瀏覽器解唔到密。請用最新版 Chrome、Edge、Firefox 或 Safari。'
  }
};
const language = /^zh\b/i.test(navigator.language || '') ? 'zh-HK' : 'en';
const t = (key, values = {}) => (TEXT[language][key] ?? TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const $ = id => document.getElementById(id);
document.documentElement.lang = language;
document.title = t('brand');
for (const node of document.querySelectorAll('[data-text]')) node.textContent = t(node.dataset.text);

const id = (/^\/d\/([A-Za-z0-9_-]{22})\/?$/.exec(location.pathname) || [])[1];
const bytes = value => { const units = ['bytes', 'KB', 'MB', 'GB']; let n = value, i = 0; while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + units[i]; };
const when = ms => new Intl.DateTimeFormat(language === 'zh-HK' ? 'zh-HK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(ms));
let secret = null, key = null, meta = null, controller = null;

function show(section) { for (const name of ['loading', 'live', 'gone']) $(name).hidden = name !== section; }
function problem(code) { const node = $('problem'); node.textContent = code ? t(code) : ''; node.hidden = !code; }
function ended(title, body) { show('gone'); document.querySelector('#gone h1').textContent = t(title); $('gone-text').textContent = t(body); }
function codeOf(error) { return error instanceof ShareOpenError ? error.code : error?.name === 'AbortError' ? null : 'NETWORK'; }

async function info() {
  const response = await fetch(`/api/links/${id}`, { cache: 'no-store' });
  if (response.status === 404) { ended('notFoundTitle', 'notFoundBody'); return null; }
  if (response.status === 410) { const body = await response.json().catch(() => ({})); ended('endedTitle', body.endedReason === 'missing' ? 'missingBody' : 'endedBody'); return null; }
  if (!response.ok) throw new ShareOpenError('NETWORK');
  return response.json();
}

async function preview() {
  // Reads only the first encrypted chunk to learn the file name. This is not counted as a download.
  const response = await fetch(`/api/links/${id}/head`, { cache: 'no-store' });
  if (!response.ok) return;
  try { await openShareStream({ reader: response.body.getReader(), total: meta.size, key, stopAfterMetadata: true, onMetadata: value => { $('file-name').textContent = value.name; $('file-size').textContent = bytes(value.size); } }); }
  catch (error) { if (codeOf(error) === 'INVALID_KEY') problem('INVALID_KEY'); }
}

function progress(value) {
  const pct = Math.round(value * 100);
  $('percent').textContent = pct + '%'; $('bar-fill').style.width = pct + '%';
  document.querySelector('.bar').setAttribute('aria-valuenow', String(pct));
}

async function save() {
  problem(null); $('done').hidden = true;
  const name = $('file-name').textContent === t('encryptedFile') ? 'download' : $('file-name').textContent;
  let writable = null;
  if (typeof window.showSaveFilePicker === 'function') {
    try { writable = await (await window.showSaveFilePicker({ suggestedName: name })).createWritable(); }
    catch (error) { if (error?.name === 'AbortError') return; writable = null; }
  }
  controller = new AbortController();
  $('progress').hidden = false; progress(0);
  const button = $('download'); button.textContent = t('cancel');
  const parts = [];
  let savedName = name;
  try {
    const response = await fetch(`/api/links/${id}/blob`, { cache: 'no-store', signal: controller.signal });
    if (response.status === 410) { const body = await response.json().catch(() => ({})); ended('endedTitle', body.error?.code === 'MISSING' ? 'missingBody' : 'endedBody'); return; }
    if (!response.ok) throw new ShareOpenError('NETWORK');
    await openShareStream({ reader: response.body.getReader(), total: meta.size, key, onProgress: progress,
      onMetadata: value => { savedName = value.name; $('file-name').textContent = value.name; },
      onContent: piece => writable ? writable.write(piece) : void parts.push(piece) });
    if (writable) await writable.close();
    else {
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/octet-stream' }));
      const anchor = Object.assign(document.createElement('a'), { href: url, download: savedName });
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    $('done').hidden = false; button.textContent = t('again');
    if (meta.downloadsLeft !== null) { meta.downloadsLeft = Math.max(0, meta.downloadsLeft - 1); $('left').textContent = String(meta.downloadsLeft); if (!meta.downloadsLeft) button.disabled = true; }
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    problem(codeOf(error)); button.textContent = t('download');
  } finally { parts.length = 0; controller = null; $('progress').hidden = true; }
}

async function unlock(event) {
  event.preventDefault();
  const button = $('unlock'); button.disabled = true; problem(null);
  const label = $('progress-label'); $('progress').hidden = false; label.textContent = t('unlocking'); progress(0);
  try {
    key = await unwrapKey(secret.wrapped, $('passphrase').value, progress);
    $('passphrase').value = ''; $('pass-form').hidden = true; $('download').hidden = false;
    await preview();
  } catch (error) { problem(codeOf(error)); button.disabled = false; }
  finally { $('progress').hidden = true; label.textContent = t('downloading'); }
}

async function start() {
  if (!id) { ended('notFoundTitle', 'notFoundBody'); return; }
  if (!globalThis.crypto?.subtle) { show('live'); problem('UNSUPPORTED'); $('download').hidden = true; return; }
  try { secret = parseSecret(location.hash); }
  catch { show('live'); problem('INVALID_LINK'); $('download').hidden = true; return; }
  try { meta = await info(); } catch { show('live'); problem('NETWORK'); return; }
  if (!meta) return;
  show('live');
  $('file-size').textContent = t('encryptedSize', { size: bytes(meta.size) });
  $('expires').textContent = when(meta.expiresAt);
  $('left').textContent = meta.downloadsLeft === null ? t('noLimit') : String(meta.downloadsLeft);
  $('download').addEventListener('click', () => { if (controller) controller.abort(); else void save(); });
  if (secret.wrapped) { $('pass-form').hidden = false; $('download').hidden = true; $('pass-form').addEventListener('submit', unlock); $('passphrase').focus(); }
  else { key = secret.key; await preview(); }
  if (meta.downloadsLeft === 0) $('download').disabled = true;
}
void start();
