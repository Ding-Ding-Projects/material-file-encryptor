import test from 'node:test';
import assert from 'node:assert/strict';
import { convertData, DATA_LIMITS } from '../src/features/converter/data.mjs';
const encode = value => new TextEncoder().encode(value);
const decode = result => new TextDecoder().decode(result.outputs[0].bytes);

test('structured data preserves quoted delimiters, newlines, quotes and headers', () => {
  const input = encode('name,notes\r\n"a,b","line 1\nline ""2"""\r\n');
  const before = input.slice();
  const result = convertData('csv-to-json', [input]);
  assert.deepEqual(JSON.parse(decode(result)), [['name','notes'],['a,b','line 1\nline "2"']]);
  assert.deepEqual(input, before);
  const back = convertData('json-to-csv', [result.outputs[0].bytes], {lineEnding:'CRLF'});
  assert.deepEqual(JSON.parse(decode(convertData('csv-to-json', [back.outputs[0].bytes]))), JSON.parse(decode(result)));
});

test('all six directions preserve string tables without type coercion', () => {
  const rows = [['001','true',''],['value','tab\tvalue','雪 😀']];
  const json = encode(JSON.stringify(rows));
  const csv = convertData('json-to-csv', [json]);
  const tsv = convertData('json-to-tsv', [json]);
  assert.deepEqual(JSON.parse(decode(convertData('csv-to-json',[csv.outputs[0].bytes]))), rows);
  assert.deepEqual(JSON.parse(decode(convertData('tsv-to-json',[tsv.outputs[0].bytes]))), rows);
  assert.deepEqual(JSON.parse(decode(convertData('tsv-to-json',[convertData('csv-to-tsv',[csv.outputs[0].bytes]).outputs[0].bytes]))), rows);
  assert.deepEqual(JSON.parse(decode(convertData('csv-to-json',[convertData('tsv-to-csv',[tsv.outputs[0].bytes]).outputs[0].bytes]))), rows);
});

test('empty files, empty cells, blank rows and header-only data remain distinct', () => {
  for (const [csv, expected] of [['',[]], ['""',[['']]], ['\n',[['']]], [',',[['','']]], ['header',[['header']]], ['\n\n',[[''],['']]]]) {
    assert.deepEqual(JSON.parse(decode(convertData('csv-to-json',[encode(csv)]))), expected);
    const result = convertData('json-to-csv',[encode(JSON.stringify(expected))]);
    assert.deepEqual(JSON.parse(decode(convertData('csv-to-json',[result.outputs[0].bytes]))), expected);
  }
});

test('semicolon and line-ending controls are explicit and BOM is disclosed', () => {
  const result = convertData('csv-to-json',[encode('\uFEFFa;b\r1;2')],{delimiter:';'});
  assert.deepEqual(JSON.parse(decode(result)), [['a','b'],['1','2']]);
  assert.equal(result.details.byteOrderMarkRemoved,true);
  assert.equal(decode(convertData('json-to-csv',[result.outputs[0].bytes],{delimiter:';',lineEnding:'CRLF'})),'a;b\r\n1;2');
});

test('formula policies disclose preservation and exact escaping', () => {
  const rows = [['=1',' +2','-3','@SUM(A1)','\tvalue','\rvalue','\u00a0\tvalue','safe']];
  const input = encode(JSON.stringify(rows));
  const preserved = convertData('json-to-csv',[input]);
  assert.equal(preserved.details.formulaCells,7);
  assert.equal(preserved.details.transformedCells,0);
  assert.equal(preserved.details.warnings.length,1);
  const escaped = convertData('json-to-csv',[input],{formulaPolicy:'escape'});
  assert.equal(escaped.details.transformedCells,7);
  assert.deepEqual(JSON.parse(decode(convertData('csv-to-json',[escaped.outputs[0].bytes]))), [rows[0].map((cell,i)=>i<7?"'"+cell:cell)]);
  assert.throws(()=>convertData('json-to-csv',[input],{formulaPolicy:'reject'}),/Formula-like/);
});

test('malformed input and unsupported shape fail closed', () => {
  for (const csv of ['"unclosed','a"b','"a" trailing','a,b\n1']) assert.throws(()=>convertData('csv-to-json',[encode(csv)]),/Malformed|same nonzero/);
  for (const json of ['{}','[[]]','[[1]]','[[null]]','[["a"],["b","c"]]','[["\\ud800"]]']) assert.throws(()=>convertData('json-to-csv',[encode(json)]));
  assert.throws(()=>convertData('csv-to-json',[new Uint8Array([0xc0,0xaf])]),/UTF-8/);
  assert.throws(()=>convertData('csv-to-json',[encode('a')],{delimiter:'|'}),/Delimiter/);
  assert.throws(()=>convertData('csv-to-json',[encode('a')],{lineEnding:'CR'}),/Line ending/);
  assert.throws(()=>convertData('csv-to-json',[encode('a')],{formulaPolicy:'execute'}),/Formula policy/);
  assert.throws(()=>convertData('__proto__',[encode('a')]),/Unsupported/);
});

test('structured-data limits reject excessive cells, columns, rows and bytes', () => {
  assert.throws(()=>convertData('csv-to-json',[new Uint8Array(DATA_LIMITS.totalBytes+1)]),/input limit/);
  assert.throws(()=>convertData('csv-to-json',[encode('a'.repeat(DATA_LIMITS.cellBytes+1))]),/cell byte limit/);
  assert.throws(()=>convertData('csv-to-json',[encode(Array(DATA_LIMITS.columns+1).fill('a').join(','))]),/column/);
  assert.throws(()=>convertData('csv-to-json',[encode('a\n'.repeat(DATA_LIMITS.rows+1))]),/row limit/);
});
