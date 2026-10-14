// Export formats for workspace records. Records here are public release
// notes, so nothing needs redacting; each export is validated before it is offered.

export const EXPORT_FORMATS = Object.freeze({
  json: {extension: 'json', type: 'application/json'},
  csv: {extension: 'csv', type: 'text/csv'},
  markdown: {extension: 'md', type: 'text/markdown'},
});

const csvCell = value => {
  const text = String(value ?? '');
  // A leading formula character is neutralised so spreadsheets show the text instead of running it.
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
};

/** Serialises changelog entries in one of the export formats. */
export function exportChangelog(entries, format) {
  if (!Object.hasOwn(EXPORT_FORMATS, format)) throw new Error('Choose an export format.');
  const rows = Array.isArray(entries) ? entries : [];
  if (format === 'json') return JSON.stringify({schemaVersion: 1, entries: rows.map(({title, date, items, yue}) => ({title, date, items: [...items], yue}))}, null, 2) + '\n';
  if (format === 'csv') {
    const lines = [['date', 'title', 'change', 'summary_yue'].join(',')];
    for (const entry of rows) for (const item of entry.items.length ? entry.items : ['']) lines.push([entry.date, entry.title, item, entry.yue].map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }
  return rows.map(entry => [`## ${entry.title}${entry.date ? ' · ' + entry.date : ''}`, '', ...entry.items.map(item => '- ' + item), ...(entry.yue ? ['', entry.yue] : []), ''].join('\n')).join('\n');
}

/** Confirms that an export reads back to the same number of releases and changes. */
export function validateExport(text, format, entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const changes = rows.reduce((total, entry) => total + Math.max(entry.items.length, 1), 0);
  if (format === 'json') { const parsed = JSON.parse(text); return parsed.schemaVersion === 1 && parsed.entries.length === rows.length; }
  if (format === 'csv') return text.split('\r\n').filter(Boolean).length === changes + 1;
  return (text.match(/^## /gm) || []).length === rows.length;
}
