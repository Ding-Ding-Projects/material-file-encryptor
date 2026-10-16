import {control} from '../../../shared/surface/controls.js';
import {DEFAULT_DRIVE_NAME, DRIVE_NAME_MAX_LENGTH} from '../../../shared/drive-name.js';
import {STEPS} from './model.js';

const STEP_NAMES = Object.freeze({welcome: 'Welcome', look: 'Look and language', requirements: 'Requirements', drive: 'Your drive', browser: 'Pair a browser', done: 'Finish'});
const STEP_CHIPS = Object.freeze({welcome: 'Welcome', look: 'Look and language', requirements: 'Requirements', drive: 'Your drive', browser: 'Browser', done: 'Finish'});
const STATE_LABELS = Object.freeze({current: 'Current', done: 'Done', skipped: 'Skipped', pending: 'Not started'});

/**
 * The setup guide view. Every action is a real one and goes through the session's services; the view only
 * collects the person's choices and shows each result. It keeps typed folder paths and the drive name in memory
 * for the length of the view and never stores or displays a password or key file.
 */
export function mountOnboarding(host, {session, translate = value => value, subscribeLanguage = null, chooseFolder = null, getDefaults = () => ({}), mountPairing = null} = {}) {
  if (!session) throw new TypeError('A setup session is required.');
  const doc = host.ownerDocument || document;
  const make = (tag, props = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset ||= {}, value);
      else node.setAttribute(key, String(value));
    }
    node.append(...children);
    return node;
  };
  const t = source => translate(source);
  const fill = (source, values) => t(source).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);

  const draft = {driveName: session.progress.choices.driveName || '', storageDir: '', cacheDir: ''};
  let disposed = false, lastStep = null, direction = 'none', pairing = null, focusKey = null;
  // Listeners belong to the nodes of one render and are removed before the next render replaces them.
  const listeners = [];
  let browserResult = null;
  const listen = (node, type, fn) => { node.addEventListener(type, fn); listeners.push(() => node.removeEventListener?.(type, fn)); };
  const guarded = work => async (...args) => { try { await work(...args); } finally { if (!disposed) render(); } };

  host.replaceChildren();
  const root = make('section', {class: 'onboarding', 'aria-labelledby': 'onboarding-title'});
  host.append(root);

  const resultLine = id => {
    const value = session.result(id);
    const line = make('p', {class: 'onboarding-result', role: 'status', 'aria-live': 'polite'});
    if (!value) return line;
    line.dataset ||= {};
    line.dataset.ok = String(value.ok === true);
    line.textContent = value.detail ? `${t(value.key)} ${value.detail}` : t(value.key);
    return line;
  };
  const busyNote = () => make('p', {class: 'onboarding-busy', role: 'status', 'aria-live': 'polite', text: session.busy ? t('Working…') : ''});
  const paragraph = source => make('p', {text: t(source)});
  const button = (key, label, kind, onClick, {disabled = false, hidden = false} = {}) => {
    const node = control('button', {class: kind === 'primary' ? 'primary' : kind === 'outlined' ? 'outlined' : '', text: t(label)}, [], doc);
    node.dataset ||= {};
    node.dataset.focusKey = key;
    node.disabled = disabled || Boolean(session.busy);
    node.hidden = hidden;
    listen(node, 'click', onClick);
    return node;
  };

  function selectField(key, label, options, current, onChange) {
    const select = control('select', {label: t(label)}, options.map(([value, text]) => control('option', {value, text: t(text)}, [], doc)), doc);
    select.value = current;
    select.setAttribute('aria-label', t(label));
    select.dataset ||= {};
    select.dataset.focusKey = key;
    listen(select, 'change', () => onChange(select.value));
    return select;
  }
  function textField(key, label, field, {maxlength = 260, help = null} = {}) {
    const input = control('input', {type: 'text', label: t(label), value: draft[field], maxlength}, [], doc);
    input.setAttribute('aria-label', t(label));
    input.dataset ||= {};
    input.dataset.focusKey = key;
    listen(input, 'input', () => { draft[field] = String(input.value ?? ''); });
    const row = make('div', {class: 'onboarding-field'}, [input]);
    if (help) row.append(make('p', {class: 'onboarding-help', text: t(help)}));
    return row;
  }

  const builders = {
    welcome(panel) {
      panel.append(paragraph('This short guide sets the app up in a few steps. Each step does a real setup action and shows its result.'));
      panel.append(paragraph('Every step except the first and the last can be skipped. Your progress is saved, and you can return at any time from Help or the command palette.'));
      const list = make('ol', {class: 'onboarding-overview'});
      for (const step of STEPS) list.append(make('li', {text: t(STEP_NAMES[step.id]) + (step.optional ? ` (${t('Optional')})` : '')}));
      panel.append(list);
    },
    look(panel) {
      const snapshot = session.snapshot();
      panel.append(paragraph('Pick a language and a colour theme. Both apply straight away, and you can change them later in Settings.'));
      panel.append(selectField('language', 'Language', [['en', 'English'], ['yue', 'Cantonese'], ['bilingual', 'English and Cantonese']], session.progress.choices.language || snapshot.language || 'en', guarded(value => session.chooseLanguage(value))));
      panel.append(selectField('theme', 'Appearance', [['system', 'Device setting'], ['light', 'Light'], ['dark', 'Dark']], session.progress.choices.theme || snapshot.theme || 'system', guarded(value => session.chooseTheme(value))));
      panel.append(resultLine('look'));
    },
    requirements(panel) {
      panel.append(paragraph('Mounting a drive needs the WinFsp driver. Local game servers need the server runtime. This step only reads their status; installing the driver is your choice.'));
      const value = session.result('requirements');
      const labels = {ready: 'Ready', missing: 'Not installed', checking: 'Still checking', unknown: 'Unknown', unavailable: 'Unavailable'};
      const list = make('ul', {class: 'onboarding-status-list'});
      if (value) {
        list.append(make('li', {text: `${t('WinFsp driver')}: ${t(labels[value.winfsp] || 'Unknown')}${value.winfspDetail ? ' (' + value.winfspDetail + ')' : ''}`}));
        list.append(make('li', {text: `${t('Local server runtime')}: ${t(value.server === 'ready' ? 'Available' : labels[value.server] || 'Unknown')}${value.serverDetail ? ' (' + t(value.serverDetail) + ')' : ''}`}));
      } else list.append(make('li', {text: t('Not checked yet. Choose Check now.')}));
      panel.append(list);
      const actions = make('div', {class: 'onboarding-actions-row'});
      actions.append(button('check', 'Check now', 'outlined', guarded(() => session.checkRequirements())));
      actions.append(button('install', 'Install WinFsp', 'outlined', guarded(() => session.installDriver()), {hidden: !(value && value.canInstall)}));
      panel.append(actions);
      panel.append(resultLine('requirements'));
    },
    drive(panel) {
      const defaults = getDefaults() || {};
      if (!draft.driveName) draft.driveName = defaults.driveName || DEFAULT_DRIVE_NAME;
      if (!draft.cacheDir && defaults.cacheDir) draft.cacheDir = defaults.cacheDir;
      panel.append(paragraph('Name the drive and choose where its encrypted parts and cache live. The next window asks for the password or key file; this guide never sees it.'));
      panel.append(textField('drive-name', 'Drive name', 'driveName', {maxlength: DRIVE_NAME_MAX_LENGTH}));
      for (const [key, label, field, kind] of [['storage', 'Encrypted storage folder', 'storageDir', 'storage'], ['cache', 'Encrypted cache folder', 'cacheDir', 'cache']]) {
        const row = textField(key, label, field, {help: 'Leave empty to use the suggested folder.'});
        if (chooseFolder) {
          row.append(button(`browse-${key}`, 'Browse', 'outlined', guarded(async () => { const picked = await chooseFolder(kind); if (picked) draft[field] = String(picked); })));
        }
        panel.append(row);
      }
      const actions = make('div', {class: 'onboarding-actions-row'});
      actions.append(button('create-drive', 'Create a drive', 'primary', guarded(() => session.openDrive('create', draft))));
      actions.append(button('unlock-drive', 'Unlock existing drive', 'outlined', guarded(() => session.openDrive('unlock', draft))));
      panel.append(actions);
      panel.append(resultLine('drive'));
    },
    browser(panel) {
      panel.append(paragraph('Show a pairing code, then type it or scan it in the browser extension. You still approve the pairing on this desktop.'));
      const slot = make('div', {class: 'onboarding-pairing'});
      panel.append(slot);
      if (mountPairing) pairing = mountPairing(slot);
      // The result sits in its own holder so showing a code can update it without rebuilding (and clearing) the pairing view.
      browserResult = make('div', {class: 'onboarding-result-holder'}, [resultLine('browser')]);
      panel.append(browserResult);
    },
    done(panel) {
      panel.append(paragraph('Here is what happened in each step. You can reopen this guide at any time.'));
      const list = make('ul', {class: 'onboarding-summary'});
      for (const step of session.steps().filter(row => !['welcome', 'done'].includes(row.id))) {
        const outcome = session.result(step.id);
        const line = `${t(STEP_NAMES[step.id])}: ${t(step.state === 'current' ? 'Not started' : STATE_LABELS[step.state])}${outcome ? ' — ' + t(outcome.key) : ''}`;
        list.append(make('li', {text: line}));
      }
      panel.append(list);
    }
  };

  function render() {
    if (disposed) return;
    const active = doc.activeElement?.dataset?.focusKey || null;
    focusKey = active;
    for (const off of listeners.splice(0)) off();
    pairing?.destroy?.(); pairing = null; browserResult = null;
    const stepId = session.step, index = session.index, total = STEPS.length;
    if (lastStep !== null && lastStep !== stepId) direction = STEPS.findIndex(step => step.id === stepId) >= STEPS.findIndex(step => step.id === lastStep) ? 'forward' : 'back';
    root.replaceChildren();
    root.setAttribute('aria-label', t('Setup guide: first run and setup'));

    const header = make('header', {class: 'onboarding-header'});
    header.append(make('p', {class: 'eyebrow', text: t('Setup guide')}));
    const title = make('h2', {id: 'onboarding-title', tabindex: '-1', text: t(STEP_NAMES[stepId])});
    header.append(title);
    const progress = control('progress', {}, [], doc);
    progress.max = 1; progress.value = index / (total - 1);
    progress.setAttribute('aria-label', t('Setup progress'));
    header.append(progress, make('p', {class: 'onboarding-count', text: fill('Step {n} of {total}', {n: index + 1, total})}));
    const chips = make('ol', {class: 'onboarding-steps', 'aria-label': t('Setup steps')});
    for (const step of session.steps()) {
      const chip = control('button', {text: t(STEP_CHIPS[step.id]), class: 'onboarding-step-chip'}, [], doc);
      chip.setAttribute('aria-label', `${t(STEP_CHIPS[step.id])}: ${t(STATE_LABELS[step.state])}`);
      if (step.state === 'current') chip.setAttribute('aria-current', 'step');
      chip.dataset ||= {};
      chip.dataset.state = step.state;
      chip.disabled = !step.reachable || Boolean(session.busy);
      listen(chip, 'click', () => { session.goTo(step.id); });
      chips.append(make('li', {}, [chip]));
    }
    header.append(chips);
    root.append(header);

    const panel = make('div', {class: 'onboarding-panel', dataset: {direction, step: stepId}});
    builders[stepId](panel);
    panel.append(busyNote());
    root.append(panel);

    root.append(make('p', {class: 'onboarding-persistence', role: 'status', text: session.loadState === 'invalid' ? t('Saved progress was not usable, so the guide started again.') : session.persistence === 'saved' ? t('Your progress is saved on this device.') : t('Progress cannot be saved on this device, so it is lost when the app closes.')}));
    root.append(make('p', {class: 'onboarding-help', text: t('Alt+Left goes back and Alt+Right goes forward.')}));

    const footer = make('footer', {class: 'onboarding-actions'});
    footer.append(button('back', 'Back', 'outlined', () => { session.back(); }, {disabled: !session.canGoBack()}));
    footer.append(button('skip-step', 'Skip this step', '', () => { session.skipStep(); }, {hidden: !session.canSkip()}));
    if (stepId === 'done') footer.append(button('finish', 'Open the workspace home', 'primary', () => { session.finish(); }));
    else footer.append(button('next', 'Next', 'primary', () => { session.next(); }, {disabled: !session.canGoNext()}));
    footer.append(button('save-close', 'Save and close', '', () => { session.saveAndClose(); }));
    footer.append(button('skip-setup', 'Skip setup', '', () => { session.dismiss(); }, {hidden: stepId === 'done'}));
    footer.append(button('restart', 'Start over', '', () => { session.restart(); direction = 'none'; }, {hidden: stepId !== 'done'}));
    root.append(footer);

    if (lastStep !== stepId) { title.focus?.(); }
    else if (focusKey) { const again = findByKey(root, focusKey); again?.focus?.(); }
    lastStep = stepId;
  }
  const findByKey = (scope, key) => {
    const stack = [scope];
    while (stack.length) {
      const node = stack.pop();
      if (node.dataset?.focusKey === key) return node;
      if (node.children) stack.push(...node.children);
    }
    return null;
  };

  // The keys work wherever focus is while the guide is on screen, so a person who has just clicked a button or the page
  // background can still move on. They are ignored while another view is showing.
  const onScreen = () => host.isConnected !== false && !host.closest?.('[hidden]');
  const onKey = event => {
    if (!event.altKey || disposed || !onScreen()) return;
    if (event.key === 'ArrowRight') { event.preventDefault?.(); session.next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault?.(); session.back(); }
  };
  doc.addEventListener?.('keydown', onKey);
  const stop = session.subscribe(() => {
    // While the pairing code is on screen, only the result line changes. Rebuilding the view would clear the code.
    if (pairing && browserResult && session.step === 'browser' && lastStep === 'browser' && !session.busy) { browserResult.replaceChildren(resultLine('browser')); return; }
    render();
  });
  const stopLanguage = typeof subscribeLanguage === 'function' ? subscribeLanguage(() => render()) : null;
  render();
  return {
    render,
    get step() { return session.step; },
    destroy() {
      if (disposed) return;
      disposed = true;
      stop();
      if (typeof stopLanguage === 'function') stopLanguage();
      doc.removeEventListener?.('keydown', onKey);
      for (const off of listeners.splice(0)) off();
      pairing?.destroy?.(); pairing = null;
      host.replaceChildren();
    }
  };
}
