/**
 * A disclosure section for search bars, filter rows and statistics panels.
 *
 * - The toggle is a Material text button, so it is reachable by keyboard and carries the shared focus ring.
 * - It announces its state through aria-expanded and names the region it controls.
 * - The open or closed choice is remembered in local storage under mfe.collapse.<id>.
 * - While the section is closed, `setActive(text)` keeps a visible line that says a filter is still excluding
 *   results, so a collapsed row never hides the reason that rows are missing.
 */
export const COLLAPSE_COPY = Object.freeze({
  'Search and filters': '搜尋同篩選',
  'Statistics': '統計',
  'Filter active': '篩選緊',
  'Entries': '項目',
  'Shown': '顯示緊',
  'Total size': '總大小',
  'Available': '可用',
  'Unavailable': '不可用',
  'Filters': '篩選',
  'Categories': '類別',
  'Dated entries': '有日期嘅項目',
  'No filter is active': '冇啟用篩選'
});

const storageKey = id => `mfe.collapse.${id}`;

function readOpen(storage, id, fallback) {
  try {
    const saved = storage?.getItem(storageKey(id));
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
  } catch { /* unreadable storage keeps the default */ }
  return fallback;
}

/**
 * @param {object} options
 * @param {Document} options.doc          document used to create the elements
 * @param {string} options.id             stable identity, also the storage key suffix
 * @param {string} options.title          already translated heading
 * @param {Storage} [options.storage]     local storage or a stand-in
 * @param {boolean} [options.open=true]   default state when nothing is stored; statistics pass false
 * @param {Element[]} [options.children]  nodes moved into the body
 */
export function createCollapsibleSection({doc = globalThis.document, id, title, storage, open = true, children = [], tag = 'md-text-button'} = {}) {
  if (!doc || typeof id !== 'string' || !id) throw Error('A collapsible section needs a document and an id.');
  const root = doc.createElement('section');
  root.setAttribute('class', 'collapsible-section');
  root.setAttribute('data-collapsible', id);
  const bodyId = `collapse-body-${id}`;
  const toggle = doc.createElement(tag);
  toggle.setAttribute('type', 'button');
  toggle.setAttribute('aria-controls', bodyId);
  toggle.setAttribute('class', 'collapsible-toggle');
  toggle.textContent = title;
  const active = doc.createElement('span');
  active.setAttribute('class', 'collapsible-active');
  active.setAttribute('role', 'status');
  active.setAttribute('aria-live', 'polite');
  active.hidden = true;
  const body = doc.createElement('div');
  body.setAttribute('id', bodyId);
  body.setAttribute('class', 'collapsible-body');
  if (children.length) body.append(...children);
  root.append(toggle, active, body);
  let expanded = readOpen(storage, id, open), activeText = '', destroyed = false;
  const paint = () => {
    toggle.setAttribute('aria-expanded', String(expanded));
    body.hidden = !expanded;
    // The disclosure is shown only while the section is closed: that is when a filter could be excluding results unseen.
    active.hidden = expanded || !activeText;
    active.textContent = expanded ? '' : activeText;
  };
  const setOpen = value => {
    if (destroyed) return expanded;
    expanded = value === true;
    try { storage?.setItem(storageKey(id), expanded ? 'open' : 'closed'); } catch { /* the choice just is not remembered */ }
    paint();
    return expanded;
  };
  const onClick = () => setOpen(!expanded);
  toggle.addEventListener('click', onClick);
  paint();
  return {
    root, toggle, body, active,
    get open() { return expanded; },
    setOpen,
    /** Empty text means no filter is excluding anything. */
    setActive(text) { activeText = typeof text === 'string' ? text : ''; paint(); },
    setTitle(text) { toggle.textContent = text; },
    destroy() { destroyed = true; toggle.removeEventListener('click', onClick); root.remove(); }
  };
}

/** Builds the rows of a statistics panel body: a definition list of label and value pairs. */
export function renderStatistics(doc, container, rows) {
  const list = doc.createElement('dl');
  list.setAttribute('class', 'collapsible-statistics');
  for (const [label, value] of rows) {
    const term = doc.createElement('dt');
    term.textContent = label;
    const detail = doc.createElement('dd');
    detail.textContent = String(value);
    list.append(term, detail);
  }
  container.replaceChildren(list);
  return list;
}

/** One sentence naming a filter that is excluding rows, or an empty string when everything is shown. */
export function activeFilterText(label, shown, total) {
  return total > shown ? `${label}: ${shown} / ${total}` : '';
}
