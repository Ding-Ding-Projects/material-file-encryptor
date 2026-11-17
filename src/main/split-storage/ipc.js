/** Renderer-facing split storage methods. Settings are validated again by the service against the open drive. */
export const SPLIT_STORAGE_METHODS = new Set([
  'splitStorageStatus', 'chooseSplitFolder', 'saveSplitStorage', 'previewSplitStorage', 'applySplitStorage',
  'cancelSplitStorage', 'disableSplitStorage', 'verifySplitStorage', 'updateMirrors', 'verifyMirror',
]);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const SETTINGS = ['enabled', 'copies', 'locations', 'rules', 'safetyBackup'];
const LOCATION = ['id', 'kind', 'role', 'label', 'path', 'repository', 'visibility', 'weight', 'capacityBytes', 'enabled', 'removableHint'];

/** Shape check only: plain objects, known keys, bounded sizes. */
export function validateSplitStorageRequest(method, value = {}) {
  if (!plain(value)) throw new Error('Invalid request.');
  if (method === 'saveSplitStorage' || method === 'previewSplitStorage') {
    if (Object.keys(value).some(key => !SETTINGS.includes(key))) throw new Error('Invalid split storage settings.');
    if (value.locations !== undefined && (!Array.isArray(value.locations) || value.locations.length > 32 || value.locations.some(item => !plain(item) || Object.keys(item).some(key => !LOCATION.includes(key)))))
      throw new Error('Invalid split storage settings.');
    if (value.rules !== undefined && (!Array.isArray(value.rules) || value.rules.length > 100 || value.rules.some(rule => !plain(rule) || Object.keys(rule).some(key => !['match', 'location'].includes(key)))))
      throw new Error('Invalid split storage settings.');
    return structuredClone(value);
  }
  if (method === 'verifyMirror') {
    if (Object.keys(value).length !== 1 || typeof value.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.id)) throw new Error('Invalid request.');
    return { id: value.id };
  }
  if (Object.keys(value).length) throw new Error('Invalid request.');
  return {};
}

export function dispatchSplitStorage(service, method, params, sessionId) {
  switch (method) {
    case 'splitStorageStatus': return service.status(sessionId);
    case 'chooseSplitFolder': return service.chooseFolder(sessionId);
    case 'saveSplitStorage': return service.save(sessionId, params);
    case 'previewSplitStorage': return service.preview(sessionId, params);
    case 'applySplitStorage': return service.apply(sessionId);
    case 'cancelSplitStorage': return service.cancel(sessionId);
    case 'disableSplitStorage': return service.disable(sessionId);
    case 'verifySplitStorage': return service.verify(sessionId);
    case 'updateMirrors': return service.updateMirrors(sessionId);
    case 'verifyMirror': return service.verifyMirror(sessionId, params.id);
    default: throw new Error('Unsupported request.');
  }
}

/**
 * Connects the native helper's hydratePart events to the service. Each request is answered exactly once
 * with the hydratePartResult command; a cancel event aborts the fetch.
 */
export function attachPartHydration(nativeClient, service) {
  const active = new Map();
  nativeClient.on('hydratePart', request => {
    const controller = new AbortController(); active.set(request.requestId, controller);
    void service.hydrate(request, controller.signal)
      .then(() => ({ requestId: request.requestId, ok: true }),
        error => ({ requestId: request.requestId, ok: false, error: String(error?.message || 'The encrypted part could not be fetched.').slice(0, 500) }))
      .then(result => { active.delete(request.requestId); if (!controller.signal.aborted) return nativeClient.request('hydratePartResult', result); })
      .catch(() => {});
  });
  nativeClient.on('hydratePartCancel', ({ requestId }) => { active.get(requestId)?.abort(); active.delete(requestId); });
  return { get pending() { return active.size; } };
}
