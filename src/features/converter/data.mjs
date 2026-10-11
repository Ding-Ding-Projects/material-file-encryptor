const encoder = new TextEncoder();
export const DATA_LIMITS = Object.freeze({ totalBytes: 16 * 1024 * 1024, rows: 100000, columns: 1024, cells: 1000000, cellBytes: 1024 * 1024 });
const FORMATS = Object.freeze({ 'csv-to-json': ['csv', 'json'], 'tsv-to-json': ['tsv', 'json'], 'json-to-csv': ['json', 'csv'], 'json-to-tsv': ['json', 'tsv'], 'csv-to-tsv': ['csv', 'tsv'], 'tsv-to-csv': ['tsv', 'csv'] });

function risky(value) { return /^\s*[=+\-@\t\r]/u.test(value); }

function checkRows(rows) {
  if (!Array.isArray(rows) || rows.length > DATA_LIMITS.rows) throw new Error('Data must be an array of rows within the row limit.');
  let count = 0;
  const width = rows[0]?.length ?? 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0 || row.length > DATA_LIMITS.columns || row.length !== width) throw new Error('Every row must have the same nonzero number of columns within the column limit.');
    count += row.length;
    if (count > DATA_LIMITS.cells) throw new Error('Data exceeds the cell count limit.');
    for (const cell of row) {
      if (typeof cell !== 'string') throw new Error('Every cell must be a string; values are never coerced.');
      if (/\p{Surrogate}/u.test(cell)) throw new Error('Cells cannot contain unpaired Unicode surrogates.');
      if (encoder.encode(cell).byteLength > DATA_LIMITS.cellBytes) throw new Error('Data exceeds the cell byte limit.');
    }
  }
}

function parseDelimited(text, delimiter) {
  if (text === '') return [];
  const rows = [];
  let row = [], cell = '', state = 'start', endedRow = false, cells = 0;
  const finishCell = () => {
    if (encoder.encode(cell).byteLength > DATA_LIMITS.cellBytes) throw new Error('Data exceeds the cell byte limit.');
    row.push(cell); cell = ''; state = 'start';
    if (row.length > DATA_LIMITS.columns || ++cells > DATA_LIMITS.cells) throw new Error('Data exceeds column or cell count limits.');
  };
  const finishRow = () => {
    finishCell(); rows.push(row); row = [];
    if (rows.length > DATA_LIMITS.rows) throw new Error('Data exceeds the row limit.');
    endedRow = true;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    endedRow = false;
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else state = 'closed';
      } else cell += ch;
    } else if (ch === delimiter) finishCell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (ch === '"' && state === 'start') state = 'quoted';
    else {
      if (ch === '"' || state === 'closed') throw new Error('Malformed delimited data: quote placement is invalid.');
      cell += ch; state = 'unquoted';
    }
    if (cell.length > DATA_LIMITS.cellBytes) throw new Error('Data exceeds the cell byte limit.');
  }
  if (state === 'quoted') throw new Error('Malformed delimited data: quoted field is not closed.');
  if (!endedRow) finishRow();
  checkRows(rows);
  return rows;
}

function serializeDelimited(rows, delimiter, newline) {
  return rows.map(row => row.map(cell => cell === '' || cell.includes(delimiter) || /["\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(delimiter)).join(newline);
}

/** Converts string tables without type inference or implicit header treatment. */
export function convertData(id, inputs, options = {}) {
  if (typeof id !== 'string' || !Object.hasOwn(FORMATS, id)) throw new Error('Unsupported structured-data conversion.');
  const formats = FORMATS[id];
  if (!Array.isArray(inputs) || inputs.length !== 1 || !(inputs[0] instanceof Uint8Array)) throw new Error('Provide exactly one byte-array input.');
  if (inputs[0].byteLength > DATA_LIMITS.totalBytes) throw new Error('Data exceeds the 16 MiB input limit.');
  const delimiter = options.delimiter ?? ',';
  if (![',', '\t', ';'].includes(delimiter)) throw new Error('Delimiter must be comma, tab or semicolon.');
  const lineEnding = options.lineEnding ?? 'LF';
  if (!['LF', 'CRLF'].includes(lineEnding)) throw new Error('Line ending must be LF or CRLF.');
  const formulaPolicy = options.formulaPolicy ?? 'preserve';
  if (!['preserve', 'escape', 'reject'].includes(formulaPolicy)) throw new Error('Formula policy must be preserve, escape or reject.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(inputs[0]); }
  catch { throw new Error('Input must contain valid UTF-8.'); }
  // A UTF-8 signature identifies the encoding rather than forming part of cell 1.
  const hadBom = text.startsWith('\uFEFF');
  if (hadBom) text = text.slice(1);
  let rows;
  if (formats[0] === 'json') {
    try { rows = JSON.parse(text); } catch { throw new Error('Input is not valid JSON.'); }
    checkRows(rows);
  } else rows = parseDelimited(text, formats[0] === 'tsv' ? '\t' : delimiter);
  let formulaCells = 0, transformedCells = 0;
  const converted = rows.map(row => row.map(cell => {
    if (!risky(cell)) return cell;
    formulaCells++;
    if (formulaPolicy === 'reject') throw new Error('Formula-like cell rejected by the selected formula policy.');
    if (formulaPolicy === 'escape') { transformedCells++; return "'" + cell; }
    return cell;
  }));
  checkRows(converted);
  const outputDelimiter = formats[1] === 'tsv' ? '\t' : delimiter;
  const outputText = formats[1] === 'json' ? JSON.stringify(converted) : serializeDelimited(converted, outputDelimiter, lineEnding === 'LF' ? '\n' : '\r\n');
  const bytes = encoder.encode(outputText);
  if (bytes.length > DATA_LIMITS.totalBytes) throw new Error('Data exceeds the 16 MiB output limit.');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const verified = formats[1] === 'json' ? JSON.parse(decoded) : parseDelimited(decoded, outputDelimiter);
  if (JSON.stringify(verified) !== JSON.stringify(converted)) throw new Error('Structured-data output verification failed.');
  return {
    outputs: [{ name: `converted.${formats[1]}`, bytes }],
    details: {
      operation: id, rows: rows.length, columns: rows[0]?.length ?? 0,
      inputBytes: inputs[0].byteLength, outputBytes: bytes.length,
      delimiter: outputDelimiter, lineEnding, formulaPolicy, formulaCells, transformedCells,
      byteOrderMarkRemoved: hadBom,
      warnings: formulaCells && formulaPolicy === 'preserve' ? ['Formula-like cells were preserved. Spreadsheet software may interpret them as formulas.'] : transformedCells ? ['Formula-like cells were prefixed with an apostrophe; these cell values were changed.'] : [],
    },
  };
}
