import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePartSize, displayPartSize, parseVocabulary, loadSettings } from '../src/renderer/preferences.js';
test('part size is an exact 1 KiB to 90,000,000 bytes physical limit with a 10 MiB default representation', () => {
 assert.equal(parsePartSize('1','KB'),1024); assert.equal(parsePartSize('10','MB'),10485760); assert.equal(parsePartSize('87890.625','KB'),90000000); assert.throws(()=>parsePartSize('1','GB'));
 assert.equal(parsePartSize('1.5','KB'),1536); assert.deepEqual(displayPartSize(10485760),{value:'10',unit:'MB'});
 for (const [value,unit] of [['0.9','KB'],['0','MB'],['-1','MB'],['1.0001','GB'],['1.001','KB'],['Infinity','MB'],['1e3','KB'],['1','TB']]) assert.throws(() => parsePartSize(value,unit));
});
test('vocabulary has bounded, plain-text, unique replacements without prototype keys', () => {
 assert.deepEqual(parseVocabulary('{"version":1,"replacements":[{"from":"My drive","to":"My files"}]}').replacements,[{from:'My drive',to:'My files'}]);
 for (const replacements of [[{from:'__proto__',to:'x'}],[{from:'one',to:'a'},{from:'one',to:'b'}],[{from:'one',to:'\u0000'}]]) assert.throws(() => parseVocabulary(JSON.stringify({version:1,replacements})));
 assert.throws(() => parseVocabulary(' '.repeat(262145))); assert.throws(() => parseVocabulary('{bad'));
});
test('malformed, oversized, or invalid saved preferences do not become executable settings', () => {
 const read = value => loadSettings({getItem:() => value});
 assert.equal(read('broken').theme,'system'); assert.equal(read('x'.repeat(150001)).theme,'system');
 assert.equal(read('{"theme":"dark","language":"yue","celebration":99}').theme,'dark');
 assert.equal(read('{"theme":"invalid","emoji":"true","patience":101}').patience,60);
});
