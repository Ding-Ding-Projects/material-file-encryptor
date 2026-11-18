import {mountControlGuidance, assertGuidanceCoverage} from './control-guidance.js';
import {assertPracticeCoverage} from './guidance-playground.js';

/**
 * Mounts every registered information icon of one surface inventory.
 *
 * Each icon is the compact Material info button that mountControlGuidance
 * places immediately before its own target. The icon opens a contextual
 * explanation, guided steps and an isolated sample. Nothing here starts the
 * real operation, reads a live value or copies private data: the guided
 * flow ends by moving focus to the original control, which the person then
 * operates themselves.
 *
 * The result reports what was mounted, what has no target on this page and
 * what failed, so a missing target is visible instead of silently skipped.
 */
export function mountInfoIcons(root, {inventory, t = value => value, query = (scope, selector) => scope.querySelector(selector), registerHelp, registerCommands, openHelp, onOpen, onClose, pair = false, presentation = 'icon'} = {}) {
  const hint = presentation === 'hint';
  if (!inventory?.descriptors) throw Error('An information icon inventory is required.');
  const mounted = [], missing = [], errors = [], modules = [], wrappers = [];
  for (const descriptor of inventory.descriptors) {
    const target = query(root, descriptor.selector);
    if (!target) { missing.push(descriptor.id); continue; }
    const existing = hint ? target.nextElementSibling : target.previousElementSibling;
    if (existing?.dataset?.guidanceId === descriptor.id) { mounted.push(descriptor.id); continue; }
    try {
      if (pair && !hint && !descriptor.noPair) { const wrapper = pairWithTarget(target, pair); if (wrapper) wrappers.push({wrapper, target}); }
      const module = mountControlGuidance(target, {descriptor, t, registerHelp, registerCommands, openHelp, onOpen, onClose, presentation});
      module.host.setAttribute?.('data-info-icon', descriptor.surface);
      modules.push(module); mounted.push(descriptor.id);
    } catch (error) { errors.push({id: descriptor.id, message: String(error?.message || error)}); }
  }
  return {
    mounted, missing, errors, modules,
    destroy() {
      for (const module of modules.splice(0)) module.destroy();
      for (const {wrapper, target} of wrappers.splice(0)) unpair(wrapper, target);
    }
  };
}

/**
 * In a wrapping flex row an icon and its control can be split across two lines, which leaves the icon looking like it
 * belongs to its neighbour. Keeping the pair in one small inline wrapper makes them wrap together. The wrapper is only
 * created where the target sits in a flex container that wraps, and never inside a container the caller lists in
 * `skipParents` (containers whose own styles address their children directly).
 */
function pairWithTarget(target, options) {
  const view = target.ownerDocument?.defaultView, parent = target.parentNode;
  if (typeof view?.getComputedStyle !== 'function' || !parent || parent.nodeType !== 1) return null;
  const skip = typeof options === 'object' && options.skipParents;
  if (skip && parent.matches?.(skip)) return null;
  const style = view.getComputedStyle(parent);
  if (!/flex/.test(style.display) || style.flexWrap === 'nowrap') return null;
  const wrapper = target.ownerDocument.createElement('span');
  wrapper.setAttribute('data-info-icon-pair', '');
  parent.insertBefore(wrapper, target);
  wrapper.append(target);
  return wrapper;
}
function unpair(wrapper, target) {
  if (target.parentNode === wrapper && wrapper.parentNode) wrapper.parentNode.insertBefore(target, wrapper);
  wrapper.remove();
}

/** Throws when the registered inventory omits a required control or repeats filler. */
export function assertInventory(required, inventory) {
  assertGuidanceCoverage(required, inventory.descriptors);
  assertPracticeCoverage(required.map(row => row.id), inventory.descriptors);
  return true;
}

const textOf = node => [node?.textContent || '', ...(node?.children ? [...node.children].map(textOf) : [])].join(' ');
function pressEscape(node) {
  const view = node.ownerDocument?.defaultView || globalThis;
  const Keyboard = view.KeyboardEvent || globalThis.KeyboardEvent;
  const event = Keyboard ? new Keyboard('keydown', {key: 'Escape', bubbles: true, cancelable: true}) : new Event('keydown', {bubbles: true, cancelable: true});
  if (event.key !== 'Escape') Object.defineProperty(event, 'key', {value: 'Escape'});
  node.dispatchEvent(event);
}

/**
 * Independent behavioural probe of one mounted icon. It opens the explanation,
 * checks its content, closes it with the keyboard and leaves the control as it
 * found it. Each problem carries a stable code, so a removed icon, a broken
 * target binding, a missing keyboard action and a missing contextual panel
 * are four different failures.
 */
