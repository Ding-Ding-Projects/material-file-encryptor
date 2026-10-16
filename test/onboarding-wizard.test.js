import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDocument, walk, textOf, byText, byKey, findAll, tick, memoryStorage} from './helpers/onboarding-dom.js';

globalThis.HTMLElement ??= class {};
globalThis.CSSStyleSheet ??= class { replaceSync() {} };
globalThis.customElements ??= {items: new Map(), get(name) { return this.items.get(name); }, define(name, type) { this.items.set(name, type); }};
const {createOnboardingSession, readProgress, validateProgress, writeProgress, STEPS, ONBOARDING_KEY} = await import('../src/renderer/features/onboarding/model.js');
const {mountOnboarding} = await import('../src/renderer/features/onboarding/index.js');
const {ONBOARDING_COPY, onboardingTranslator} = await import('../src/renderer/features/onboarding/copy.js');
const read = relative => fs.readFile(new URL('../' + relative, import.meta.url), 'utf8');

function services(overrides = {}) {
  const calls = [];
  const state = {language: 'en', theme: 'system', driver: {available: false, checking: false, error: 'WinFsp is not installed.'}, canInstall: true, drive: {configured: false, locked: true, driveName: ''}, runtime: {available: true}};
  const api = {
    calls, state,
    getSnapshot: () => ({language: state.language, theme: state.theme, driver: {...state.driver}, canInstallDriver: state.canInstall, drive: {...state.drive}}),
    setPreference: (key, value) => { calls.push(['setPreference', key, value]); state[key] = value; },
    refreshStatus: async () => { calls.push(['refreshStatus']); },
    serverRuntime: async () => state.runtime,
    installDriver: async () => { calls.push(['installDriver']); state.driver = {available: true, checking: false}; },
    openDriveDialog: async (mode, prefill) => { calls.push(['openDriveDialog', mode, {...prefill}]); state.drive = {configured: true, locked: false, driveName: prefill.driveName || 'Material Files'}; },
    confirmReplace: async () => { calls.push(['confirmReplace']); return true; },
    openHome: () => { calls.push(['openHome']); },
    ...overrides
  };
  return api;
}
const session = (options = {}) => { const s = services(options.services); const storage = options.storage ?? memoryStorage(); return {s, storage, session: createOnboardingSession({storage, services: s, now: () => 1000})}; };
const advance = (model, count) => { for (let index = 0; index < count; index++) model.next(); };

// ------------------------------------------------------------------ model

test('the guide has an ordered, hand-written step list with only the first and last required', () => {
  assert.deepEqual(STEPS.map(step => step.id), ['welcome', 'look', 'requirements', 'drive', 'browser', 'done']);
  assert.deepEqual(STEPS.filter(step => !step.optional).map(step => step.id), ['welcome', 'done']);
});

test('first run opens by itself once, resumes after being left, and never reopens after finish or skip', () => {
  const {session: model, storage} = session();
  assert.equal(model.shouldAutoOpen, true);
  model.open();
  assert.equal(model.shouldAutoOpen, false);
  assert.equal(createOnboardingSession({storage, services: services()}).shouldAutoOpen, false, 'a restart does not reopen it');
  model.dismiss();
  assert.equal(createOnboardingSession({storage, services: services()}).shouldAutoOpen, false);
  const fresh = session();
  advance(fresh.session, 5);
  fresh.session.finish();
  assert.equal(fresh.session.status, 'finished');
  assert.equal(createOnboardingSession({storage: fresh.storage, services: services()}).shouldAutoOpen, false);
});

test('language and appearance are applied through the existing preference path and reported', async () => {
  const {session: model, s, storage} = session();
  model.next();
  const language = await model.chooseLanguage('yue');
  assert.equal(language.ok, true);
  assert.deepEqual(s.calls.find(call => call[0] === 'setPreference'), ['setPreference', 'language', 'yue']);
  const theme = await model.chooseTheme('dark');
  assert.equal(theme.ok, true);
  assert.deepEqual(s.calls.filter(call => call[0] === 'setPreference').at(-1), ['setPreference', 'theme', 'dark']);
  assert.equal(model.result('look').key, 'Appearance applied.');
  assert.deepEqual(model.progress.choices, {language: 'yue', theme: 'dark'});
  assert.ok(model.progress.done.includes('look'));
  assert.deepEqual(JSON.parse(storage.getItem(ONBOARDING_KEY)).choices, {language: 'yue', theme: 'dark'});
});

