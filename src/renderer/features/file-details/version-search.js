import { createWarmWorkerRunner, MATCH_BUDGET_MS } from '../../../shared/surface/warm-worker.js';

// `timeout` is the budget for the match work alone; worker start-up is measured separately.
export const VERSION_SEARCH_LIMITS = Object.freeze({ pattern: 256, rows: 10000, rowText: 32767, totalText: 4 * 1024 * 1024, timeout: MATCH_BUDGET_MS });

export function createVersionSearch({ createWorker = () => new Worker(new URL('./version-search-worker.js', import.meta.url), { type: 'module' }), timeout = VERSION_SEARCH_LIMITS.timeout, startTimeout } = {}) {
 const runner = createWarmWorkerRunner({ createWorker, matchBudget: timeout, ...(startTimeout ? { startBudget: startTimeout } : {}) });
 function cancel() { runner.cancel(); }
 return {
  cancel,
  dispose() { runner.dispose(); },
  async filter(rows, pattern) {
   cancel();
   if (!pattern) return rows;
   if (pattern.length > VERSION_SEARCH_LIMITS.pattern) throw new Error('Regular expression must contain at most 256 characters.');
   if (rows.length > VERSION_SEARCH_LIMITS.rows) throw new Error('Too many versions for regular expression search. Narrow the date range.');
   let total = 0;
   const input = rows.map((row, index) => {
    const text = [row.path, row.label].filter(Boolean).join(' ');
    total += text.length;
    if (text.length > VERSION_SEARCH_LIMITS.rowText || total > VERSION_SEARCH_LIMITS.totalText) throw new Error('Version search text exceeds the supported limit. Narrow the date range.');
    return { index, text };
   });
   let data;
   try { data = await runner.run({ pattern, rows: input }); }
   catch (error) {
    if (error?.code === 'superseded') return null;
    if (error?.code === 'match-timeout') throw new Error('Regular expression took too long. Use a simpler expression.');
    if (error?.code === 'worker-error') throw new Error('Search could not be completed.');
    throw new Error(error instanceof Error ? error.message : 'Search could not be completed.');
   }
   if (data?.error) throw new Error(data.error);
   if (!Array.isArray(data?.indices) || data.indices.some(index => !Number.isInteger(index) || index < 0 || index >= rows.length)) throw new Error('Invalid search response.');
   return data.indices.map(index => rows[index]);
  }
 };
}
