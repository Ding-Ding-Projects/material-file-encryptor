// Drop a personal wording file anywhere on the window to apply it, and celebrate when it applies.
//
// This module is deliberately free of product wording and of global state: the page supplies the document,
// the timers, the localized text and the function that validates and stores a file. The same file is shipped
// unchanged to the desktop renderer and the browser extension pages (a test keeps the two copies identical).
//
// Behaviour contract:
//   * only a drag that carries files is handled; any other drag is ignored;
//   * a drop on a text field is left to the browser, the field keeps its normal text-drop behaviour;
//   * exactly one .json file within the size limit is accepted, anything else is refused with no change;
//   * the celebration never takes focus, never receives pointer events and shows only the supplied headline.

export const CELEBRATION = Object.freeze({ enterMs: 400, holdMs: 3000, exitMs: 300 });
export const MAX_DISPLAY_NAME = 40;

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'MD-OUTLINED-TEXT-FIELD', 'MD-FILLED-TEXT-FIELD', 'MD-SEARCH-FIELD']);
const NON_TEXT_INPUTS = new Set(['file', 'button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'image', 'color']);

/** True when the drag carries files, as opposed to text, links or in-page elements. */
export function dragCarriesFiles(event) {
  const types = event?.dataTransfer?.types;
  if (!types) return false;
  return Array.prototype.includes.call(types, 'Files');
}

function isTextNode(node) {
  if (!node || typeof node.tagName !== 'string') return false;
  if (node.isContentEditable === true) return true;
  if (node.tagName === 'INPUT') return !NON_TEXT_INPUTS.has(String(node.type || 'text').toLowerCase());
  return TEXT_TAGS.has(node.tagName);
}

/** True when the drop target is, or sits inside, a field that already takes text drops. */
export function isTextDropTarget(event) {
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target];
  return path.some(isTextNode);
}

/** Chooses the single dropped file, or says why it cannot be used. Never reads the file. */
export function pickDroppedFile(dataTransfer, maxBytes) {
  const files = dataTransfer?.files;
  if (!files || files.length !== 1) return { error: 'count' };
  const file = files[0];
  if (typeof file?.name !== 'string' || !/\.json$/i.test(file.name)) return { error: 'type' };
  if (!Number.isFinite(file.size) || file.size > maxBytes) return { error: 'size' };
  return { file };
}

/** A headline from the imported file: plain text, bounded, or nothing at all. */
export function headlineFrom(name) {
  if (typeof name !== 'string') return '';
  const text = name.trim();
  return text && [...text].length <= MAX_DISPLAY_NAME ? text : '';
}

/**
 * The full-window celebration. `show(name)` animates the headline in, holds it, animates it out and removes it.
 * Phases are exposed as data-phase so the stylesheet owns the motion; timers only move between phases.
 */
export function createCelebration({ doc, neutral, reducedMotion = () => false, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let root = null, timers = [];
  const stop = () => { for (const id of timers) clearTimer(id); timers = []; root?.remove(); root = null; };
  const phase = value => { if (root) root.dataset.phase = value; };
  const later = (fn, ms) => { timers.push(setTimer(fn, ms)); };
  return {
    show(name) {
      stop();
      const headline = headlineFrom(name) || (typeof neutral === 'function' ? neutral() : String(neutral));
      root = doc.createElement('div');
      root.className = 'wording-celebration';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      const reduced = reducedMotion() === true;
      root.dataset.reduced = String(reduced);
      root.dataset.phase = reduced ? 'hold' : 'in';
      doc.body.append(root);
      // The live region is attached first and filled afterwards so assistive technology announces the headline.
      const text = doc.createElement('p');
      text.className = 'wording-celebration__headline';
      text.textContent = headline;
      root.append(text);
      if (reduced) { later(stop, CELEBRATION.holdMs); return; }
      later(() => phase('hold'), CELEBRATION.enterMs);
      later(() => phase('out'), CELEBRATION.enterMs + CELEBRATION.holdMs);
      later(stop, CELEBRATION.enterMs + CELEBRATION.holdMs + CELEBRATION.exitMs);
    },
    dismiss: stop,
    get active() { return root !== null; },
  };
}

/** A short non-blocking notice for pages with no toast of their own. It never takes focus. */
export function createNotice({ doc, ms = 5000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let node = null, timer = null;
  const dismiss = () => { clearTimer(timer); node?.remove(); node = null; };
  return {
    show(text) {
      dismiss();
      node = doc.createElement('p');
      node.className = 'wording-notice';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      doc.body.append(node);
      node.textContent = text;
      timer = setTimer(dismiss, ms);
    },
    dismiss,
  };
}

/**
 * Installs the window-wide drop handling.
 *   apply(text)  validates and stores the file, returning { name } to celebrate, or throwing to refuse;
 *   refuse(code, error)  tells the user nothing changed; code is count, type, size, unreadable or invalid;
 *   overlayText()  the localized drop-target label.
 * Returns { dispose, celebration }.
 */
export function installWordingDrop({ doc, win = doc.defaultView, maxBytes, apply, refuse, overlayText, celebration, readFile = file => file.text() }) {
  const overlay = doc.createElement('div');
  overlay.className = 'wording-drop-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.active = 'false';
  const card = doc.createElement('div');
  card.className = 'wording-drop-overlay__card';
  const label = doc.createElement('p');
  card.append(label);
  overlay.append(card);
  doc.body.append(overlay);
  let latest = 0;

  const show = () => { if (overlay.dataset.active === 'true') return; label.textContent = overlayText(); overlay.dataset.active = 'true'; };
  const hide = () => { overlay.dataset.active = 'false'; };

  const onDragOver = event => {
    if (!dragCarriesFiles(event)) return;
    if (isTextDropTarget(event)) { hide(); return; }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    show();
  };
  const onDragEnter = onDragOver;
  const onDragLeave = event => { if (!event.relatedTarget) hide(); };
  const onDrop = async event => {
    hide();
    if (!dragCarriesFiles(event) || isTextDropTarget(event)) return;
    event.preventDefault();
    const ticket = ++latest;
    const picked = pickDroppedFile(event.dataTransfer, maxBytes);
    if (picked.error) { refuse(picked.error); return; }
    let text;
    try { text = await readFile(picked.file); } catch (error) { if (ticket === latest) refuse('unreadable', error); return; }
    if (ticket !== latest) return;
    let result;
    try { result = await apply(String(text)); } catch (error) { if (ticket === latest) refuse('invalid', error); return; }
    if (ticket === latest && result) celebration.show(result.name);
  };

  const target = win || doc;
  const events = [['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop], ['dragend', hide]];
  for (const [name, handler] of events) target.addEventListener(name, handler);
  return {
    celebration,
    overlay,
    dispose() { for (const [name, handler] of events) target.removeEventListener(name, handler); overlay.remove(); celebration.dismiss(); },
  };
}
