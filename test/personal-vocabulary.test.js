import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVocabulary, parseStrictJson, replaceVocabulary, createVocabularyStore } from '../src/shared/personal-vocabulary.js';
const canonical = entries => JSON.stringify({ schemaVersion: 1, entries });
test('canonical inventories beyond previous limits remain bounded by bytes only', () => {
  const entries = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`word${i}`, `label${i}`]));
  const parsed = parseVocabulary(canonical(entries));
  assert.equal(parsed.replacements.length, 5000);
  assert.equal(replaceVocabulary('word4999', parsed), 'label4999');
  assert.equal(parseVocabulary(canonical({})).replacements.length, 0);
});
test('Unicode limits count code points and UTF-8 byte limit remains independent', () => {
  assert.equal(parseVocabulary(canonical({ ['😀'.repeat(160)]: '😀'.repeat(1000) })).replacements.length, 1);
  assert.throws(() => parseVocabulary(canonical({ ['😀'.repeat(161)]: 'x' })));
  assert.throws(() => parseVocabulary(canonical({ x: '😀'.repeat(1001) })));
  assert.throws(() => parseVocabulary(canonical(Object.fromEntries(Array.from({length: 1000}, (_,i)=>[`word${i}`, '😀'.repeat(100)])))));
});
test('strict parser rejects duplicate and escaped duplicate keys before parsing', () => {
  for (const source of ['{"schemaVersion":1,"schemaVersion":1,"entries":{}}', '{"schemaVersion":1,"entries":{"x":"a","\\u0078":"b"}}', '{"version":1,"replacements":[{"from":"a","to":"b","to":"c"}]}', '{"schemaVersion":1,"entries":{"__proto__":"x"}}']) assert.throws(() => parseVocabulary(source));
  for (const source of ['[] trailing', '{"a":}', '[1,]', '"bad\nstring"', '['.repeat(10)+'0'+']'.repeat(10)]) assert.throws(() => parseStrictJson(source));
});
test('replacement is literal, noncascading and preserves factual spans', () => {
  const vocabulary = parseVocabulary(canonical({ folder: 'directory', directory: 'cabinet', 'a.b': 'dot', '10': 'ten' }));
  assert.equal(replaceVocabulary('folder directory a.b https://host/folder C:\\folder\\folder `folder` 10 MiB', vocabulary), 'directory cabinet dot https://host/folder C:\\folder\\folder `folder` 10 MiB');
  assert.equal(replaceVocabulary('folder', vocabulary), 'directory');
});
test('store validates old cache, rejects atomically and truthfully reports persistence', () => {
  const data = new Map([['words', JSON.stringify({version:1,replacements:[{from:'folder',to:'directory'}]})]]);
  let fail = false;
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>{if(fail)throw Error('denied');data.set(k,v);},removeItem:k=>data.delete(k)};
  const store=createVocabularyStore(storage,'words');
  assert.equal(replaceVocabulary('folder',store.current),'directory');
  const previous=store.current;
  assert.throws(()=>store.replace('{"schemaVersion":1,"entries":{"valid":"yes","invalid":5}}'));
  assert.equal(store.current,previous);
  fail=true;
  assert.equal(store.replace(canonical({folder:'cabinet'})).persisted,false);
  assert.equal(data.has('words'),false);
  assert.equal(replaceVocabulary('folder',store.current),'cabinet');
  assert.equal(store.clear().persisted,true);
  assert.equal(replaceVocabulary('folder',store.current),'folder');
  data.set('words','{"version":1,"version":1,"replacements":[]}');
  assert.equal(createVocabularyStore(storage,'words').current.replacements.length,0);
  assert.equal(data.has('words'),false);
});
test('public and desktop parser implementations remain identical', () => {
  assert.equal(readFileSync(new URL('../src/shared/personal-vocabulary.js',import.meta.url),'utf8'),readFileSync(new URL('../docs/site/personal-vocabulary.js',import.meta.url),'utf8'));
});
