// Full-window installation takeover. A success celebrates and closes by itself; a failure raises an alarm that stays
// until it is dismissed. Both show only real values: a row is omitted when its value is not known. The surface needs
// only a small DOM subset, so it is exercised by tests with a minimal document.
import {lastOutputLines, maskSecrets} from './mask-secrets.js';

export const SUCCESS_AUTO_DISMISS_MS = 6000;
export const TAKEOVER_STORAGE_KEY = 'mfe.install-takeover.v1';

/** Whether installation results use full-window takeovers or ordinary notifications. */
export function createTakeoverPreference({storage = globalThis.localStorage} = {}) {
  const read = () => {
    try { const value = JSON.parse(storage?.getItem(TAKEOVER_STORAGE_KEY) || 'null'); return value?.mode === 'notify' ? 'notify' : 'takeover'; } catch { return 'takeover'; }
  };
  return {
    get: read,
    set(mode) {
      if (mode !== 'takeover' && mode !== 'notify') throw new Error('Unknown installation result mode.');
      try { storage?.setItem(TAKEOVER_STORAGE_KEY, JSON.stringify({version: 1, mode})); } catch { /* the choice still applies for this session */ }
      return mode;
    }
  };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

export function createInstallationTakeover({
  doc = globalThis.document,
  translate = text => text,
  preference = createTakeoverPreference(),
  notify = () => {},
  playCue = () => {},
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = id => globalThis.clearTimeout(id),
  copyText = text => globalThis.navigator?.clipboard?.writeText(text)
} = {}) {
  const t = text => translate(text, {message: true});
  const queue = [];
  let current = null;
  let sequence = 0;

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function button(label, run, variant = 'outlined') {
    const node = el('button', `button ${variant}`, label);
    node.type = 'button';
    node.addEventListener('click', event => { event.stopPropagation?.(); run(); });
    return node;
  }

  function detailRows(rows) {
    const list = el('dl', 'install-takeover__facts');
    for (const [label, value] of rows) {
      if (value === undefined || value === null || value === '') continue;
      const row = el('div', 'install-takeover__fact');
      row.append(el('dt', '', t(label)), el('dd', '', String(value)));
      list.append(row);
    }
    return list;
  }

  function plainDetails(item) {
    return [
      `${t(item.kind === 'failure' ? 'Installation failed' : 'Installed')}: ${item.what}`,
      item.where ? `${t('Where')}: ${item.where}` : '',
      item.exitCode !== undefined && item.exitCode !== null ? `${t('Exit code')}: ${item.exitCode}` : '',
      item.durationText ? `${t('Duration')}: ${item.durationText}` : '',
      item.command ? `${t('Failing command')}: ${item.command}` : '',
      item.output.length ? `${t('Last output')}:\n${item.output.join('\n')}` : ''
    ].filter(Boolean).join('\n');
  }

  function close(reason) {
    if (!current) return false;
    const item = current;
    current = null;
    if (item.timer !== null) clearTimer(item.timer);
    doc.removeEventListener('keydown', item.onKey, true);
    item.root.remove();
    // Focus returns to whatever held it before the takeover opened, so keyboard work carries on where it stopped.
    if (item.returnFocus && item.returnFocus.isConnected !== false) item.returnFocus.focus?.();
    item.onClose?.(reason);
    const next = queue.shift();
    if (next) show(next);
    return true;
  }

  function show(item) {
    const failure = item.kind === 'failure';
    const root = el('div', `install-takeover install-takeover--${item.kind}`);
    root.dataset.kind = item.kind;
    root.dataset.takeover = String(++sequence);
    const card = el('section', 'install-takeover__card');
    const titleId = `install-takeover-title-${sequence}`;
    const bodyId = `install-takeover-body-${sequence}`;
    card.setAttribute('role', failure ? 'alertdialog' : 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);
    card.setAttribute('aria-describedby', bodyId);
    card.setAttribute('aria-label', t('Installation result'));

    const badge = el('div', 'install-takeover__badge');
    badge.setAttribute('aria-hidden', 'true');
    badge.append(el('span', 'install-takeover__ring'), el('span', 'install-takeover__glyph', failure ? '!' : '✓'));
    const title = el('h2', 'install-takeover__title', item.title);
    title.id = titleId;
    const body = el('div', 'install-takeover__body');
    body.id = bodyId;
    body.append(detailRows([
      ['What', item.what], ['Where', item.where],
      ['Exit code', item.exitCode], ['Duration', item.durationText]
    ]));
    if (failure && item.command) {
      body.append(el('p', 'install-takeover__label', t('Failing command')));
      const pre = el('pre', 'install-takeover__code', item.command);
      pre.tabIndex = 0;
      body.append(pre);
    }
    if (failure && item.output.length) {
      body.append(el('p', 'install-takeover__label', t('Last output')));
      const pre = el('pre', 'install-takeover__code', item.output.join('\n'));
      pre.tabIndex = 0;
      body.append(pre);
    }
    const hint = el('p', 'install-takeover__hint', t(failure ? 'This stays until you close it. Press Escape or choose Dismiss.' : 'Closes by itself in a few seconds. Click or press Escape to close now.'));

    const actions = el('div', 'install-takeover__actions');
    const status = el('p', 'install-takeover__copy-status');
    status.setAttribute('role', 'status');
    const controls = [];
    for (const action of item.recovery) {
      const node = button(action.label, async () => { try { await action.run(); } catch (error) { status.textContent = String(error?.message || error); } if (action.dismiss !== false) close('recovery'); }, 'tonal');
      controls.push(node);
    }
    if (failure) {
      controls.push(button(t('Copy details'), async () => {
        try { await copyText(plainDetails(item)); status.textContent = t('Details copied.'); } catch { status.textContent = t('Details could not be copied.'); }
      }));
    }
    const dismiss = button(t('Dismiss'), () => close('dismissed'), 'primary');
    dismiss.setAttribute('aria-label', t('Dismiss installation result'));
    controls.push(dismiss);
    actions.append(...controls);
    card.append(badge, title, body, hint, actions, status);
    root.append(card);

    // A success closes on any click. A failure ignores stray clicks on its backdrop, so it cannot be lost by accident.
    if (!failure) root.addEventListener('click', () => close('click'));

    const focusables = controls;
    item.onKey = event => {
      if (event.key === 'Escape') { event.preventDefault?.(); event.stopPropagation?.(); close('escape'); return; }
      if (event.key !== 'Tab' || !focusables.length) return;
      const index = focusables.indexOf(doc.activeElement);
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index === focusables.length - 1 ? 0 : index + 1);
      event.preventDefault?.();
      focusables[next].focus?.();
    };
    item.root = root;
    item.returnFocus = doc.activeElement;
    item.timer = null;
    current = item;
    doc.addEventListener('keydown', item.onKey, true);
    doc.body.append(root);
    dismiss.focus?.();
    playCue(failure ? 'failure' : 'success');
    if (!failure) {
      item.timer = setTimer(() => close('auto'), item.autoDismissMs ?? SUCCESS_AUTO_DISMISS_MS);
      // Reading or focusing the card pauses the countdown so a message is never taken away mid-read.
      const pause = () => { if (item.timer !== null) { clearTimer(item.timer); item.timer = null; } };
      card.addEventListener('pointerenter', pause);
      card.addEventListener('focusin', pause);
    }
    return item;
  }

  function normalize(kind, data) {
    const what = String(data?.what ?? '').trim();
    if (!what) throw new Error('An installation result needs the name of what was installed.');
    const exitCode = Number.isInteger(data.exitCode) ? data.exitCode : undefined;
    return {
      kind,
      what: maskSecrets(what),
      where: data.where ? maskSecrets(String(data.where)) : '',
      exitCode,
      durationText: formatDuration(data.durationMs),
      command: data.command ? maskSecrets(String(data.command)) : '',
      output: lastOutputLines(data.output),
      recovery: Array.isArray(data.recovery) ? data.recovery.filter(row => row && typeof row.label === 'string' && typeof row.run === 'function') : [],
      title: t(data.title || (kind === 'failure' ? 'Installation failed' : 'Installed')),
      reason: data.reason ? maskSecrets(String(data.reason)) : '',
      autoDismissMs: data.autoDismissMs,
      onClose: data.onClose
    };
  }

  function present(kind, data) {
    const item = normalize(kind, data);
    // The person may prefer ordinary notifications. The notification carries the same real values.
    if (preference.get() === 'notify') {
      const lines = [item.where, item.exitCode !== undefined ? `${t('Exit code')}: ${item.exitCode}` : '', item.durationText, item.reason, ...item.output.slice(-3)].filter(Boolean);
      notify({title: `${item.title}: ${item.what}`, message: lines.join(' · '), level: kind === 'failure' ? 'error' : 'success'});
      playCue(kind);
      return {mode: 'notify'};
    }
    if (current) {
      if (kind === 'failure' && current.kind === 'success') { close('replaced'); show(item); } else queue.push(item);
      return {mode: 'takeover', queued: current !== item};
    }
    show(item);
    return {mode: 'takeover'};
  }

  return {
    success: data => present('success', data),
    failure: data => present('failure', data),
    dismiss: () => close('dismissed'),
    active: () => current ? {kind: current.kind, what: current.what} : null,
    pending: () => queue.length,
    destroy() { queue.length = 0; close('destroyed'); }
  };
}
