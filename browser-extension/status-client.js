// Status client enrollment: an independent extension client that reports
// bounded state to the paired desktop. It exists only after pairing, goes only
// through the desktop (the mediator), and carries no content: the extension
// version, whether it is paired, when the workspace last refreshed, and a few
// counts. The desktop answers with one fixed state word.

export const ENROLLMENT_STATES = Object.freeze(['not-enrolled', 'pending', 'enrolled', 'unavailable']);
export const REPORT_COUNTS = Object.freeze(['notes', 'schedules', 'tickets', 'operations']);

const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/;
const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

/** True for a report with exactly the bounded fields and nothing else. */
export function validReport(report) {
  return exact(report, ['version', 'connection', 'lastRefresh', 'counts'])
    && typeof report.version === 'string' && VERSION.test(report.version)
    && report.connection === 'paired'
    && (report.lastRefresh === null || typeof report.lastRefresh === 'string' && MINUTE.test(report.lastRefresh))
    && exact(report.counts, REPORT_COUNTS)
    && REPORT_COUNTS.every(key => Number.isSafeInteger(report.counts[key]) && report.counts[key] >= 0 && report.counts[key] <= 9999);
}

/** Builds a report from counts. Times are cut to the minute so nothing finer leaves the browser. */
export function buildReport({version, lastRefreshAt = null, counts}) {
  const minute = lastRefreshAt instanceof Date && !Number.isNaN(lastRefreshAt.getTime()) ? lastRefreshAt.toISOString().slice(0, 16) + 'Z' : null;
  const bounded = Object.fromEntries(REPORT_COUNTS.map(key => [key, Math.min(9999, Math.max(0, Number.isSafeInteger(counts?.[key]) ? counts[key] : 0))]));
  const report = {version: String(version), connection: 'paired', lastRefresh: minute, counts: bounded};
  if (!validReport(report)) throw new Error('The status report is not valid.');
  return report;
}

/** Maps a desktop answer to the state shown in the Status section. Anything unexpected is unavailable. */
export function enrollmentFromReply(reply) {
  if (!exact(reply, ['type', 'schemaVersion', 'state']) || reply.type !== 'status-client' || reply.schemaVersion !== 1) return 'unavailable';
  return ['pending', 'enrolled', 'unavailable'].includes(reply.state) ? reply.state : 'unavailable';
}

/** The state to show given the pairing and the last answer: never enrolled before pairing. */
export function shownEnrollment(connection, state) {
  if (connection !== true) return 'not-enrolled';
  return ENROLLMENT_STATES.includes(state) ? state : 'not-enrolled';
}
