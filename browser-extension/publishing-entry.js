// Mounts the Progress and publication section. It is a separate module so options.js needs only the section
// registration; it reads the page language from the document and the personal wording from local storage.
import {mountPublishing} from './publishing.js';
import {acquireStorage} from './preferences.js';
import {readVocabulary} from './vocabulary.js';

const root = document.getElementById('publishing-root');
if (root) {
  const storage = acquireStorage();
  const view = mountPublishing(root, {
    send: message => chrome.runtime.sendMessage(message),
    getLanguage: () => document.documentElement.dataset.controlLanguage || 'en',
    getWording: () => readVocabulary(storage),
  });
  // Labels follow the page language and personal wording without a reload.
  new MutationObserver(() => view.refreshLabels()).observe(document.documentElement, {attributes: true, attributeFilter: ['data-control-language']});
  globalThis.addEventListener('pagehide', () => view.disconnect());
}
