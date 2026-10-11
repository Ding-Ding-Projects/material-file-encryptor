const VERSION = 1;
const text = (value, limit = 256) => String(value ?? '').slice(0, limit);
const escapeLiteral = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const copy = value => JSON.parse(JSON.stringify(value));

export function createMatcher(query = '', { regex = false, flags = 'i' } = {}) {
  const pattern = String(query ?? '');
  if (pattern.length > 512) return { valid: false, error: 'Pattern exceeds 512 characters.', test: () => false };
  if (!/^(?:i?u?|u?i?)$/.test(flags)) return { valid: false, error: 'Only i and u flags are supported.', test: () => false };
  try {
    // Synchronous matching deliberately accepts a conservative subset. Full
    // expressions belong in the isolated worker used by the expression editor.
    if (regex) {
      if (/\\(?:[1-9]|k[<{])|\(\?(?!:)/.test(pattern)) throw new Error('Backreferences and lookaround require isolated evaluation.');
      const syntax = pattern.replace(/\\./g, '').replace(/\[(?:\\.|[^\]\\])*\]/g, 'x').replace(/\(\?:/g, '(');
      if (/\)[*+?{]/.test(syntax)) throw new Error('Repeated groups require isolated evaluation.');
      if ((syntax.match(/[*+?]|\{[^}]*\}/g) ?? []).length > 1) throw new Error('Multiple repetitions require isolated evaluation.');
      for (const repetition of syntax.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
        if (Number(repetition[1]) > 1000 || (repetition[2] && Number(repetition[2]) > 1000)) throw new Error('Repetition exceeds the safe limit.');
      }
    }
    const expression = new RegExp(regex ? pattern : escapeLiteral(pattern), flags);
    return { valid: true, error: null, test: value => expression.test(text(value, 4096)) };
  } catch (error) {
    return { valid: false, error: error.message, test: () => false };
  }
}

export function buildPattern(tokens = [], { anchorStart = false, anchorEnd = false } = {}) {
  const body = tokens.map(token => {
    if (typeof token === 'string') return escapeLiteral(token);
    if (token?.type === 'literal') return escapeLiteral(String(token.value ?? ''));
    if (token?.type === 'raw') return String(token.value ?? '');
    if (token?.type === 'alternative') return `(?:${(token.values ?? []).map(value => escapeLiteral(String(value))).join('|')})`;
    throw new TypeError('Unsupported pattern token.');
  }).join('');
  return `${anchorStart ? '^' : ''}${body}${anchorEnd ? '$' : ''}`;
}

export function createSurfaceModel({ storage, storageKey = 'surface-state', tabs = [] } = {}) {
  const sanitizeTab = tab => ({ id: text(tab.id, 128), label: text(tab.label), group: text(tab.group, 128), pinned: tab.pinned === true });
  const uniqueTabs = values => {
    const seen = new Set();
    return values.filter(tab => tab && typeof tab.id === 'string' && tab.id && !seen.has(tab.id) && seen.add(tab.id)).slice(0, 100).map(sanitizeTab);
  };
  const defaults = uniqueTabs(tabs);
  if (!defaults.length) defaults.push({ id: 'home', label: 'Home', group: '', pinned: false });
  let state = { version: VERSION, tabs: defaults, activeTabId: defaults[0].id, closedTabs: [], notifications: [] };
  try {
    const raw = storage?.getItem(storageKey);
    if (raw && raw.length <= 262144) {
      const saved = JSON.parse(raw);
      if (saved.version === VERSION && Array.isArray(saved.tabs)) {
        const restored = uniqueTabs(saved.tabs);
        if (restored.length) {
          state.tabs = restored;
          state.activeTabId = restored.some(tab => tab.id === saved.activeTabId) ? saved.activeTabId : restored[0].id;
          state.closedTabs = uniqueTabs(Array.isArray(saved.closedTabs) ? saved.closedTabs : []).filter(tab => !restored.some(open => open.id === tab.id)).slice(-20);
        }
      }
    }
  } catch { /* Invalid or inaccessible storage leaves the safe defaults active. */ }
  let sequence = 0;
  const persist = () => {
    // Notifications can describe sensitive operations and intentionally remain in memory.
    try { storage?.setItem(storageKey, JSON.stringify({ ...state, notifications: undefined })); } catch { /* State remains usable when storage is full. */ }
  };
  const tabById = id => state.tabs.find(tab => tab.id === id);
  const matchRows = (rows, query, options, label) => {
    const matcher = createMatcher(query, options);
    return matcher.valid ? copy(rows.filter(row => matcher.test(label(row)))) : [];
  };
  return {
    getState: () => copy(state),
    openTab(tab) {
      if (!tab || typeof tab.id !== 'string' || !tab.id || tab.id.length > 128) return null;
      if (!tabById(tab.id)) {
        if (state.tabs.length >= 100) return null;
        state.tabs.push(sanitizeTab(tab));
      }
      state.closedTabs = state.closedTabs.filter(closed => closed.id !== tab.id);
      state.activeTabId = tab.id; persist(); return tab.id;
    },
    activateTab(id) { if (!tabById(id)) return false; state.activeTabId = id; persist(); return true; },
    closeTab(id) {
      const index = state.tabs.findIndex(tab => tab.id === id);
      if (index < 0 || state.tabs.length === 1 || state.tabs[index].pinned) return false;
      state.closedTabs.push(state.tabs.splice(index, 1)[0]);
      state.closedTabs = state.closedTabs.slice(-20);
      if (state.activeTabId === id) state.activeTabId = state.tabs[Math.min(index, state.tabs.length - 1)].id;
      persist(); return true;
    },
    restoreTab() { const tab = state.closedTabs.pop(); if (!tab) return null; state.tabs.push(tab); state.activeTabId = tab.id; persist(); return tab.id; },
    pinTab(id, pinned = true) { const tab = tabById(id); if (!tab) return false; tab.pinned = !!pinned; persist(); return true; },
    groupTab(id, group) { const tab = tabById(id); if (!tab) return false; tab.group = text(group, 128); persist(); return true; },
    searchTabs: (query, options) => matchRows(state.tabs, query, options, tab => `${tab.label} ${tab.group}`),
    addNotification(input = {}) {
      const id = `notification-${++sequence}`;
      state.notifications.push({ id, title: text(input.title), message: text(input.message, 4096), level: ['info', 'success', 'warning', 'error'].includes(input.level) ? input.level : 'info', read: false, createdAt: new Date().toISOString() });
      state.notifications = state.notifications.slice(-200); return id;
    },
    readNotification(id, read = true) { const item = state.notifications.find(row => row.id === id); if (!item) return false; item.read = !!read; return true; },
    dismissNotification(id) { const length = state.notifications.length; state.notifications = state.notifications.filter(row => row.id !== id); return length !== state.notifications.length; },
    filterNotifications(query = '', options = {}) { return matchRows(state.notifications.filter(row => !options.unreadOnly || !row.read), query, options, row => `${row.title} ${row.message} ${row.level}`); },
    exportNotifications(format = 'json') {
      if (format === 'json') return JSON.stringify(state.notifications, null, 2);
      if (format !== 'csv') throw new TypeError('Unsupported export format.');
      const cell = value => `"${String(value).replace(/^\s*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
      const fields = ['id', 'title', 'message', 'level', 'read', 'createdAt'];
      return [fields.join(','), ...state.notifications.map(row => fields.map(field => cell(row[field])).join(','))].join('\r\n');
    }
  };
}