test('an invalid language or theme is rejected before any preference is touched', async () => {
  const {session: model, s} = session();
  assert.equal((await model.chooseLanguage('klingon')).ok, false);
  assert.equal((await model.chooseTheme('neon')).ok, false);
  assert.equal(s.calls.length, 0);
  assert.equal(model.progress.done.length, 0);
});

test('the requirements step reads the real driver and server runtime and reports each separately', async () => {
  const {session: model, s} = session();
  const missing = await model.checkRequirements();
  assert.equal(missing.winfsp, 'missing');
  assert.equal(missing.server, 'ready');
  assert.equal(missing.canInstall, true);
  assert.equal(missing.ok, false);
  assert.deepEqual(s.calls.map(call => call[0]), ['refreshStatus'], 'a check reads status and installs nothing');
  s.state.driver = {available: true, checking: false};
  s.state.runtime = {available: false, reason: 'No supervisor.'};
  const ready = await model.checkRequirements();
  assert.equal(ready.winfsp, 'ready');
  assert.equal(ready.server, 'unavailable');
  assert.equal(ready.serverDetail, 'No supervisor.');
  assert.equal(ready.ok, true);
  assert.equal(ready.canInstall, false);
});

test('installing the driver runs only when it is offered, re-reads the state and reports whether it worked', async () => {
  const unsupported = session({services: {}});
  unsupported.s.state.canInstall = false;
  const refused = await unsupported.session.installDriver();
  assert.equal(refused.ok, false);
  assert.equal(unsupported.s.calls.some(call => call[0] === 'installDriver'), false);

  const {session: model, s} = session();
  const done = await model.installDriver();
  assert.equal(done.ok, true);
  assert.equal(done.winfsp, 'ready');
  assert.deepEqual(s.calls.map(call => call[0]), ['installDriver', 'refreshStatus']);

  const stuck = session({services: {installDriver: async () => {}}});
  const waiting = await stuck.session.installDriver();
  assert.equal(waiting.ok, false);
  assert.match(waiting.key, /not installed yet/);
});

test('the drive step opens the existing dialog with the chosen name and folders and reports what actually happened', async () => {
  const {session: model, s, storage} = session();
  const result = await model.openDrive('create', {driveName: '  Family files ', storageDir: 'D:\\Encrypted', cacheDir: 'D:\\Cache'});
  assert.equal(result.ok, true);
  assert.deepEqual(s.calls.find(call => call[0] === 'openDriveDialog'), ['openDriveDialog', 'create', {driveName: 'Family files', storageDir: 'D:\\Encrypted', cacheDir: 'D:\\Cache'}]);
  assert.equal(s.calls.some(call => call[0] === 'confirmReplace'), false, 'a first drive needs no replacement confirmation');
  assert.equal(model.result('drive').detail, 'Family files');
  const saved = storage.getItem(ONBOARDING_KEY);
  assert.deepEqual(JSON.parse(saved).choices, {driveName: 'Family files'});
  assert.doesNotMatch(saved, /Encrypted|Cache|password|key/i, 'folders, secrets and key paths are never saved');
});

test('a dialog that ends without a ready drive is reported as not done', async () => {
  const {session: model} = session({services: {openDriveDialog: async () => {}}});
  const result = await model.openDrive('unlock', {});
  assert.equal(result.ok, false);
  assert.equal(model.progress.done.includes('drive'), false);
});

test('a drive name Windows would reject never reaches the dialog', async () => {
  const {session: model, s} = session();
  const result = await model.openDrive('create', {driveName: 'bad:name'});
  assert.equal(result.ok, false);
  assert.equal(s.calls.some(call => call[0] === 'openDriveDialog'), false);
  assert.equal((await model.openDrive('erase', {})).ok, false);
});

