import {randomUUID} from 'node:crypto';

// Enrolls the paired browser extension as its own independent status client through the existing status-hub client
// factory. The hub is only reached when the factory yields a configured, non-degraded client; otherwise the answer is
// the fixed word `unavailable`. Only the bounded report fields (version, connection, last refresh minute and four
// counts) become the session summary. No content, link, path, name or credential is read or sent.
export function createExtensionStatusEnrollment({createClient, clientOptions = {}, sessionId = () => 'material-file-encryptor-extension-' + randomUUID()} = {}) {
  let clientPromise = null, closed = false;
  const summaryOf = report => {
    const c = report.counts;
    return 'Browser extension ' + report.version + ' paired. Notes ' + c.notes + ', schedules ' + c.schedules + ', tickets ' + c.tickets + ', operations ' + c.operations + '.' + (report.lastRefresh ? ' Last refresh ' + report.lastRefresh + '.' : '');
  };
  const client = () => {
    if (!clientPromise) clientPromise = (async () => createClient({...clientOptions, sessionId: sessionId(), title: 'Browser extension', exitHooks: false}))().catch(() => null);
    return clientPromise;
  };
  return {
    async enroll(report) {
      if (closed || typeof createClient !== 'function') return 'unavailable';
      try {
        const instance = await client();
        if (!instance || closed || instance.status().degraded) return 'unavailable';
        const result = await instance.update({status: 'running', summary: summaryOf(report)});
        if (!result?.ok || instance.status().degraded) return 'unavailable';
        return 'enrolled';
      } catch {
        return 'unavailable';
      }
    },
    async close() {
      closed = true;
      const pending = clientPromise;
      clientPromise = null;
      try { const instance = await pending; if (instance) { await instance.finish?.('waiting'); instance.close?.(); } } catch { /* shutdown is best effort */ }
    },
  };
}
