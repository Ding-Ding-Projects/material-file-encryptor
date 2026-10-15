// Reduced motion inside Material Web shadow roots.
//
// A page stylesheet cannot reach the shadow roots of Material Web components (md-ripple, md-outlined-field, md-switch,
// md-slider, md-elevation and the rest), so their state-layer, label, handle and elevation transitions keep running when
// the visitor asks for reduced motion. Material Web exposes no custom property for those durations, so this module
// adopts one small stylesheet into the shadow root of every md-* element while reduced motion is in force, and removes
// it again when reduced motion is turned off.
//
// Reduced motion is in force when any of these holds:
//   * the prefers-reduced-motion: reduce media query matches;
//   * the document element carries data-motion="reduced" (the in-app Motion setting);
//   * the document element carries data-low-stimulation="true" (the in-app attention setting).
//
// Animations that Material Web starts through the Web Animations API (the press ripple, the floating field label) are
// not styled by CSS at all, so finite animations that run inside those shadow roots are finished immediately after the
// interaction that started them.

export const REDUCED_MOTION_CSS = ':host,*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';

const installed = new WeakMap();

/** True when the media query, the in-app Motion setting or the in-app attention setting asks for reduced motion. */
export function reducedMotionRequested(doc = globalThis.document) {
  const view = doc?.defaultView;
  const root = doc?.documentElement;
  if (root?.dataset?.motion === 'reduced' || root?.dataset?.lowStimulation === 'true') return true;
  try { return view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
}

const isMaterialHost = element => typeof element?.localName === 'string' && element.localName.startsWith('md-');

/**
 * Keeps the reduced-motion stylesheet adopted into every md-* shadow root while reduced motion is requested.
 * Returns a controller with refresh(), active() and dispose(). Calling it again for the same document returns the
 * existing controller, so every entry point may call it without coordinating.
 */
export function installShadowReducedMotion(doc = globalThis.document) {
  if (!doc?.documentElement || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in ShadowRoot.prototype)) return null;
  if (installed.has(doc)) return installed.get(doc);
  const view = doc.defaultView;
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(REDUCED_MOTION_CSS);
  const observed = new WeakSet();
  const pending = new Set();
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let scheduled = false;
  let disposed = false;

  const adopt = shadow => {
    if (!shadow.adoptedStyleSheets.includes(sheet)) shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  };
  const release = shadow => {
    if (shadow.adoptedStyleSheets.includes(sheet)) shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter(item => item !== sheet);
  };
  const watch = root => {
    if (observed.has(root) || !view.MutationObserver) return;
    observed.add(root);
    new view.MutationObserver(schedule).observe(root, {childList: true, subtree: true});
  };
  const walk = (root, reduced) => {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
        if (isMaterialHost(element)) reduced ? adopt(element.shadowRoot) : release(element.shadowRoot);
        watch(element.shadowRoot);
        walk(element.shadowRoot, reduced);
      } else if (isMaterialHost(element) && !view.customElements.get(element.localName) && !pending.has(element.localName)) {
        // The element is not upgraded yet, so it has no shadow root. Refresh once its definition arrives.
        pending.add(element.localName);
        view.customElements.whenDefined(element.localName).then(() => { pending.delete(element.localName); schedule(); }, () => pending.delete(element.localName));
      }
    }
  };
  const refresh = () => {
    scheduled = false;
    if (disposed) return;
    const reduced = reducedMotionRequested(doc);
    walk(doc, reduced);
    if (reduced) finishShadowAnimations(doc);
  };
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    view.requestAnimationFrame ? view.requestAnimationFrame(refresh) : Promise.resolve().then(refresh);
  }

  const events = ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'focusin', 'input', 'change'];
  const interaction = () => { if (reducedMotionRequested(doc)) { schedule(); view.setTimeout(() => finishShadowAnimations(doc), 40); } };
  for (const name of events) doc.addEventListener(name, interaction, true);
  media?.addEventListener?.('change', refresh);
  watch(doc);
  const attributes = new view.MutationObserver(refresh);
  attributes.observe(doc.documentElement, {attributes: true, attributeFilter: ['data-motion', 'data-low-stimulation']});

  const controller = {
    sheet,
    refresh,
    active: () => reducedMotionRequested(doc),
    dispose() {
      disposed = true;
      for (const name of events) doc.removeEventListener(name, interaction, true);
      media?.removeEventListener?.('change', refresh);
      attributes.disconnect();
      walk(doc, false);
      installed.delete(doc);
    }
  };
  installed.set(doc, controller);
  refresh();
  return controller;
}

/** Finishes finite Web Animations that run inside md-* shadow roots. Infinite animations are left to the stylesheet. */
export function finishShadowAnimations(doc = globalThis.document) {
  // Document.getAnimations() does not report animations whose target lives in a shadow tree, so ask each md-* root.
  const roots = [];
  const collect = parent => {
    for (const element of parent.querySelectorAll('*')) {
      if (!element.shadowRoot) continue;
      if (isMaterialHost(element)) roots.push(element.shadowRoot);
      collect(element.shadowRoot);
    }
  };
  collect(doc);
  let finished = 0;
  for (const root of roots) {
    for (const animation of root.getAnimations?.() || []) {
      if (animation.playState !== 'running') continue;
      const timing = animation.effect?.getComputedTiming?.();
      if (!timing || !Number.isFinite(timing.endTime)) continue;
      try { animation.finish(); finished++; } catch { /* an animation that cannot finish is already settled */ }
    }
  }
  return finished;
}