test('creating over a drive that is already set up needs the two-key confirmation, and declining changes nothing', async () => {
  const declined = session({services: {confirmReplace: async () => false}});
  declined.s.state.drive = {configured: true, locked: false, driveName: 'Current'};
  const stopped = await declined.session.openDrive('create', {driveName: 'Another'});
  assert.equal(stopped.ok, false);
  assert.equal(declined.s.calls.some(call => call[0] === 'openDriveDialog'), false);
  assert.equal(declined.session.progress.choices.driveName, undefined, 'a declined replacement saves no choice');

  const confirmed = session();
  confirmed.s.state.drive = {configured: true, locked: false, driveName: 'Current'};
  const proceeded = await confirmed.session.openDrive('create', {driveName: 'Another'});
  assert.deepEqual(confirmed.s.calls.map(call => call[0]).slice(0, 2), ['confirmReplace', 'openDriveDialog']);
  assert.equal(proceeded.ok, true);

  const unlocking = session();
  unlocking.s.state.drive = {configured: true, locked: true, driveName: 'Current'};
  await unlocking.session.openDrive('unlock', {});
  assert.equal(unlocking.s.calls.some(call => call[0] === 'confirmReplace'), false, 'unlocking replaces nothing');
});

test('only one setup action runs at a time', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const {session: model} = session({services: {openDriveDialog: () => gate}});
  const first = model.openDrive('create', {});
  const second = await model.checkRequirements();
  assert.equal(second.ok, false);
  assert.equal(model.busy, 'drive');
  assert.equal(model.canGoNext(), false, 'navigation waits for the running action');
  release();
  await first;
  assert.equal(model.busy, null);
});

test('a service that throws is reported instead of crashing the guide', async () => {
  const {session: model} = session({services: {setPreference: () => { throw new Error('Storage is full.'); }}});
  const result = await model.chooseLanguage('en');
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'Storage is full.');
  assert.equal(model.progress.done.includes('look'), false);
});

test('Next on an unanswered optional step records it as skipped, and the first and last steps cannot be skipped', () => {
  const {session: model} = session();
  assert.equal(model.canSkip(), false, 'welcome is required');
  model.next();
  assert.equal(model.step, 'look');
  assert.equal(model.canSkip(), true);
  assert.equal(model.skipStep(), true);
  assert.deepEqual(model.progress.skipped, ['look']);
  assert.equal(model.step, 'requirements');
  advance(model, 3);
  assert.equal(model.step, 'done');
  assert.equal(model.canSkip(), false);
  assert.equal(model.canGoNext(), false);
  assert.equal(model.skipStep(), false);
  assert.deepEqual(model.steps().map(step => step.state), ['done', 'skipped', 'skipped', 'skipped', 'skipped', 'current']);
});

test('Back and goTo move only within steps already reached', async () => {
  const {session: model} = session();
  assert.equal(model.back(), false);
  advance(model, 2);
  assert.equal(model.goTo('drive'), false, 'cannot jump ahead');
  assert.equal(model.goTo('look'), true);
  assert.equal(model.back(), true);
  assert.equal(model.step, 'welcome');
  assert.equal(model.goTo('requirements'), true, 'a reached step can be revisited');
});

test('finishing leads to the workspace home; skip and save-and-close keep progress and also lead home', () => {
  const finished = session();
  advance(finished.session, 5);
  assert.equal(finished.session.finish(), true);
  assert.deepEqual(finished.s.calls.at(-1), ['openHome']);
  assert.equal(finished.session.progress.status, 'finished');

  const early = session();
  early.session.next();
  assert.equal(early.session.finish(), false, 'finish only works on the last step');
  early.session.saveAndClose();
  assert.equal(early.session.status, 'dismissed');
  assert.equal(early.session.step, 'look');
  assert.deepEqual(early.s.calls.at(-1), ['openHome']);
  early.session.dismiss();
  assert.equal(early.s.calls.filter(call => call[0] === 'openHome').length, 2);
});

