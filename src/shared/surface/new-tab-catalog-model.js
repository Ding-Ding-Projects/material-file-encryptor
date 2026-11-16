// The data behind the New tab catalog: every destination, tool, settings page and menu option in one list.
//
// This module is pure. It reads the shell's label map, the saved tab state, the registered commands and the
// tab-management actions, and returns plain entries. The dialog (new-tab-catalog.js) renders them and the
// search control filters them, so both can be tested without a document.
import { homeEntries, HOME_ID, HOME_LABEL, HOME_DESCRIPTION } from './home.js';

export const CATALOG_KINDS = Object.freeze(['page', 'tool', 'setting', 'menu']);

/** Group headings in both languages, in display order. */
export const CATALOG_GROUPS = Object.freeze({
  page: { en: 'Pages', yue: '頁面' },
  tool: { en: 'Tools', yue: '工具' },
  setting: { en: 'Settings pages and options', yue: '設定頁面同選項' },
  menu: { en: 'Menu options and tab actions', yue: '選單選項同分頁操作' },
});

const TOOL_DESTINATIONS = new Set(['converter', 'ollama', 'server-manager', 'workflow', 'storage', 'browser-pairing', 'connection']);
const SETTING_DESTINATIONS = new Set(['settings', 'personalization', 'access', 'updates', 'onboarding']);
// Command ids that are shortcuts to something this catalog already lists, or controls inside a page.
const COVERED_COMMAND = /^(?:view|destination|control|tab):/;

const pair = value => (typeof value === 'string' ? { en: value, yue: value } : { en: String(value?.en ?? ''), yue: String(value?.yue ?? value?.en ?? '') });

export function destinationKind(id) {
  if (TOOL_DESTINATIONS.has(id)) return 'tool';
  if (SETTING_DESTINATIONS.has(id)) return 'setting';
  return 'page';
}

/** The kind of a registered command. A command may name its own kind; otherwise its id decides. */
export function commandKind(command) {
  if (CATALOG_KINDS.includes(command?.kind)) return command.kind;
  const id = String(command?.id ?? '');
  if (id.startsWith('settings:') || command?.control) return 'setting';
  if (/^(?:converter|ollama|server|workflow|storage):/.test(id)) return 'tool';
  return 'menu';
}

function commandIcon(command, kind) {
  const id = String(command?.id ?? '');
  if (kind === 'setting') return 'settings';
  if (/^(?:vault|file):/.test(id)) return 'drive';
  if (id.startsWith('history:')) return 'history';
    return kind === 'tool' ? 'converter' : 'apps';
}

/**
 * Builds the complete entry list.
 *   labels      Map of destination id to localized label (the shell's own map);
 *   state       the saved tab state, used to mark destinations that are already open;
 *   commands    registered host commands (menu options, settings, tools);
 *   management  the tab-management actions ({label, description, shortcut, disabled, run}).
 * An entry is { key, kind, label, description, icon, open, disabled, shortcut, destination, run }.
 */
export function buildCatalog({ labels, state = { tabs: [] }, commands = [], management = [] } = {}) {
  const entries = [];
  const open = new Set((state.tabs || []).map(tab => tab.id));
  entries.push({ key: `destination:${HOME_ID}`, kind: 'page', label: pair(HOME_LABEL), description: pair(HOME_DESCRIPTION), icon: 'home', open: open.has(HOME_ID), destination: HOME_ID });
  for (const entry of homeEntries(labels, state)) {
    entries.push({ key: `destination:${entry.id}`, kind: destinationKind(entry.id), label: pair(entry.label), description: pair(entry.description), icon: entry.icon, open: entry.open, destination: entry.id });
  }
  const seen = new Set();
  for (const command of commands) {
    const id = String(command?.id ?? '');
    if (!id || seen.has(id) || COVERED_COMMAND.test(id) || !command.label) continue;
    seen.add(id);
    const kind = commandKind(command);
    entries.push({ key: `command:${id}`, kind, label: pair(command.label), description: command.description ? pair(command.description) : null, icon: commandIcon(command, kind), open: false, disabled: command.disabled === true, shortcut: command.shortcut, run: command.run });
  }
  management.forEach((item, index) => {
    entries.push({ key: `action:${index}`, kind: 'menu', label: pair(item.label), description: item.description ? pair(item.description) : null, icon: 'apps', open: false, disabled: item.disabled === true, shortcut: item.shortcut, run: item.run });
  });
  return entries;
}

/** The text the search control matches: both languages of the label and description, plus the group name. */
export function catalogSearchText(entry) {
  const group = CATALOG_GROUPS[entry.kind];
  return [entry.label.en, entry.label.yue, entry.description?.en, entry.description?.yue, group.en, group.yue].filter(Boolean).join(' ');
}

/** Rows for the search control, which needs an id and the text to match. */
export const catalogRows = entries => entries.map(entry => ({ id: entry.key, text: catalogSearchText(entry) }));

/** Entries grouped in display order. Empty groups are dropped. */
export function groupCatalog(entries) {
  return CATALOG_KINDS.map(kind => ({ kind, heading: CATALOG_GROUPS[kind], entries: entries.filter(entry => entry.kind === kind) })).filter(group => group.entries.length);
}

/** Destination ids that Open every tab should open: every listed destination except Home. */
export function destinationsToOpen(entries) {
  return entries.filter(entry => entry.destination && entry.destination !== HOME_ID).map(entry => entry.destination);
}
