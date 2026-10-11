export const DEFAULT_PART_BYTES = 83886080;
export function partBytes(value) {
 const bytes = Number(value) * 1048576;
 if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > 90000000) throw new Error('Enter a physical part size from 0.0009765625 to 85.8306884765625 MiB.');
 return bytes;
}
export function operationProgress(operation) {
 const done = Number(operation.bytesCompleted), total = Number(operation.totalBytes);
 return Number.isFinite(done) && Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(1, done / total)) : null;
}
export const activePacking = operation => operation?.kind === 'packing' && ['queued','running','cancelling'].includes(operation.state);
