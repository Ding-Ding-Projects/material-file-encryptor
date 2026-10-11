import { PDFDocument, PDFName, PDFDict, PDFArray, degrees } from 'pdf-lib';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PAGES = 1000;
const OPERATIONS = new Set(['inspect', 'split', 'merge', 'extract', 'reorder', 'rotate', 'metadata']);
const FIELDS = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];

function selection(value, count) {
  if (value === undefined || value === null || value === '') return Array.from({ length: count }, (_, i) => i);
  let list = value;
  if (typeof value === 'string') {
    if (value.length > 10000) throw new Error('Page selection is too long.');
    list = [];
    for (const part of value.split(',')) {
      const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
      if (!match) throw new Error('Use page numbers or ascending ranges, for example 1,3-5.');
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (end < start || end - start > MAX_PAGES) throw new Error('Invalid page range.');
      for (let page = start; page <= end; page++) list.push(page);
    }
  }
  if (!Array.isArray(list) || !list.length || list.length > MAX_PAGES || list.some(n => !Number.isInteger(n) || n < 1 || n > count)) {
    throw new Error('Page selection is outside the document.');
  }
  return list.map(n => n - 1);
}

function readMetadata(doc) {
  return Object.fromEntries(FIELDS.map(field => [field, doc[`get${field[0].toUpperCase()}${field.slice(1)}`]() ?? '']));
}

function applyMetadata(doc, metadata) {
  for (const [field, value] of Object.entries(metadata)) {
    if (!FIELDS.includes(field)) throw new Error(`Unsupported PDF metadata field: ${field}`);
    if (field === 'keywords') {
      const words = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;]/).map(s => s.trim()).filter(Boolean) : null;
      if (!words || words.length > 100 || words.some(s => typeof s !== 'string' || s.length > 4096)) throw new Error('Invalid PDF keywords.');
      doc.setKeywords(words);
    } else {
      if (typeof value !== 'string' || value.length > 4096) throw new Error(`Invalid PDF ${field}.`);
      doc[`set${field[0].toUpperCase()}${field.slice(1)}`](value);
    }
  }
}

function rejectSignatures(doc) {
  const seen = new Set();
  const visit = object => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) {
      for (const value of object.asArray()) visit(value);
    } else if (object instanceof PDFDict) {
      const type = object.get(PDFName.of('Type'))?.toString();
      const fieldType = object.get(PDFName.of('FT'))?.toString();
      if (type === '/Sig' || fieldType === '/Sig' || object.has(PDFName.of('ByteRange'))) {
        throw new Error('Signed PDFs are not supported; changing them invalidates signatures.');
      }
      for (const [, value] of object.entries()) visit(value);
    }
  };
  for (const [, object] of doc.context.enumerateIndirectObjects()) visit(object);
}

// Conservative raw screening also catches unreferenced signature dictionaries.
// It may reject marker text inside streams. This is deliberate: unsupported
// signature/encryption cases must not be presented as a safe editable document.
function rejectRawMarkers(bytes) {
  const raw = new TextDecoder('latin1').decode(bytes);
  if (/\/(?:Encrypt|ByteRange|Sig)\b/.test(raw)) throw new Error('Encrypted or signed PDFs are not supported.');
}

function fingerprint(doc, page) {
  const box = page.getMediaBox();
  const streams = [];
  const collect = object => {
    const item = doc.context.lookup(object);
    if (item instanceof PDFArray) {
      for (let i = 0; i < item.size(); i++) collect(item.get(i));
    } else if (item?.getContents) {
      const bytes = item.getContents();
      let hash = 2166136261;
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      streams.push(`${bytes.length}:${hash}`);
    }
  };
  const contents = page.node.get(PDFName.of('Contents'));
  if (contents) collect(contents);
  return { box, rotation: ((page.getRotation().angle % 360) + 360) % 360, streams };
}

