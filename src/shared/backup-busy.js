// While a backup prepares or holds its encrypted snapshot, the native host briefly refuses other drive requests.
// That is normal work, not a failure, so the workspace keeps its last known state and shows "Backing up…"
// instead of an error banner. Only these exact native refusals are treated this way.
const REFUSALS = [
  /An encrypted image snapshot is being prepared\. Wait for it to finish\./,
  /Wait for snapshot preparation and cancellation cleanup to settle/,
];
/** True when an error (or message) is the native host saying a backup snapshot is in progress. */
export function isBackupBusyRefusal(error) {
  const message = typeof error === 'string' ? error : String(error?.message ?? '');
  return REFUSALS.some(pattern => pattern.test(message));
}
/** How long the "Backing up…" status lasts after the last refusal, and how soon a refused file list is retried. */
export const BACKUP_BUSY_HOLD_MS = 6000;
export const BACKUP_BUSY_RETRY_MS = 2500;
