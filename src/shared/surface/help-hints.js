/**
 * Help without information icons.
 *
 * Every control that has guidance carries its help text in `data-help-text` and in its accessible description
 * (see the hint presentation of mountControlGuidance). This module shows that same text:
 *   - as one shared tooltip when the pointer rests on the control or keyboard focus reaches it;
 *   - inline under every control while help mode is on (the ? button in the title bar).
 * Nothing here reads a live value or starts an operation; it only displays text the control already declares.
 */
const STORAGE_KEY = 'mfe.helpMode.v1';
const HOVER_DELAY = 450;

/** The nearest element on the event path that declares help text, crossing shadow roots. */
export function helpTargetFromPath(path) {
  for (const node of path || []) {
    if (node && node.nodeType === 1 && typeof node.getAttribute === 'function' && node.getAttribute('data-help-text')) return node;
  }
  return null;
}

/** Where the tooltip goes: below the control when it fits, otherwise above, always inside the viewport. */
export function tooltipPosition(rect, size, viewport, gap = 6) {
  const width = Math.min(size.width, viewport.width - 16);
  let left = Math.round(rect.left + rect.width / 2 - width / 2);
  left = Math.max(8, Math.min(left, viewport.width - width - 8));
  let top = Math.round(rect.bottom + gap);
  if (top + size.height > viewport.height - 8) top = Math.max(8, Math.round(rect.top - gap - size.height));
  return {left, top, width};
}

export function installHelpTooltip(doc = document, {delay = HOVER_DELAY} = {}) {
  const win = doc.defaultView;
  const tip = doc.createElement('div');
  tip.className = 'help-tooltip';
  tip.setAttribute('role', 'tooltip');
  // The control already announces this text through aria-describedby, so the visual copy is not read twice.
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  doc.body.append(tip);
  let current = null, timer = null, keyboard = false;
  const hide = () => { win.clearTimeout(timer); timer = null; current = null; tip.hidden = true; tip.classList.remove('visible'); };
  const show = target => {
    if (!target?.isConnected) return hide();
    if (doc.documentElement.dataset.helpMode === 'on') return hide();
    const text = target.getAttribute('data-help-text');
    if (!text) return hide();
    current = target;
    tip.textContent = text;
    tip.hidden = false;
    const rect = target.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const place = tooltipPosition(rect, {width: Math.min(320, box.width || 320), height: box.height || 40}, {width: win.innerWidth, height: win.innerHeight});
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
    tip.style.maxWidth = `${place.width}px`;
    tip.classList.add('visible');
  };
  const schedule = (target, wait) => {
    win.clearTimeout(timer);
    if (!target) { hide(); return; }
    if (target === current && !tip.hidden) return;
    timer = win.setTimeout(() => show(target), wait);
  };
  const onPointer = event => schedule(helpTargetFromPath(event.composedPath?.()), delay);
  const onPointerOut = event => { if (!event.relatedTarget || !current?.contains?.(event.relatedTarget)) { if (helpTargetFromPath(event.composedPath?.()) === current) hide(); } };
  const onKey = event => { keyboard = true; if (event.key === 'Escape' && !tip.hidden) hide(); };
  const onPointerDown = () => { keyboard = false; hide(); };
  const onFocus = event => { if (!keyboard) return; schedule(helpTargetFromPath(event.composedPath?.()), 0); };
  const onFocusOut = () => hide();
  doc.addEventListener('pointerover', onPointer, true);
  doc.addEventListener('pointerout', onPointerOut, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('focusout', onFocusOut, true);
  win.addEventListener('scroll', hide, true);
  return {
    element: tip, show, hide,
    destroy() {
      hide();
      doc.removeEventListener('pointerover', onPointer, true);
      doc.removeEventListener('pointerout', onPointerOut, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('focusin', onFocus, true);
      doc.removeEventListener('focusout', onFocusOut, true);
      win.removeEventListener('scroll', hide, true);
      tip.remove();
    }
  };
}

/** Help mode: when on, every control shows its help text inline under it. The choice is remembered on this PC. */
export function createHelpMode({doc = document, storage, onChange = () => {}} = {}) {
  let on = false;
  try { on = storage?.getItem(STORAGE_KEY) === 'on'; } catch { on = false; }
  const apply = () => { doc.documentElement.dataset.helpMode = on ? 'on' : 'off'; onChange(on); };
  apply();
  return {
    get on() { return on; },
    set(value) { on = value === true; try { storage?.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* the choice still applies for this session */ } apply(); return on; },
    toggle() { return this.set(!on); }
  };
}
