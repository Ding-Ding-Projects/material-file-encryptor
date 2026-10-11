/** Keep teardown admission closed after any irreversible preparation step. */
export function createRestartPreparation({ verify, preflight, closeServices, clearMarker, disposeHelper, prepared }) {
  let started = false;
  let completed = false;
  let pending;
  async function run() {
    if (completed) return;
    if (pending) return pending;
    pending = (async () => {
      if (!started) {
        await verify();
        await preflight();
        started = true;
      }
      await closeServices();
      // Preserve the interrupted-session marker until services have actually closed.
      await clearMarker();
      await disposeHelper();
      prepared();
      completed = true;
    })();
    try { await pending; } finally { pending = undefined; }
  }
  return { run, get started() { return started; }, get completed() { return completed; } };
}