test('progress resumes after a restart at the same step with the same answers', async () => {
  const first = session();
  first.session.next();
  await first.session.chooseLanguage('bilingual');
  first.session.next();
  first.session.next();
  const restarted = createOnboardingSession({storage: first.storage, services: services()});
  assert.equal(restarted.step, 'drive');
  assert.deepEqual(restarted.progress.done, ['welcome', 'look']);
  assert.deepEqual(restarted.progress.skipped, ['requirements']);
  assert.equal(restarted.progress.choices.language, 'bilingual');
  assert.equal(restarted.loadState, 'ok');
  assert.equal(restarted.open(), 'drive', 'reopening resumes where it stopped');
});

test('reopening a finished guide starts again, and Start over clears only the saved progress', async () => {
  const {session: model, s, storage} = session();
  advance(model, 5);
  model.finish();
  assert.equal(model.open(), 'welcome');
  assert.equal(model.status, 'in-progress');
  const before = s.calls.length;
  model.restart();
  assert.equal(model.status, 'new');
  assert.equal(model.step, 'welcome');
  assert.equal(s.calls.length, before, 'starting over calls no service');
  assert.equal(JSON.parse(storage.getItem(ONBOARDING_KEY)).status, 'new');
});

test('unusable saved progress is rejected whole, and an unavailable store keeps the guide working in memory', () => {
  const bad = [
    {version: 2}, 'not json', JSON.stringify({version: 1, status: 'in-progress', step: 'nowhere', done: [], skipped: [], choices: {}, updatedAt: 1}),
    JSON.stringify({version: 1, status: 'in-progress', step: 'look', done: ['look'], skipped: ['look'], choices: {}, updatedAt: 1}),
    JSON.stringify({version: 1, status: 'in-progress', step: 'look', done: [], skipped: [], choices: {password: 'x'}, updatedAt: 1}),
    JSON.stringify({version: 1, status: 'in-progress', step: 'look', done: [], skipped: [], choices: {driveName: 'a:b'}, updatedAt: 1}),
    JSON.stringify({version: 1, status: 'in-progress', step: 'look', done: [], skipped: [], choices: {}, updatedAt: 1, extra: true}),
    'x'.repeat(5000)
  ];
  for (const raw of bad) {
    const loaded = readProgress(memoryStorage({[ONBOARDING_KEY]: raw}));
    assert.equal(loaded.state, 'invalid', String(raw).slice(0, 40));
    assert.equal(loaded.value.status, 'new');
  }
  assert.equal(validateProgress({version: 1, status: 'new', step: 'welcome', done: [], skipped: [], choices: {}, updatedAt: 0}).step, 'welcome');
  const failing = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  const model = createOnboardingSession({storage: failing, services: services()});
  assert.equal(model.persistence, 'session-only');
  model.next();
  assert.equal(model.step, 'look');
  assert.equal(model.persistence, 'session-only');
  assert.equal(writeProgress(failing, model.progress), false);
});

// ------------------------------------------------------------------ view

function mountView({language = 'en', storage = memoryStorage(), overrides = {}, pairing = null, folder = null} = {}) {
  const document = createDocument();
  const host = document.createElement('div');
  const s = services(overrides);
  const model = createOnboardingSession({storage, services: s, now: () => 1000});
  const requested = [];
  const translate = onboardingTranslator(() => language);
  const record = source => { requested.push(source); return translate(source); };
  const view = mountOnboarding(host, {
    session: model, translate: record, chooseFolder: folder, getDefaults: () => ({cacheDir: 'C:\\Cache', driveName: 'Material Files'}),
    mountPairing: pairing
  });
  return {document, host, s, model, view, requested, storage};
}
const heading = ui => ui.host.children[0].children[0].children[1];
const status = ui => walk(ui.host).filter(node => node.className === 'onboarding-result').map(node => node.textContent);

