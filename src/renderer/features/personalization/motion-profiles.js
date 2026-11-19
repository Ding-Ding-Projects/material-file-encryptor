// The animation and transition editor: a Settings panel that lists every animated element kind with a live
// preview and tunes duration, delay, stagger, easing, distance and scale for each. It edits the shared motion
// controller, so every change is visible across the whole app at once. The advanced keyframe editor stays one
// button away for authoring per-element tracks.
import {withIcon} from '../../icons.js';
import {control as materialControl} from '../../../shared/surface/controls.js';
import {createSettingsControl} from './settings-controls.js';
import {motionKindName, motionText} from './motion-profiles-copy.js';
import {BUILT_IN_PROFILES, EASING_NAMES, MOTION_FIELDS, MOTION_KINDS, SPEED_RANGE, easingCss, easingPoints, effectiveKind, previewKeyframes, validateEasing} from '../../motion/motion-tokens.js';

const REDUCED_COPY = {
  system: 'Windows asks for reduced motion, so nothing moves whatever is set here.',
  app: 'The Motion setting is Reduced, so nothing moves whatever is set here.',
  'low-stimulation': 'Low stimulation is on, so nothing moves whatever is set here.'
};
const HELP = {
  enabled: 'Turns this kind of motion on or off by itself.',
  duration: 'Duration in milliseconds. Longer is slower.',
  delay: 'Wait before the motion starts, in milliseconds.',
  stagger: 'Gap between neighbouring rows or cards, in milliseconds.',
  distance: 'How far the element travels while entering, in pixels.',
  scale: 'Size at the start (or at the peak of a pulse). 1 is full size.'
};

