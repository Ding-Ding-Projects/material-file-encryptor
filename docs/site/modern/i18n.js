// Applies the saved site language to generated text that carries paired data-en and data-yue attributes.
const MESSAGES_KEY = 'material-file-encryptor.site.messages';
export function currentLanguage() {
 const fromRoot = document.documentElement.dataset.language;
 if (fromRoot === 'yue' || fromRoot === 'bilingual' || fromRoot === 'en') return fromRoot;
 try { const value = JSON.parse(localStorage.getItem(MESSAGES_KEY) || 'null')?.language; if (value === 'yue' || value === 'bilingual') return value; } catch { /* default */ }
 return 'en';
}
export const pick = (en, yue, language = currentLanguage()) => language === 'yue' ? yue : language === 'bilingual' ? `${en} / ${yue}` : en;
export function applyLanguage(root = document, language = currentLanguage()) {
 for (const node of root.querySelectorAll('[data-en][data-yue]')) {
  const next = pick(node.dataset.en, node.dataset.yue, language);
  if (node.textContent !== next) node.textContent = next;
 }
}
export function mountLanguage() {
 applyLanguage();
 window.addEventListener('site-language', event => applyLanguage(document, event.detail?.language || currentLanguage()));
 window.addEventListener('storage', event => { if (event.key === MESSAGES_KEY) applyLanguage(); });
 new MutationObserver(() => applyLanguage()).observe(document.documentElement, {attributes: true, attributeFilter: ['data-language']});
}
