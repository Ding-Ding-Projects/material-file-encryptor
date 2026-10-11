import test from 'node:test';
import assert from 'node:assert/strict';
import {rendererTargetReadiness,serveRendererFixture} from '../scripts/test-renderer-browser.mjs';
test('startup waits only for an empty or blank target, never selects among contamination',()=>{
 const url='http://127.0.0.1:4000/',port=4001,valid={type:'page',url,webSocketDebuggerUrl:'ws://127.0.0.1:4001/devtools/page/one'};
 assert.equal(rendererTargetReadiness([],url,port),'pending');
 assert.equal(rendererTargetReadiness([{type:'page',url:'about:blank'}],url,port),'pending');
 assert.equal(rendererTargetReadiness([valid],url,port),'ready');
 for(const targets of [null,{},[valid,valid],[{...valid,type:'worker'}],[{...valid,url:'https://unrelated.invalid/'}],[{...valid,webSocketDebuggerUrl:'ws://127.0.0.1:4002/devtools/page/one'}]])assert.equal(rendererTargetReadiness(targets,url,port),'invalid');
});
test('shared module imports resolve canonical renderer URLs inside the source boundary',async()=>{
 for(const [url,expected] of [['/renderer/features/personalization/image-geometry.js',200],['/features/personalization/image-geometry.js',200],['/renderer/../../package.json',404],['/renderer/%2e%2e/main/main.js',404]]){
  let status=200;await serveRendererFixture({url},{setHeader(){},writeHead(value){status=value;return this;},end(){}});assert.equal(status,expected,url);
 }
});
