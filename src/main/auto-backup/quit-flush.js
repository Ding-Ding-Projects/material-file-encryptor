/**
 * The close flow's last chance to back up pending changes. The backup gets a short quiet grace period; after that a
 * small "Finishing backup…" prompt with a single Quit now button appears while the backup keeps running. The prompt
 * closes itself when the backup finishes, so quitting never waits on a dialog nobody needs to answer.
 *
 * Data stays safe either way: the local encrypted copy is always complete, and a backup that is stopped here simply
 * runs again at the next start.
 */
export const QUIT_FLUSH_PROMPT = Object.freeze({
  type: 'info',
  title: 'Finishing backup…',
  message: 'Finishing backup…',
  detail: 'Your drives are complete and safe on this PC. The backup of your latest changes finishes in a moment. If you quit now, it continues the next time you start the app.',
  buttons: ['Quit now'],
  defaultId: 0,
  cancelId: 0,
});

const delay = (ms, timers) => new Promise(resolve => { const timer = timers.setTimeout(resolve, ms); timer?.unref?.(); });

/**
 * @param {object} options
 * @param {() => Promise<unknown>} options.flush Backs up pending drives and settles when it stops.
 * @param {() => Promise<unknown>} options.stop Stops the backup that is still running.
 * @param {(options: object) => Promise<{response: number}>} options.ask Shows the prompt; it settles when the signal aborts.
 * @param {number} [options.graceMs] Time the backup may take before the prompt appears.
 * @param {number} [options.limitMs] Longest the close flow waits for the backup.
 * @param {number} [options.stopMs] Longest the close flow waits for the backup to stop.
 * @returns {Promise<'finished'|'quit-now'|'time-limit'>}
 */
export async function finishBackupBeforeQuit({ flush, stop, ask, graceMs = 1500, limitMs = 120000, stopMs = 15000, timers = globalThis }) {
  const work = Promise.resolve().then(flush).then(() => 'finished', () => 'finished');
  const early = await Promise.race([work, delay(graceMs, timers).then(() => null)]);
  if (early) return early;
  const controller = new AbortController();
  const answer = Promise.resolve().then(() => ask({ ...QUIT_FLUSH_PROMPT, signal: controller.signal }))
    .then(() => controller.signal.aborted ? null : 'quit-now', () => null);
  const outcome = await Promise.race([work, answer.then(value => value ?? work), delay(limitMs, timers).then(() => 'time-limit')]);
  controller.abort();
  if (outcome !== 'finished') await Promise.race([Promise.resolve().then(stop).catch(() => {}), delay(stopMs, timers)]);
  return outcome;
}
