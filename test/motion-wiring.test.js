import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MOTION_KINDS, builtInProfile, motionCssVars} from '../src/renderer/motion/motion-tokens.js';
import {createUnlockChoreography} from '../src/renderer/motion/unlock-choreography.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/renderer/motion/motion-tokens.css');
const html = read('src/renderer/index.html');
const app = read('src/renderer/app.js');

test('the stylesheet declares every token the module can write, with the module defaults', () => {
  const vars = motionCssVars(builtInProfile());
  const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
  for (const name of Object.keys(vars)) assert.ok(root.includes(`${name}:`), `${name} has a first-paint default`);
  // The first-paint durations match the Expressive profile exactly, so there is no jump when the controller runs.
  for (const kind of MOTION_KINDS) {
    const match = root.match(new RegExp(`--motion-${kind.id}-duration:(\\d+)ms`));
    assert.equal(Number(match?.[1]), builtInProfile().kinds[kind.id].duration, kind.id);
  }
});

test('reduced motion, the Motion setting and low stimulation each remove the declared animations', () => {
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^]*animation:none!important/);
  assert.match(css, /:root\[data-motion="reduced"\] \.view:not\(\[hidden\]\)/);
  assert.match(css, /:root\[data-low-stimulation="true"\] \.view:not\(\[hidden\]\)/);
  assert.match(css, /:root\[data-motion="reduced"\] \.install-takeover \*/);
});

test('the page loads the motion layer after the shell styles and boots the controller', () => {
  const order = ['style.css', 'modern.css', 'motion/motion-tokens.css', 'features/installation/takeover.css'].map(name => html.indexOf(`href="${name}"`));
  assert.ok(order.every(index => index > 0), 'all four sheets are linked');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the motion sheets come after the shell sheets');
  assert.match(app, /createMotionController\(\{doc:document,storage:localStorage/);
  assert.match(app, /motionController,takeoverPreference,openMotionEditor/);
});

test('the real installation events are routed to the takeover', () => {
  assert.match(app, /what:'WinFsp driver'/);
  assert.match(app, /title:'Update ready'/);
  assert.match(app, /title:'Update failed'/);
  assert.match(app, /onInstallResult:result=>/);
  const ollama = read('src/renderer/features/ollama/index.js');
  assert.match(ollama, /onInstallResult\(\{\.\.\.value,durationMs:/);
  // No placeholder values are ever injected into a takeover call.
  for (const bad of ['TODO', 'placeholder', 'lorem', 'exitCode:0,', 'exitCode: 0,']) assert.ok(!app.includes(`failure({${bad}`) && !read('src/renderer/features/installation/takeover.js').includes(bad), bad);
});

function fakeController({reduced = false, master = true, unlockEnabled = true} = {}) {
  const profile = builtInProfile();
  profile.master = master;
  profile.kinds.unlock.enabled = unlockEnabled;
  return {snapshot: () => ({reduced, state: {profile}})};
}
function fakeElement() { const calls = []; return {calls, animate(keyframes, options) { calls.push({keyframes, options}); return {}; }}; }

test('the unlock choreography bursts on success, shakes on failure and stays still under reduced motion', () => {
  const badge = fakeElement(), form = fakeElement();
  const play = controller => createUnlockChoreography({controller, getBadge: () => badge, getForm: () => form});
  assert.ok(play(fakeController()).play('success'));
  assert.equal(badge.calls.length, 1);
  assert.equal(badge.calls[0].options.duration, 900);
  assert.ok(play(fakeController()).play('failure'));
  assert.equal(form.calls.length, 1);
  assert.equal(form.calls[0].options.duration, Math.round(900 * 0.47));
  assert.equal(form.calls[0].keyframes[1].transform, 'translateX(-8px)');
  for (const options of [{reduced: true}, {master: false}, {unlockEnabled: false}]) {
    assert.equal(play(fakeController(options)).play('success'), null);
    assert.equal(play(fakeController(options)).play('failure'), null);
  }
  assert.equal(badge.calls.length, 1);
  assert.equal(form.calls.length, 1);
  assert.equal(createUnlockChoreography({controller: fakeController(), getBadge: () => null}).play('success'), null);
});
