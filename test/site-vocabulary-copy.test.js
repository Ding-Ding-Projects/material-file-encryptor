import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseVocabulary} from '../docs/site/personal-vocabulary.js';
import {localized,messagePair} from '../docs/site/locales.js';

test('published format example loads through the canonical parser',()=>{
 const html=readFileSync(new URL('../docs/site/index.html',import.meta.url),'utf8');
 const example=html.match(/<pre><code>(\{[\s\S]*?\})<\/code><\/pre>/)[1];
 assert.deepEqual(parseVocabulary(example).replacements,[{from:'folder',to:'directory'}]);
 assert.match(example,/"schemaVersion": 1/);
 assert.match(html,/256 KiB/);assert.match(html,/1–160 Unicode code points/);assert.match(html,/1,000 Unicode code points/);assert.match(html,/Maximum JSON depth: 8/);
});

test('current documentation and translations remove obsolete size and persistence claims',()=>{
 for(const path of ['index.html','locales.js','README.md']){
  const text=readFileSync(new URL('../docs/site/'+path,import.meta.url),'utf8');
  assert.doesNotMatch(text,/128 KB|200 replacements|200 entries|1–120|up to 500|Nothing (?:was )?uploaded or saved/);
 }
 assert.notEqual(localized('Vocabulary JSON must be no larger than 256 KiB.','yue'),'Vocabulary JSON must be no larger than 256 KiB.');
});
