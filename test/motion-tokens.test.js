import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_PROFILES, MOTION_KINDS, MAX_CUSTOM_PROFILES, STORAGE_KEY, builtInProfile, defaultState, easingCss,
  effectiveKind, exportProfileJson, previewKeyframes, motionCssVars, parseProfileJson, reducedMotionReason, validateEasing, validateProfile, validateState
} from '../src/renderer/motion/motion-tokens.js';
import {createMotionController} from '../src/renderer/motion/motion-controller.js';

function fakeDocument({appMotion, lowStimulation, media = false} = {}) {
  const style = new Map();
  const listeners = {};
  const root = {dataset: {}, style: {setProperty: (name, value) => style.set(name, value)}};
  if (appMotion) root.dataset.motion = appMotion;
  if (lowStimulation) root.dataset.lowStimulation = 'true';
  const view = {
    matchMedia: () => ({matches: media, addEventListener() {}, removeEventListener() {}}),
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}
  };
  return {doc: {defaultView: view, documentElement: root}, style, root, listeners, setMedia: value => { media = value; }};
}
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))};
}

test('every element kind has complete, in-range defaults and a token set', () => {
  assert.equal(MOTION_KINDS.length, 16);
  const profile = builtInProfile();
  const vars = motionCssVars(profile);
  for (const kind of MOTION_KINDS) {
    for (const suffix of ['enabled', 'duration', 'delay', 'stagger', 'easing', 'distance', 'scale']) assert.ok(`--motion-${kind.id}-${suffix}` in vars, `${kind.id} ${suffix}`);
  }
  assert.equal(vars['--motion-page-duration'], '520ms');
  assert.equal(vars['--motion-page-easing'], 'cubic-bezier(0.05,0.7,0.1,1)');
});

test('built-in profiles are distinct and Expressive is the default', () => {
  assert.deepEqual(BUILT_IN_PROFILES.map(row => row.id), ['calm', 'standard', 'expressive', 'playful']);
  assert.equal(defaultState().activeId, 'expressive');
  const calm = builtInProfile('calm'), playful = builtInProfile('playful');
  assert.ok(calm.kinds.page.duration < playful.kinds.page.duration);
  assert.ok(calm.kinds.page.distance < playful.kinds.page.distance);
  assert.equal(playful.kinds.list.easing, 'spring');
  for (const row of BUILT_IN_PROFILES) assert.deepEqual(validateProfile(builtInProfile(row.id)), builtInProfile(row.id));
});

test('validation refuses unsafe, unknown and out-of-range input', () => {
  assert.throws(() => validateProfile({version: 2}), /version/);
  assert.throws(() => validateProfile({version: 1, extra: 1}), /Unknown motion profile field/);
  assert.throws(() => validateProfile({version: 1, kinds: {nope: {}}}), /Unknown motion kind/);
  assert.throws(() => validateProfile({version: 1, kinds: {page: {duration: 99999}}}), /duration/);
  assert.throws(() => validateProfile({version: 1, kinds: {page: {duration: '300'}}}), /duration/);
  assert.throws(() => validateProfile({version: 1, kinds: {page: {duration: NaN}}}), /duration/);
  assert.throws(() => validateProfile({version: 1, kinds: {page: {color: 'red'}}}), /Unknown motion kind field/);
  assert.throws(() => validateProfile({version: 1, speed: 0}), /speed/);
  assert.throws(() => validateProfile({version: 1, speed: 9}), /speed/);
  assert.throws(() => validateProfile({version: 1, master: 'yes'}), /master/);
  assert.throws(() => validateProfile({version: 1, name: '<script>'}), /name/);
  assert.throws(() => validateProfile(JSON.parse('{"version":1,"__proto__":{"x":1}}')), /Unsafe/);
  assert.throws(() => validateProfile(JSON.parse('{"version":1,"kinds":{"page":{"constructor":1}}}')), /Unsafe/);
  assert.throws(() => validateProfile([]), /object/);
  // Strings that look like CSS cannot pass through the easing field.
  assert.throws(() => validateEasing('url(javascript:alert(1))'), /easing/);
  assert.throws(() => validateEasing('cubic-bezier(0,0,0,0)'), /easing/);
  assert.throws(() => validateEasing([2, 0, 0, 1]), /easing/);
  assert.throws(() => validateEasing([0, 9, 0, 1]), /easing/);
  assert.throws(() => validateEasing([0, 0, 0]), /easing/);
  assert.deepEqual(validateEasing([0.1234567, 0, 1, 1]), [0.123, 0, 1, 1]);
});

