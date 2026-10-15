import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {findBrowser, sleep} from '../scripts/extension-browser.mjs';
import {RUNTIME_ALLOWLIST, MotionReport, launchPlain, sample, serveStatic} from '../scripts/audit-runtime-motion.mjs';
import {pageAuditSource, probeEnterSource} from '../scripts/runtime-motion-page.mjs';

// The page-side classifier runs here over small static fixtures in a real headless browser, so a native button with
// no transition must be flagged and a Material control must pass. Without a browser the tests are skipped, not passed.
let browserPath = null;
try { browserPath = findBrowser(); } catch { browserPath = null; }
const skip = browserPath ? false : 'No Edge or Chrome executable was found; set MFE_EXTENSION_BROWSER.';

const materialStub = `<script>
  // A stand-in for a Material Web control: an md-* host whose shadow root carries a ripple with a transition.
  customElements.define('md-filled-button', class extends HTMLElement {
    constructor() { super(); this.attachShadow({mode: 'open'}).innerHTML = '<style>.ripple{position:absolute;inset:0;transition:opacity 150ms linear}</style><button part="button"><span class="ripple"></span><slot></slot></button>'; }
  });
  customElements.define('md-plain-button', class extends HTMLElement {
    constructor() { super(); this.attachShadow({mode: 'open'}).innerHTML = '<button part="button"><slot></slot></button>'; }
  });
</script>`;
const pages = {
  'native.html': `<!doctype html><meta charset=utf-8><style>body{margin:16px}button,a,input{display:block;margin:8px;min-width:80px;min-height:24px}</style><button id=bare>Go</button><a id=link href="#x">Link</a><input id=field>`,
  'native-with-transition.html': `<!doctype html><meta charset=utf-8><style>button{display:block;min-width:80px;min-height:24px;transition:background-color 200ms}</style><button id=smooth>Go</button>`,
  'material.html': `<!doctype html><meta charset=utf-8>${materialStub}<style>md-filled-button{display:inline-block;min-width:80px;min-height:24px}</style><md-filled-button id=ok>Go</md-filled-button>`,
  'material-bare.html': `<!doctype html><meta charset=utf-8>${materialStub}<style>md-plain-button{display:inline-block;min-width:80px;min-height:24px}</style><md-plain-button id=bare>Go</md-plain-button>`,
  'allowlisted.html': `<!doctype html><meta charset=utf-8><style>.home-card{display:block;min-width:80px;min-height:24px}.moving{transition:opacity 200ms}</style><button class="home-card moving" id=moving>Card</button><button class=home-card id=still>Card</button>`,
  'host-allowlist.html': `<!doctype html><meta charset=utf-8><script>customElements.define('mfe-date-field', class extends HTMLElement { constructor() { super(); this.attachShadow({mode: 'open'}).innerHTML = '<input id=inner type=date style="min-width:40px;min-height:20px">'; } }); customElements.define('mfe-other-field', class extends HTMLElement { constructor() { super(); this.attachShadow({mode: 'open'}).innerHTML = '<input id=stray type=date style="min-width:40px;min-height:20px">'; } });</script><mfe-date-field id=host></mfe-date-field><mfe-other-field id=other></mfe-other-field>`,
  'reduced.html': `<!doctype html><meta charset=utf-8><style>.a,.b{display:block;min-width:60px;min-height:20px;transition:opacity 300ms}@media(prefers-reduced-motion:reduce){.b{transition:none}}</style><div class=a id=a>A</div><div class=b id=b>B</div>`,
  'enter.html': `<!doctype html><meta charset=utf-8><style>@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.panel{display:none;min-width:60px;min-height:20px}.panel.open.animated{display:block;animation:rise 200ms both}.panel.open.still{display:block}</style><div class="panel animated" id=animated>A</div><div class="panel still" id=still>B</div>`
};

async function withPages(body) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-runtime-motion-test-'));
  for (const [name, html] of Object.entries(pages)) await fs.writeFile(path.join(directory, name), html);
  const {server, origin} = await serveStatic(directory);
  const session = await launchPlain({browser: browserPath});
  try {
    const page = await session.open('about:blank');
    await page.send('Emulation.setDeviceMetricsOverride', {width: 800, height: 600, deviceScaleFactor: 1, mobile: false});
    const run = async (name, options = {}) => {
      await page.send('Page.navigate', {url: `${origin}/${name}`}); await sleep(500);
      return page.eval(`(${pageAuditSource})(${JSON.stringify({allowlist: RUNTIME_ALLOWLIST, ...options})})`);
    };
    return await body({page, run, origin});
  } finally { await session.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, {recursive: true, force: true}); }
}

