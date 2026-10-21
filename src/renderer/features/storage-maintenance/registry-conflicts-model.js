export const CONFLICT_CHOICES = Object.freeze(['keep-current', 'use-preserved', 'keep-both']);
const bounded = (value, maximum = 256) => typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value);
export function conflictPage(value) {
  if (!value || !Array.isArray(value.items) || value.items.length > 1000 || value.nextCursor !== null && !bounded(value.nextCursor, 4096)) throw Error('invalid');
  const ids = new Set();
  const side = value => {
    if (value === null) return null;
    if (!value || !bounded(value.entryId) || !bounded(value.versionId) || !bounded(value.path, 32767) || typeof value.isDirectory !== 'boolean') throw Error('invalid');
    if (value.isLive !== undefined && typeof value.isLive !== 'boolean' || value.historyVersionId !== undefined && value.historyVersionId !== null && !bounded(value.historyVersionId)) throw Error('invalid');
    return Object.freeze({ entryId: value.entryId, versionId: value.versionId, path: value.path, isDirectory: value.isDirectory, isLive: value.isLive !== false, historyVersionId: value.historyVersionId || null });
  };
  const items = value.items.map(row => {
    if (!row || !bounded(row.conflictId) || ids.has(row.conflictId) || !bounded(row.kind, 80) || !Array.isArray(row.supportedChoices) || row.supportedChoices.length > 16 || row.supportedChoices.some(choice => !bounded(choice, 80)) || row.unsupportedReason !== null && row.unsupportedReason !== undefined && !bounded(row.unsupportedReason, 2048)) throw Error('invalid');
    ids.add(row.conflictId);
    let deletion = null;
    if (row.deletion !== undefined && row.deletion !== null) {
      if (!bounded(row.deletion.deletionCommitId) || !bounded(row.deletion.path,32767) || !bounded(row.deletion.entryId) || !bounded(row.deletion.expectedVersion)) throw Error('invalid');
      deletion = Object.freeze({ deletionCommitId: row.deletion.deletionCommitId, path: row.deletion.path, entryId: row.deletion.entryId, expectedVersion: row.deletion.expectedVersion });
    }
    if (row.recoveryDirectory !== undefined && row.recoveryDirectory !== null && row.recoveryDirectory !== '') throw Error('invalid');
    return Object.freeze({ conflictId: row.conflictId, kind: row.kind, current: side(row.current), preserved: side(row.preserved), supportedChoices: Object.freeze([...new Set(row.supportedChoices)]), unsupportedReason: row.unsupportedReason || null, deletion, recoveryDirectory: row.recoveryDirectory });
  });
  return { items, nextCursor: value.nextCursor };
}
export function choicesForConflict(row) {
  if (row?.kind === 'resolution-divergence' && row.recoveryDirectory === '' && row.current?.isLive === false && row.preserved?.isLive === false && row.current.historyVersionId && row.preserved.historyVersionId && !row.current.isDirectory && !row.preserved.isDirectory && !row.unsupportedReason) return row.supportedChoices.includes('keep-both') ? ['keep-both'] : [];
  if (row?.kind === 'delete-versus-edit' && row.current && row.current.isLive !== false && !row.current.isDirectory && row.preserved === null && row.deletion && !row.unsupportedReason) return ['keep-change','apply-deletion'].filter(choice => row.supportedChoices.includes(choice));
  return ['file-edit','rename'].includes(row?.kind) && row.current && row.preserved && row.current.isLive !== false && row.preserved.isLive !== false && !row.current.isDirectory && !row.preserved.isDirectory && !row.unsupportedReason ? CONFLICT_CHOICES.filter(choice => row.supportedChoices.includes(choice)) : [];
}
export function restoredConflictPaths(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(item => !bounded(item,32767)) || new Set(value.map(item => item.replaceAll('\\','/').toLowerCase())).size !== 2) throw Error('unverified');
  return [...value];
}
export function conflictRequest(row, choice) {
  if (!choicesForConflict(row).includes(choice)) throw Error('unsupported');
  return Object.freeze({ conflictId: row.conflictId, choice, currentVersion: row.current.versionId, preservedVersion: row.preserved?.versionId ?? null, ...(row.kind === 'delete-versus-edit' ? { deletionCommitId: row.deletion.deletionCommitId } : {}) });
}
export function appendConflictPage(previous, page) {
  const items = [...previous], ids = new Map(items.map(row => [row.conflictId, row]));
  for (const row of page.items) {
    const before = ids.get(row.conflictId);
    if (before && JSON.stringify(before) !== JSON.stringify(row)) throw Error('stale');
    if (!before) { items.push(row); ids.set(row.conflictId, row); }
  }
  if (items.length > 10000) throw Error('limit');
  return items;
}
