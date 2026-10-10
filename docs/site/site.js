import { parseVocabulary, replaceVocabulary, filterGuides, updateGalleryGroups } from './preferences.js';
import { cantonese, localized, loadMessagePreferences, messagePair } from './locales.js';
import { previewRelease, renderReleaseDownload } from './release.js';

renderReleaseDownload(document, previewRelease);

let preferences;
try { preferences = loadMessagePreferences(localStorage); } catch { preferences = loadMessagePreferences({ getItem: () => null }); }
let vocabulary = { version: 1, replacements: [] };
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
  textRecords.push({ node, original: node.textContent, key: node.textContent.trim().replace(/\s+/gu, ' '), vocabulary: !node.parentElement.closest('#preferences-dialog,select'), secondary: null });
}
const attributes = [];
for (const element of document.querySelectorAll('[aria-label],[alt],[title],[placeholder]')) {
  if (element.closest('#interactive-workflow')) continue;
  for (const name of ['aria-label', 'alt', 'title', 'placeholder']) if (element.hasAttribute(name)) attributes.push({ element, name, original: element.getAttribute(name) });
}
const originalTitle = document.title;
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

const pair = (en, yue) => preferences.language === 'yue' ? yue : preferences.language === 'bilingual' ? `${en} / ${yue}` : en;
function friendly(kind, count = 0) {
  const [en, yue] = messagePair(kind, preferences[kind === 'success' ? 'successTone' : 'searchTone'], count);
  return `${preferences.emoji ? kind === 'success' ? '✅ ' : '🔎 ' : ''}${pair(en, yue)}`;
}
function savePreferences() {
  try { localStorage.setItem('material-file-encryptor.site.messages', JSON.stringify(preferences)); } catch { /* Preferences remain usable in this tab. */ }
}
function updateSearch() {
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
  successTone.style.setProperty('--range-progress', `${(preferences.successTone - 1) * 25}%`);
  searchTone.style.setProperty('--range-progress', `${(preferences.searchTone - 1) * 25}%`);
  document.querySelector('#success-tone-value').textContent = `${preferences.successTone} / 5`;
  document.querySelector('#search-tone-value').textContent = `${preferences.searchTone} / 5`;
  document.querySelector('#success-preview').textContent = pair('Example message: ', '訊息示例：') + friendly('success', 2);
  document.querySelector('#search-preview').textContent = pair('Example message: ', '訊息示例：') + friendly('search');
  vocabularyStatus.dataset.error = String(vocabularyState.kind === 'error');
  vocabularyStatus.textContent = vocabularyState.kind === 'success' ? friendly('success', vocabulary.replacements.length)
    : localized(vocabularyState.kind === 'error' ? vocabularyState.message : 'Default wording is active.', preferences.language);
  updateSearch();
}
function renderCopy() {
  document.documentElement.lang = preferences.language === 'yue' ? 'yue-Hant-HK' : 'en';
  document.documentElement.dataset.language = preferences.language;
  document.title = localized(originalTitle, preferences.language);
  for (const record of textRecords) {
    record.secondary?.remove(); record.secondary = null;
    const translated = cantonese[record.key];
    const replace = text => record.vocabulary ? replaceVocabulary(text, vocabulary) : text;
    const leading = record.original.match(/^\s*/u)[0];
    const trailing = record.original.match(/\s*$/u)[0];
    record.node.textContent = leading + replace(preferences.language === 'yue' && translated ? translated : record.key) + trailing;
    if (preferences.language === 'bilingual' && translated) {
      if (record.node.parentElement.tagName === 'OPTION') record.node.textContent = localized(record.key, 'bilingual');
      else {
        const translation = document.createElement('span'); translation.lang = 'yue-Hant-HK'; translation.className = 'translation';
        translation.textContent = replace(translated); record.node.after(translation); record.secondary = translation;
      }
    }
  }
  for (const record of attributes) record.element.setAttribute(record.name, localized(record.original, preferences.language));
  menuToggle.setAttribute('aria-label', localized(menu.classList.contains('is-open') ? 'Close navigation' : 'Open navigation', preferences.language));
  updateMessages();
  window.dispatchEvent(new CustomEvent('site-language', { detail: { language: preferences.language } }));
}
function closeMenu() {
  menu.classList.remove('is-open'); menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', localized('Open navigation', preferences.language));
}
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open'); menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', localized(open ? 'Close navigation' : 'Open navigation', preferences.language));
});
menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); menuToggle.focus(); } });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
matchMedia('(min-width: 800px)').addEventListener('change', closeMenu);
for (const id of ['preferences-open', 'preferences-footer']) document.getElementById(id).addEventListener('click', () => { closeMenu(); dialog.showModal(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const themeSelect = document.querySelector('#theme-select');
function applyTheme(theme) {
  if (!['system', 'light', 'dark'].includes(theme)) theme = 'system';
  if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
}
try { applyTheme(localStorage.getItem('material-file-encryptor.site.theme') || 'system'); } catch { applyTheme('system'); }
themeSelect.addEventListener('change', () => { applyTheme(themeSelect.value); try { localStorage.setItem('material-file-encryptor.site.theme', themeSelect.value); } catch {} });
languageSelect.value = preferences.language; emojiToggle.checked = preferences.emoji;
successTone.value = preferences.successTone; searchTone.value = preferences.searchTone;
languageSelect.addEventListener('change', () => { preferences.language = languageSelect.value; savePreferences(); renderCopy(); });
emojiToggle.addEventListener('change', () => { preferences.emoji = emojiToggle.checked; savePreferences(); updateMessages(); });
for (const [input, key] of [[successTone, 'successTone'], [searchTone, 'searchTone']]) input.addEventListener('input', () => { preferences[key] = Number(input.value); savePreferences(); updateMessages(); });
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
    if (file.size > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.');
    const next = parseVocabulary(await file.text()); if (version !== uploadVersion) return;
    vocabulary = next; vocabularyState = { kind: 'success' }; renderCopy();
  } catch (error) { if (version !== uploadVersion) return; vocabularyState = { kind: 'error', message: error.message }; updateMessages(); }
});
document.querySelector('#vocabulary-reset').addEventListener('click', () => { uploadVersion++; vocabulary = { version: 1, replacements: [] }; vocabularyFile.value = ''; vocabularyState = { kind: 'default' }; renderCopy(); });
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
