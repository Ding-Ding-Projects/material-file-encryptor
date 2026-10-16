import { mountSiteFoundation } from './site-foundation.js';
import {preparePublicDocumentControls,confirmSiteDestructive} from './site-foundation.js';
import { parseVocabulary, replaceVocabulary, filterGuides, updateGalleryGroups } from './preferences.js';
import { emptyVocabulary, serializeVocabulary } from './personal-vocabulary.js';
import { cantonese, localized, loadMessagePreferences, effectiveMessagePair } from './locales.js';
import { loadReleaseRecord, renderReleaseDownload } from './release.js';

renderReleaseDownload(document, loadReleaseRecord(document));
preparePublicDocumentControls(document);

let siteStorage;try{siteStorage=window.localStorage;}catch{siteStorage={getItem:()=>null,setItem:()=>{throw Error('Browser storage unavailable');},removeItem:()=>{throw Error('Browser storage unavailable');}};}
let preferences;
try { preferences = loadMessagePreferences(siteStorage); } catch { preferences = loadMessagePreferences({ getItem: () => null }); }
let vocabulary = { version: 1, replacements: [] };
// The owning private-profile controller must authenticate before enabling wording.
let privateWordingAvailable = false;
let privateCacheAccess = null, wordingGeneration = 0, authenticationGeneration = 0;
let vocabularyClearFlight = Promise.resolve();
let pendingVocabularySource = null;
const vocabularyStorageKey = 'material-file-encryptor.visitor.private-wording.v1';
// Retire the previous plaintext cache. Authentication never trusts its contents.
try{siteStorage.removeItem('material-file-encryptor.site.vocabulary.v1');}catch{}
async function replacePrivateVocabulary(source) {
 const next=parseVocabulary(source),access=privateCacheAccess,ticket=++wordingGeneration;
 if(!privateWordingAvailable||!access?.authenticated||typeof access.encryptPrivateCache!=='function')throw Error('Unlock your private profile before applying local wording.');
 if(!globalThis.navigator?.locks?.request)throw Error('Protected local storage requires browser Web Locks support.');
 let persisted=true;
 await globalThis.navigator.locks.request('material-file-encryptor.visitor.access.write',async()=>{
  const envelope=await access.encryptPrivateCache(serializeVocabulary(next),'public-site-personal-vocabulary');
  if(ticket!==wordingGeneration||!access.authenticated||schoolEnabled)throw Error('Authentication changed. Original wording remains active.');
  access.credentialStore.assertSession();
  try{siteStorage.setItem(vocabularyStorageKey,JSON.stringify(envelope));}catch{persisted=false;}
  access.credentialStore.assertSession();
 });
 if(ticket!==wordingGeneration||!access.authenticated||schoolEnabled)throw Error('Authentication changed. Original wording remains active.');
 pendingVocabularySource=null;vocabulary=next;vocabularyState={kind:'success',persisted};
}
async function clearPrivateVocabulary() {
 const ticket=++wordingGeneration;
 pendingVocabularySource=null;vocabulary=emptyVocabulary();vocabularyState={kind:'default'};renderCopy();
 const clear=async()=>{
  if(!globalThis.navigator?.locks?.request)throw Error('Protected local storage requires browser Web Locks support.');
  await globalThis.navigator.locks.request('material-file-encryptor.visitor.access.write',()=>siteStorage.removeItem(vocabularyStorageKey));
 };
 vocabularyClearFlight=clear();
 try{await vocabularyClearFlight;}catch{if(ticket===wordingGeneration)vocabularyState={kind:'error',message:'Original wording restored for this session. Stored wording could not be removed.'};}
 if(ticket===wordingGeneration)renderCopy();
}
export async function setAuthenticatedLocalSession(authenticated,access) {
 const session=++authenticationGeneration;let ticket=++wordingGeneration;privateCacheAccess=access;
 privateWordingAvailable=authenticated===true&&access?.authenticated===true&&!schoolEnabled;
 vocabulary=emptyVocabulary();
 if(!privateWordingAvailable){vocabularyState={kind:pendingVocabularySource===null?'locked':'pending'};renderCopy();return;}
 try{
  await vocabularyClearFlight.catch(()=>{});
  if(session!==authenticationGeneration||ticket!==wordingGeneration||!access.authenticated)return;
  if(pendingVocabularySource!==null){const source=pendingVocabularySource;ticket=wordingGeneration+1;await replacePrivateVocabulary(source);if(pendingVocabularySource===source)pendingVocabularySource=null;}
  else {const raw=siteStorage.getItem(vocabularyStorageKey);if(raw){const clear=await access.decryptPrivateCache(JSON.parse(raw),'public-site-personal-vocabulary');if(ticket!==wordingGeneration||!access.authenticated)return;vocabulary=parseVocabulary(clear);vocabularyState={kind:'success',persisted:true};}else vocabularyState={kind:'default'};}
 }catch{if(session!==authenticationGeneration||ticket!==wordingGeneration)return;vocabulary=emptyVocabulary();vocabularyState={kind:'error',message:'Saved private wording could not be unlocked. Original wording remains active.'};}
 if(access.authenticated&&!schoolEnabled)renderCopy();
}
let vocabularyState = { kind: 'default' };
const dynamic = '#search-status,#no-results,#vocabulary-status,#success-preview,#search-preview,output';
const textRecords = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
  acceptNode(node) {
    if (!node.textContent.trim() || node.parentElement.closest(`script,style,code,pre,svg,#interactive-workflow,${dynamic}`)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  },
});
while (walker.nextNode()) {
  const node = walker.currentNode;
  textRecords.push({ node, original: node.textContent, key: node.textContent.trim().replace(/\s+/gu, ' '), vocabulary: !node.parentElement.closest('#preferences-dialog,select,md-outlined-select'), secondary: null });
}
const attributes = [];
for (const element of document.querySelectorAll('[aria-label],[alt],[title],[placeholder]')) {
  if (element.closest('#interactive-workflow')) continue;
  for (const name of ['aria-label', 'alt', 'title', 'placeholder']) if (element.hasAttribute(name)) attributes.push({ element, name, original: element.getAttribute(name) });
}
const originalTitle = document.title;
const controlLabels=[...document.querySelectorAll('md-outlined-text-field,md-outlined-select,mfe-file-picker')].filter(node=>node.label&&!node.closest('#interactive-workflow')).map(node=>({node,original:node.label}));
const activeLanguage = () => schoolEnabled ? 'en' : preferences.language;
const menu = document.querySelector('#navigation');
const menuToggle = document.querySelector('#menu-toggle');
const dialog = document.querySelector('#preferences-dialog');
const search = document.querySelector('#doc-search');
const searchStatus = document.querySelector('#search-status');
const searchClear = document.querySelector('#search-clear');
const guideElements = [...document.querySelectorAll('.guide')];
const guideEnglish = new Map(guideElements.map(element => [element, `${element.dataset.search} ${element.textContent}`]));
const vocabularyFile = document.querySelector('#vocabulary-file');
const vocabularyStatus = document.querySelector('#vocabulary-status');
const languageSelect = document.querySelector('#language-select');
const emojiToggle = document.querySelector('#emoji-toggle');
const successTone = document.querySelector('#success-tone');
const searchTone = document.querySelector('#search-tone');

