import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const worker=readFileSync(new URL('../src/shared/surface/regex-worker.js',import.meta.url),'utf8');
function run(data){let result;const scope={performance,self:{postMessage:value=>{result=value;}}};vm.runInNewContext(worker,scope);scope.self.onmessage({data});return JSON.parse(JSON.stringify(result));}
test('isolated regex protocol preserves Unicode captures and replacement previews',()=>{
 const result=run({pattern:'(?<word>\\p{L}+)',flags:'gu',sample:'香港 test',replacement:'[$<word>]'});
 assert.deepEqual(result.matches.map(m=>m.groups.word),['香港','test']);assert.equal(result.replacement,'[香港] [test]');
});
test('zero width Unicode matching terminates at code point boundaries',()=>{
 const result=run({pattern:'(?=.)',flags:'u',sample:'😀a',replacement:'|'});
 assert.deepEqual(result.matches.map(m=>m.index),[0,2]);
});
test('worker handles invalid syntax, flags and oversized patterns as errors',()=>{
 for(const data of [{pattern:'[',flags:'u'},{pattern:'a',flags:'ii'},{pattern:'a'.repeat(513),flags:'u'}])assert.equal(typeof run({...data,sample:'test'}).error,'string');
});
test('row matching resets global state and returns only ids',()=>{
 assert.deepEqual(run({pattern:'a',flags:'g',rows:[{id:'first',text:'a'},{id:'second',text:'a'},{id:'third',text:'b'}]}),{matches:['first','second']});
});
test('suite executes expected outcomes with timing and capture indices',()=>{
 const result=run({pattern:'a+',flags:'d',sample:'baaa',replacement:'x',cases:[{text:'aaa',match:true},{text:'b',match:false},{text:'a',match:false}]});
 assert.deepEqual(result.cases.map(c=>c.passed),[true,true,false]);assert.deepEqual(result.matches[0].indices,[[1,4]]);assert.equal(typeof result.elapsedMs,'number');assert.equal(result.replacement,'bx');
});
