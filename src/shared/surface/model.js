const VERSION = 1;
const text = (value, limit = 256) => String(value ?? '').slice(0, limit);
const escapeLiteral = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const copy = value => JSON.parse(JSON.stringify(value));
// Callers must supply non-sensitive messages. This is a best-effort additional
// redaction layer, not a substitute for that boundary.
const notificationText = (value, limit) => text(value, limit).replace(/\b(password|passwd|secret|token|api[_ -]?key|authorization)\b\s*[:=]\s*(?:Bearer\s+[^\s,;]+|"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]').slice(0, limit);

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
  const canonicalTabs = new Map();
  const sanitizeTab = tab => ({ id: text(tab.id, 128), label: canonicalTabs.get(tab.id) ?? text(tab.label), group: text(tab.group, 128), pinned: tab.pinned === true });
  const uniqueTabs = values => {
    const seen = new Set();
    return values.filter(tab => tab && typeof tab.id === 'string' && tab.id && tab.id.length <= 128 && !seen.has(tab.id) && seen.add(tab.id)).slice(0, 100).map(sanitizeTab);
  };
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128;
  const sanitizeNotification = item => ({ id: item.id, title: notificationText(item.title, 256), message: notificationText(item.message, 4096), level: ['info', 'success', 'warning', 'error'].includes(item.level) ? item.level : 'info', read: item.read === true, createdAt: new Date(item.createdAt).toISOString() });
  const defaults = uniqueTabs(tabs);
  if (!defaults.length) defaults.push({ id: 'home', label: 'Home', group: '', pinned: false });
  let state = { notificationFormat: 2, droppedLegacyNotifications: 0, version: VERSION, tabs: defaults, activeTabId: defaults[0].id, closedTabs: [], closedTabIds: [], groups: [], notifications: [] };
  try {
    const raw = storage?.getItem(storageKey);
    if (raw && raw.length <= 2097152) {
      const saved = JSON.parse(raw);
      if (saved.version === VERSION && Array.isArray(saved.tabs)) {
        const restored = uniqueTabs(saved.tabs);
        if (restored.length) {
          state.tabs = restored;
          state.activeTabId = restored.some(tab => tab.id === saved.activeTabId) ? saved.activeTabId : restored[0].id;
          state.closedTabs = uniqueTabs(Array.isArray(saved.closedTabs) ? saved.closedTabs : []).filter(tab => !restored.some(open => open.id === tab.id)).slice(-20);
          state.closedTabIds = [...new Set([...(Array.isArray(saved.closedTabIds)?saved.closedTabIds:[]),...state.closedTabs.map(tab=>tab.id)])].filter(id=>validId(id)&&!restored.some(tab=>tab.id===id)).slice(-100);
          const groupIds = new Set();
          state.groups = (Array.isArray(saved.groups) ? saved.groups : []).filter(group => group && validId(group.id) && !groupIds.has(group.id) && groupIds.add(group.id)).slice(0, 100).map(group => ({ id: group.id, label: text(group.label), collapsed: group.collapsed === true }));
          const notificationIds = new Set();
          state.droppedLegacyNotifications = saved.notificationFormat === 2 ? 0 : (Array.isArray(saved.notifications) ? saved.notifications.length : 0);
          state.notifications = (saved.notificationFormat === 2 && Array.isArray(saved.notifications) ? saved.notifications : []).filter(item => item && validId(item.id) && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) && !notificationIds.has(item.id) && notificationIds.add(item.id)).slice(-200).map(sanitizeNotification);
        }
      }
    }
  } catch { /* Invalid or inaccessible storage leaves the safe defaults active. */ }
  for (const tab of [...state.tabs, ...state.closedTabs]) {
    if (tab.group && !state.groups.some(group => group.id === tab.group)) {
      if (state.groups.length < 100) state.groups.push({ id: tab.group, label: tab.group, collapsed: false });
      else tab.group = '';
    }
  }
  let sequence = 0;
  const persist = () => {
    try { storage?.setItem(storageKey, JSON.stringify(state)); } catch { /* State remains usable when storage is full. */ }
  };
  // Persist the format migration before a caller can add a new canonical record.
  persist();
  const tabById = id => state.tabs.find(tab => tab.id === id);
  const ensureGroup = id => {
    if (!id || state.groups.some(group => group.id === id)) return true;
    if (!validId(id) || state.groups.length >= 100) return false;
    state.groups.push({ id, label: id, collapsed: false }); return true;
  };
  const closeTab = id => {
    const index = state.tabs.findIndex(tab => tab.id === id);
    if (index < 0 || state.tabs.length === 1 || state.tabs[index].pinned) return false;
    state.closedTabs.push(state.tabs.splice(index, 1)[0]);
    state.closedTabIds = [...state.closedTabIds.filter(closed=>closed!==id),id].slice(-100);
    state.closedTabs = state.closedTabs.slice(-20);
    if (state.activeTabId === id) state.activeTabId = state.tabs[Math.min(index, state.tabs.length - 1)].id;
    persist(); return true;
  };
  const closeTabs = ids => Array.isArray(ids) ? [...new Set(ids)].filter(closeTab) : [];
  const matchRows = (rows, query, options, label) => {
    const matcher = createMatcher(query, options);
    return matcher.valid ? copy(rows.filter(row => matcher.test(label(row)))) : [];
  };
  return {
    getState: () => copy(state),
    registerCanonicalTab(id,label) {
      if(!validId(id)||typeof label!=='string')return false;
      const canonical=text(label);canonicalTabs.set(id,canonical);
      for(const tab of [...state.tabs,...state.closedTabs])if(tab.id===id)tab.label=canonical;
      persist();return true;
    },
    openTab(tab) {
      if (!tab || typeof tab.id !== 'string' || !tab.id || tab.id.length > 128) return null;
      if (!tabById(tab.id)) {
        if (state.tabs.length >= 100) return null;
        if (!ensureGroup(text(tab.group, 128))) return null;
        state.tabs.push(sanitizeTab(tab));
      }
      state.closedTabs = state.closedTabs.filter(closed => closed.id !== tab.id);
      state.closedTabIds = state.closedTabIds.filter(closed=>closed!==tab.id);
      state.activeTabId = tab.id; persist(); return tab.id;
    },
    activateTab(id) { if (!tabById(id)) return false; state.activeTabId = id; persist(); return true; },
    closeTab,
    closeTabs,
    closeOtherTabs(id) { return tabById(id) ? closeTabs(state.tabs.filter(tab => tab.id !== id).map(tab => tab.id)) : []; },
    closeTabsToRight(id) { const index = state.tabs.findIndex(tab => tab.id === id); return index >= 0 ? closeTabs(state.tabs.slice(index + 1).map(tab => tab.id)) : []; },
    moveTab(id, index) { const oldIndex = state.tabs.findIndex(tab => tab.id === id); if (oldIndex < 0 || !Number.isInteger(index)) return false; const [tab] = state.tabs.splice(oldIndex, 1); state.tabs.splice(Math.max(0, Math.min(index, state.tabs.length)), 0, tab); persist(); return true; },
    restoreTab() { if (state.tabs.length >= 100) return null; const tab = state.closedTabs.pop(); if (!tab) return null; state.closedTabIds=state.closedTabIds.filter(id=>id!==tab.id);state.tabs.push(tab); state.activeTabId = tab.id; persist(); return tab.id; },
    pinTab(id, pinned = true) { const tab = tabById(id); if (!tab) return false; tab.pinned = !!pinned; persist(); return true; },
    groupTab(id, group) { const tab = tabById(id); const groupId = text(group, 128); if (!tab || !ensureGroup(groupId)) return false; tab.group = groupId; persist(); return true; },
    createGroup(group) { if (!group || !validId(group.id) || state.groups.some(item => item.id === group.id) || state.groups.length >= 100) return null; state.groups.push({ id: group.id, label: text(group.label), collapsed: false }); persist(); return group.id; },
    renameGroup(id, label) { const group = state.groups.find(item => item.id === id); if (!group) return false; group.label = text(label); persist(); return true; },
    collapseGroup(id, collapsed = true) { const group = state.groups.find(item => item.id === id); if (!group) return false; group.collapsed = !!collapsed; persist(); return true; },
    removeGroup(id, { ungroup = true } = {}) { if (!state.groups.some(group => group.id === id)) return false; const members = [...state.tabs, ...state.closedTabs].filter(tab => tab.group === id); if (members.length && !ungroup) return false; for (const tab of members) tab.group = ''; state.groups = state.groups.filter(group => group.id !== id); persist(); return true; },
    searchTabs: (query, options) => matchRows(state.tabs, query, options, tab => `${tab.label} ${tab.group}`),
    addNotification(input = {}) {
      let id;
      do { id = `notification-${++sequence}`; } while (state.notifications.some(item => item.id === id));
      state.notifications.push(sanitizeNotification({ ...input, id, read: false, createdAt: new Date().toISOString() }));
      state.notifications = state.notifications.slice(-200); persist(); return id;
    },
    readNotification(id, read = true) { const item = state.notifications.find(row => row.id === id); if (!item) return false; item.read = !!read; persist(); return true; },
    dismissNotification(id) { const length = state.notifications.length; state.notifications = state.notifications.filter(row => row.id !== id); if (length === state.notifications.length) return false; persist(); return true; },
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