test('the runtime classifier flags a native button, link and input that have no transition', {skip, timeout: 90000}, () => withPages(async ({run}) => {
  const result = await run('native.html');
  const kinds = result.findings.map(row => row.kind).sort();
  assert.deepEqual(kinds, ['link-without-motion', 'native-control', 'native-control']);
  assert.ok(result.findings.every(row => row.path && row.reason && typeof row.label === 'string' && row.label.length <= 32));
  assert.equal(result.counts.interactive, 3);
}));

test('a native button with a transition is still not a Material control, and the reason says so', {skip, timeout: 90000}, () => withPages(async ({run}) => {
  const result = await run('native-with-transition.html');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, 'native-control');
  assert.doesNotMatch(result.findings[0].reason, /no transition/);
}));

test('a Material control with a ripple passes and one without any motion is flagged', {skip, timeout: 90000}, () => withPages(async ({run}) => {
  const good = await run('material.html');
  assert.deepEqual(good.findings, []);
  assert.equal(good.counts.byClass.material, 1);
  assert.ok(good.counts.byClass['material-part'] >= 1, 'the control\'s own inner button is counted as part of the component, not as a native finding');
  const bad = await run('material-bare.html');
  assert.deepEqual(bad.findings.map(row => row.kind), ['material-without-motion']);
}));

test('allowlisted native elements must still show motion', {skip, timeout: 90000}, () => withPages(async ({run}) => {
  const result = await run('allowlisted.html');
  assert.deepEqual(result.findings.map(row => [row.kind, row.path.includes('#still')]), [['allowlisted-without-motion', true]]);
  assert.equal(result.counts.byClass['allowlisted-native'], 2);
}));

test('the picker-input allowlist applies only inside its named hosts', {skip, timeout: 90000}, () => withPages(async ({run}) => {
  const result = await run('host-allowlist.html');
  assert.deepEqual(result.findings.map(row => [row.kind, row.path.includes('mfe-other-field')]), [['native-control', true]]);
  assert.equal(result.counts.byClass['allowlisted-native'], 1);
}));

test('reduced-motion mode reports only elements that keep a transition', {skip, timeout: 90000}, () => withPages(async ({page, run}) => {
  await page.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  const result = await run('reduced.html', {mode: 'reduced'});
  assert.deepEqual(result.leaks.map(row => row.path.split(' ').pop()), ['div#a']);
  assert.equal(result.leaks[0].kind, 'transition');
  await page.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'no-preference'}]});
  const normal = await run('reduced.html', {mode: 'reduced'});
  assert.equal(normal.leakTotal, 2, 'without the emulation both elements keep their transition');
}));

test('the enter probe sees an animated surface and reports one that appears with no motion', {skip, timeout: 90000}, () => withPages(async ({page, run}) => {
  await run('enter.html');
  const animated = await page.eval(`(${probeEnterSource})("document.getElementById('animated').classList.add('open')","#animated",500)`);
  assert.equal(animated.found, true);
  assert.match(animated.via, /css-animation|computed-animation/);
  const still = await page.eval(`(${probeEnterSource})("document.getElementById('still').classList.add('open')","#still",300)`);
  assert.equal(still.found, false);
}));

test('the report merges repeated findings and counts failures from every check', () => {
  const report = new MotionReport();
  const row = {path: 'main button', kind: 'native-control', reason: 'x', label: 'Go'};
  report.addNormal('demo', 'state one', {counts: {examined: 5, interactive: 1, byClass: {'native-control': 1}}, findings: [row]});
  report.addNormal('demo', 'state two', {counts: {examined: 5, interactive: 1, byClass: {'native-control': 1}}, findings: [row]});
  report.addEnter('demo', 'open', '#panel', {found: false, via: 'none'});
  report.addReduced('demo', 'state one', {leaks: [{path: 'div', kind: 'transition', seconds: 0.2}], libraryInternal: {'md-ripple': 2}, runningAnimations: 0});
  const [surface] = report.toJSON();
  assert.equal(surface.findings.length, 1);
  assert.deepEqual(surface.findings[0].states, ['state one', 'state two']);
  assert.equal(surface.interactiveElementsChecked, 2);
  assert.equal(report.failureCount(), 3);
});

test('the runtime allowlist is minimal and every entry states a reason', () => {
  assert.ok(RUNTIME_ALLOWLIST.length <= 3);
  for (const entry of RUNTIME_ALLOWLIST) assert.ok(entry.id && entry.selector && entry.reason.length > 30);
});

test('route sampling always keeps the first and last entries and spreads the rest', () => {
  const list = Array.from({length: 100}, (_, index) => index);
  const picked = sample(list, 10);
  assert.equal(picked.length, 10); assert.equal(picked[0], 0); assert.equal(picked.at(-1), 99);
  assert.deepEqual(sample([1, 2], 10), [1, 2]);
});