test('the view starts on the welcome step with progress, step list and a disabled Back', () => {
  const ui = mountView();
  assert.equal(heading(ui).textContent, 'Welcome');
  const text = textOf(ui.host);
  assert.match(text, /Step 1 of 6/);
  assert.equal(byKey(ui.host, 'back').disabled, true);
  assert.equal(byKey(ui.host, 'skip-step').hidden, true, 'the first step cannot be skipped');
  const chips = findAll(ui.host, node => node.className === 'onboarding-step-chip');
  assert.equal(chips.length, 6);
  assert.equal(chips[0].attributes['aria-current'], 'step');
  assert.equal(chips[3].disabled, true, 'a step not yet reached cannot be opened');
  const progress = findAll(ui.host, node => node.localName === 'md-linear-progress')[0];
  assert.equal(progress.value, 0);
});

test('Next, Back and Skip move through the steps, and the heading takes focus on each new step', async () => {
  const ui = mountView();
  await byKey(ui.host, 'next').click();
  assert.equal(heading(ui).textContent, 'Look and language');
  assert.equal(ui.document.activeElement, heading(ui));
  assert.match(textOf(ui.host), /Step 2 of 6/);
  await byKey(ui.host, 'skip-step').click();
  assert.equal(heading(ui).textContent, 'Requirements');
  await byKey(ui.host, 'back').click();
  assert.equal(heading(ui).textContent, 'Look and language');
  assert.equal(ui.model.progress.skipped.includes('look'), true);
});

test('keyboard: Alt+Right and Alt+Left move between steps, and unmodified arrows do nothing', async () => {
  const ui = mountView();
  await ui.document.fire('keydown', {key: 'ArrowRight', altKey: true});
  assert.equal(ui.model.step, 'look');
  await ui.document.fire('keydown', {key: 'ArrowRight', altKey: false});
  assert.equal(ui.model.step, 'look');
  await ui.document.fire('keydown', {key: 'ArrowLeft', altKey: true});
  assert.equal(ui.model.step, 'welcome');
  await ui.document.fire('keydown', {key: 'ArrowLeft', altKey: true});
  assert.equal(ui.model.step, 'welcome', 'cannot go back past the first step');
  const buttons = findAll(ui.host, node => /button$/.test(node.localName));
  assert.ok(buttons.length >= 4, 'every action is a real focusable Material button');
});

test('the keyboard shortcuts work from anywhere while the guide is on screen and are ignored while its view is hidden', async () => {
  const ui = mountView();
  ui.host.closest = selector => selector === '[hidden]' ? {hidden: true} : null;
  await ui.document.fire('keydown', {key: 'ArrowRight', altKey: true});
  assert.equal(ui.model.step, 'welcome', 'a hidden view does not react');
  ui.host.closest = () => null;
  await ui.document.fire('keydown', {key: 'ArrowRight', altKey: true});
  assert.equal(ui.model.step, 'look', 'focus does not need to be inside the guide');
});

test('choosing a language and a theme in the view applies them through the preference path and shows the result', async () => {
  const ui = mountView();
  ui.model.next();
  ui.view.render();
  const language = byKey(ui.host, 'language');
  language.value = 'yue';
  await language.fire('change');
  await tick();
  assert.deepEqual(ui.s.calls.find(call => call[0] === 'setPreference'), ['setPreference', 'language', 'yue']);
  assert.deepEqual(status(ui), ['Language applied. yue']);
  const theme = byKey(ui.host, 'theme');
  theme.value = 'dark';
  await theme.fire('change');
  await tick();
  assert.deepEqual(ui.s.calls.filter(call => call[0] === 'setPreference').at(-1), ['setPreference', 'theme', 'dark']);
});

