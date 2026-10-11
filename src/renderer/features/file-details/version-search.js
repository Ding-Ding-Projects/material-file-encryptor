export const VERSION_SEARCH_LIMITS = Object.freeze({ pattern: 256, rows: 10000, rowText: 32767, totalText: 4 * 1024 * 1024, timeout: 150 });

export function createVersionSearch({ createWorker = () => new Worker(new URL('./version-search-worker.js', import.meta.url), { type: 'module' }), timeout = VERSION_SEARCH_LIMITS.timeout } = {}) {
 let pending;
 function cancel() { pending?.(null); }
 return {
  cancel,
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
   return new Promise((resolve, reject) => {
    let worker, timer, finished = false;
    const finish = (ids, error) => {
     if (finished) return;
     finished = true; clearTimeout(timer); worker?.terminate();
     if (pending === abort) pending = undefined;
     if (error) reject(new Error(error));
     else resolve(ids === null ? null : ids.map(index => rows[index]));
    };
    const abort = () => finish(null);
    pending = abort;
    try {
     worker = createWorker();
     worker.onmessage = ({ data }) => {
      if (data.error) { finish(null, data.error); return; }
      if (!Array.isArray(data.indices) || data.indices.some(index => !Number.isInteger(index) || index < 0 || index >= rows.length)) { finish(null, 'Invalid search response.'); return; }
      finish(data.indices);
     };
     worker.onerror = () => finish(null, 'Search could not be completed.');
     timer = setTimeout(() => finish(null, 'Regular expression took too long. Use a simpler expression.'), timeout);
     worker.postMessage({ pattern, rows: input });
    } catch (error) { finish(null, error instanceof Error ? error.message : 'Search could not be completed.'); }
   });
  }
 };
}
