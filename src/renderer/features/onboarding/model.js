import {normalizeDriveName} from '../../../shared/drive-name.js';

/**
 * First-run and setup guide model. It owns the step order, the saved progress
 * and the result of each setup action, and performs every real action through
 * services injected by the renderer (the existing preference, driver, drive
 * dialog and pairing code paths). It never stores a password, key file path
 * or folder path, and it never calls an operation the person did not choose.
 */
export const ONBOARDING_KEY = 'mfe.onboarding.v1';
export const ONBOARDING_VERSION = 1;
export const STEPS = Object.freeze([
  Object.freeze({id: 'welcome', optional: false}),
  Object.freeze({id: 'look', optional: true}),
  Object.freeze({id: 'requirements', optional: true}),
  Object.freeze({id: 'drive', optional: true}),
  Object.freeze({id: 'browser', optional: true}),
  Object.freeze({id: 'done', optional: false})
]);
const IDS = STEPS.map(step => step.id);
export const LANGUAGES = Object.freeze(['en', 'yue', 'bilingual']);
export const THEMES = Object.freeze(['system', 'light', 'dark']);
const STATUSES = Object.freeze(['new', 'in-progress', 'finished', 'dismissed']);
const KEYS = ['version', 'status', 'step', 'done', 'skipped', 'choices', 'updatedAt'];
const CHOICE_KEYS = ['language', 'theme', 'driveName'];

const freshProgress = () => ({version: ONBOARDING_VERSION, status: 'new', step: 'welcome', done: [], skipped: [], choices: {}, updatedAt: 0});
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idList = value => Array.isArray(value) && value.length <= IDS.length && new Set(value).size === value.length && value.every(id => IDS.includes(id));

/** Strict validation of saved progress. Anything unexpected is rejected, never repaired. */
export function validateProgress(value) {
  if (!isObject(value) || Object.keys(value).some(key => !KEYS.includes(key))) return null;
  if (value.version !== ONBOARDING_VERSION || !STATUSES.includes(value.status) || !IDS.includes(value.step)) return null;
  if (!idList(value.done) || !idList(value.skipped) || value.done.some(id => value.skipped.includes(id))) return null;
  if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) return null;
  const choices = value.choices;
  if (!isObject(choices) || Object.keys(choices).some(key => !CHOICE_KEYS.includes(key))) return null;
  if (Object.hasOwn(choices, 'language') && !LANGUAGES.includes(choices.language)) return null;
  if (Object.hasOwn(choices, 'theme') && !THEMES.includes(choices.theme)) return null;
  if (Object.hasOwn(choices, 'driveName') && (typeof choices.driveName !== 'string' || normalizeDriveName(choices.driveName) === null)) return null;
  return {version: ONBOARDING_VERSION, status: value.status, step: value.step, done: [...value.done], skipped: [...value.skipped], choices: {...choices}, updatedAt: value.updatedAt};
}

/** Reads saved progress. `state` says whether it was found, absent, rejected or the store is unavailable. */
export function readProgress(storage) {
  let raw;
  try { raw = storage?.getItem(ONBOARDING_KEY); } catch { return {value: freshProgress(), state: 'unavailable'}; }
  if (raw === null || raw === undefined) return {value: freshProgress(), state: storage ? 'new' : 'unavailable'};
  if (typeof raw !== 'string' || raw.length > 4096) return {value: freshProgress(), state: 'invalid'};
  try {
    const parsed = validateProgress(JSON.parse(raw));
    return parsed ? {value: parsed, state: 'ok'} : {value: freshProgress(), state: 'invalid'};
  } catch { return {value: freshProgress(), state: 'invalid'}; }
}

