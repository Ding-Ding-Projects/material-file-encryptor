// The reviewed list of browser extension targets that the desktop can lock. One entry per options tab.
// The browser extension keeps an identical copy (browser-extension/options.js); a test compares the two.
export const EXTENSION_LOCK_TABS = Object.freeze(['connection', 'personalization', 'changelog', 'notes', 'docs', 'support', 'dimsum', 'models', 'status']);

/** The element identity of an extension target, the same shape the desktop uses for its own locks. */
export const extensionLockId = tab => 'extension:' + tab;

/** True only for a tab id on the reviewed list. */
export const isExtensionLockTab = value => typeof value === 'string' && EXTENSION_LOCK_TABS.includes(value);