const pair = (en, yue) => (!schoolEnabled && preferences.language === 'yue') ? yue : (!schoolEnabled && preferences.language === 'bilingual') ? `${en} / ${yue}` : en;
function friendly(kind, count = 0) {
  const [en,yue] = effectiveMessagePair({...preferences,school:{enabled:schoolEnabled}},kind,count);
  return `${(!schoolEnabled && preferences.emoji) ? kind === 'success' ? '✅ ' : '🔎 ' : ''}${pair(en, yue)}`;
}
function savePreferences() {
  try { siteStorage.setItem('material-file-encryptor.site.messages', JSON.stringify(preferences)); } catch { /* Preferences remain usable in this tab. */ }
}
let enhancedSearch = null;
function updateSearch() {
  if (enhancedSearch) { if(search.value!==enhancedSearch.query)enhancedSearch.setQuery(search.value); enhancedSearch.refresh(); return; }
  const guides = guideElements.map(element => ({ id: element.id, text: `${guideEnglish.get(element)} ${element.textContent}` }));
  const matched = new Set(filterGuides(guides, search.value).map(guide => guide.id));
  guideElements.forEach(element => { element.hidden = !matched.has(element.id); });
  updateGalleryGroups(document.querySelectorAll('[data-gallery-group]'), document.querySelectorAll('[data-gallery-group-link]'));
  searchClear.hidden = !search.value;
  document.querySelector('#no-results').hidden = matched.size > 0;
  document.querySelector('#no-results').textContent = friendly('search');
  searchStatus.textContent = search.value.trim()
    ? pair(`${matched.size} of ${guides.length} guides match. Search stays in your browser.`, `${guides.length} 份指南入面有 ${matched.size} 份符合。搜尋只喺你嘅瀏覽器進行。`)
    : pair(`${guides.length} entries. Search stays in your browser.`, `${guides.length} 項內容。搜尋只喺你嘅瀏覽器進行。`);
}
function updateMessages() {
  successTone.style.setProperty('--range-progress', `${(preferences.funnyEnglish - 1) * 25}%`);
  searchTone.style.setProperty('--range-progress', `${(preferences.funnyCantonese - 1) * 25}%`);
  document.querySelector('#success-tone-value').textContent = `${preferences.funnyEnglish} / 5`;
  document.querySelector('#search-tone-value').textContent = `${preferences.funnyCantonese} / 5`;
  document.querySelector('#success-preview').textContent = pair('Example message: ', '訊息示例：') + friendly('success', 2);
  document.querySelector('#search-preview').textContent = pair('Example message: ', '訊息示例：') + friendly('search');
  vocabularyStatus.dataset.error = String(vocabularyState.kind === 'error');
  vocabularyStatus.textContent = vocabularyState.kind === 'error' ? localized(vocabularyState.message, activeLanguage()) : !privateWordingAvailable ? localized(pendingVocabularySource === null ? 'Private wording is locked. Choose a file to validate it locally, then unlock your private profile to apply it.' : 'File validated locally. Unlock your private profile to apply its wording. Public text remains unchanged.',activeLanguage()) : vocabularyState.kind === 'success' ? friendly('success', vocabulary.replacements.length) + localized(vocabularyState.persisted ? ' Saved on this device.' : ' Active for this session only; storage failed.',activeLanguage())
    : localized(vocabularyState.kind === 'error' ? vocabularyState.message : 'Default wording is active.', activeLanguage());
  updateSearch();
}
let schoolEnabled = false;
let siteDisplayName='Material File Encryptor';
function renderCopy() {
  document.documentElement.lang = (!schoolEnabled && preferences.language === 'yue') ? 'yue-Hant-HK' : 'en';
  document.documentElement.dataset.language = schoolEnabled?'en':preferences.language;
  document.title = localized(originalTitle, schoolEnabled?'en':preferences.language);
  for (const record of textRecords) {
    record.secondary?.remove(); record.secondary = null;
    const translated = cantonese[record.key];
    const replace = text => record.vocabulary ? replaceVocabulary(text, vocabulary) : text;
    const leading = record.original.match(/^\s*/u)[0];
    const trailing = record.original.match(/\s*$/u)[0];
    record.node.textContent = leading + replace((!schoolEnabled && preferences.language === 'yue') && translated ? translated : record.key) + trailing;
    if ((!schoolEnabled && preferences.language === 'bilingual') && translated) {
      if (record.node.parentElement.closest('option,md-select-option')) record.node.textContent = localized(record.key, 'bilingual');
      else {
        const translation = document.createElement('span'); translation.lang = 'yue-Hant-HK'; translation.className = 'translation';
        translation.textContent = replace(translated); record.node.after(translation); record.secondary = translation;
      }
    }
  }
  for (const record of attributes) record.element.setAttribute(record.name, localized(record.original, schoolEnabled?'en':preferences.language));
  for(const record of controlLabels)record.node.label=localized(record.original,schoolEnabled?'en':preferences.language);
  document.documentElement.setAttribute('data-control-language',schoolEnabled?'en':preferences.language);
  menuToggle.setAttribute('aria-label', localized(menu.classList.contains('is-open') ? 'Close navigation' : 'Open navigation', preferences.language));
  if(siteDisplayName!=='Material File Encryptor'){for(const node of document.querySelectorAll('.brand span,.footer-brand'))node.textContent=siteDisplayName;document.title=siteDisplayName+' · '+localized('Documentation library',activeLanguage());}
  updateMessages();
  window.dispatchEvent(new CustomEvent('site-language', { detail: { language: schoolEnabled ? 'en' : preferences.language } }));
}
function closeMenu() {
  menu.classList.remove('is-open'); menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', localized('Open navigation', preferences.language));
}
const header = document.querySelector('.homepage-header');
const exploreToggle = document.querySelector('#explore-toggle');
const exploreLinks = document.querySelector('#explore-links');
function closeExplore({ restoreFocus = false } = {}) {
  if (!exploreToggle) return;
  exploreToggle.setAttribute('aria-expanded', 'false');
  exploreLinks.hidden = !header.classList.contains('is-compact');
  if (restoreFocus) exploreToggle.focus();
}
function updateNavigationLayout() {
  if (!header) return;
  header.dataset.navigationReady = 'true';
  const active = document.activeElement;
  const wasCompact = header.classList.contains('is-compact');
  header.classList.remove('is-compact');
  exploreLinks.hidden = true;
  const row = header.querySelector('.header-inner');
  const navigationBounds = menu.getBoundingClientRect();
  const brandBounds = header.querySelector('.brand').getBoundingClientRect();
  const requiredStart = Math.max(navigationBounds.left, brandBounds.right + (parseFloat(getComputedStyle(row).columnGap) || 0));
  const childOverflow = [...menu.children].some(child => {
    if (!child.getClientRects().length) return false;
    const bounds = child.getBoundingClientRect();
    return bounds.left < requiredStart - .5 || bounds.right > navigationBounds.right + .5;
  });
  const compact = window.innerWidth <= 1100 || row.scrollWidth > row.clientWidth || menu.scrollWidth > menu.clientWidth || childOverflow;
  header.classList.toggle('is-compact', compact);
  if (compact !== wasCompact) {
    closeMenu();
    closeExplore();
    if (menu.contains(active) || active === menuToggle) (compact ? menuToggle : menu.querySelector('a')).focus();
  } else {
    exploreLinks.hidden = compact ? false : exploreToggle.getAttribute('aria-expanded') !== 'true';
  }
}
exploreToggle?.addEventListener('click', () => {
  const open = exploreToggle.getAttribute('aria-expanded') !== 'true';
  exploreToggle.setAttribute('aria-expanded', String(open));
  exploreLinks.hidden = !open;
});
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open'); menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', localized(open ? 'Close navigation' : 'Open navigation', preferences.language));
});
menu.addEventListener('click', event => { if (event.composedPath().some(node => node?.matches?.('a[href]')) && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { closeMenu(); closeExplore(); } });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (menu.classList.contains('is-open')) { closeMenu(); menuToggle.focus(); }
  else if (exploreToggle?.getAttribute('aria-expanded') === 'true') closeExplore({ restoreFocus: true });
});
document.addEventListener('click', event => {
  if (!event.target.closest('.site-header')) closeMenu();
  if (!event.target.closest('.navigation-explore')) closeExplore();
});
window.addEventListener('resize', updateNavigationLayout);
window.addEventListener('site-language', updateNavigationLayout);
document.fonts?.ready.then(updateNavigationLayout);
updateNavigationLayout();
if (header && typeof ResizeObserver === 'function') {
  let pendingLayout = false;
  const observer = new ResizeObserver(() => {
    if (pendingLayout) return;
    pendingLayout = true;
    requestAnimationFrame(() => { pendingLayout = false; updateNavigationLayout(); });
  });
  observer.observe(header.querySelector('.header-inner'));
  observer.observe(header.querySelector('.brand'));
  observer.observe(menu);
}
let preferencesReturnTarget = null;
for (const id of ['preferences-open', 'preferences-footer']) document.getElementById(id).addEventListener('click', () => {
  preferencesReturnTarget = id === 'preferences-open' && header?.classList.contains('is-compact') ? menuToggle : document.getElementById(id);
  closeMenu(); closeExplore(); dialog.showModal();
});
dialog.addEventListener('close', () => { preferencesReturnTarget?.focus(); preferencesReturnTarget = null; });
const themeSelect = document.querySelector('#theme-select');
function applyTheme(theme) {
  if (!['system', 'light', 'dark'].includes(theme)) theme = 'system';
  if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
}
try { applyTheme(siteStorage.getItem('material-file-encryptor.site.theme') || 'system'); } catch { applyTheme('system'); }
themeSelect.addEventListener('change', () => { applyTheme(themeSelect.value); try { siteStorage.setItem('material-file-encryptor.site.theme', themeSelect.value); } catch {} });
languageSelect.value = preferences.language; emojiToggle.checked = preferences.emoji;
successTone.value = preferences.funnyEnglish; searchTone.value = preferences.funnyCantonese;
languageSelect.addEventListener('change', () => { preferences.language = languageSelect.value; savePreferences(); renderCopy(); });
emojiToggle.addEventListener('change', () => { preferences.emoji = emojiToggle.checked; savePreferences(); updateMessages(); });
for (const [input, key] of [[successTone, 'funnyEnglish'], [searchTone, 'funnyCantonese']]) input.addEventListener('input', () => { preferences[key] = Number(input.value); savePreferences(); updateMessages(); });
search.addEventListener('input', updateSearch);
searchClear.addEventListener('click', () => { search.value = ''; updateSearch(); search.focus(); });
function revealHash() {
  const guide = guideElements.find(element => element.id === location.hash.slice(1));
  if (guide) { search.value = ''; updateSearch(); guide.open = true; requestAnimationFrame(() => guide.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })); }
}
window.addEventListener('hashchange', revealHash);
document.addEventListener('click', event => { const link = event.target.closest('a[href^="#guide-"]'); if (link && location.hash === link.hash) revealHash(); });
let uploadVersion = 0;
vocabularyFile.addEventListener('change', async () => {
  const version = ++uploadVersion; const file = vocabularyFile.files[0]; if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('Vocabulary JSON must be no larger than 256 KiB.');
    const source = await file.text(); const next = parseVocabulary(source); if (version !== uploadVersion) return;
    if (!privateWordingAvailable) { pendingVocabularySource = source; vocabularyState = { kind: 'pending' }; updateMessages(); return; }
    await replacePrivateVocabulary(source);if(version===uploadVersion)renderCopy();
  } catch (error) { if (version !== uploadVersion) return; vocabularyState = { kind: 'error', message: error.message }; updateMessages(); }
});
document.querySelector('#vocabulary-reset').addEventListener('click', async () => { if (!await confirmSiteDestructive('site.clear-vocabulary', { language: activeLanguage })) return; uploadVersion++; vocabularyFile.value = ''; clearPrivateVocabulary(); });
const foundation = mountSiteFoundation({document, storage:siteStorage, getPreferences:()=>preferences, onPreferences:()=>dialog.showModal(), onSearch:control=>{enhancedSearch=control;}, onSchool:enabled=>{schoolEnabled=enabled;if(enabled){wordingGeneration++;privateWordingAvailable=false;vocabulary=emptyVocabulary();}renderCopy();},onAuthentication:setAuthenticatedLocalSession,onCanonicalSettings:value=>{siteDisplayName=value.displayName;preferences={...preferences,language:value.language,funnyEnglish:value.funnyEnglish,funnyCantonese:value.funnyCantonese,emoji:value.emoji};schoolEnabled=value.school.enabled;languageSelect.value=value.language;emojiToggle.checked=value.emoji;successTone.value=value.funnyEnglish;searchTone.value=value.funnyCantonese;renderCopy();if(!schoolEnabled&&privateCacheAccess?.authenticated&&!privateWordingAvailable)setAuthenticatedLocalSession(true,privateCacheAccess);}});
for(const [id,key] of [['english-tone-reset','funnyEnglish'],['cantonese-tone-reset','funnyCantonese']]) document.getElementById(id)?.addEventListener('click',()=>{preferences[key]=5;(key==='funnyEnglish'?successTone:searchTone).value=5;savePreferences();updateMessages();});
renderCopy(); revealHash();

// Native scrolling stays intact; this only reveals the themed thumb briefly.
const scrollIdleTimers = new WeakMap();
document.addEventListener('scroll', event => {
  const surface = event.target === document ? document.documentElement : event.target;
  if (!(surface instanceof Element)) return;
  clearTimeout(scrollIdleTimers.get(surface));
  surface.classList.add('is-scrolling');
  scrollIdleTimers.set(surface, setTimeout(() => surface.classList.remove('is-scrolling'), 900));
}, { capture: true, passive: true });
