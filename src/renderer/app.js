import { deletedDescendantCandidates } from './recycle-selection.js';
import { createScopedSearch } from './scoped-search.js';
import { parsePartSize, displayPartSize, parseVocabulary, loadSettings } from './preferences.js';
import { icon, initializeIcons } from './icons.js';
import { cantonese } from './i18n.js';
const $ = id => document.getElementById(id);
const api = window.drive;
let preferences = loadSettings(localStorage);
let state = null, selected = null, view = 'drive', busy = false, dialogMode = 'create', snackbarTimer;
let archiveRows = {history:[],recycle:[]}, archiveRequests={history:0,recycle:0};
const archiveRenders={history:0,recycle:0};
const recycledSelection=new Set(); let historySearch, recycleSearch;
let driveLetterEdited = false, activeDriveLetter = '';
const dictionary = new Map();
document.querySelectorAll('[data-i18n]').forEach(el => dictionary.set(el, el.textContent));
initializeIcons();
const scrollTimers = new WeakMap();
document.addEventListener('scroll', event => {
 const surface = event.target === document ? document.documentElement : event.target;
 if (!(surface instanceof Element)) return;
 surface.classList.add('is-scrolling');
 clearTimeout(scrollTimers.get(surface));
 scrollTimers.set(surface, setTimeout(() => { surface.classList.remove('is-scrolling'); scrollTimers.delete(surface); }, 900));
}, {capture:true,passive:true});
document.querySelector('main').prepend($('operation'), $('main-error'));
function t(source) {
 let value = preferences.language === 'yue' ? cantonese[source] || source : preferences.language === 'bilingual' && cantonese[source] ? `${source} · ${cantonese[source]}` : source;
 const entries = preferences.vocabulary.replacements;
 if (entries.length) {
  const replacements = new Map(entries.map(entry => [entry.from, entry.to]));
  const pattern = [...replacements.keys()].sort((a,b) => b.length-a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  value = value.replace(new RegExp(pattern, 'gu'), match => replacements.get(match));
 }
 return value.slice(0, 8192);
}
function setText(id, source) { $(id).textContent = t(source); }
function savePreferences() { try { localStorage.setItem('material-drive.preferences.v1', JSON.stringify(preferences)); } catch { showError('Your device could not save these preferences.'); } }
const colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyPreferences() {
 document.documentElement.dataset.theme = preferences.theme === 'system' ? colorQuery.matches ? 'dark' : 'light' : preferences.theme;
 document.documentElement.lang = preferences.language === 'yue' ? 'yue-Hant' : 'en';
 for (const [el, source] of dictionary) el.textContent = t(source);
 for (const el of document.querySelectorAll('[data-view]')) { const label = t(({drive:'My drive',offline:'Available offline',history:'History',recycle:'Recycle Bin',settings:'Settings',help:'How it works'})[el.dataset.view]); el.setAttribute('aria-label',label); el.title = label; }
 $('file-search').placeholder = t('Search files');
 $('file-search').setAttribute('aria-label',t('Search files'));
 $('theme-setting').value = preferences.theme; $('language-setting').value = preferences.language; $('emoji-setting').checked = preferences.emoji;
 for (const key of ['celebration','patience']) { $(`${key}-setting`).value = preferences[key]; $(`${key}-output`).textContent = preferences[key]; $(`${key}-setting`).style.setProperty('--range-progress', `${preferences[key]}%`); }
 $('vocabulary-summary').textContent = preferences.language === 'yue' ? `已儲存 ${preferences.vocabulary.replacements.length} 個替換詞。` : `${preferences.vocabulary.replacements.length} label replacements saved on this device.`;
 historySearch?.refresh(); recycleSearch?.refresh();
 if (state) { render(); changeView(view); }
 if ($('vault-dialog').open) updateDialog();
}
colorQuery.addEventListener('change', applyPreferences);
function showError(error, inDialog = false) {
 const message = error instanceof Error ? error.message : String(error || 'The operation could not be completed.');
 const target = $(inDialog ? 'dialog-error' : 'main-error-text'); target.textContent = message;
 $(inDialog ? 'dialog-error' : 'main-error').hidden = false;
 if (!inDialog) $('main-error').scrollIntoView({block:'nearest'});
}
function toast(source, values = {}) {
 clearTimeout(snackbarTimer);
 const message = t(source).replace(/\{(\w+)\}/g, (placeholder, key) => Object.hasOwn(values, key) ? String(values[key]) : placeholder);
 $('snackbar').textContent = `${message}${preferences.celebration >= 75 ? ` ${t('All set!')}` : ''}`;
 $('snackbar').hidden = false;
 snackbarTimer = setTimeout(() => { $('snackbar').hidden = true; }, 5500);
}
function operation(label) {
 label = ({ saveVersion:'Saving a version…', restoreVersion:'Restoring a version…', restoreDeleted:'Restoring deleted entries…', emptyRecycleBin:'Emptying the Recycle Bin…', upgrading:'Creating and verifying an upgraded copy…' })[label] || label;
 label = ({ importing:'Importing files…', resplit:'Re-splitting encrypted files…', syncing:'Syncing encrypted files…', sync:'Syncing encrypted files…', setPartSize:'Applying part size…', unmounting:'Locking drive…', mounting:'Mounting drive…', locking:'Locking drive…', keepOffline:'Keeping encrypted parts offline…', releaseOffline:'Removing offline copy…', creating:'Mounting drive…', unlocking:'Mounting drive…' })[label] || label;
 $('operation').hidden = !label;
 if (label) $('operation-text').textContent = `${t(label)}${preferences.patience >= 70 ? ` ${t('Please keep the app open.')}` : ''}`;
}
async function refresh() { state = await api.status(); render(); }
async function run(label, task, success, inDialog = false) {
 if (busy) return;
 busy = true; $('main-error').hidden = true; $('dialog-error').hidden = true; operation(label); renderAvailability();
 try { const result = await task(); await refresh(); if (success) toast(success); return { ok: true, result }; }
 catch (error) { showError(error, inDialog); try { await refresh(); } catch { /* Keep the last authentic state on transport failure. */ } return { ok:false }; }
 finally { busy = false; operation(state?.operation || (state?.sync?.running ? 'Syncing encrypted files…' : '')); renderAvailability(); }
}
function mountState() {
 if (!state || state.driver?.checking) return 'Checking drive…';
 if (state.unmountbusy || state.unmountBusy || state.mountState === 'unmountbusy' || state.phase === 'unmountbusy') return 'Waiting for open files';
 if (state.operation === 'mounting' || state.mounting || state.mountState === 'mounting' || state.phase === 'mounting') return 'Mounting…';
 return state.locked ? 'Locked' : state.mounted ? 'Mounted' : 'Unlocked · not mounted';
}
function renderAvailability() {
 $('upgrade-vault').hidden = state?.locked !== false || state?.storageFormat !== 1; $('upgrade-vault').disabled=busy;
 const unlocked = state && !state.locked, mounted = unlocked && state.mounted;
 const file = state?.files?.find(file => file.id === selected);
 for (const id of ['create-button','unlock-button']) $(id).disabled = busy || !api || !state;
 $('lock-button').disabled = busy; $('mount-button').disabled = busy || !unlocked || state?.driver?.available === false; $('explorer-button').disabled = busy || !mounted;
 for (const id of ['import-button','empty-import-button','sync-button','split-apply','resplit-button']) $(id).disabled = busy || !unlocked;
 $('open-button').disabled = busy || !mounted || !file;
 $('export-button').disabled = busy || !mounted || !file;
 $('offline-button').disabled = busy || !unlocked || !file || file.offline;
 $('release-button').disabled = busy || !unlocked || !file?.offline;
 $('startup-setting').disabled = busy || !state;
 $('auto-unlock-setting').disabled = busy || !unlocked;
 $('forget-credential').disabled = busy || !state;
 for(const el of document.querySelectorAll('[data-archive-restore]')) el.disabled=busy||!unlocked||el.dataset.available!=='true';
 for (const el of $('vault-form').querySelectorAll('button,input,select')) el.disabled = busy;
 const letter = normalizedDriveLetter($('drive-letter').value);
 const available = (state?.availableDriveLetters || []).map(normalizedDriveLetter);
 const validLetter = /^[D-Z]$/.test(letter) && !state?.driver?.checking && (!available.length || available.includes(letter));
 $('drive-letter').setCustomValidity(validLetter ? '' : t('Choose an available drive letter'));
 $('dialog-submit').disabled = busy || !validLetter;
 for (const id of ['save-version','empty-recycle','restore-recycled','history-retention-apply']) if ($(id)) $(id).disabled = busy || !unlocked;
 if ($('restore-recycled')) $('restore-recycled').disabled ||= !recycledSelection.size;
}
function render() {
 if (!state) return;
 if(state.locked) {for(const kind of ['history','recycle']) {archiveRequests[kind]++;archiveRenders[kind]++;archiveRows[kind]=[];$(kind+'-list').replaceChildren();setArchiveMessage(kind,'Unlock a drive to view its history and recycle bin.');}recycledSelection.clear();}
 const status = mountState(); setText('vault-badge',status); $('vault-badge').dataset.state = state.mounted ? 'mounted' : 'locked';
 $('locked-state').hidden = !state.locked; $('drive-content').hidden = state.locked; $('lock-button').hidden = state.locked;
 $('driver-notice').hidden = state.driver?.checking || state.driver?.available !== false;
 $('install-driver').hidden = !api.installDriver || state.driver?.available !== false || !/Windows/i.test(navigator.userAgent);
 $('mount-button').hidden = state.locked || state.mounted;
 $('driver-error').textContent = state.driver?.error || 'Install WinFsp on Windows to mount this drive. Encrypted storage can still be configured.';
 $('storage-path').textContent = state.storageDir || ''; $('storage-path').title = state.storageDir || '';
 $('vault-storage-status').hidden = state.locked;
 const transfer = t(state.transport?.mode === 'privateGit' ? 'Private repository' : 'Synchronized folder');
 const pending = Boolean(state.transport?.pendingSynchronization || state.sync?.pendingCommits || state.history?.pendingVersionCount);
 $('vault-storage-status').textContent = `${transfer} · ${t('Versions')}: ${state.history?.versionCount ?? 0} · ${t('Pending versions')}: ${state.history?.pendingVersionCount ?? 0} · ${t(pending ? 'Synchronization pending' : state.transport?.available === false ? 'Source connection unavailable' : 'No pending synchronization')}`;
 $('cache-path').textContent = state.cacheDir || ''; $('cache-path').title = state.cacheDir || '';
 const letter = state.driveLetter?.replace(/[:\\]+$/,'');
 $('mounted-path').textContent = state.mounted && letter ? `${letter}:\\` : t('Not mounted');
 $('offline-count').textContent = (state.files || []).filter(file => file.offline).length;
 $('startup-setting').checked = state.startup ?? state.preferences?.startup ?? true;
 $('auto-unlock-setting').checked = state.autoUnlock ?? state.preferences?.autoUnlock ?? false;
 if (!['split-value','split-unit'].includes(document.activeElement?.id)) {
  const size = displayPartSize(state.partSizeBytes || 10 * 1024 ** 2); $('split-value').value = size.value; $('split-unit').value = size.unit;
 }
 if (!busy) operation(state.operation || (state.sync?.running ? 'Syncing encrypted files…' : ''));
 if (state.sync?.error) $('sync-detail').textContent = state.sync.error;
 else if (state.sync?.running) setText('sync-detail','Syncing encrypted files…');
 else if (state.sync?.lastSync) $('sync-detail').textContent = `${preferences.language === 'yue' ? '加密儲存已更新' : 'Encrypted storage updated'} · ${formatDate(state.sync.lastSync)}`;
 else setText('sync-detail','Not synced yet');
 if ($('vault-dialog').open) updateDriveLetters();
 renderFiles(); renderAvailability();
}
function formatDate(date) { const d = new Date(date); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(preferences.language === 'yue' ? 'zh-HK' : 'en', { month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' }).format(d); }
function formatBytes(bytes) { if (!Number.isFinite(bytes)) return ''; if (bytes < 1024) return `${bytes} B`; for (const [unit, size] of [['GB',1024**3],['MB',1024**2],['KB',1024]]) if (bytes >= size) return `${new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(bytes/size)} ${unit}`; }
function renderFiles() {
 const files = state?.files || [], query = $('file-search').value.toLocaleLowerCase();
 const filtered = files.filter(file => (view !== 'offline' || file.offline) && String(file.path).toLocaleLowerCase().includes(query));
 if (!filtered.some(file => file.id === selected)) selected = null;
 const fragment = document.createDocumentFragment();
 for (const file of filtered) {
  const row = document.createElement('tr'); row.classList.toggle('selected',file.id === selected);
  const cell = () => { const td = document.createElement('td'); row.append(td); return td; };
  const select = document.createElement('input'); select.type = 'radio'; select.className = 'file-selection'; select.name = 'selected-file'; select.checked = file.id === selected; select.setAttribute('aria-label',`${t('Select')} ${file.path}`);
  select.addEventListener('change',() => { selected = file.id; renderFiles(); renderAvailability(); $('file-list').querySelector('input:checked')?.focus(); }); cell().append(select);
  const name = document.createElement('div'); name.className = 'file-name'; const filename = document.createElement('span'); filename.textContent = file.path; name.append(icon('file'),filename); const nameCell = cell(); nameCell.append(name); nameCell.title = file.path;
  const availability = cell(); availability.className = 'availability'; const av = document.createElement('span'); av.className = 'availability-content'; const label = document.createElement('span'); label.textContent = t(file.offline ? 'Available offline' : 'Encrypted storage only'); av.append(icon(file.offline ? 'offline' : 'shield'),label); availability.append(av);
  const sizeCell = cell(); sizeCell.className = 'numeric'; sizeCell.textContent = formatBytes(file.size); sizeCell.title = `${file.partCount ?? '?'} encrypted parts · ${formatBytes(file.partSizeBytes || state.partSizeBytes)} maximum`;
  const dateCell = cell(); dateCell.className = 'modified'; dateCell.textContent = formatDate(file.modified);
  row.addEventListener('click',event => { if (event.target === select) return; selected = file.id; renderFiles(); renderAvailability(); $('file-list').querySelector('input:checked')?.focus(); });
  row.addEventListener('dblclick',() => { if (!busy && state.mounted) openSelected(); });
  select.addEventListener('keydown',event => { if (event.key === 'Enter') { event.preventDefault(); openSelected(); } });
  fragment.append(row);
 }
 $('file-list').replaceChildren(fragment); $('file-count').textContent = `(${filtered.length})`;
 $('selection-label').textContent = selected ? files.find(file => file.id === selected)?.path || '' : t('Select a file');
 $('empty-files').hidden = filtered.length > 0; $('empty-import-button').hidden = Boolean(query) || view === 'offline';
 setText('empty-title',query ? 'No matching files' : view === 'offline' ? 'No offline files yet' : 'Room for your first file');
 setText('empty-description',query ? 'Try a different search.' : view === 'offline' ? 'Select a file in My drive and choose Keep offline.' : 'Add files in Explorer or import them here.');
}
function changeView(next) {
 view = next;
 document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${next === 'offline' ? 'drive' : next}`; });
 document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === next; el.classList.toggle('active',active); active ? el.setAttribute('aria-current','page') : el.removeAttribute('aria-current'); });
 setText('drive-heading',next === 'offline' ? 'Available offline' : 'My drive'); setText('files-heading',next === 'offline' ? 'Available offline' : 'All files');
 if (state) { renderFiles(); renderAvailability(); }
 if (['history','recycle'].includes(next)) loadArchive(next);
}
function updateDialog() {
 const upgrading = dialogMode === 'upgrade';
 const creating = dialogMode !== 'unlock';
 $('dialog-title').textContent = `${preferences.emoji ? '🔐 ' : ''}${t(upgrading ? 'Upgrade by creating a copy' : creating ? 'Create a drive' : 'Unlock existing drive')}`;
 setText('dialog-description',upgrading ? 'Choose separate destination storage and cache folders. The original vault is preserved. Choose credentials for the upgraded copy. No conversion happens when opening a vault.' : creating ? 'Choose the encrypted storage and local encrypted cache, then set your unlock method.' : 'Choose your existing encrypted storage and enter its password or key file.');
 setText('dialog-submit',upgrading ? 'Create upgraded copy' : creating ? 'Create & mount' : 'Unlock & mount');
 $('confirm-password-fields').hidden = !creating; $('generate-key').hidden = !creating; $('create-split').hidden = !creating;
 const isKey = document.querySelector('input[name="credential-mode"]:checked').value === 'keyFile';
 $('password-fields').hidden = isKey; $('key-fields').hidden = !isKey;
 $('password-input').required = !isKey; $('confirm-password').required = creating && !isKey; $('key-path').required = isKey;
 $('password-input').autocomplete = creating ? 'new-password' : 'current-password';
}
const normalizedDriveLetter = value => /^[A-Z]:?$/i.test(String(value || '')) ? String(value)[0].toUpperCase() : '';
function closeDrivePicker() {
 $('drive-letter-options').hidden = true;
 for (const id of ['drive-letter','drive-letter-toggle']) $(id).setAttribute('aria-expanded','false');
 $('drive-letter').removeAttribute('aria-activedescendant');
}
function markDriveOption() {
 const selectedLetter = normalizedDriveLetter($('drive-letter').value);
 for (const option of $('drive-letter-options').children) {
  option.setAttribute('aria-selected',String(option.dataset.letter === selectedLetter));
  option.classList.toggle('active-option',option.dataset.letter === activeDriveLetter);
 }
 const active = document.getElementById(`drive-option-${activeDriveLetter}`);
 if (!$('drive-letter-options').hidden && active) $('drive-letter').setAttribute('aria-activedescendant',active.id);
 else $('drive-letter').removeAttribute('aria-activedescendant');
}
function openDrivePicker() {
 if (busy) return;
 $('drive-letter-options').hidden = false;
 for (const id of ['drive-letter','drive-letter-toggle']) $(id).setAttribute('aria-expanded','true');
 const options = [...$('drive-letter-options').children];
 activeDriveLetter = options.find(option => option.dataset.letter === normalizedDriveLetter($('drive-letter').value))?.dataset.letter || options[0]?.dataset.letter || '';
 markDriveOption(); $('drive-letter').focus();
}
function chooseDriveLetter(letter) {
 if (busy || !normalizedDriveLetter(letter)) return;
 $('drive-letter').value = `${normalizedDriveLetter(letter)}:`; driveLetterEdited = true;
 markDriveOption(); closeDrivePicker(); renderAvailability(); $('drive-letter').focus();
}
function updateDriveLetters(preserveSelection = true) {
 const checking = state?.driver?.checking === true;
 const letters = checking ? [] : [...new Set((state?.availableDriveLetters || state?.defaults?.availableDriveLetters || []).map(normalizedDriveLetter).filter(Boolean))].sort();
 const input = $('drive-letter'), list = $('drive-letter-options');
 const status = checking ? 'Checking available drive letters…' : letters.length ? 'Available drive letters' : 'No available letters reported. You can still enter one manually.';
 setText('drive-letter-status',status); $('drive-letter-toggle').setAttribute('aria-label',t('Choose an available drive letter'));
 if (!preserveSelection || !driveLetterEdited) {
  const preferred = normalizedDriveLetter(state?.driveLetter || state?.defaults?.driveLetter) || 'M';
  input.value = `${letters.includes(preferred) || !letters.length ? preferred : letters[0]}:`;
 }
 const signature = JSON.stringify(letters);
 if (list.dataset.choices !== signature) {
  const fragment = document.createDocumentFragment();
  for (const letter of letters) {
   const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
   option.id = `drive-option-${letter}`; option.dataset.letter = letter; option.setAttribute('role','option'); option.textContent = `${letter}:`;
   fragment.append(option);
  }
  list.replaceChildren(fragment); list.dataset.choices = signature;
  if (!letters.includes(activeDriveLetter)) activeDriveLetter = letters[0] || '';
 }
 list.setAttribute('aria-busy',String(checking)); markDriveOption();
}

function openVaultDialog(mode) {
 dialogMode = mode; driveLetterEdited = false; closeDrivePicker(); $('vault-form').reset(); $('dialog-error').hidden = true;
 $('storage-input').value = mode === 'upgrade' ? '' : state?.storageDir || ''; $('cache-input').value = mode === 'upgrade' ? '' : state?.cacheDir || state?.defaults?.cacheDir || '';
 $('transport-mode').value=state?.transport?.mode || 'folder'; $('remote-repository').value=state?.transport?.remoteRepository || ''; $('private-git-fields').hidden=$('transport-mode').value!=='privateGit';
 $('password-input').type = 'password'; $('show-password').setAttribute('aria-pressed','false'); setText('show-password','Show');
 updateDriveLetters(false);
 updateDialog(); renderAvailability(); $('vault-dialog').showModal(); $('storage-input').focus();
}
function closeVaultDialog() { if (busy) return; closeDrivePicker(); $('vault-dialog').close(); $('password-input').value = ''; $('confirm-password').value = ''; $('key-path').value = ''; }
async function confirmAction(title, description, action) {
 setText('confirm-title',title); setText('confirm-description',description); setText('confirm-action',action);
 const dialog = $('confirm-dialog'); dialog.returnValue = ''; dialog.showModal(); dialog.querySelector('button[value=cancel]').focus();
 return new Promise(resolve => dialog.addEventListener('close',() => resolve(dialog.returnValue === 'confirm'),{once:true}));
}
async function importFiles() { const paths = await api.chooseFiles(); if (paths?.length) await run('Importing files…',() => api.importFiles(paths),'Files imported.'); }
async function openSelected() { if (selected && state.mounted) await run('Working…',() => api.open(selected)); }
function listen(id, event, callback) { $(id).addEventListener(event,async (...args) => { try { await callback(...args); } catch (error) { showError(error,$('vault-dialog').open); } }); }
for (const nav of document.querySelectorAll('[data-view]')) nav.addEventListener('click',() => changeView(nav.dataset.view));
for (const button of document.querySelectorAll('[data-window]')) button.addEventListener('click',() => api?.windowControl(button.dataset.window));
listen('dismiss-error','click',() => { $('main-error').hidden = true; });
listen('create-button','click',() => openVaultDialog('create')); listen('unlock-button','click',() => openVaultDialog('unlock'));
listen('dialog-close','click',closeVaultDialog); listen('dialog-cancel','click',closeVaultDialog);
$('vault-dialog').addEventListener('cancel',event => { if (busy) event.preventDefault(); });
$('vault-dialog').addEventListener('close',() => { $('password-input').value = ''; $('confirm-password').value = ''; $('key-path').value = ''; });
for (const el of document.querySelectorAll('[data-browse]')) el.addEventListener('click',async () => { try { const path = await api.chooseFolder(el.dataset.browse === 'cache-input' ? 'cache' : 'storage'); if (path) $(el.dataset.browse).value = path; } catch (error) { showError(error,true); } });
for (const el of document.querySelectorAll('[name=credential-mode]')) el.addEventListener('change',updateDialog);
listen('drive-letter','input',() => {
 driveLetterEdited = true; $('drive-letter').value = $('drive-letter').value.toUpperCase();
 activeDriveLetter = normalizedDriveLetter($('drive-letter').value); markDriveOption(); renderAvailability();
});
listen('drive-letter-toggle','click',() => { if ($('drive-letter-options').hidden) openDrivePicker(); else { closeDrivePicker(); $('drive-letter').focus(); } });
$('drive-letter-options').addEventListener('mousedown',event => event.preventDefault());
listen('drive-letter-options','click',event => { const option = event.target.closest('[data-letter]'); if (option) chooseDriveLetter(option.dataset.letter); });
$('drive-letter').addEventListener('keydown',event => {
 const open = !$('drive-letter-options').hidden;
 if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); closeDrivePicker(); return; }
 if (event.key === 'Tab') { closeDrivePicker(); return; }
 if (event.key === 'Enter' && open) { if (document.getElementById(`drive-option-${activeDriveLetter}`)) { event.preventDefault(); chooseDriveLetter(activeDriveLetter); } else closeDrivePicker(); return; }
 if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key) || (!open && ['Home','End'].includes(event.key))) return;
 event.preventDefault(); if (!open) { openDrivePicker(); return; }
 const letters = [...$('drive-letter-options').children].map(option => option.dataset.letter); if (!letters.length) return;
 const current = letters.indexOf(activeDriveLetter);
 activeDriveLetter = event.key === 'Home' ? letters[0] : event.key === 'End' ? letters.at(-1) : letters[(current + (event.key === 'ArrowDown' ? 1 : -1) + letters.length) % letters.length];
 markDriveOption(); document.getElementById(`drive-option-${activeDriveLetter}`)?.scrollIntoView({block:'nearest'});
});
document.addEventListener('pointerdown',event => { if (!$('drive-picker').contains(event.target)) closeDrivePicker(); });
listen('show-password','click',() => { const showing = $('password-input').type === 'password'; $('password-input').type = showing ? 'text' : 'password'; $('show-password').setAttribute('aria-pressed',String(showing)); setText('show-password',showing ? 'Hide' : 'Show'); });
listen('choose-key','click',async () => { const path = await api.chooseKeyFile(); if (path) $('key-path').value = path; });
listen('generate-key','click',async () => { const path = await api.generateKeyFile({storageDir:$('storage-input').value,cacheDir:$('cache-input').value}); if (path) $('key-path').value = path; });
listen('vault-form','submit',async event => {
 event.preventDefault(); if (busy) return;
 const isKey = document.querySelector('[name=credential-mode]:checked').value === 'keyFile';
 if (!isKey && dialogMode !== 'unlock' && $('password-input').value !== $('confirm-password').value) return showError('The passwords do not match.',true);
 const options = {transport:$('transport-mode').value,storageDir:$('storage-input').value,cacheDir:$('cache-input').value,driveLetter:`${normalizedDriveLetter($('drive-letter').value)}:`};
 if (options.transport === 'privateGit') { options.remoteRepository = $('remote-repository').value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(options.remoteRepository)) return showError(t('Enter owner/repository.'),true); }
 if (isKey) options.keyFilePath = $('key-path').value; else options.password = $('password-input').value;
 if (dialogMode !== 'unlock') { try { options.partSizeBytes = parsePartSize($('create-split-value').value,$('create-split-unit').value); } catch(error) { return showError(error,true); } }
 if(dialogMode === 'upgrade') {const normalize=value=>value.replace(/[\\/]+$/,'').toLowerCase();const destinations=[options.storageDir,options.cacheDir].map(normalize);const originals=[state?.storageDir,state?.cacheDir].filter(Boolean).map(normalize);if(destinations[0]===destinations[1]||destinations.some(path=>originals.some(original=>path===original||path.startsWith(original+'\\')||path.startsWith(original+'/')||original.startsWith(path+'\\')||original.startsWith(path+'/'))))return showError(t('Choose separate destination folders outside the original vault.'),true);}
 const result = await run('Mounting drive…',() => api[dialogMode](options),dialogMode === 'upgrade' ? 'Upgraded copy created. Original vault preserved.' : dialogMode === 'create' ? 'Drive created.' : 'Drive unlocked.',true);
 if (result?.ok) closeVaultDialog();
});
listen('lock-button','click',() => run('Locking drive…',() => api.lock(),'Drive locked.'));
listen('mount-button','click',() => run('Mounting drive…',() => api.mount({driveLetter:state.driveLetter || state.defaults?.driveLetter}),'Drive unlocked.'));
listen('project-website-link','click',() => api.openExternal('https://ding-ding-projects.github.io/material-file-encryptor/'));
listen('winfsp-link','click',() => api.openExternal('https://winfsp.dev/'));
listen('install-driver','click',() => run('Working…',() => api.installDriver()));
listen('explorer-button','click',() => run('Working…',() => api.openExplorer()));
listen('import-button','click',importFiles); listen('empty-import-button','click',importFiles); listen('open-button','click',openSelected);
listen('file-search','input',() => { renderFiles(); renderAvailability(); });
listen('export-button','click',async () => {
 const file = state.files.find(file => file.id === selected); if (!file) return;
 if (!await confirmAction('Export a decrypted copy?','The destination will contain an ordinary readable file. Choose a location you trust.','Continue')) return;
 const destination = await api.chooseExport(file.path.split(/[\\/]/).at(-1));
 if (destination) await run('Exporting copy…',() => api.exportFile({id:file.id,destination}),'Copy exported.');
});
listen('offline-button','click',() => run('Keeping encrypted parts offline…',() => api.keepOffline(selected),'Offline copy retained.'));
listen('release-button','click',async () => {
 const file = state.files.find(file => file.id === selected); if (!file) return;
 if (!await confirmAction('Remove this offline copy?','Release unneeded encrypted cache for this file. The encrypted storage copy remains. You may need your storage connection to open it again.','Remove copy')) return;
 const outcome = await run('Removing offline copy…',() => api.releaseOffline(file.id));
 if (!outcome?.ok) return;
 const release = outcome.result?.lastOfflineRelease || state.lastOfflineRelease;
 if (release?.path !== file.path || !Number.isFinite(release.bytesFreed) || release.bytesFreed < 0) {
  toast('Offline pin removed. Cache release details are unavailable.');
 } else if (release.bytesFreed > 0) {
  toast('Offline pin removed. Released {size} of encrypted cache. Protected data is retained.', {size:formatBytes(release.bytesFreed)});
 } else {
  toast('Offline pin removed. No encrypted cache was released. Cache needed for safe or offline access stays encrypted.');
 }
});
listen('sync-button','click',() => run('Syncing encrypted files…',() => api.sync(),'Encrypted parts updated.'));
listen('split-form','submit',async event => { event.preventDefault(); let bytes; try { bytes = parsePartSize($('split-value').value,$('split-unit').value); } catch(error) { return showError(error); } await run('Applying part size…',() => api.setPartSize(bytes),'Part size saved for new and edited files.'); });
listen('resplit-button','click',async () => { if (await confirmAction('Re-split all existing files?','Create replacement encrypted parts using the current limit. This can take time. Existing committed data remains until replacement succeeds.','Re-split files')) await run('Re-splitting encrypted files…',() => api.resplit(),'Encrypted parts updated.'); });
listen('startup-setting','change',event => run('Saving preference…',() => api.setStartup(event.target.checked),'Saved.'));
listen('auto-unlock-setting','change',async event => { const enabled = event.target.checked; if (enabled && !await confirmAction('Automatically unlock this drive?','This Windows user will be able to unlock this drive without its password or key file. A protected drive key will be saved on this device.','Enable automatic unlock')) return render(); await run('Saving preference…',() => api.setAutoUnlock(enabled),'Saved.'); });
listen('forget-credential','click',() => run('Saving preference…',() => api.forgetSavedCredential(),'Saved credential forgotten.'));
for (const key of ['theme','language','emoji','celebration','patience']) listen(`${key}-setting`, ['celebration','patience'].includes(key) ? 'input' : 'change',event => {
 preferences[key] = key === 'emoji' ? event.target.checked : ['celebration','patience'].includes(key) ? Number(event.target.value) : event.target.value;
 savePreferences(); applyPreferences();
});
listen('vocabulary-label','keydown',event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); $('vocabulary-file').click(); } });
listen('vocabulary-file','change',async event => { try { const file = event.target.files[0]; if (!file) return; if (file.size > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.'); preferences.vocabulary = parseVocabulary(await file.text()); savePreferences(); applyPreferences(); toast('Saved.'); } finally { event.target.value = ''; } });
listen('export-vocabulary','click',() => { const url = URL.createObjectURL(new Blob([JSON.stringify(preferences.vocabulary,null,2)],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = 'material-drive-vocabulary.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); });
listen('reset-vocabulary','click',() => { preferences.vocabulary = {version:1,replacements:[]}; savePreferences(); applyPreferences(); toast('Saved.'); });
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('keydown', event => {
 if (event.key !== 'Tab') return;
 const controls = [...dialog.querySelectorAll('button,input,select,[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0);
 const first = controls[0], last = controls.at(-1);
 if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
 else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
listen('upgrade-vault','click',()=>openVaultDialog('upgrade'));
initializeArchive();
applyPreferences(); renderAvailability();
if (!api) { setText('vault-badge','Not mounted'); showError('The desktop bridge is unavailable. Open this interface through Material File Encryptor.'); }
else {
 const unsubscribe = api.onStatus(next => { state = next; render(); }); window.addEventListener('beforeunload',() => unsubscribe?.(),{once:true});
 refresh().catch(error => showError(error));
}


function initializeArchive() {
 const button=(id,text,handler)=>{const el=document.createElement('button');el.id=id;el.type='button';el.className='button outlined';el.textContent=t(text);dictionary.set(el,text);el.onclick=handler;return el;};
 $('history-actions').append(button('save-version','Save version now',()=>archiveMutation('history',()=>api.saveVersion())),document.createTextNode(t('Show history')));
 const retention=document.createElement('select');retention.id='history-retention';retention.setAttribute('aria-label',t('Show history'));
 for(const [value,text] of [['forever','Forever'],['30','Last 30 days'],['90','Last 90 days'],['custom','Custom days']]) {const option=document.createElement('option');option.value=value;option.textContent=t(text);dictionary.set(option,text);retention.append(option);}
 const days=document.createElement('input');days.id='history-days';days.type='number';days.min='1';days.max='36500';days.value='365';days.hidden=true;days.setAttribute('aria-label',t('Custom days'));
 retention.onchange=()=>{days.hidden=retention.value!=='custom';};
 $('history-actions').append(retention,days,button('history-retention-apply','Apply',()=>{const value=retention.value==='forever'?null:retention.value==='custom'?Number(days.value):Number(retention.value);if(value!==null&&(!Number.isInteger(value)||value<1||value>36500))return showError(t('Enter 1 to 36500 days.'));archiveMutation('history',()=>api.setHistoryRetention(value));}));
 $('recycle-actions').append(button('select-recycled','Select all visible',()=>{for(const el of $('recycle-list').querySelectorAll('input:not(:disabled)')) {el.checked=true;recycledSelection.add(el.value);}renderAvailability();}),button('restore-recycled','Restore selected',()=>restoreRecycledSelection()),button('empty-recycle','Empty Recycle Bin',async()=>{if(await confirmAction('Empty Recycle Bin?','Deleted entries will disappear from the bin. Version history is retained. This does not promise to free storage space.','Empty Recycle Bin'))archiveMutation('recycle',()=>api.emptyRecycleBin());}));
 historySearch=createScopedSearch($('history-search-host'),t,()=>renderArchive('history'));recycleSearch=createScopedSearch($('recycle-search-host'),t,()=>renderArchive('recycle'));
 $('transport-mode').onchange=()=>{$('private-git-fields').hidden=$('transport-mode').value!=='privateGit';};
}
async function archiveMutation(kind,task) {const result=await run('Working…',task,'Saved.');if(result?.ok){recycledSelection.clear();await loadArchive(kind);}}
async function loadArchive(kind) {
 const request=++archiveRequests[kind]; archiveRows[kind]=[];$(kind+'-list').replaceChildren();
 if(!state || state.locked) {setArchiveMessage(kind,'Unlock a drive to view its history and recycle bin.');return;}
 setArchiveMessage(kind,'Loading…');
 try {const rows=await (kind==='history'?api.history():api.recycled());if(request!==archiveRequests[kind])return;if(!Array.isArray(rows))throw new Error(t('History is unavailable.'));archiveRows[kind]=rows;await renderArchive(kind);
 const value=state.preferences?.historyRetentionDays ?? state.history?.retentionDays ?? null; if(kind==='history') {$('history-retention').value=value===null?'forever':[30,90].includes(value)?String(value):'custom';$('history-days').hidden=$('history-retention').value!=='custom';if(value!==null)$('history-days').value=value;}}
 catch(error){if(request===archiveRequests[kind]){setArchiveMessage(kind,'History is unavailable.');showError(error);}}
}
async function renderArchive(kind) {
 const generation=++archiveRenders[kind];const rows=await (kind==='history'?historySearch:recycleSearch).filter(archiveRows[kind]);if(generation!==archiveRenders[kind])return;const fragment=document.createDocumentFragment();
 for(const version of rows) {const row=document.createElement('tr');const cell=text=>{const el=document.createElement('td');el.textContent=text;row.append(el);return el;};
 const selection=cell('');if(kind==='recycle'){const check=document.createElement('input');check.type='checkbox';check.value=version.id;check.checked=recycledSelection.has(version.id);check.disabled=!version.isAvailable;check.setAttribute('aria-label',t('Select')+' '+version.path);check.onchange=()=>{check.checked?recycledSelection.add(version.id):recycledSelection.delete(version.id);renderAvailability();};selection.append(check);}
 cell(version.path);cell(formatDate(version.timestampUtc));cell(version.isDirectory?t('Folder'):formatBytes(version.length));cell(t(version.isAvailable?'Available':'Encrypted data unavailable'));const actions=cell('');
 if(kind==='history'){const restore=document.createElement('button');restore.className='button small';restore.textContent=t('Restore as new version');restore.disabled=busy||!version.isAvailable;restore.dataset.archiveRestore='true';restore.dataset.available=String(version.isAvailable);restore.onclick=async()=>{if(await confirmAction('Restore this version?','Restoring creates a new current version. Existing history remains encrypted.','Restore as new version'))archiveMutation('history',()=>api.restoreVersion(version.id));};actions.append(restore);}fragment.append(row);}
 $(kind+'-list').replaceChildren(fragment);setArchiveMessage(kind,rows.length?'':'No matching entries.');renderAvailability();
}

async function restoreRecycledSelection() {
 const original=[...recycledSelection];if(!original.length||busy)return;
 const rows=archiveRows.recycle;const byId=new Map(rows.map(row=>[row.id,row]));
 const candidates=deletedDescendantCandidates(rows,original);
 if(!candidates.length)return archiveMutation('recycle',()=>api.restoreDeleted(original));
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','descendant-dialog-title');
 const form=document.createElement('form');form.method='dialog';
 const heading=document.createElement('header');heading.className='dialog-heading';const title=document.createElement('h2');title.id='descendant-dialog-title';title.textContent=t('Choose deleted descendants to restore');heading.append(title);
 const body=document.createElement('div');body.className='dialog-body';const explanation=document.createElement('p');explanation.textContent=t('Originally selected entries are required. Additional deleted descendants start unchecked. Older independent deletions stay in the bin unless you select them. Entries deleted together may be restored together automatically.');body.append(explanation);
 const checks=[];
 for(const row of [...original.map(id=>byId.get(id)).filter(Boolean),...candidates]) {const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=row.id;input.checked=original.includes(row.id);input.disabled=input.checked||!row.isAvailable;const name=document.createElement('span');name.textContent=row.path+' · '+String(row.timestampUtc||'');label.append(input,name);body.append(label);checks.push(input);}
 const selectAll=document.createElement('button');selectAll.type='button';selectAll.className='button';selectAll.textContent=t('Select all descendants');selectAll.onclick=()=>{for(const input of checks)if(!input.disabled)input.checked=true;};body.append(selectAll);
 const footer=document.createElement('footer');footer.className='dialog-actions';for(const [value,text] of [['cancel','Cancel'],['folder','Restore original selection only'],['subtree','Restore explicitly selected descendants']]){const button=document.createElement('button');button.value=value;button.className='button'+(value==='subtree'?' primary':'');button.textContent=t(text);footer.append(button);}
 form.append(heading,body,footer);dialog.append(form);document.body.append(dialog);dialog.showModal();footer.querySelector('button').focus();
 const action=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
 const ids=action==='folder'?original:[...new Set([...original,...checks.filter(input=>input.checked&&!input.disabled).map(input=>input.value)])];dialog.remove();
 if(['folder','subtree'].includes(action))await archiveMutation('recycle',()=>api.restoreDeleted(ids));
}

function setArchiveMessage(kind,source) {const message=$(kind+'-message');message.textContent=t(source);message.hidden=!source;}
