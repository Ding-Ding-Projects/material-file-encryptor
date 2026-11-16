/**
 * Hand-written index of every personalization setting and the tab that shows it.
 *
 * The Personalization view renders one tab at a time, so the generic control scan behind the command palette only sees
 * the tab that is open. This list lets every setting be found from the palette and opened on its own tab no matter
 * which tab is showing. A test compares it with the stored defaults, the label table and the field help, so a setting
 * added without an entry here is caught instead of silently becoming unreachable by search.
 */
export const PERSONALIZATION_TABS = Object.freeze({
  language: 'Language and voice',
  appearance: 'Appearance',
  schedules: 'Schedules',
  attention: 'Attention',
  history: 'Private local history'
});

export const PERSONALIZATION_SETTINGS = Object.freeze([
  ['language', 'Mode name'],
  ['language', 'Language'],
  ['language', 'English playfulness'],
  ['language', 'Cantonese playfulness'],
  ['language', 'Show emojis in dialogs and message boxes'],
  ['language', 'Narrator'],
  ['language', 'Narration language'],
  ['language', 'English voice'],
  ['language', 'Cantonese voice'],
  ['language', 'Rate'],
  ['language', 'Pitch'],
  ['appearance', 'Theme'],
  ['appearance', 'Density'],
  ['appearance', 'Accent color'],
  ['appearance', 'Font family'],
  ['appearance', 'Font scale'],
  ['appearance', 'Font weight'],
  ['appearance', 'Motion'],
  ['appearance', 'Display name'],
  ['attention', 'Focus'],
  ['attention', 'Low stimulation'],
  ['attention', 'Time awareness'],
  ['attention', 'One thing at a time'],
  ['attention', 'Momentum'],
  ['attention', 'Next action']
].map(([tab, label]) => Object.freeze({tab, label})));

const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Palette commands for every personalization setting plus one per tab. `open(tab, label)` must show the tab and may
 * move focus to the setting; `translate(english)` returns the Cantonese text or the English one when none exists.
 */
export function personalizationSettingCommands({open, translate = value => value, groupLabel = {en: 'Settings', yue: '設定'}} = {}) {
  if (typeof open !== 'function') throw TypeError('open(tab, label) is required.');
  const entry = (id, label, tab, description) => ({
    id, label: {en: label, yue: translate(label)}, group: groupLabel,
    description: {en: description, yue: translate(description)}, run: () => open(tab, label)
  });
  return [
    ...Object.entries(PERSONALIZATION_TABS).map(([tab, title]) => entry(`personalization:tab:${tab}`, title, tab, 'Personalization')),
    ...PERSONALIZATION_SETTINGS.map(row => entry(`personalization:setting:${slug(row.label)}`, row.label, row.tab, PERSONALIZATION_TABS[row.tab]))
  ];
}