test('a partial profile fills the rest from Expressive', () => {
  const partial = validateProfile({version: 1, kinds: {toast: {duration: 90, easing: [0.1, 0.2, 0.3, 0.4]}}});
  assert.equal(partial.kinds.toast.duration, 90);
  assert.deepEqual(partial.kinds.toast.easing, [0.1, 0.2, 0.3, 0.4]);
  assert.equal(partial.kinds.page.duration, builtInProfile().kinds.page.duration);
});

test('import and export round trip, and oversized or malformed files are refused', () => {
  const profile = validateProfile({version: 1, name: 'Mine', speed: 1.5, kinds: {dialog: {duration: 200, enabled: false}}});
  const text = exportProfileJson(profile);
  assert.deepEqual(parseProfileJson(text), profile);
  assert.deepEqual(parseProfileJson(JSON.stringify(profile)), profile);
  assert.throws(() => parseProfileJson('{nope'), /not valid JSON/);
  assert.throws(() => parseProfileJson('x'.repeat(70000)), /smaller than 64 KiB/);
  assert.throws(() => parseProfileJson(JSON.stringify({version: 1, kinds: {page: {duration: -1}}})), /duration/);
  assert.throws(() => parseProfileJson('null'), /object/);
});

test('speed, master switch and per-kind switch change the effective values', () => {
  const profile = validateProfile({version: 1, speed: 2, kinds: {page: {duration: 400, delay: 100, stagger: 20}, tab: {enabled: false}}});
  assert.deepEqual(effectiveKind(profile, 'page'), {enabled: true, duration: 200, delay: 50, stagger: 10, easing: easingCss('emphasized'), distance: 24, scale: 0.96});
  const off = effectiveKind(profile, 'tab');
  assert.equal(off.enabled, false); assert.equal(off.duration, 0); assert.equal(off.distance, 0); assert.equal(off.scale, 1);
  const master = motionCssVars({...profile, master: false});
  assert.equal(master['--motion-enabled'], '0'); assert.equal(master['--motion-page-duration'], '0ms');
});

test('reduced motion always wins over the profile, the master switch and every kind', () => {
  assert.equal(reducedMotionReason({media: true, appSetting: 'full'}), 'system');
  assert.equal(reducedMotionReason({appSetting: 'reduced'}), 'app');
  assert.equal(reducedMotionReason({lowStimulation: true}), 'low-stimulation');
  assert.equal(reducedMotionReason({appSetting: 'full'}), null);
  const playful = builtInProfile('playful');
  const vars = motionCssVars(playful, {reduced: true});
  for (const kind of MOTION_KINDS) {
    assert.equal(vars[`--motion-${kind.id}-duration`], '0ms', kind.id);
    assert.equal(vars[`--motion-${kind.id}-distance`], '0px', kind.id);
    assert.equal(vars[`--motion-${kind.id}-enabled`], '0', kind.id);
  }
  assert.equal(vars['--motion-enabled'], '0');
});

test('the controller applies tokens live, persists them and keeps reduced motion on top', () => {
  const env = fakeDocument();
  const storage = fakeStorage();
  const controller = createMotionController({doc: env.doc, storage});
  assert.equal(env.style.get('--motion-page-duration'), '520ms');
  assert.equal(env.root.dataset.motionLayer, 'on');
  let notified = 0;
  controller.subscribe(() => notified++);

  controller.useProfile('calm');
  assert.equal(env.root.dataset.motionProfile, 'calm');
  assert.equal(env.style.get('--motion-page-duration'), `${builtInProfile('calm').kinds.page.duration}ms`);

  controller.setKind('page', {duration: 700});
  assert.equal(env.style.get('--motion-page-duration'), '700ms');
  assert.equal(controller.snapshot().state.activeId, 'edited');
  controller.setSpeed(2);
  assert.equal(env.style.get('--motion-page-duration'), '350ms');
  controller.setMaster(false);
  assert.equal(env.style.get('--motion-page-duration'), '0ms');
  assert.equal(env.root.dataset.motionLayer, 'off');
  assert.ok(notified >= 4);

  const stored = JSON.parse(storage.map.get(STORAGE_KEY));
  assert.equal(stored.profile.speed, 2);
  assert.equal(stored.profile.master, false);

  // A new controller reads what was stored.
  const again = fakeDocument();
  createMotionController({doc: again.doc, storage});
  assert.equal(again.style.get('--motion-page-duration'), '0ms');
  assert.equal(again.root.dataset.motionLayer, 'off');
});

