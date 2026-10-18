/** Desktop session inventory. Native controllers remain the authority for mount ownership. */
export class VaultSessions {
  constructor({ initialState, initialPreferences, cacheRoot }) {
    this.selectedId = 'main';
    this.rows = new Map([['main', { state: initialState, preferences: initialPreferences }]]);
    this.cacheRoot = cacheRoot;
    this.client = null;
    this.foreground = 0;
    this.switching = false;
  }
  get selected() { return this.rows.get(this.selectedId); }
  remember(state, preferences) { Object.assign(this.selected, { state, preferences }); }
  accept(sessionId, state) {
    const row = this.rows.get(sessionId);
    if (row) row.state = state;
    return sessionId === this.selectedId;
  }
  inventory() {
    return [...this.rows].map(([sessionId, { state }]) => ({
      sessionId, locked: state.locked, mounted: state.mounted,
      driveLetter: state.driveLetter, driveName: state.driveName,
      storageDir: state.storageDir, cacheDir: state.cacheDir,
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
  async add(defaults) {
    const result = await this.client.request('createSession');
    if (!result || typeof result.sessionId !== 'string' || this.rows.has(result.sessionId))
      throw new Error('The native session identity is invalid.');
    const sessionId = result.sessionId;
    this.rows.set(sessionId, { state: result.status, preferences: {
      ...defaults, autoUnlock: false, storageDir: undefined, remoteRepository: undefined,
      cacheDir: this.cacheRoot(sessionId), transport: 'folder',
      driveLetter: result.status.availableDriveLetters?.[0] || 'M:',
    } });
    this.selectedId = sessionId;
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