test('the requirements step reads status on demand, then offers the installer only when it is needed', async () => {
  const ui = mountView();
  ui.model.next(); ui.model.next();
  assert.match(textOf(ui.host), /Not checked yet/);
  assert.equal(byKey(ui.host, 'install').hidden, true);
  await byKey(ui.host, 'check').click();
  await tick();
  const text = textOf(ui.host);
  assert.match(text, /WinFsp driver: Not installed/);
  assert.match(text, /Local server runtime: Available/);
  assert.equal(byKey(ui.host, 'install').hidden, false);
  await byKey(ui.host, 'install').click();
  await tick();
  assert.match(textOf(ui.host), /WinFsp driver: Ready/);
  assert.equal(ui.s.calls.filter(call => call[0] === 'installDriver').length, 1);
});

test('the drive step passes the typed name and the browsed folder to the existing dialog and shows its outcome', async () => {
  const ui = mountView({folder: async kind => kind === 'storage' ? 'E:\\Vault' : null});
  advance(ui.model, 3);
  const name = byKey(ui.host, 'drive-name');
  assert.equal(name.value, 'Material Files', 'the suggested name is filled in');
  name.value = 'Photos';
  await name.fire('input');
  await byKey(ui.host, 'browse-storage').click();
  await tick();
  assert.equal(byKey(ui.host, 'storage').value, 'E:\\Vault');
  await byKey(ui.host, 'create-drive').click();
  await tick();
  const call = ui.s.calls.find(item => item[0] === 'openDriveDialog');
  assert.deepEqual(call, ['openDriveDialog', 'create', {driveName: 'Photos', storageDir: 'E:\\Vault', cacheDir: 'C:\\Cache'}]);
  assert.deepEqual(status(ui), ['Your drive is created and unlocked. Photos']);
  await byKey(ui.host, 'unlock-drive').click();
  await tick();
  assert.equal(ui.s.calls.filter(item => item[0] === 'openDriveDialog').at(-1)[1], 'unlock');
});

test('the pairing step mounts the existing pairing view once, and showing a code does not rebuild or clear it', async () => {
  const mounted = [];
  const ui = mountView({pairing: slot => { const entry = {slot, destroyed: false, destroy() { entry.destroyed = true; }}; mounted.push(entry); return entry; }});
  advance(ui.model, 4);
  assert.equal(ui.model.step, 'browser');
  assert.equal(mounted.length, 1);
  ui.model.notePairingCodeShown();
  await tick();
  assert.equal(mounted.length, 1, 'no second mount');
  assert.equal(mounted[0].destroyed, false, 'the code stays visible');
  assert.deepEqual(status(ui), ['A pairing code was shown. Enter it in the browser extension.']);
  await byKey(ui.host, 'next').click();
  assert.equal(mounted[0].destroyed, true, 'leaving the step clears the pairing view');
});

test('the last step summarises each step truthfully and leads into the workspace home', async () => {
  const ui = mountView();
  ui.model.next();
  await ui.model.chooseLanguage('en');
  advance(ui.model, 4);
  const summary = textOf(findAll(ui.host, node => node.className === 'onboarding-summary')[0]);
  assert.match(summary, /Look and language: Done/);
  assert.match(summary, /Requirements: Skipped/);
  assert.match(summary, /Your drive: Skipped/);
  assert.equal(byKey(ui.host, 'next'), undefined, 'there is no Next after the last step');
  await byKey(ui.host, 'finish').click();
  assert.deepEqual(ui.s.calls.at(-1), ['openHome']);
  assert.equal(ui.model.status, 'finished');
  await byKey(ui.host, 'restart').click();
  assert.equal(ui.model.step, 'welcome');
});

test('Skip setup and Save and close leave the guide, keep progress and open the home view', async () => {
  const ui = mountView();
  ui.model.next();
  await byKey(ui.host, 'save-close').click();
  assert.equal(ui.model.status, 'dismissed');
  assert.deepEqual(ui.s.calls.at(-1), ['openHome']);
  assert.equal(ui.model.step, 'look');
  await byKey(ui.host, 'skip-setup').click();
  assert.equal(ui.s.calls.filter(call => call[0] === 'openHome').length, 2);
  assert.equal(JSON.parse(ui.storage.getItem(ONBOARDING_KEY)).step, 'look');
});