export function writeProgress(storage, progress) {
  try { storage.setItem(ONBOARDING_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

const result = (ok, key, detail = null) => ({ok, key, detail});

/**
 * One guide session. `services` supplies the real actions:
 *   getSnapshot()                      -> {language, theme, driver, drive, canInstallDriver}
 *   setPreference(key, value)          -> applies and saves one preference through the existing path
 *   refreshStatus()                    -> reads the drive status again
 *   serverRuntime()                    -> {available, reason?} for local server supervision
 *   installDriver()                    -> runs the existing driver installer (native consent stays with the person)
 *   openDriveDialog(mode, prefill)     -> opens the existing create or unlock dialog and resolves when it closes
 *   confirmReplace()                   -> the existing two-key confirmation; resolves true only when confirmed
 *   openHome()                         -> shows the workspace home
 */
export function createOnboardingSession({storage = null, services, now = Date.now} = {}) {
  if (!services) throw new TypeError('Onboarding services are required.');
  const loaded = readProgress(storage);
  let progress = loaded.value;
  let persistence = loaded.state === 'unavailable' ? 'session-only' : 'saved';
  const results = new Map();
  const listeners = new Set();
  let busy = null;

  const emit = () => { for (const listener of [...listeners]) listener(api); };
  const save = () => {
    progress.updatedAt = now();
    if (storage && writeProgress(storage, progress)) persistence = 'saved'; else persistence = 'session-only';
  };
  const change = mutate => { mutate(progress); save(); emit(); };
  const indexOf = id => IDS.indexOf(id);
  // Leaving a step always opens the next one, so the furthest step visited is one past the last answered step.
  const furthest = () => Math.min(IDS.length - 1, Math.max(indexOf(progress.step), ...[...progress.done, ...progress.skipped].map(id => indexOf(id) + 1)));
  const mark = (id, list) => {
    const other = list === 'done' ? 'skipped' : 'done';
    progress[other] = progress[other].filter(item => item !== id);
    if (!progress[list].includes(id)) progress[list].push(id);
  };
  const guard = async (id, work) => {
    if (busy) return result(false, 'Another setup action is still running.');
    busy = id; emit();
    try { return await work(); }
    catch (error) { return result(false, 'This action could not finish.', String(error?.message || 'Unavailable')); }
    finally { busy = null; emit(); }
  };
  const record = (id, value, {markDone = value.ok} = {}) => {
    results.set(id, value);
    if (markDone) change(state => { mark(id, 'done'); if (state.status === 'new') state.status = 'in-progress'; });
    else emit();
    return value;
  };

  const api = {
    get progress() { return progress; },
    get persistence() { return persistence; },
    get loadState() { return loaded.state; },
    get step() { return progress.step; },
    get index() { return indexOf(progress.step); },
    get status() { return progress.status; },
    get busy() { return busy; },
    get percent() { return Math.round((indexOf(progress.step) / (IDS.length - 1)) * 100); },
    /** Whether the guide should open by itself: only for a person who has never started or dismissed it. */
    get shouldAutoOpen() { return progress.status === 'new'; },
    steps() {
      const reach = furthest();
      return STEPS.map((step, position) => ({
        id: step.id, optional: step.optional, reachable: position <= reach,
        state: step.id === progress.step ? 'current' : progress.done.includes(step.id) ? 'done' : progress.skipped.includes(step.id) ? 'skipped' : 'pending'
      }));
    },
    result(id) { return results.get(id) || null; },
    snapshot() { return services.getSnapshot(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    canGoBack() { return !busy && indexOf(progress.step) > 0; },
    canGoNext() { return !busy && indexOf(progress.step) < IDS.length - 1; },
    canSkip() { return !busy && STEPS[indexOf(progress.step)].optional; },

    /** Starts or resumes. A finished guide begins again from the welcome step; anything else resumes where it stopped. */
    open() {
      change(state => {
        if (state.status === 'finished') { state.step = 'welcome'; state.done = []; state.skipped = []; }
        state.status = 'in-progress';
      });
      return progress.step;
    },
    next() {
      if (!api.canGoNext()) return false;
      change(state => {
        const current = state.step;
        if (STEPS[indexOf(current)].optional && !state.done.includes(current)) mark(current, 'skipped');
        else if (current === 'welcome') mark(current, 'done');
        state.step = IDS[indexOf(current) + 1];
        if (state.status === 'new') state.status = 'in-progress';
      });
      return true;
    },
    back() {
      if (!api.canGoBack()) return false;
      change(state => { state.step = IDS[indexOf(state.step) - 1]; });
      return true;
    },
    skipStep() { return api.canSkip() ? api.next() : false; },
    /** Jumps to a step already reached (the current one, or any earlier or answered one). Never past the furthest step. */
    goTo(id) {
      if (busy || !IDS.includes(id)) return false;
      if (indexOf(id) > furthest()) return false;
      change(state => { state.step = id; });
      return true;
    },
    /** Leaves the guide without losing progress. The saved step resumes the next time it opens. */
    saveAndClose() { change(state => { if (state.status !== 'finished') state.status = 'dismissed'; }); services.openHome?.(); return true; },
    /** Skips the whole guide. Nothing is changed on the device. */
    dismiss() { change(state => { state.status = 'dismissed'; }); services.openHome?.(); return true; },
    finish() {
      if (progress.step !== 'done' || busy) return false;
      change(state => { state.status = 'finished'; });
      services.openHome?.();
      return true;
    },
    /** Clears saved wizard progress only. No preference, drive or pairing is changed. */
    restart() {
      results.clear();
      progress = freshProgress();
      save(); emit();
    },

    async chooseLanguage(value) {
      if (!LANGUAGES.includes(value)) return result(false, 'Choose English, Cantonese or both.');
      return guard('look', async () => {
        services.setPreference('language', value);
        change(state => { state.choices.language = value; });
        return record('look', result(true, 'Language applied.', value));
      });
    },
    async chooseTheme(value) {
      if (!THEMES.includes(value)) return result(false, 'Choose the device setting, light or dark.');
      return guard('look', async () => {
        services.setPreference('theme', value);
        change(state => { state.choices.theme = value; });
        return record('look', result(true, 'Appearance applied.', value));
      });
    },

    /** Reads the real driver and server runtime state. Read-only. */
    async checkRequirements() {
      return guard('requirements', async () => {
        await services.refreshStatus?.();
        const snapshot = services.getSnapshot();
        const runtime = await Promise.resolve(services.serverRuntime?.()).catch(() => null);
        const driver = snapshot.driver || {};
        const winfsp = driver.checking ? 'checking' : driver.available === true ? 'ready' : driver.available === false ? 'missing' : 'unknown';
        const server = runtime == null ? 'unknown' : runtime.available ? 'ready' : 'unavailable';
        const value = {ok: winfsp === 'ready', key: winfsp === 'ready' ? 'Drive mounting is ready.' : 'Drive mounting needs WinFsp.', detail: null, winfsp, winfspDetail: driver.error || null, server, serverDetail: runtime?.reason || null, canInstall: Boolean(snapshot.canInstallDriver && winfsp === 'missing')};
        results.set('requirements', value);
        change(state => { mark('requirements', 'done'); if (state.status === 'new') state.status = 'in-progress'; });
        return value;
      });
    },
    async installDriver() {
      return guard('requirements', async () => {
        const snapshot = services.getSnapshot();
        if (!snapshot.canInstallDriver) return record('requirements', result(false, 'The driver installer is not available here.'), {markDone: false});
        await services.installDriver();
        await services.refreshStatus?.();
        const after = services.getSnapshot().driver || {};
        const ok = after.available === true;
        const value = {ok, key: ok ? 'WinFsp is installed.' : 'WinFsp is not installed yet. Windows may still be asking for approval.', detail: null, winfsp: ok ? 'ready' : 'missing', winfspDetail: after.error || null, server: results.get('requirements')?.server || 'unknown', serverDetail: results.get('requirements')?.serverDetail || null, canInstall: !ok};
        results.set('requirements', value);
        change(state => { mark('requirements', 'done'); });
        return value;
      });
    },

    /**
     * Opens the existing create or unlock dialog with the chosen name and folders filled in. The dialog keeps its own
     * validation, password and key handling and its own result; this step reads the drive state afterwards.
     * Creating while a drive is already set up first needs the two-key confirmation.
     */
    async openDrive(mode, prefill = {}) {
      if (!['create', 'unlock'].includes(mode)) return result(false, 'Choose to create or unlock a drive.');
      let driveName;
      if (prefill.driveName !== undefined && String(prefill.driveName).trim() !== '') {
        driveName = normalizeDriveName(String(prefill.driveName));
        if (driveName === null) return record('drive', result(false, 'That drive name is not allowed.'), {markDone: false});
      }
      return guard('drive', async () => {
        const before = services.getSnapshot().drive || {};
        if (mode === 'create' && before.configured) {
          const confirmed = await services.confirmReplace();
          if (confirmed !== true) return record('drive', result(false, 'Nothing was changed. The current drive is still set up.'), {markDone: false});
        }
        if (driveName !== undefined) change(state => { state.choices.driveName = driveName; });
        await services.openDriveDialog(mode, {driveName, storageDir: prefill.storageDir || '', cacheDir: prefill.cacheDir || ''});
        await services.refreshStatus?.();
        const drive = services.getSnapshot().drive || {};
        const ready = drive.configured === true && drive.locked === false;
        return record('drive', ready
          ? result(true, mode === 'create' ? 'Your drive is created and unlocked.' : 'Your drive is unlocked.', drive.driveName || null)
          : result(false, 'No drive was created or unlocked. You can try again or skip this step.'));
      });
    },

    /** The pairing code itself comes from the existing pairing view; this records that it was shown. */
    notePairingCodeShown() {
      return record('browser', result(true, 'A pairing code was shown. Enter it in the browser extension.'));
    }
  };
  return api;
}
