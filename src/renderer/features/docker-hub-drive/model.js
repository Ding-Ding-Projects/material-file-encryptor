import { formatBytes, formatTime, fill } from '../split-storage/model.js';

export { formatBytes, formatTime, fill };
export const HUB_DRIVE_METHODS = Object.freeze(['hubDriveFolders', 'hubDriveFoldersDiscard', 'hubCatalogStart', 'hubCatalogStatus', 'hubCatalogCancel', 'hubEnsureRepository', 'hubRestoreSnapshot', 'hubRestoreStatus', 'hubRestoreCancel',
  'registryLoginStatus', 'recheckRegistryLogin', 'startRegistryLogin', 'cancelRegistryLogin', 'openRegistryLoginPage', 'configureRegistryStorage', 'syncRegistryStorage', 'create', 'unlock']);
export const CHIPS = Object.freeze(['all', 'drives', 'empty', 'public', 'private']);
export const REPOSITORY_SUFFIX = 'material-file-encryptor-storage';
export const DEFAULT_PART_SIZE_BYTES = 80 * 1024 * 1024;
/** The schedule a new Docker Hub drive starts with: hourly, 15 minute retry, background task off. */
export const NEW_DRIVE_SCHEDULE = Object.freeze({ enabled: true, mode: 'interval', intervalMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6], times: ['02:00'], timeZone: 'UTC', missed: 'run-once', retryMinutes: 15, background: false });
/** A drive restored from Docker Hub is linked to its repository with the schedule switched off. */
export const RESTORED_DRIVE_SCHEDULE = Object.freeze({ ...NEW_DRIVE_SCHEDULE, enabled: false });
const REPOSITORY = /^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const DRIVE_NAME_FORBIDDEN = /[\\/:*?"<>|\x00-\x1f]/;

export const validRepository = value => typeof value === 'string' && value.length <= 140 && REPOSITORY.test(value);
export const normalizeDriveName = value => { const text = String(value ?? '').trim(); return text && [...text].length <= 32 && !DRIVE_NAME_FORBIDDEN.test(text) && !/[. ]$/.test(text) ? text : null; };

// ---- Repository list model ---------------------------------------------------------------------------------------

export function chipMatches(chip, repository) {
  if (chip === 'drives') return repository.drives.length > 0;
  if (chip === 'empty') return repository.drives.length === 0;
  if (chip === 'public') return repository.visibility === 'public';
  if (chip === 'private') return repository.visibility === 'private';
  return true;
}
export const chipCounts = repositories => Object.fromEntries(CHIPS.map(chip => [chip, repositories.filter(item => chipMatches(chip, item)).length]));
/** The rows handed to the shared search control: one row for the repository name and one for each drive name or id, so a pattern such as ^owner/ anchors on the name alone. */
export const searchRows = repositories => repositories.flatMap(item => [{ id: item.id, text: item.id }, ...item.drives.flatMap(drive => [drive.name, drive.shortId, drive.id].filter(Boolean).map(text => ({ id: item.id, text })))]);
/** Applies the filter chip, then the set of ids the search matched (null means no search is active). */
export function visibleRepositories(repositories, chip, matchedIds = null) {
  const allowed = matchedIds ? new Set(matchedIds) : null;
  return repositories.filter(item => chipMatches(chip, item) && (!allowed || allowed.has(item.id)));
}
/** A plain-text matcher used when the shared search control is not available (and by tests). */
export function plainMatcher(query) { const needle = String(query ?? '').toLocaleLowerCase(); return rows => rows.filter(row => !needle || row.text.toLocaleLowerCase().includes(needle)); }
export function regexMatcher(pattern, flags = 'iu') {
  let expression; try { expression = new RegExp(pattern, flags); } catch { return null; }
  return rows => rows.filter(row => { expression.lastIndex = 0; return expression.test(row.text); });
}

/** The repository a new drive proposes: the account's own default, and what it already holds. */
export function suggestedRepository(account, repositories = []) {
  const repository = `${account}/${REPOSITORY_SUFFIX}`;
  const existing = repositories.find(item => item.id === repository);
  return { repository, exists: Boolean(existing), driveCount: existing?.drives.length ?? 0, visibility: existing?.visibility ?? 'public' };
}
export function allDrives(repositories) { return repositories.flatMap(repository => repository.drives.map(drive => ({ repository, drive }))); }

/** Which message a failed or signed-out catalogue deserves. */
export function catalogProblem(snapshot) {
  if (!snapshot || snapshot.phase !== 'failed') return null;
  if (snapshot.reason === 'SIGN_IN_REQUIRED' || snapshot.reason === 'AUTHENTICATION_REQUIRED') return 'problemSignedOut';
  if (snapshot.reason === 'PROVIDER_UNAVAILABLE' || snapshot.reason === 'TIMEOUT') return 'problemOffline';
  return 'problemOther';
}
export function repositoryProblemKey(error) {
  if (!error) return null;
  return { AUTHENTICATION_REQUIRED: 'repoErrorSignIn', PROVIDER_UNAVAILABLE: 'repoErrorUnavailable', TIMEOUT: 'repoErrorTimeout', UNREADABLE_SNAPSHOTS: 'repoErrorUnreadable' }[error.code] ?? 'repoErrorOther';
}
export const catalogBusy = snapshot => ['listing', 'scanning'].includes(snapshot?.phase);

// ---- Drafts and validation ----------------------------------------------------------------------------------------

export function validateNewDrive(draft) {
  const problems = [];
  if (!validRepository(draft.repository)) problems.push(draft.repository ? 'validationRepositoryName' : 'validationRepository');
  if (normalizeDriveName(draft.driveName) === null) problems.push('validationName');
  if (!/^[D-Z]:?$/i.test(String(draft.driveLetter ?? ''))) problems.push('validationLetter');
  if (draft.credentialMode === 'keyFile') { if (!draft.keyFilePath) problems.push('validationPassword'); }
  else { if (!draft.password) problems.push('validationPassword'); else if (draft.password !== draft.confirmPassword) problems.push('validationMatch'); }
  return problems;
}
export function validateOpenDrive(draft) {
  const problems = [];
  if (!validRepository(draft.repository) || !draft.digest) problems.push('validationRepository');
  if (!/^[D-Z]:?$/i.test(String(draft.driveLetter ?? ''))) problems.push('validationLetter');
  if (draft.credentialMode === 'keyFile') { if (!draft.keyFilePath) problems.push('validationPassword'); }
  else if (!draft.password) problems.push('validationPassword');
  return problems;
}
const letter = value => `${String(value)[0].toUpperCase()}:`;
const credentials = draft => draft.credentialMode === 'keyFile' ? { keyFilePath: draft.keyFilePath } : { password: draft.password };
export function errorKey(error) {
  const code = error?.code ?? /(?:^|: )([A-Z_]{4,})$/.exec(String(error?.message ?? ''))?.[1];
  return { SIGN_IN_REQUIRED: 'errSignIn', AUTHENTICATION_REQUIRED: 'errSignIn', REPOSITORY_CREATE_DENIED: 'errDenied', REPOSITORY_PRIVATE: 'errPrivate', PROVIDER_UNAVAILABLE: 'errProvider', BUSY: 'errBusy', NOT_FOUND: 'restoreNotFound', RESTORE_FAILED: 'restoreFailed' }[code] ?? 'errGeneric';
}
const stepError = (step, error) => Object.assign(Error(String(error?.message ?? 'failed')), { step, code: error?.code, cause: error });

// ---- Flows ----------------------------------------------------------------------------------------------------------

export const CREATE_STEPS = Object.freeze(['folders', 'vault', 'repository', 'destination', 'sync']);
export const OPEN_STEPS = Object.freeze(['restore', 'unlock', 'destination']);

/**
 * Creates a drive whose storage and cache folders the host allocates. Nothing here ever asks for a folder:
 * `api.chooseFolder` is never called. If the drive itself cannot be created, the unused folders are
 * discarded; once it exists, a later failure keeps it and can be resumed from the failed step.
 * Returns { ok, failedStep, error, folders, resume }.
 */
export async function runCreateFlow({ api, draft, onStep = () => {}, resume = null }) {
  const state = resume ?? { folders: null, done: new Set() };
  const run = async (step, action) => {
    if (state.done.has(step)) return;
    onStep(step, 'working');
    try { await action(); state.done.add(step); onStep(step, 'done'); }
    catch (error) { onStep(step, 'failed', error); throw stepError(step, error); }
  };
  try {
    await run('folders', async () => { state.folders = await api.hubDriveFolders(); });
    await run('vault', async () => {
      try {
        await api.create({ transport: 'folder', storageDir: state.folders.storageDir, cacheDir: state.folders.cacheDir, driveLetter: letter(draft.driveLetter),
          driveName: normalizeDriveName(draft.driveName), partSizeBytes: draft.partSizeBytes ?? DEFAULT_PART_SIZE_BYTES, ...credentials(draft) });
      } catch (error) { await api.hubDriveFoldersDiscard(state.folders.driveId).catch(() => {}); state.done.delete('folders'); state.folders = null; throw error; }
    });
    await run('repository', () => api.hubEnsureRepository(draft.repository));
    await run('destination', () => api.configureRegistryStorage({ repository: draft.repository, visibility: 'public', schedule: { ...NEW_DRIVE_SCHEDULE } }));
    await run('sync', () => api.syncRegistryStorage());
    return { ok: true, folders: state.folders };
  } catch (error) {
    return { ok: false, failedStep: error.step, error, created: state.done.has('vault'), folders: state.folders, resume: state };
  }
}

/**
 * Opens a drive found on Docker Hub. The snapshot is restored into a folder the host allocates (or a parent
 * the user chose under Advanced), then unlocked, then linked to its repository with the schedule off.
 */
export async function runOpenFlow({ api, draft, onStep = () => {}, onProgress = () => {}, resume = null, until = null, setTimer = setInterval, clearTimer = clearInterval, pollMs = 400 }) {
  const state = resume ?? { restored: null, done: new Set() };
  const run = async (step, action) => {
    if (state.done.has(step)) return;
    onStep(step, 'working');
    try { await action(); state.done.add(step); onStep(step, 'done'); }
    catch (error) { onStep(step, 'failed', error); throw stepError(step, error); }
  };
  try {
    await run('restore', async () => {
      const timer = setTimer(() => { api.hubRestoreStatus().then(onProgress, () => {}); }, pollMs);
      try {
        const status = await api.hubRestoreSnapshot({ repository: draft.repository, digest: draft.digest, location: draft.location === 'choose' ? 'choose' : 'automatic' });
        if (status.state === 'cancelled') throw Object.assign(Error('cancelled'), { code: 'CANCELLED' });
        if (status.state !== 'done') throw Object.assign(Error('restore failed'), { code: status.error?.code ?? 'RESTORE_FAILED' });
        state.restored = status.result; onProgress(status);
      } finally { clearTimer(timer); }
    });
    if (until === 'restore') return { ok: true, partial: true, restored: state.restored, resume: state };
    await run('unlock', () => api.unlock({ transport: 'folder', storageDir: state.restored.storageDir, cacheDir: state.restored.cacheDir, driveLetter: letter(draft.driveLetter),
      driveName: normalizeDriveName(draft.driveName ?? state.restored.driveName), ...credentials(draft) }));
    await run('destination', () => api.configureRegistryStorage({ repository: draft.repository, visibility: state.restored.visibility === 'private' ? 'private' : 'public', schedule: { ...RESTORED_DRIVE_SCHEDULE } }));
    return { ok: true, restored: state.restored };
  } catch (error) {
    return { ok: false, failedStep: error.step, error, cancelled: error.code === 'CANCELLED', restored: state.restored, resume: state };
  }
}
