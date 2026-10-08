import { parsePartSize, displayPartSize, parseVocabulary, loadSettings } from './preferences.js';
import { icon, initializeIcons } from './icons.js';
import { cantonese } from './i18n.js';
const $ = id => document.getElementById(id);
const api = window.drive;
let preferences = loadSettings(localStorage);
let state = null, selected = null, view = 'drive', busy = false, dialogMode = 'create', snackbarTimer;
const dictionary = new Map();
document.querySelectorAll('[data-i18n]').forEach(el => dictionary.set(el, el.textContent));
initializeIcons();
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
 for (const el of document.querySelectorAll('[data-view]')) { const label = t(({drive:'My drive',offline:'Available offline',settings:'Settings',help:'How it works'})[el.dataset.view]); el.setAttribute('aria-label',label); el.title = label; }
 $('file-search').placeholder = t('Search files');
 $('file-search').setAttribute('aria-label',t('Search files'));
 $('theme-setting').value = preferences.theme; $('language-setting').value = preferences.language; $('emoji-setting').checked = preferences.emoji;
 for (const key of ['celebration','patience']) { $(`${key}-setting`).value = preferences[key]; $(`${key}-output`).textContent = preferences[key]; }
 $('vocabulary-summary').textContent = preferences.language === 'yue' ? `已儲存 ${preferences.vocabulary.replacements.length} 個替換詞。` : `${preferences.vocabulary.replacements.length} label replacements saved on this device.`;
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
function toast(source) {
 clearTimeout(snackbarTimer);
 $('snackbar').textContent = `${t(source)}${preferences.celebration >= 75 ? ` ${t('All set!')}` : ''}`;
 $('snackbar').hidden = false;
 snackbarTimer = setTimeout(() => { $('snackbar').hidden = true; }, 5500);
}
function operation(label) {
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
 if (!state) return 'Checking drive…';
 if (state.unmountbusy || state.unmountBusy || state.mountState === 'unmountbusy' || state.phase === 'unmountbusy') return 'Waiting for open files';
 if (state.operation === 'mounting' || state.mounting || state.mountState === 'mounting' || state.phase === 'mounting') return 'Mounting…';
 return state.locked ? 'Locked' : state.mounted ? 'Mounted' : 'Unlocked · not mounted';
}
function renderAvailability() {
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
 for (const el of $('vault-form').querySelectorAll('button,input,select')) el.disabled = busy;
 $('dialog-submit').disabled = busy || !$('drive-letter').value;
}
function render() {
 if (!state) return;
 const status = mountState(); setText('vault-badge',status); $('vault-badge').dataset.state = state.mounted ? 'mounted' : 'locked';
 $('locked-state').hidden = !state.locked; $('drive-content').hidden = state.locked; $('lock-button').hidden = state.locked;
 $('driver-notice').hidden = state.driver?.available !== false;
 $('install-driver').hidden = !api.installDriver || state.driver?.available !== false || !/Windows/i.test(navigator.userAgent);
 $('mount-button').hidden = state.locked || state.mounted;
 $('driver-error').textContent = state.driver?.error || 'Install WinFsp on Windows to mount this drive. Encrypted storage can still be configured.';
 $('storage-path').textContent = state.storageDir || ''; $('storage-path').title = state.storageDir || '';
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
  const select = document.createElement('input'); select.type = 'radio'; select.name = 'selected-file'; select.checked = file.id === selected; select.setAttribute('aria-label',`${t('Select')} ${file.path}`);
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
}
function updateDialog() {
 const creating = dialogMode === 'create';
 $('dialog-title').textContent = `${preferences.emoji ? '🔐 ' : ''}${t(creating ? 'Create a drive' : 'Unlock existing drive')}`;
 setText('dialog-description',creating ? 'Choose the encrypted storage and local encrypted cache, then set your unlock method.' : 'Choose your existing encrypted storage and enter its password or key file.');
 setText('dialog-submit',creating ? 'Create & mount' : 'Unlock & mount');
 $('confirm-password-fields').hidden = !creating; $('generate-key').hidden = !creating; $('create-split').hidden = !creating;
 const isKey = document.querySelector('input[name="credential-mode"]:checked').value === 'keyFile';
 $('password-fields').hidden = isKey; $('key-fields').hidden = !isKey;
 $('password-input').required = !isKey; $('confirm-password').required = creating && !isKey; $('key-path').required = isKey;
 $('password-input').autocomplete = creating ? 'new-password' : 'current-password';
}
function openVaultDialog(mode) {
 dialogMode = mode; $('vault-form').reset(); $('dialog-error').hidden = true;
 $('storage-input').value = state?.storageDir || ''; $('cache-input').value = state?.cacheDir || state?.defaults?.cacheDir || '';
 $('password-input').type = 'password'; $('show-password').setAttribute('aria-pressed','false'); setText('show-password','Show');
 const letters = state?.availableDriveLetters || state?.defaults?.availableDriveLetters || [];
 $('drive-letter').replaceChildren();
 const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = letters.length ? t('Drive letter') : 'No available drive letters'; $('drive-letter').append(placeholder);
 for (const candidate of letters) { const letter = String(candidate).replace(/[:\\]+$/,''); const option = document.createElement('option'); option.value = letter; option.textContent = `${letter}:`; $('drive-letter').append(option); }
 const preferred = state?.driveLetter || state?.defaults?.driveLetter;
 if (preferred) $('drive-letter').value = String(preferred).replace(/[:\\]+$/,'');
 if (!$('drive-letter').value && letters.length) $('drive-letter').selectedIndex = 1;
 updateDialog(); renderAvailability(); $('vault-dialog').showModal(); $('storage-input').focus();
}
function closeVaultDialog() { if (busy) return; $('vault-dialog').close(); $('password-input').value = ''; $('confirm-password').value = ''; $('key-path').value = ''; }
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
listen('drive-letter','change',renderAvailability);
listen('show-password','click',() => { const showing = $('password-input').type === 'password'; $('password-input').type = showing ? 'text' : 'password'; $('show-password').setAttribute('aria-pressed',String(showing)); setText('show-password',showing ? 'Hide' : 'Show'); });
listen('choose-key','click',async () => { const path = await api.chooseKeyFile(); if (path) $('key-path').value = path; });
listen('generate-key','click',async () => { const path = await api.generateKeyFile({storageDir:$('storage-input').value,cacheDir:$('cache-input').value}); if (path) $('key-path').value = path; });
listen('vault-form','submit',async event => {
 event.preventDefault(); if (busy) return;
 const isKey = document.querySelector('[name=credential-mode]:checked').value === 'keyFile';
 if (!isKey && dialogMode === 'create' && $('password-input').value !== $('confirm-password').value) return showError('The passwords do not match.',true);
 const options = {storageDir:$('storage-input').value,cacheDir:$('cache-input').value,driveLetter:$('drive-letter').value};
 if (isKey) options.keyFilePath = $('key-path').value; else options.password = $('password-input').value;
 if (dialogMode === 'create') options.partSizeBytes = parsePartSize($('create-split-value').value,$('create-split-unit').value);
 const result = await run('Mounting drive…',() => api[dialogMode](options),dialogMode === 'create' ? 'Drive created.' : 'Drive unlocked.',true);
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
listen('release-button','click',async () => { const id = selected; if (await confirmAction('Remove this offline copy?','Release unneeded encrypted cache for this file. The encrypted storage copy remains. You may need your storage connection to open it again.','Remove copy')) await run('Removing offline copy…',() => api.releaseOffline(id),'Offline copy removed.'); });
listen('sync-button','click',() => run('Syncing encrypted files…',() => api.sync(),'Encrypted parts updated.'));
listen('split-form','submit',async event => { event.preventDefault(); const bytes = parsePartSize($('split-value').value,$('split-unit').value); await run('Applying part size…',() => api.setPartSize(bytes),'Part size saved for new and edited files.'); });
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
applyPreferences(); renderAvailability();
if (!api) { setText('vault-badge','Not mounted'); showError('The desktop bridge is unavailable. Open this interface through Material File Encryptor.'); }
else {
 const unsubscribe = api.onStatus(next => { state = next; render(); }); window.addEventListener('beforeunload',() => unsubscribe?.(),{once:true});
 refresh().catch(error => showError(error));
}
