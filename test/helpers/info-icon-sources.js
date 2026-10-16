/**
 * Source-level helpers for the information icon coverage tests. They read the
 * markup of a surface as text and list every capable control in it, so the
 * inventory is checked against an independent reading of the page instead of
 * against itself. Inventory selectors are limited to: tag, #id, tag#id,
 * [attribute], [attribute="value"] and tag[attribute="value"].
 */
const CONTROL_TAG = /^(?:md-(?:icon-|outlined-|filled-|filled-tonal-|text-|elevated-)?button|md-switch|md-checkbox|md-radio|md-slider|md-outlined-select|md-filled-select|md-outlined-text-field|md-filled-text-field|md-filter-chip|md-primary-tab|md-secondary-tab|input|select|textarea|button|mfe-file-picker|mfe-search)$/;
const TOKEN = /<([a-z][a-z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi;
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function extractControls(html) {
  const controls = [];
  for (const match of html.matchAll(TOKEN)) {
    const tag = match[1].toLowerCase();
    if (!CONTROL_TAG.test(tag)) continue;
    const attributes = {};
    for (const attribute of match[2].matchAll(ATTRIBUTE)) attributes[attribute[1].toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    if (tag === 'input' && attributes.type === 'hidden') continue;
    controls.push({tag, attributes});
  }
  return controls;
}

const SELECTOR = /^([a-z][a-z0-9-]*)?(?:#([A-Za-z0-9_-]+))?(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/;
export function selectorMatches(control, selector) {
  const parsed = SELECTOR.exec(selector);
  if (!parsed) throw Error(`Unsupported coverage selector: ${selector}`);
  const [, tag, id, attribute, value] = parsed;
  if (tag && control.tag !== tag) return false;
  if (id && control.attributes.id !== id) return false;
  if (attribute) {
    if (!(attribute in control.attributes)) return false;
    if (value !== undefined && control.attributes[attribute] !== value) return false;
  }
  return true;
}

/** Controls in the markup that no descriptor, group cover or stated exemption accounts for. */
export function uncoveredControls(html, inventory) {
  const selectors = [
    ...inventory.descriptors.flatMap(row => [row.selector, ...(row.covers || [])]),
    ...inventory.exemptions.map(row => row.selector)
  ];
  return extractControls(html).filter(control => !selectors.some(selector => selectorMatches(control, selector)));
}

/** Descriptor and exemption selectors that match no control in the markup (static, non-runtime rows only). */
export function unmatchedSelectors(html, inventory) {
  const controls = extractControls(html), found = [];
  for (const row of [...inventory.descriptors.filter(row => !row.runtime), ...inventory.exemptions]) {
    if (row.group) continue;
    if (!controls.some(control => selectorMatches(control, row.selector))) found.push(row.selector);
  }
  return found;
}
