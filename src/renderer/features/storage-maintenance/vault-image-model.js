const TARGET = /^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
export const IMAGE_PHASES = Object.freeze(['prepared', 'building', 'built', 'uploading', 'uploaded', 'build-unverified', 'upload-unverified']);

export function vaultImageTarget(value) {
  const reference = String(value ?? '').trim();
  if (reference.length > 220 || !TARGET.test(reference)) throw new Error('invalidTarget');
  return reference;
}

export function vaultImageSource(state) {
  return JSON.stringify([state?.storageDir || '', state?.transport?.mode || state?.preferences?.transport || 'folder']);
}

export function canPrepareVaultImage(state) {
  return Boolean(state?.sessionId && state.locked === true && state.lockVerified !== false && !state.mounted && state.storageDir &&
    (state.transport?.mode || state.preferences?.transport || 'folder') === 'folder' && !state.operation);
}

/** Validate the session and display metadata before accepting an asynchronous result. */
export function vaultImagePreview(value, sessionId) {
  if (value === null) return null;
  if (!value || value.sessionId !== sessionId || typeof value.previewId !== 'string' || !value.previewId ||
    typeof value.target !== 'string' || !value.target.startsWith('docker.io/') ||
    !Number.isSafeInteger(value.fileCount) || value.fileCount < 1 ||
    !Number.isSafeInteger(value.totalBytes) || value.totalBytes < 0 ||
    !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(value.vaultId) || !IMAGE_PHASES.includes(value.phase) ||
    value.storageOnly !== true || value.excludesPendingCache !== true) throw new Error('invalidPreview');
  vaultImageTarget(value.target.slice('docker.io/'.length));
  if (['built', 'uploading', 'uploaded'].includes(value.phase) && !/^sha256:[a-f0-9]{64}$/.test(value.imageId)) throw new Error('invalidPreview');
  if (value.phase === 'uploaded' && (value.receipt?.uploaded !== true || value.receipt?.private !== true ||
    !new RegExp(`^(?:docker\\.io/)?${value.target.slice(10).split(':')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@sha256:[a-f0-9]{64}$`).test(value.receipt?.digest))) throw new Error('invalidPreview');
  return { ...value, receipt: value.receipt ? { ...value.receipt } : undefined };
}

export function vaultImageActions({ state, preview, pending, available = true, sourceChanged = false }) {
  const active = ['building', 'uploading'].includes(preview?.phase);
  const idle = available && !pending && !active;
  return {
    prepare: idle && canPrepareVaultImage(state),
    build: idle && !sourceChanged && preview?.phase === 'prepared',
    upload: idle && !sourceChanged && preview?.phase === 'built',
    discard: idle && Boolean(preview),
    refresh: available && !pending,
    cancel: available && (['prepare', 'build', 'upload'].includes(pending) || (!pending && active)),
  };
}