test('the controller reports reduced motion from the system, the Motion setting and low stimulation', () => {
  for (const [options, reason] of [[{media: true}, 'system'], [{appMotion: 'reduced'}, 'app'], [{lowStimulation: true}, 'low-stimulation']]) {
    const env = fakeDocument(options);
    const controller = createMotionController({doc: env.doc, storage: fakeStorage()});
    assert.equal(controller.reduced().reason, reason);
    assert.equal(env.style.get('--motion-page-duration'), '0ms', reason);
    assert.equal(env.style.get('--motion-takeover-duration'), '0ms', reason);
    assert.equal(controller.previewable(), false);
    // The stored profile is untouched, so it applies again when reduced motion is off.
    assert.equal(controller.snapshot().state.profile.kinds.page.duration, 520);
  }
});

test('saving, switching and deleting profiles stays inside its limits', () => {
  const env = fakeDocument();
  const controller = createMotionController({doc: env.doc, storage: fakeStorage()});
  controller.setKind('toast', {duration: 111});
  controller.saveProfile('Quiet');
  assert.equal(controller.snapshot().state.activeId, 'Quiet');
  controller.useProfile('playful');
  controller.useProfile('Quiet');
  assert.equal(controller.snapshot().state.profile.kinds.toast.duration, 111);
  assert.throws(() => controller.saveProfile('Calm'), /different profile name/);
  assert.throws(() => controller.saveProfile('  '), /different profile name/);
  assert.throws(() => controller.saveProfile('<b>'), /different profile name/);
  for (let i = 0; i < MAX_CUSTOM_PROFILES; i++) { try { controller.saveProfile(`P${i}`); } catch { break; } }
  assert.throws(() => controller.saveProfile('One too many'), /Delete a saved motion profile/);
  controller.deleteProfile('Quiet');
  assert.throws(() => controller.useProfile('Quiet'), /does not exist/);
  assert.throws(() => controller.deleteProfile('Quiet'), /does not exist/);
});

test('per-kind and global reset restore the built-in values', () => {
  const env = fakeDocument();
  const controller = createMotionController({doc: env.doc, storage: fakeStorage()});
  controller.setKind('menu', {duration: 999, enabled: false});
  controller.setKind('page', {duration: 40});
  controller.resetKind('menu');
  assert.equal(controller.snapshot().state.profile.kinds.menu.duration, builtInProfile().kinds.menu.duration);
  assert.equal(controller.snapshot().state.profile.kinds.menu.enabled, true);
  assert.equal(controller.snapshot().state.profile.kinds.page.duration, 40);
  controller.resetAll();
  assert.deepEqual(controller.snapshot().state.profile, builtInProfile());
  assert.equal(controller.snapshot().state.activeId, 'expressive');
});

test('a corrupt or hostile stored value falls back to the defaults and reports the error', () => {
  for (const raw of ['{broken', JSON.stringify({version: 1, profile: {version: 1, kinds: {page: {duration: 'fast'}}}}), '{"version":1,"__proto__":{"a":1}}', 'x'.repeat(200000)]) {
    const env = fakeDocument();
    const errors = [];
    createMotionController({doc: env.doc, storage: fakeStorage({[STORAGE_KEY]: raw}), onError: error => errors.push(error)});
    assert.equal(errors.length, 1);
    assert.equal(env.style.get('--motion-page-duration'), '520ms');
  }
  assert.throws(() => validateState({version: 1, custom: {Calm: {version: 1}}}), /name/);
});

test('another window changing the stored profile reaches this one', () => {
  const env = fakeDocument();
  const storage = fakeStorage();
  const controller = createMotionController({doc: env.doc, storage});
  const other = {...defaultState(), profile: builtInProfile('playful'), activeId: 'playful'};
  storage.map.set(STORAGE_KEY, JSON.stringify(other));
  env.listeners.storage({key: STORAGE_KEY});
  assert.equal(controller.snapshot().state.activeId, 'playful');
  assert.equal(env.style.get('--motion-page-duration'), `${builtInProfile('playful').kinds.page.duration}ms`);
});

test('previews use each kind\'s own distance and scale', () => {
  const values = {distance: 30, scale: 0.5};
  assert.match(previewKeyframes('page', values)[0].transform, /translateY\(30px\) scale\(0.5\)/);
  assert.match(previewKeyframes('tab', values)[0].transform, /translateX\(30px\)/);
  assert.match(previewKeyframes('pulse', values)[1].transform, /scale\(0.5\)/);
});
