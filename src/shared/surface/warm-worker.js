// Runs one job at a time on a disposable-but-reusable worker.
//
// The wall-clock budget protects the window from catastrophic expressions, so it
// must only count the match work. A worker announces `{ready: true}` once its
// script has been evaluated; until then only the (much longer) start budget
// applies. After a job finishes normally the worker stays warm for the next job.
// A worker that exceeds the match budget, fails, or is superseded mid-job is
// terminated, because a runaway native match cannot be interrupted any other way.

export const MATCH_BUDGET_MS = 1000;
export const START_BUDGET_MS = 10000;

export class WorkerJobError extends Error {
  constructor(code, message) { super(message || code); this.name = 'WorkerJobError'; this.code = code; }
}

export function createWarmWorkerRunner({createWorker, matchBudget = MATCH_BUDGET_MS, startBudget = START_BUDGET_MS} = {}) {
  let warm = null, active = null, disposed = false;

  function discard(entry) {
    if (!entry) return;
    entry.worker.onmessage = null;
    entry.worker.onerror = null;
    try { entry.worker.terminate(); } catch { /* already gone */ }
    if (warm === entry) warm = null;
  }

  function cancel(code = 'superseded', message = 'Search was superseded.') {
    active?.settle(new WorkerJobError(code, message), null, true);
  }

  return {
    run(payload) {
      cancel();
      if (disposed) return Promise.reject(new WorkerJobError('disposed', 'Search surface is closed.'));
      return new Promise((resolve, reject) => {
        let entry = warm; warm = null;
        let startTimer = null, matchTimer = null, settled = false;
        const job = {settle(error, data, terminate) {
          if (settled) return;
          settled = true;
          clearTimeout(startTimer); clearTimeout(matchTimer);
          if (active === job) active = null;
          if (entry) { entry.worker.onmessage = null; entry.worker.onerror = null; }
          if (error) { if (terminate !== false) discard(entry); reject(error); return; }
          if (disposed) discard(entry); else warm = entry;
          resolve(data);
        }};
        active = job;
        const beginMatchClock = () => {
          if (matchTimer || settled) return;
          clearTimeout(startTimer);
          matchTimer = setTimeout(() => job.settle(new WorkerJobError('match-timeout', 'The match did not finish within its time budget.'), null, true), matchBudget);
        };
        try {
          if (!entry) entry = {worker: createWorker(), ready: false};
          entry.worker.onmessage = event => {
            const data = event?.data;
            if (data && data.ready === true) { entry.ready = true; beginMatchClock(); return; }
            entry.ready = true;
            job.settle(null, data, false);
          };
          entry.worker.onerror = () => job.settle(new WorkerJobError('worker-error', 'Search worker could not run.'), null, true);
          if (entry.ready) beginMatchClock();
          else startTimer = setTimeout(() => job.settle(new WorkerJobError('start-timeout', 'Search worker could not start.'), null, true), startBudget);
          entry.worker.postMessage(payload);
        } catch {
          job.settle(new WorkerJobError('start-failed', 'Search worker could not start.'), null, true);
        }
      });
    },
    cancel,
    /** Ends the idle warm worker (and any running job) without disposing the runner. */
    release() { cancel(); discard(warm); },
    dispose() { disposed = true; cancel('superseded', 'Search was superseded.'); discard(warm); }
  };
}
