const LABELS = [
  ['transfers', 'Drive transfers'],
  ['requests', 'Background requests'],
  ['converter', 'File conversions'],
  ['workflows', 'Document and download tasks'],
  ['servers', 'Server preparation'],
  ['models', 'Local model operations'],
];

/** Lists, in plain words, what is still running so the shutdown prompt can say what it waits for. */
export function describePending(detail = {}, transfers = 0) {
  const counts = {...detail, transfers};
  return LABELS
    .map(([key, label]) => [label, counts[key]])
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .map(([label, count]) => `${label}: ${count}`);
}

/** Shutdown prompt title and detail, naming the unfinished work when it is known. */
export function shutdownPrompt(lines) {
  const base = 'Completed files remain available. The application exits only after pending work settles and the drive locks successfully.';
  const onlyTransfers = lines.length > 0 && lines.every(line => line.startsWith('Drive transfers:'));
  return {
    title: onlyTransfers || lines.length === 0 ? 'Transfers are still active' : 'Work is still running',
    detail: lines.length ? `${base}\n\nStill running:\n${lines.join('\n')}` : base,
  };
}
