export function filterVersions(rows, { from = '', to = '', pattern = '' } = {}) {
 const expression = pattern ? new RegExp(pattern, 'iu') : null;
 const start = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
 const end = to ? Date.parse(`${to}T23:59:59.999Z`) : Infinity;
 return rows.filter(row => {
  const time = Date.parse(row.timestampUtc);
  return time >= start && time <= end && (!expression || expression.test([row.path, row.label].filter(Boolean).join(' ')));
 });
}

// A bounded line comparison, deliberately avoiding an unbounded quadratic diff.
export function compareText(before, after) {
 const a = String(before).split('\n'), b = String(after).split('\n');
 if (a.length > 5000 || b.length > 5000) throw new Error('Preview exceeds 5,000 lines. Export the versions to compare them.');
 const lines = [];
 for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) lines.push(`  ${a[i]}`);
  else { if (i < a.length) lines.push(`- ${a[i]}`); if (i < b.length) lines.push(`+ ${b[i]}`); }
 }
 return lines.join('\n');
}

export function selectedVersions(rows, ids) { return rows.filter(row => ids.has(row.id)); }
