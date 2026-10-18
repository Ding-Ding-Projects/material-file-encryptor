import { MAX_SECONDARY_VAULTS, sanitizeSecondaryVaultPreferences, sanitizeSecondaryVaultSessions } from './vault-session-settings.js';

/** Desktop session inventory. Native controllers remain the authority for mount ownership. */
export class VaultSessions {
  constructor({ initialState, initialPreferences, cacheRoot }) {
    this.selectedId = 'main';
    this.rows = new Map([['main', { state: initialState, preferences: initialPreferences }]]);
    this.cacheRoot = cacheRoot;
    this.client = null;
    this.foreground = 0;
    this.switching = false;
    this.savedSettingsLoaded = false;
    this.pendingSettings = [];
  }
  get selected() { return this.rows.get(this.selectedId); }
  remember(state, preferences) { Object.assign(this.selected, { state, preferences }); }
  accept(sessionId, state) {
    const row = this.rows.get(sessionId);
    if (row) row.state = state;
    return sessionId === this.selectedId;
  }
  inventory() {
    return [...this.rows].map(([sessionId, { state, preferences }]) => ({
      sessionId, locked: state.locked, mounted: state.mounted,
      driveLetter: state.locked ? preferences.driveLetter || state.driveLetter : state.driveLetter,
      driveName: state.locked ? preferences.driveName || state.driveName : state.driveName,
      storageDir: state.storageDir || preferences.storageDir, cacheDir: state.cacheDir || preferences.cacheDir,
      recoveryRequired: state.recoveryRequired || state.lockVerified === false,
      operation: state.operation ?? null,
      activeTransfers: (state.operations || []).filter(activeOperation).length,
    }));
  }
  async run(task, expectedSessionId) {
    if (this.switching) throw new Error('Wait for vault selection to finish.');
    if (expectedSessionId !== undefined && expectedSessionId !== this.selectedId)
      throw new Error('The selected vault changed. Review the current vault and try again.');
    this.foreground++;
    try { return await task(); } finally { this.foreground--; }
  }
  async change(task) {
    if (this.switching || this.foreground) throw new Error('Wait for the current action before switching vaults.');
    this.switching = true;
    try { return await task(); } finally { this.switching = false; }
  }
  request(method, params = {}, sessionId = this.selectedId) {
    if (!this.client) throw new Error('The mounted drive is available on Windows.');
    const global = method.startsWith('server.') || method.startsWith('managedOllama.');
    return this.client.request(method, global ? params : { ...params, sessionId });
  }
  setSavedSessions(sessions) {
    if (this.savedSettingsLoaded) throw new Error('Saved vault sessions have already been staged.');
    this.pendingSettings = sanitizeSecondaryVaultSessions(sessions);
    this.savedSettingsLoaded = true;
  }
  savedSessions() {
    return sanitizeSecondaryVaultSessions([
      ...[...this.rows].filter(([id]) => id !== 'main').map(([, row]) => row.preferences),
      ...this.pendingSettings,
    ]);
  }
  async restore(defaults) {
    const failures = [];
    for (const settings of [...this.pendingSettings]) {
      try {
        await this.add(defaults, settings, { select: false });
        this.pendingSettings.splice(this.pendingSettings.indexOf(settings), 1);
      } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} secondary vault session(s) could not be restored. Their saved storage and cache locations were preserved. Restart to retry; no vault was unlocked.`);
  }
  async add(defaults, savedPreferences = null, { select = true } = {}) {
    if (!this.client) throw new Error('The mounted drive is available on Windows.');
    if (!savedPreferences && this.rows.size - 1 + this.pendingSettings.length >= MAX_SECONDARY_VAULTS)
      throw new Error('Close an unused vault session before adding another. Saved sessions awaiting recovery also count toward this limit.');
    const restored = savedPreferences && sanitizeSecondaryVaultPreferences(savedPreferences);
    const result = await this.client.request('createSession');
    if (!result || typeof result.sessionId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(result.sessionId) || this.rows.has(result.sessionId) || result.status?.locked !== true || result.status.mounted !== false)
      throw new Error('The native session identity is invalid.');
    const sessionId = result.sessionId;
    this.rows.set(sessionId, { state: result.status, preferences: sanitizeSecondaryVaultPreferences({
      ...defaults, autoUnlock: false, storageDir: undefined, remoteRepository: undefined,
      cacheDir: restored ? restored.cacheDir : this.cacheRoot(sessionId), transport: 'folder',
      driveLetter: result.status.availableDriveLetters?.[0] || 'M:',
      ...restored,
    }) });
    if (select) this.selectedId = sessionId;
  }
  select(sessionId) {
    if (!this.rows.has(sessionId)) throw new Error('The vault session no longer exists.');
    this.selectedId = sessionId;
  }
  async remove(sessionId) {
    if (sessionId === 'main') throw new Error('The primary vault session cannot be removed.');
    const row = this.rows.get(sessionId);
    if (!row) throw new Error('The vault session no longer exists.');
    if (!row.state.locked || row.state.mounted || row.state.lockVerified === false)
      throw new Error('Lock this vault and verify its teardown before removing it.');
    await this.client.request('removeSession', { sessionId });
    this.rows.delete(sessionId);
    if (this.selectedId === sessionId) this.selectedId = 'main';
  }
  async operations() {
    if (!this.client) return [];
    const rows = await Promise.all([...this.rows.keys()].map(async sessionId =>
      (await this.request('operations', {}, sessionId)).map(operation => ({ ...operation, sessionId }))));
    return rows.flat();
  }
  async each(method, params = {}) {
    if (!this.client) return [];
    // Attempt every session even if one cannot detach. Never let one busy mount
    // prevent the others from committing their journals or releasing keys.
    const results = await Promise.allSettled([...this.rows.keys()].map(async sessionId => {
      const result = await this.request(method, params, sessionId);
      const state = await this.request('statusSummary', {}, sessionId);
      this.accept(sessionId, state);
      return result;
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map(result => result.value);
  }
  get safelyLocked() {
    return [...this.rows.values()].every(({ state }) => state.locked && !state.mounted && state.lockVerified !== false);
  }
  failAll() {
    for (const row of this.rows.values()) row.state = {
      ...row.state, mounted: false, lockVerified: false, recoveryRequired: true, files: [],
      sync: { ...row.state.sync, error: 'The native helper stopped. Drive teardown is unverified. Reopen the application for locked recovery.' },
    };
  }
}
function activeOperation(item) { return ['queued', 'running', 'cancelling'].includes(item.state); }