export function mountMotionProfiles(host, {controller, getLanguage = () => 'en', notify = () => {}, openAdvanced = () => {}, openEditor = () => {}, takeoverPreference = null, download, readFile} = {}) {
  if (!controller) throw new Error('A motion controller is required.');
  const doc = host.ownerDocument;
  const L = english => motionText(getLanguage(), english);
  let selected = MOTION_KINDS[0].id;
  let disposed = false;
  const animations = new Set();
  const root = doc.createElement('section');
  root.className = 'motion-profiles local-ux-section';
  root.setAttribute('aria-labelledby', 'motion-profiles-title');
  host.append(root);

  const el = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (label, run, variant = 'outlined', iconName = 'check') => {
    const node = withIcon(materialControl('button', {class: variant, type: 'button'}, [label], doc), iconName);
    node.addEventListener('click', () => { if (!disposed) { try { run(); } catch (error) { notify(error.message); } } });
    return node;
  };
  const say = message => { status.textContent = L(message); };
  const status = el('p', 'motion-profiles-status');
  status.setAttribute('role', 'status');

  function stopAnimations() { for (const animation of animations) animation.cancel(); animations.clear(); }

  function playPreview(target, kindId, values, running) {
    if (!running || typeof target.animate !== 'function') return;
    const animation = target.animate(previewKeyframes(kindId, values), {
      duration: Math.max(120, values.duration), delay: values.delay, easing: values.easing,
      iterations: Infinity, direction: kindId === 'progress' ? 'alternate' : 'alternate', endDelay: 300, fill: 'both'
    });
    animations.add(animation);
  }

  function render() {
    if (disposed) return;
    stopAnimations();
    const snap = controller.snapshot();
    const {profile, activeId, custom} = snap.state;
    const language = getLanguage();
    const reducedMotion = snap.reduced; // reduced motion always wins: nothing is animated or previewed while it is in force
    const running = !reducedMotion && profile.master;
    root.replaceChildren();

    const head = el('header', 'motion-profiles-head');
    const title = el('h3', '', L('Animation and transitions'));
    title.id = 'motion-profiles-title';
    head.append(title, el('p', 'motion-profiles-intro', L('Tune every moving part. Changes apply live across the app.')));
    root.append(head);

    // Reduced motion always wins, and this panel says so.
    const notice = el('p', 'motion-profiles-reduced', snap.reduced ? L(REDUCED_COPY[snap.reason]) : L('Reduced motion always wins. Your profile is kept and applies again when it is off.'));
    notice.dataset.reduced = String(snap.reduced);
    root.append(notice);

    const global = el('div', 'motion-profiles-global');
    const master = createSettingsControl(doc, 'checkbox', {label: L('All animations'), value: profile.master});
    master.addEventListener('change', () => { controller.setMaster(master.checked); });
    const masterLabel = el('label', 'motion-profiles-inline');
    masterLabel.append(master, el('span', '', L('All animations')));
    const speed = createSettingsControl(doc, 'range', {label: L('Speed'), value: profile.speed});
    Object.assign(speed, {min: SPEED_RANGE.min, max: SPEED_RANGE.max, step: 0.05});
    const speedOut = el('output', '', `${profile.speed.toFixed(2)}x`);
    speed.addEventListener('input', () => { speedOut.textContent = `${Number(speed.value).toFixed(2)}x`; });
    speed.addEventListener('change', () => { controller.setSpeed(Number(Number(speed.value).toFixed(2))); });
    const speedLabel = el('label', 'motion-profiles-inline');
    speedLabel.append(el('span', '', L('Speed')), speed, speedOut);
    speedLabel.title = L('Multiplies every duration. 2 is twice as fast.');
    global.append(masterLabel, speedLabel);
    root.append(global);

    // Installation results: a full-window message, or an ordinary notification instead.
    if (takeoverPreference) {
      const takeover = createSettingsControl(doc, 'checkbox', {label: L('Show installation results as full-window messages'), value: takeoverPreference.get() === 'takeover'});
      takeover.addEventListener('change', () => { takeoverPreference.set(takeover.checked ? 'takeover' : 'notify'); });
      const takeoverLabel = el('label', 'motion-profiles-inline');
      takeoverLabel.append(takeover, el('span', '', L('Show installation results as full-window messages')), el('small', '', L('Turn this off to receive a notification instead of a full-window message.')));
      root.append(takeoverLabel);
    }

    // Profiles.
    const profiles = el('div', 'motion-profiles-profiles');
    profiles.setAttribute('role', 'radiogroup');
    profiles.setAttribute('aria-label', L('Motion profile'));
    const choose = (id, name) => {
      const node = withIcon(materialControl('button', {class: id === activeId ? 'primary' : 'outlined', type: 'button', role: 'radio'}, [name], doc), 'palette');
      node.setAttribute('aria-checked', String(id === activeId));
      node.addEventListener('click', () => { controller.useProfile(id); say('Motion profile applied.'); });
      profiles.append(node);
    };
    for (const row of BUILT_IN_PROFILES) choose(row.id, language === 'en' ? row.name : language === 'yue' ? row.yue : `${row.name} · ${row.yue}`);
    for (const name of Object.keys(custom)) choose(name, name);
    if (activeId === 'edited') {
      const edited = el('span', 'motion-profiles-edited', L('Edited'));
      edited.setAttribute('aria-current', 'true');
      profiles.append(edited);
    }
    root.append(profiles);

    const profileActions = el('div', 'motion-profiles-actions');
    const nameField = materialControl('input', {type: 'text', label: L('Profile name'), 'aria-label': L('Profile name'), maxLength: 40}, [], doc);
    profileActions.append(nameField,
      button(L('Save as profile'), () => { controller.saveProfile(nameField.value); say('Motion profile saved.'); }, 'outlined', 'save'),
      button(L('Delete profile'), () => { controller.deleteProfile(activeId); say('Motion profile deleted.'); }, 'outlined', 'delete'),
      button(L('Import JSON'), () => file.click(), 'outlined', 'upload'),
      button(L('Export JSON'), () => { download?.(controller.exportJson(), 'motion-profile.json'); say('Motion profile exported.'); }, 'outlined', 'export'),
      button(L('Reset all'), () => { controller.resetAll(); say('Everything is back to the Expressive profile.'); }, 'outlined', 'restore'));
    const deleteButton = profileActions.children[2];
    deleteButton.disabled = !Object.hasOwn(custom, activeId);
    const file = el('input');
    file.type = 'file'; file.accept = 'application/json'; file.hidden = true;
    file.setAttribute('aria-label', L('Import JSON'));
    file.addEventListener('change', async () => {
      try {
        const chosen = file.files[0];
        if (!chosen) return;
        controller.importJson(await (readFile ? readFile(chosen) : chosen.text()));
        say('Motion profile imported.');
      } catch (error) { notify(error.message); } finally { file.value = ''; }
    });
    root.append(profileActions, file);

    // Kind grid and the selected kind's controls.
    const layout = el('div', 'motion-profiles-layout');
    const grid = el('div', 'motion-profiles-kinds');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', L('Element kinds'));
    for (const kind of MOTION_KINDS) {
      const values = effectiveKind(profile, kind.id, {reduced: snap.reduced});
      const row = profile.kinds[kind.id];
      const item = el('button', 'motion-profiles-kind');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(kind.id === selected));
      item.dataset.kind = kind.id;
      const stage = el('span', 'motion-profiles-stage');
      const dot = el('span', 'motion-profiles-dot');
      stage.append(dot);
      const summary = el('span', 'motion-profiles-kind-summary');
      summary.append(el('span', '', motionKindName(language, kind)), el('span', 'motion-profiles-kind-ms', running && row.enabled ? `${values.duration} ms` : L('Off')));
      item.append(stage, summary);
      item.addEventListener('click', () => { selected = kind.id; render(); grid.querySelector(`[data-kind="${kind.id}"]`)?.focus(); });
      grid.append(item);
      playPreview(dot, kind.id, values, running && row.enabled);
    }

    const kind = MOTION_KINDS.find(row => row.id === selected);
    const row = profile.kinds[selected];
    const values = effectiveKind(profile, selected, {reduced: snap.reduced});
    const detail = el('aside', 'motion-profiles-detail');
    detail.setAttribute('aria-label', L('Selected kind'));
    detail.append(el('h4', '', motionKindName(language, kind)));
    const previewBox = el('div', 'motion-profiles-preview');
    previewBox.setAttribute('aria-label', L('Preview'));
    const sample = el('div', 'motion-profiles-sample', running && row.enabled ? L('Preview') : L('Preview unavailable while motion is off.'));
    previewBox.append(sample);
    detail.append(previewBox);
    playPreview(sample, selected, values, running && row.enabled);

    const enabled = createSettingsControl(doc, 'checkbox', {label: L('Enabled'), value: row.enabled});
    enabled.addEventListener('change', () => controller.setKind(selected, {enabled: enabled.checked}));
    const enabledLabel = el('label', 'motion-profiles-inline');
    enabledLabel.append(enabled, el('span', '', L('Enabled')), el('small', '', L(HELP.enabled)));
    detail.append(enabledLabel);

    for (const field of MOTION_FIELDS) {
      const slider = createSettingsControl(doc, 'range', {label: L(field.key[0].toUpperCase() + field.key.slice(1)), value: row[field.key]});
      Object.assign(slider, {min: field.min, max: field.max, step: field.step});
      const out = el('output', '', `${row[field.key]}${field.unit ? ' ' + field.unit : ''}`);
      slider.addEventListener('input', () => { out.textContent = `${slider.value}${field.unit ? ' ' + field.unit : ''}`; });
      slider.addEventListener('change', () => controller.setKind(selected, {[field.key]: Number(slider.value)}));
      const label = el('label', 'motion-profiles-field');
      label.append(el('span', '', L(field.key[0].toUpperCase() + field.key.slice(1))), slider, out, el('small', '', L(HELP[field.key])));
      detail.append(label);
    }

    detail.append(el('p', 'motion-profiles-easing-title', L('Easing')));
    detail.append(curveEditor(row.easing));
    detail.append(button(L('Reset this kind'), () => controller.resetKind(selected), 'outlined', 'restore'), button(L('Advanced keyframe editor'), openAdvanced, 'text', 'edit'));
    layout.append(grid, detail);
    root.append(layout, status);
  }

  /** Cubic Bezier curve editor: a drawn curve, preset chips and four numeric fields as the keyboard route. */
  function curveEditor(easing) {
    const box = el('div', 'motion-profiles-curve');
    const points = easingPoints(easing);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${L('Easing curve')}: ${typeof easing === 'string' ? easing : easingCss(easing)}`);
    const x = value => 16 + value * 168, y = value => 104 - value * 88;
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x(0)} ${y(0)} C ${x(points[0])} ${y(points[1])}, ${x(points[2])} ${y(points[3])}, ${x(1)} ${y(1)}`);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '3');
    svg.append(path);
    box.append(svg);
    const chips = el('div', 'motion-profiles-chips');
    for (const name of EASING_NAMES) {
      const chip = withIcon(materialControl('button', {class: easing === name ? 'primary' : 'outlined', type: 'button'}, [name[0].toUpperCase() + name.slice(1)], doc), 'curve');
      chip.setAttribute('aria-pressed', String(easing === name));
      chip.addEventListener('click', () => controller.setKind(selected, {easing: name}));
      chips.append(chip);
    }
    box.append(chips);
    const fields = el('div', 'motion-profiles-points');
    fields.setAttribute('role', 'group');
    fields.setAttribute('aria-label', `${L('Control point')} (${L('Starting point and end point of the curve, on a 0 to 1 scale.')})`);
    const inputs = ['x1', 'y1', 'x2', 'y2'].map((name, index) => {
      const input = materialControl('input', {type: 'text', label: name, 'aria-label': `${L('Control point')} ${name}`}, [], doc);
      input.value = String(points[index]);
      fields.append(input);
      return input;
    });
    const apply = () => {
      try { controller.setKind(selected, {easing: validateEasing(inputs.map(input => Number(input.value))) }); } catch (error) { notify(error.message); }
    };
    for (const input of inputs) input.addEventListener('change', apply);
    box.append(fields);
    return box;
  }

  const off = controller.subscribe(() => render());
  render();
  return {
    render,
    destroy() { disposed = true; off(); stopAnimations(); root.remove(); }
  };
}

/** Command palette entries for motion. They are registered once by the Settings feature, whether or not the editor is open. */
export function motionCommands({controller, openEditor = () => {}}) {
  return [
    ...BUILT_IN_PROFILES.map(row => ({id: `motion:profile:${row.id}`, label: {en: `Motion profile: ${row.name}`, yue: `動態設定檔：${row.yue}`}, keywords: ['animation', 'transition', 'motion', row.name], run: () => controller.useProfile(row.id)})),
    {id: 'motion:toggle-all', label: {en: 'Toggle all animations', yue: '開關所有動畫'}, keywords: ['animation', 'motion', 'master'], run: () => controller.setMaster(!controller.snapshot().state.profile.master)},
    {id: 'motion:reset-all', label: {en: 'Reset animations to Expressive', yue: '動畫重設為豐富'}, keywords: ['animation', 'reset'], run: () => controller.resetAll()},
    {id: 'motion:open-editor', label: {en: 'Open the animation and transition editor', yue: '開啟動畫與過渡編輯器'}, keywords: ['animation', 'transition', 'motion', 'editor'], run: () => openEditor()}
  ];
}
