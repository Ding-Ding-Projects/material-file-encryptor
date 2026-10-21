/** Validate and confirm selected-session conflict actions before native mutation. */
export const REGISTRY_CONFLICT_METHODS = new Set(['listRegistryConflicts', 'resolveRegistryConflict']);
const choices = new Set(['keep-current', 'use-preserved', 'keep-both', 'keep-change', 'apply-deletion']);
const hex = (value, lengths) => typeof value === 'string' && lengths.includes(value.length) && /^[a-f0-9]+$/.test(value);
const invalid = () => { throw Error('Invalid conflict review request.'); };

export function validateRegistryConflictRequest(method, value) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const allowed = method === 'listRegistryConflicts' ? ['limit', 'cursor'] : ['conflictId', 'choice', 'currentVersion', 'preservedVersion', 'deletionCommitId'];
  if (!REGISTRY_CONFLICT_METHODS.has(method) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) invalid();
  if (method === 'listRegistryConflicts') {
    if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 1000)) invalid();
    if (value.cursor !== undefined && value.cursor !== null && !hex(value.cursor, [64])) invalid();
    return { limit: value.limit ?? 25, ...(value.cursor == null ? {} : { cursor: value.cursor }) };
  }
  if (!hex(value.conflictId, [64]) || !choices.has(value.choice) || !hex(value.currentVersion, [32])) invalid();
  const deletion = value.choice === 'keep-change' || value.choice === 'apply-deletion';
  if (deletion ? value.preservedVersion !== null || !hex(value.deletionCommitId, [32, 64]) : !hex(value.preservedVersion, [32]) || Object.hasOwn(value, 'deletionCommitId')) invalid();
  return { conflictId: value.conflictId, choice: value.choice, currentVersion: value.currentVersion,
    preservedVersion: value.preservedVersion, ...(deletion ? { deletionCommitId: value.deletionCommitId } : {}) };
}

const descriptions = {
  'keep-current': ['Keep the current file choice', '保留目前檔案選擇'],
  'use-preserved': ['Use the preserved file choice', '採用保留檔案選擇'],
  'keep-both': ['Keep both reviewed values', '保留兩個已檢視內容'],
  'keep-change': ['Keep the changed file instead of the recorded deletion', '保留已改動檔案，唔套用記錄中嘅刪除'],
  'apply-deletion': ['Apply the recorded deletion to the exact reviewed file', '將記錄中嘅刪除套用到確切已檢視檔案'],
};

export function createRegistryConflictRequests({ nativeRequest, confirm, available, exiting, busy, selectedSession, language = () => 'en' }) {
  const admit = id => {
    if (!available()) throw Error('Unlock the native vault before reviewing conflicts.');
    if (exiting()) throw Error('The application is preparing to close.');
    if (busy()) throw Error('Wait for registry synchronization before reviewing conflicts.');
    if (selectedSession() !== id) throw Error('The selected vault changed. Refresh the conflict list.');
  };
  return async (method, raw, sessionId) => {
    const params = Object.freeze(validateRegistryConflictRequest(method, raw));
    admit(sessionId);
    if (method === 'listRegistryConflicts') return nativeRequest('listConflicts', params, sessionId);
    const [english, cantonese] = descriptions[params.choice];
    const mode = language(), text = (en, yue) => mode === 'yue' ? yue : mode === 'bilingual' ? `${en} · ${yue}` : en;
    const answer = await confirm({ type: 'warning', buttons: [text('Cancel', '取消'), text('Apply reviewed choice', '套用已檢視選擇')], defaultId: 0, cancelId: 0,
      title: text('Resolve file conflict', '處理檔案衝突'), message: text(`${english}?`, `${cantonese}？`),
      detail: `${text('Conflict', '衝突')}: ${params.conflictId}\n${text('Current version', '目前版本')}: ${params.currentVersion}\n${text('Preserved version', '保留版本')}: ${params.preservedVersion ?? text('recorded deletion', '記錄中嘅刪除')}${params.deletionCommitId ? '\n' + text('Deletion transaction', '刪除交易') + ': ' + params.deletionCommitId : ''}\n${text('The native vault will compare the exact reviewed versions again before changing files. A changed review must be refreshed.', '原生保管庫會再次比對確切已檢視版本先改動檔案；版本有變就必須重新檢視。')}` });
    if (answer?.response !== 1) return { cancelled: true };
    admit(sessionId);
    const result = await nativeRequest('resolveConflict', params, sessionId);
    if (result?.resolved !== true || result.conflictId !== params.conflictId || result.choice !== params.choice) throw Error('Conflict resolution is unverified. Refresh the conflict list before retrying.');
    if (Object.hasOwn(result, 'restoredPaths') && (!Array.isArray(result.restoredPaths) || result.restoredPaths.length !== 2 || new Set(result.restoredPaths).size !== 2 || result.restoredPaths.some(value => typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)))) throw Error('Conflict recovery paths are unverified. Refresh the conflict list before retrying.');
    return result;
  };
}