test('a view mounted after a restart resumes on the saved step', () => {
  const first = mountView();
  advance(first.model, 3);
  first.view.destroy();
  const second = mountView({storage: first.storage});
  assert.equal(heading(second).textContent, 'Your drive');
  assert.match(textOf(second.host), /Step 4 of 6/);
});

for (const language of ['en', 'yue', 'bilingual']) {
  test(`every step is readable in ${language}, and every string the view asks for has a Cantonese counterpart`, () => {
    const ui = mountView({language, pairing: () => ({destroy() {}})});
    for (const step of STEPS) {
      while (ui.model.step !== step.id) ui.model.next();
      ui.view.render();
      assert.ok(heading(ui).textContent.length > 0);
    }
    for (const source of ui.requested) assert.ok(Object.hasOwn(ONBOARDING_COPY, source), `no Cantonese wording for "${source}"`);
    if (language === 'yue') assert.equal(heading(ui).textContent, ONBOARDING_COPY.Finish);
    if (language === 'bilingual') assert.equal(heading(ui).textContent, `Finish \u00b7 ${ONBOARDING_COPY.Finish}`);
  });
}

test('step results use wording the translator knows', () => {
  const keys = [
    'Language applied.', 'Appearance applied.', 'Choose English, Cantonese or both.', 'Choose the device setting, light or dark.', 'Another setup action is still running.', 'This action could not finish.',
    'Drive mounting is ready.', 'Drive mounting needs WinFsp.', 'The driver installer is not available here.', 'WinFsp is installed.', 'WinFsp is not installed yet. Windows may still be asking for approval.',
    'Choose to create or unlock a drive.', 'That drive name is not allowed.', 'Nothing was changed. The current drive is still set up.', 'Your drive is created and unlocked.', 'Your drive is unlocked.',
    'No drive was created or unlocked. You can try again or skip this step.', 'A pairing code was shown. Enter it in the browser extension.', 'Local server supervision is not available on this computer.'
  ];
  for (const key of keys) assert.ok(Object.hasOwn(ONBOARDING_COPY, key), key);
});

test('the destroyed view removes its keyboard handling and leaves the host empty', async () => {
  const ui = mountView();
  ui.view.destroy();
  assert.equal(ui.host.children.length, 0);
  await ui.document.fire('keydown', {key: 'ArrowRight', altKey: true});
  assert.equal(ui.model.step, 'welcome');
  ui.view.destroy();
});

// ------------------------------------------------------------------ wiring and motion

test('the desktop wires the guide to first launch, Help, the command palette and the existing confirmation', async () => {
  const app = await read('src/renderer/app.js');
  assert.match(app, /createOnboardingSession\(\{storage:localStorage/);
  assert.match(app, /mountFeature\('onboarding','Setup guide'/);
  assert.match(app, /onboardingSession\.shouldAutoOpen&&!effectiveLocalSettings\.school\.enabled/);
  assert.match(app, /id:'onboarding:open'/);
  assert.match(app, /listen\('open-setup-guide','click'/);
  assert.match(app, /requestSuperConfirmation\(document\.body,\{action:'Create a drive replaces the current drive'/);
  assert.match(app, /featureRequest\('browser-pairing',action,\{\}\)/);
  assert.match(app, /featureRequest\('server-manager','capabilities',\{\}\)/);
  const html = await read('src/renderer/index.html');
  assert.match(html, /id="open-setup-guide"/);
  assert.ok(html.indexOf('id="open-setup-guide"') > html.indexOf('id="view-help"'), 'the button is in the Help view');
});

test('the guide animates with motion tokens and removes every animation and transition for reduced motion', async () => {
  const css = await read('src/renderer/features/onboarding/onboarding.css');
  assert.match(css, /\.onboarding-panel\{[^}]*animation:onboarding-forward var\(--md-sys-motion-duration-medium2/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.onboarding-panel\{animation:none\}\.onboarding-step-chip,\.onboarding-header h2\{transition:none\}\}/);
  assert.match(css, /transition:background-color var\(--md-sys-motion-duration-short3/);
});

