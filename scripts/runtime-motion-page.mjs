// Page-side half of the runtime Material and motion audit.
//
// Everything in this file runs inside the page under test (it is serialized with Function.prototype.toString and
// evaluated through the DevTools protocol, or evaluated by the unit test over a static fixture), so each function
// is self-contained: it may use only browser globals and its own arguments.
//
// pageAudit(options) walks every element, including open shadow roots, and returns:
//   counts   how many elements fell in each class
//   findings elements that are not a Material control, not allowlisted, or have no motion
//   leaks    (reduced-motion mode only) elements whose transitions or animations are still running
//
// Findings carry a selector path, a kind and a reason, plus a label of at most 32 characters. No other page text
// is returned, so a receipt can be committed without copying page content.

export function pageAudit(options = {}) {
  const mode = options.mode === 'reduced' ? 'reduced' : 'normal';
  const allowlist = Array.isArray(options.allowlist) ? options.allowlist : [];
  const NEAR_ZERO = 0.011; // seconds: 0.01ms overrides and 1ms resets both qualify as removed
  const INTERACTIVE_SELECTOR = [
    'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=tab]', '[role=menuitem]', '[role=option]', '[role=switch]', '[role=checkbox]', '[role=radio]', '[role=slider]',
    '[role=link]', '[role=combobox]', '[role=textbox]', '[role=menuitemcheckbox]', '[role=menuitemradio]',
    '[tabindex]', '[contenteditable=""]', '[contenteditable=true]'
  ].join(',');
  // md-* elements that are containers, decoration or indicators rather than controls.
  const MATERIAL_NON_CONTROL = new Set(['md-icon', 'md-divider', 'md-elevation', 'md-ripple', 'md-focus-ring', 'md-list', 'md-menu', 'md-dialog', 'md-tabs', 'md-circular-progress', 'md-linear-progress', 'md-chip-set', 'md-segmented-button-set', 'md-navigation-bar', 'md-badge']);

  const seconds = value => {
    const parts = String(value || '0s').split(',').map(part => part.trim());
    return parts.map(part => (part.endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part) || 0));
  };
  const longest = value => Math.max(0, ...seconds(value));
  const motionOf = style => {
    const transition = style.transitionProperty !== 'none' ? longest(style.transitionDuration) : 0;
    const animation = style.animationName !== 'none' ? Math.max(0, ...seconds(style.animationDuration).map((duration, index) => (duration > 0 ? duration : 0))) : 0;
    return { transition, animation };
  };

  const walk = (root, visit) => {
    for (const element of root.querySelectorAll('*')) {
      visit(element);
      if (element.shadowRoot) walk(element.shadowRoot, visit);
    }
  };
  const all = [];
  walk(document, element => all.push(element));

  const parentOf = node => node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  const hostChain = element => { const chain = []; for (let root = element.getRootNode(); root && root.host; root = root.host.getRootNode()) chain.push(root.host); return chain; };
  const isVisible = element => {
    for (let node = element; node; node = parentOf(node)) {
      if (node.hidden || node.inert) return false;
      if (getComputedStyle(node).display === 'none') return false;
    }
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const segment = element => {
    const tag = element.localName;
    if (element.id && /^[A-Za-z][\w-]{0,40}$/.test(element.id)) return `${tag}#${element.id}`;
    const siblings = element.parentElement ? [...element.parentElement.children].filter(sibling => sibling.localName === tag) : [element];
    const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/).find(name => /^[A-Za-z][\w-]{0,30}$/.test(name)) : '';
    return `${tag}${className ? '.' + className : ''}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : ''}`;
  };
  const pathOf = element => {
    const parts = [];
    for (let node = element; node; ) {
      parts.unshift(segment(node));
      if (node.parentElement && node.parentElement.localName !== 'html') node = node.parentElement;
      else if (!node.parentElement && node.getRootNode().host) { parts.unshift('>>'); node = node.getRootNode().host; }
      else break;
    }
    return parts.slice(-7).join(' ').replace(/ >> /g, ' >> ');
  };
  const labelOf = element => clean(element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('label') || element.textContent);

  // Looks for motion on the element, its pseudo-elements and its descendants (light and shadow): the state layer or
  // ripple of a control is usually a descendant or a pseudo-element, not the host itself.
  const motionEvidence = element => {
    const own = [element.localName === 'html' ? null : element].filter(Boolean);
    const probe = target => {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(target, pseudo);
        const { transition, animation } = motionOf(style);
        if (transition > 0) return 'transition';
        if (animation > 0) return 'animation';
      }
      return '';
    };
    const direct = own.map(probe).find(Boolean);
    if (direct) return direct;
    let budget = 400;
    const scan = root => {
      for (const child of root.querySelectorAll('*')) {
        if (budget-- <= 0) return '';
        const name = child.localName;
        if (name === 'md-ripple' || name === 'md-focus-ring' || /(^|[\s-])(ripple|state-layer)([\s-]|$)/.test(String(child.className || ''))) return 'ripple';
        const found = probe(child);
        if (found) return found;
        if (child.shadowRoot) { const inner = scan(child.shadowRoot); if (inner) return inner; }
      }
      return '';
    };
    if (element.shadowRoot) { const inner = scan(element.shadowRoot); if (inner) return inner; }
    return scan(element) || '';
  };

  const allowlisted = element => allowlist.find(entry => { try { const host = element.getRootNode().host; return element.matches(entry.selector) && (!entry.host || Boolean(host && host.matches(entry.host))); } catch { return false; } });
  const counts = { examined: all.length, interactive: 0, byClass: {} };
  const bump = key => { counts.byClass[key] = (counts.byClass[key] || 0) + 1; };
  const findings = [];
  const seen = new Set();
  const report = (element, kind, reason, extra = {}) => {
    const path = pathOf(element);
    const key = `${path}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ path, kind, reason, label: labelOf(element), ...extra });
  };

  if (mode === 'reduced') {
    // Reduced motion: no visible element may keep a transition or animation of any real length.
    const leaks = [];
    const libraryTags = new Map();
    for (const element of all) {
      if (!isVisible(element)) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const { transition, animation } = motionOf(style);
        const worst = Math.max(transition, animation);
        if (worst <= NEAR_ZERO) continue;
        const chain = hostChain(element);
        const materialHost = chain.find(host => host.localName.startsWith('md-'));
        const record = { path: pathOf(element) + (pseudo || ''), kind: animation > NEAR_ZERO ? 'animation' : 'transition', seconds: Number(worst.toFixed(3)) };
        if (materialHost) { const tag = materialHost.localName; libraryTags.set(tag, (libraryTags.get(tag) || 0) + 1); continue; }
        leaks.push(record);
      }
    }
    const running = document.getAnimations().filter(animation => {
      const timing = animation.effect && animation.effect.getTiming ? animation.effect.getTiming() : null;
      return timing && typeof timing.duration === 'number' && timing.duration > NEAR_ZERO * 1000 && animation.playState === 'running';
    }).length;
    return { mode, counts: { examined: all.length }, leaks: leaks.slice(0, 200), leakTotal: leaks.length, libraryInternal: Object.fromEntries([...libraryTags.entries()].sort()), runningAnimations: running };
  }

  for (const element of all) {
    if (!element.matches(INTERACTIVE_SELECTOR) && !(element.localName.startsWith('md-') && !MATERIAL_NON_CONTROL.has(element.localName))) continue;
    if (!isVisible(element)) continue;
    const tag = element.localName;
    const chain = hostChain(element);
    // Native parts that live inside a Material component's own shadow root are the component's implementation.
    if (chain.some(host => host.localName.startsWith('md-'))) { bump('material-part'); continue; }
    if (tag.startsWith('md-')) {
      if (tag === 'md-list-item') { const type = element.type || element.getAttribute('type') || 'text'; if (type === 'text' && !element.hasAttribute('href')) continue; }
      counts.interactive++; bump('material');
      if (!motionEvidence(element)) report(element, 'material-without-motion', 'Material control with no transition, animation, ripple or state layer');
      continue;
    }
    if (tag.startsWith('mfe-')) { bump('project-composite'); continue; }
    // A tabindex on its own does not make a control: -1 marks a programmatic focus target, 0 a focus stop.
    const nativeInteractive = element.matches('button,a[href],input:not([type=hidden]),select,textarea,summary');
    // Only widget roles make a control. A tabindex on a log, region or status container is a focus stop.
    const role = (element.getAttribute('role') || '').split(/\s+/)[0];
    const widgetRole = /^(button|tab|menuitem|menuitemcheckbox|menuitemradio|option|switch|checkbox|radio|slider|link|combobox|textbox|searchbox|spinbutton)$/.test(role);
    if (!nativeInteractive && !widgetRole) { bump(element.getAttribute('tabindex') === '-1' ? 'focus-target' : 'focus-stop'); continue; }
    counts.interactive++;
    const entry = allowlisted(element);
    const motion = motionEvidence(element);
    if (entry) {
      bump('allowlisted-native');
      if (!motion && !entry.skipMotion) report(element, 'allowlisted-without-motion', `${entry.id}: allowlisted native element has no transition or state layer`);
      continue;
    }
    if (tag === 'a' || tag === 'summary') {
      bump(tag === 'a' ? 'hyperlink' : 'disclosure');
      if (!motion) report(element, tag === 'a' ? 'link-without-motion' : 'disclosure-without-motion', `${tag === 'a' ? 'Hyperlink' : 'Disclosure summary'} with no transition or animation`);
      continue;
    }
    if (['button', 'input', 'select', 'textarea'].includes(tag)) {
      bump('native-control');
      report(element, 'native-control', `Native ${tag} that is not a Material control and not allowlisted${motion ? '' : ', and has no transition'}`);
      continue;
    }
    bump('custom-role');
    report(element, 'custom-role-control', `Element with role ${role} is not a Material control${motion ? '' : ' and has no transition'}`);
  }
  return { mode, counts, findings };
}

// Watches for an enter animation while `trigger` runs. A surface counts as animated when, within the window, a
// running Web Animation, CSS animation or CSS transition targets it or something inside it (shadow trees included),
// or when its computed style (or a descendant's) declares a non-zero animation or transition duration.
export async function probeEnter(triggerSource, surfaceSelector, windowMs = 500) {
  const resolve = selector => {
    const parts = selector.split(' >>> ');
    let node = document;
    for (const part of parts) { node = (node.shadowRoot || node).querySelector(part); if (!node) return null; }
    return node;
  };
  const seconds = value => String(value || '0s').split(',').map(part => (part.trim().endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part) || 0));
  const inside = (surface, target) => {
    for (let node = target; node; node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null) if (node === surface) return true;
    return false;
  };
  const before = new Set(document.getAnimations());
  // eslint-disable-next-line no-new-func
  await new Function(triggerSource)();
  const seen = new Map();
  const started = performance.now();
  while (performance.now() - started < windowMs) {
    await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
    const surface = resolve(surfaceSelector);
    if (!surface) continue;
    for (const animation of document.getAnimations()) {
      const target = animation.effect && animation.effect.target;
      const timing = animation.effect && animation.effect.getTiming ? animation.effect.getTiming() : null;
      if (target && timing && timing.duration > 0 && inside(surface, target) && !seen.has(animation)) {
        seen.set(animation, animation.constructor.name === 'CSSAnimation' ? 'css-animation' : animation.constructor.name === 'CSSTransition' ? 'css-transition' : 'web-animation');
      }
    }
    if (seen.size) break;
  }
  const surface = resolve(surfaceSelector);
  if (!surface) return { found: false, via: 'surface-missing' };
  if (seen.size) return { found: true, via: [...new Set(seen.values())].join('+') };
  const probe = element => {
    const style = getComputedStyle(element);
    if (style.animationName !== 'none' && Math.max(...seconds(style.animationDuration)) > 0) return 'computed-animation';
    if (style.transitionProperty !== 'none' && Math.max(...seconds(style.transitionDuration)) > 0) return 'computed-transition';
    return '';
  };
  let via = probe(surface);
  if (!via) {
    let budget = 300;
    const scan = root => { for (const child of root.querySelectorAll('*')) { if (budget-- <= 0) return ''; const found = probe(child); if (found) return found; if (child.shadowRoot) { const inner = scan(child.shadowRoot); if (inner) return inner; } } return ''; };
    via = (surface.shadowRoot && scan(surface.shadowRoot)) || scan(surface);
  }
  return { found: Boolean(via), via: via || 'none', preExisting: before.size };
}

export const pageAuditSource = String(pageAudit);
export const probeEnterSource = String(probeEnter);
