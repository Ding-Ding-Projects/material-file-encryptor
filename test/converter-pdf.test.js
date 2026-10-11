import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { convertPdf } from '../src/features/converter/pdf.mjs';

async function fixture(widths = [200, 300, 400]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Source title');
  for (const width of widths) pdf.addPage([width, 500]).drawText(`Page ${width}`);
  return pdf.save();
}
async function load(output) { return PDFDocument.load(output.bytes, { updateMetadata: false }); }

test('PDF inspect reports pages and metadata without altering input', async () => {
  const input = await fixture();
  const before = input.slice();
  const result = await convertPdf([input], { operation: 'inspect' });
  assert.deepEqual(result.outputs, []);
  assert.equal(result.details.pageCount, 3);
  assert.equal(result.details.metadata.title, 'Source title');
  assert.deepEqual(input, before);
});

test('PDF split, extract, reorder and merge preserve selected page order', async () => {
  const input = await fixture();
  const split = await convertPdf([input], { operation: 'split', pages: '3,1' });
  assert.deepEqual(split.outputs.map(output => output.name), ['page-3.pdf', 'page-1.pdf']);
  assert.equal((await load(split.outputs[0])).getPage(0).getWidth(), 400);
  const extract = await convertPdf([input], { operation: 'extract', pages: '2-3' });
  assert.deepEqual((await load(extract.outputs[0])).getPages().map(page => page.getWidth()), [300, 400]);
  const reorder = await convertPdf([input], { operation: 'reorder', pages: [3, 1, 2] });
  assert.deepEqual((await load(reorder.outputs[0])).getPages().map(page => page.getWidth()), [400, 200, 300]);
  const merge = await convertPdf([split.outputs[0].bytes, split.outputs[1].bytes], { operation: 'merge' });
  assert.deepEqual((await load(merge.outputs[0])).getPages().map(page => page.getWidth()), [400, 200]);
});

test('PDF rotation targets selected pages and metadata survives reload', async () => {
  const input = await fixture();
  const rotated = await convertPdf([input], { operation: 'rotate', pages: [2], rotation: -90 });
  assert.deepEqual((await load(rotated.outputs[0])).getPages().map(page => page.getRotation().angle), [0, 270, 0]);
  const metadata = await convertPdf([input], { operation: 'metadata', metadata: { title: 'Revised', author: 'Author', keywords: ['one', 'two'] } });
  const doc = await load(metadata.outputs[0]);
  assert.equal(doc.getTitle(), 'Revised');
  assert.equal(doc.getAuthor(), 'Author');
  assert.equal(doc.getKeywords(), 'one two');
  assert.equal((await PDFDocument.load(input)).getTitle(), 'Source title');
});

test('PDF rejects malformed, signed, encrypted and excessive input', async () => {
  await assert.rejects(convertPdf([new Uint8Array([1, 2, 3])]), /could not be read/);
  for (const marker of ['/Encrypt', '/ByteRange', '/Sig']) {
    await assert.rejects(convertPdf([new TextEncoder().encode(`%PDF-1.7 ${marker} 1 0 R`)]), /Encrypted or signed/);
  }
  // Object-stream compression conceals signature names from the raw screening.
  const signed = await PDFDocument.create();
  signed.addPage();
  const signature = signed.context.obj({ Type: PDFName.of('Sig'), ByteRange: [PDFNumber.of(0), PDFNumber.of(1)], Contents: PDFString.of('signature') });
  signed.catalog.set(PDFName.of('Perms'), signed.context.register(signature));
  await assert.rejects(convertPdf([await signed.save({ useObjectStreams: true })]), /[Ss]igned/);
  await assert.rejects(convertPdf([new Uint8Array(64 * 1024 * 1024 + 1)]), /64 MiB/);
  const excessive = await PDFDocument.create();
  for (let index = 0; index < 1001; index++) excessive.addPage();
  await assert.rejects(convertPdf([await excessive.save()]), /1000/);
});

test('PDF validates page selections, rotation and metadata before output', async () => {
  const input = await fixture();
  for (const pages of [[0], [4], [], '3-1', '1,no', [1.5]]) {
    await assert.rejects(convertPdf([input], { operation: 'extract', pages }), /[Pp]age|range/);
  }
  await assert.rejects(convertPdf([input], { operation: 'reorder', pages: [1, 1, 2] }), /exactly once/);
  await assert.rejects(convertPdf([input], { operation: 'rotate', rotation: 15 }), /multiple of 90/);
  await assert.rejects(convertPdf([input], { operation: 'metadata', metadata: { unknown: 'value' } }), /Unsupported PDF metadata/);
  await assert.rejects(convertPdf([input, input], { operation: 'extract' }), /exactly one/);
});