export function probeInfoIcon(target, descriptor, {t = value => value, commands = []} = {}) {
  const problems = [];
  const host = target.previousElementSibling;
  if (!host || String(host.tagName).toLowerCase() !== 'mfe-control-guidance') return [{code: 'icon-missing', id: descriptor.id}];
  if (host.dataset?.guidanceId !== descriptor.id) problems.push({code: 'target-binding', id: descriptor.id});
  const shadow = host.shadowRoot, children = shadow ? [...shadow.children] : [];
  const entry = children.find(node => String(node.tagName).toLowerCase() === 'md-icon-button' && String(node.attributes?.['aria-label'] ?? node.getAttribute?.('aria-label') ?? '').includes(t(descriptor.label)));
  if (!entry) problems.push({code: 'icon-missing', id: descriptor.id});
  const panel = children.find(node => String(node.tagName).toLowerCase() === 'section');
  if (!panel) problems.push({code: 'contextual-panel', id: descriptor.id});
  if (!entry || !panel) return problems;
  try {
    if (panel.hidden === false) entry.click();
    entry.click();
    const body = textOf(panel);
    if (panel.hidden !== false || host.dataset?.open !== 'true' || !body.includes(t(descriptor.label)) || !body.includes(t(descriptor.purpose))) problems.push({code: 'contextual-panel', id: descriptor.id});
    pressEscape(shadow);
    if (panel.hidden !== true) problems.push({code: 'keyboard-action', id: descriptor.id});
  } finally {
    if (panel.hidden === false) entry.click();
  }
  const owned = new Set((commands || []).map(command => command.id));
  if (!owned.has(`guidance:${descriptor.id}`) || !owned.has(`explanation:${descriptor.id}`)) problems.push({code: 'keyboard-action', id: descriptor.id});
  return problems;
}

/** Probes every descriptor of an inventory against the mounted document and returns the problems found. */
export function probeInfoIcons(root, {inventory, query = (scope, selector) => scope.querySelector(selector), t = value => value, commands = []} = {}) {
  const problems = [];
  for (const descriptor of inventory.descriptors) {
    const target = query(root, descriptor.selector);
    if (!target) { problems.push({code: 'target-missing', id: descriptor.id}); continue; }
    problems.push(...probeInfoIcon(target, descriptor, {t, commands}));
  }
  return problems;
}

/**
 * Independent behavioural probe of one control in hint presentation, where no information icon is drawn.
 * The help must be reachable from the control itself: its accessible description and tooltip text carry the
 * explanation, the inline help-mode text exists beside it, the full explanation opens from the keyboard command and
 * closes with Escape. Each problem carries a stable code.
 */
export function probeHelpHint(target, descriptor, {t = value => value, commands = [], lookup} = {}) {
  const problems = [];
  const host = target.nextElementSibling;
  if (!host || String(host.tagName).toLowerCase() !== 'mfe-control-guidance' || host.dataset?.presentation !== 'hint') return [{code: 'help-missing', id: descriptor.id}];
  if (host.dataset?.guidanceId !== descriptor.id) problems.push({code: 'target-binding', id: descriptor.id});
  const purpose = t(descriptor.purpose), label = t(descriptor.label);
  const tooltip = String(target.getAttribute?.('data-help-text') ?? '');
  if (!tooltip.includes(purpose) || !tooltip.includes(label)) problems.push({code: 'tooltip-text', id: descriptor.id});
  const described = String(target.getAttribute?.('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  const inline = (host.children || []).find(node => node.classList?.contains?.('control-help-text') || node.attributes?.class === 'control-help-text' || node.className === 'control-help-text');
  const findText = id => (typeof lookup === 'function' ? lookup(id) : null) || (inline && (inline.id === id || inline.attributes?.id === id) ? inline : null);
  const descriptions = described.map(findText).filter(Boolean);
  if (!descriptions.some(node => textOf(node).includes(purpose))) problems.push({code: 'accessible-description', id: descriptor.id});
  if (!inline || !textOf(inline).includes(purpose)) problems.push({code: 'help-mode-text', id: descriptor.id});
  const panel = (host.shadowRoot?.children || []).find(node => String(node.tagName).toLowerCase() === 'section');
  if (!panel) problems.push({code: 'contextual-panel', id: descriptor.id});
  const owned = new Map((commands || []).map(command => [command.id, command]));
  const explain = owned.get(`explanation:${descriptor.id}`);
  if (!owned.has(`guidance:${descriptor.id}`) || !explain) problems.push({code: 'keyboard-action', id: descriptor.id});
  if (!panel || !explain) return problems;
  try {
    explain.run();
    const body = textOf(panel);
    if (panel.hidden !== false || !body.includes(label) || !body.includes(purpose)) problems.push({code: 'contextual-panel', id: descriptor.id});
    pressEscape(host.shadowRoot);
    if (panel.hidden !== true) problems.push({code: 'keyboard-action', id: descriptor.id});
  } finally {
    if (panel.hidden === false) pressEscape(host.shadowRoot);
  }
  return problems;
}

/** Probes every descriptor of an inventory in hint presentation and returns the problems found. */
export function probeHelpHints(root, {inventory, query = (scope, selector) => scope.querySelector(selector), t = value => value, commands = [], lookup} = {}) {
  const problems = [];
  for (const descriptor of inventory.descriptors) {
    const target = query(root, descriptor.selector);
    if (!target) { problems.push({code: 'target-missing', id: descriptor.id}); continue; }
    problems.push(...probeHelpHint(target, descriptor, {t, commands, lookup}));
  }
  return problems;
}
