import { validateAutoBackupPatch } from './settings.js';

/** Renderer-facing automatic backup methods. No repository, endpoint or path is accepted from the renderer. */
export const AUTO_BACKUP_METHODS = new Set([
  'autoBackupStatus', 'autoBackupUpdate', 'autoBackupSetDrive', 'autoBackupNow', 'autoBackupPrune', 'autoBackupMove',
]);
const SESSION = /^[A-Za-z0-9-]{1,64}$/;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function validateAutoBackupRequest(method, value = {}) {
  if (!plain(value)) throw Error('Invalid request.');
  if (method === 'autoBackupStatus') { if (Object.keys(value).length) throw Error('Invalid request.'); return {}; }
  if (method === 'autoBackupUpdate') return validateAutoBackupPatch(value);
  if (method === 'autoBackupSetDrive') {
    if (Object.keys(value).length !== 2 || !SESSION.test(String(value.sessionId)) || typeof value.enabled !== 'boolean') throw Error('Invalid request.');
    return { sessionId: value.sessionId, enabled: value.enabled };
  }
  if (Object.keys(value).length !== 1 || typeof value.sessionId !== 'string' || !SESSION.test(value.sessionId)) throw Error('Invalid request.');
  return { sessionId: value.sessionId };
}

export function dispatchAutoBackup({ auto, sync }, method, params) {
  switch (method) {
    case 'autoBackupStatus': return auto.status();
    case 'autoBackupUpdate': return auto.update(params);
    case 'autoBackupSetDrive': return auto.setDrive(params.sessionId, params.enabled);
    case 'autoBackupNow': return auto.backUpNow(params.sessionId);
    case 'autoBackupPrune': return sync.pruneNow(params.sessionId);
    case 'autoBackupMove': return auto.moveToOwnRepository(params.sessionId);
    default: throw Error('Unsupported request.');
  }
}