/** Local PDF operations. Page selectors are one-based; input byte arrays are never mutated. */
export async function convertPdf(inputs, { operation = 'inspect', pages, rotation = 90, metadata = {} } = {}) {
  if (!OPERATIONS.has(operation)) throw new Error('Unsupported PDF operation.');
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > MAX_PAGES) throw new Error('Provide at least one PDF.');
  if (operation !== 'merge' && inputs.length !== 1) throw new Error('This PDF operation accepts exactly one input.');
  let total = 0;
  for (const bytes of inputs) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('PDF input must be nonempty bytes.');
    total += bytes.byteLength;
    if (total > MAX_BYTES) throw new Error('PDF input exceeds the 64 MiB limit.');
  }
  const docs = [];
  let pageCount = 0;
  for (const bytes of inputs) {
    rejectRawMarkers(bytes);
    let doc;
    try { doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false, throwOnInvalidObject: true }); }
    catch { throw new Error('PDF could not be read; malformed or encrypted files are unsupported.'); }
    if (doc.isEncrypted) throw new Error('Encrypted PDFs are not supported.');
    rejectSignatures(doc);
    pageCount += doc.getPageCount();
    if (!doc.getPageCount() || pageCount > MAX_PAGES) throw new Error('PDF page count must be between 1 and 1000.');
    docs.push(doc);
  }
  const details = { operation, inputCount: docs.length, inputBytes: total, pageCount, metadata: readMetadata(docs[0]), pages: docs.flatMap(doc => doc.getPages().map((page, index) => ({ number: index + 1, width: page.getWidth(), height: page.getHeight(), rotation: page.getRotation().angle }))) };
  if (operation === 'inspect') return { outputs: [], details };
  const chosen = operation === 'merge' ? [] : selection(pages, pageCount);
  if (operation === 'reorder' && (chosen.length !== pageCount || new Set(chosen).size !== pageCount)) throw new Error('Reorder requires every page exactly once.');
  if (operation === 'rotate' && (!Number.isInteger(rotation) || rotation % 90 !== 0 || Math.abs(rotation) > 3600)) throw new Error('Rotation must be a multiple of 90 degrees between -3600 and 3600.');
  if (operation === 'metadata' && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error('Metadata must be an object.');
  const all = docs.flatMap(doc => doc.getPages().map((_, index) => ({ doc, index })));
  const groups = operation === 'split' ? chosen.map(index => [all[index]])
    : [operation === 'merge' || operation === 'rotate' || operation === 'metadata' ? all : chosen.map(index => all[index])];
  const outputs = [];
  let outputBytes = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const output = await PDFDocument.create();
    const expected = [];
    for (const { doc, index } of group) {
      const [copy] = await output.copyPages(doc, [index]);
      const source = fingerprint(doc, doc.getPage(index));
      if (operation === 'rotate' && chosen.includes(index)) {
        source.rotation = ((source.rotation + rotation) % 360 + 360) % 360;
        copy.setRotation(degrees(source.rotation));
      }
      output.addPage(copy);
      expected.push(source);
    }
    applyMetadata(output, readMetadata(docs[0]));
    if (operation === 'metadata') applyMetadata(output, metadata);
    const expectedMetadata = readMetadata(output);
    const bytes = await output.save();
    outputBytes += bytes.length;
    if (outputBytes > MAX_BYTES) throw new Error('PDF output exceeds the 64 MiB limit.');
    const verified = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    if (verified.getPageCount() !== expected.length || JSON.stringify(readMetadata(verified)) !== JSON.stringify(expectedMetadata) || verified.getPages().some((page, index) => JSON.stringify(fingerprint(verified, page)) !== JSON.stringify(expected[index]))) {
      throw new Error('PDF output verification failed.');
    }
    outputs.push({ name: operation === 'split' ? `page-${chosen[groupIndex] + 1}.pdf` : `${operation}.pdf`, bytes });
  }
  return { outputs, details: { ...details, outputBytes, outputPageCounts: groups.map(group => group.length) } };
}
