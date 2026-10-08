import { parseVocabulary, replaceVocabulary, filterGuides } from './preferences.js';

const menu = document.querySelector('#navigation');
const menuToggle = document.querySelector('#menu-toggle');
function closeMenu() {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
}
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); menuToggle.focus(); } });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
const desktop = matchMedia('(min-width: 800px)');
desktop.addEventListener('change', closeMenu);

const dialog = document.querySelector('#preferences-dialog');
for (const id of ['preferences-open', 'preferences-footer']) document.getElementById(id).addEventListener('click', () => { closeMenu(); dialog.showModal(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const themeSelect = document.querySelector('#theme-select');
function applyTheme(theme) {
  if (!['system', 'light', 'dark'].includes(theme)) theme = 'system';
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
}
try { applyTheme(localStorage.getItem('material-file-encryptor.site.theme') || 'system'); } catch { applyTheme('system'); }
themeSelect.addEventListener('change', () => {
  applyTheme(themeSelect.value);
  try { localStorage.setItem('material-file-encryptor.site.theme', themeSelect.value); } catch { /* Theme remains usable without browser storage. */ }
});

const guideElements = [...document.querySelectorAll('.guide')];
const guides = guideElements.map(element => ({ id: element.id, text: `${element.dataset.search} ${element.textContent}`, element }));
const search = document.querySelector('#doc-search');
const searchStatus = document.querySelector('#search-status');
const searchClear = document.querySelector('#search-clear');
function updateSearch() {
  const matched = new Set(filterGuides(guides, search.value).map(guide => guide.id));
  guideElements.forEach(element => { element.hidden = !matched.has(element.id); });
  const active = Boolean(search.value.trim());
  searchClear.hidden = !search.value;
  document.querySelector('#no-results').hidden = matched.size > 0;
  searchStatus.textContent = active ? `${matched.size} of ${guides.length} guides match. Search stays in your browser.` : 'Four guides. Search stays in your browser.';
}
search.addEventListener('input', updateSearch);
searchClear.addEventListener('click', () => { search.value = ''; updateSearch(); search.focus(); });
function revealHash() {
  const id = location.hash.slice(1);
  const guide = guideElements.find(element => element.id === id);
  if (guide) {
    search.value = ''; updateSearch(); guide.open = true;
    requestAnimationFrame(() => guide.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  }
}
window.addEventListener('hashchange', revealHash);
document.addEventListener('click', event => { const link = event.target.closest('a[href^="#guide-"]'); if (link && location.hash === link.hash) revealHash(); });
revealHash();

// Preserve original text nodes; never rewrite markup, URLs, code, or identifiers.
const originalText = new Map();
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
  acceptNode(node) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style,code,pre,input,textarea,select,#preferences-dialog,#search-status,#no-results')) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  },
});
while (walker.nextNode()) originalText.set(walker.currentNode, walker.currentNode.textContent);
const vocabularyFile = document.querySelector('#vocabulary-file');
const vocabularyStatus = document.querySelector('#vocabulary-status');
let uploadVersion = 0;
vocabularyFile.addEventListener('change', async () => {
  const version = ++uploadVersion;
  const file = vocabularyFile.files[0];
  if (!file) return;
  try {
    if (file.size > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.');
    const vocabulary = parseVocabulary(await file.text());
    if (version !== uploadVersion) return;
    for (const [node, original] of originalText) node.textContent = replaceVocabulary(original, vocabulary);
    vocabularyStatus.dataset.error = 'false';
    vocabularyStatus.textContent = `${vocabulary.replacements.length} replacement${vocabulary.replacements.length === 1 ? '' : 's'} applied in this tab. Nothing was uploaded or saved.`;
  } catch (error) {
    if (version !== uploadVersion) return;
    vocabularyStatus.dataset.error = 'true';
    vocabularyStatus.textContent = error.message;
  }
});
document.querySelector('#vocabulary-reset').addEventListener('click', () => {
  uploadVersion++;
  for (const [node, original] of originalText) node.textContent = original;
  vocabularyFile.value = '';
  vocabularyStatus.dataset.error = 'false';
  vocabularyStatus.textContent = 'Default wording is active.';
});
