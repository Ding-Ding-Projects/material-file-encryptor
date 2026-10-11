import test from 'node:test';
import assert from 'node:assert/strict';
import {rendererTargetReadiness} from '../scripts/test-renderer-browser.mjs';
test('startup waits only for an empty or blank target, never selects among contamination',()=>{
 const url='http://127.0.0.1:4000/',port=4001,valid={type:'page',url,webSocketDebuggerUrl:'ws://127.0.0.1:4001/devtools/page/one'};
 assert.equal(rendererTargetReadiness([],url,port),'pending');
 assert.equal(rendererTargetReadiness([{type:'page',url:'about:blank'}],url,port),'pending');
 assert.equal(rendererTargetReadiness([valid],url,port),'ready');
 for(const targets of [null,{},[valid,valid],[{...valid,type:'worker'}],[{...valid,url:'https://unrelated.invalid/'}],[{...valid,webSocketDebuggerUrl:'ws://127.0.0.1:4002/devtools/page/one'}]])assert.equal(rendererTargetReadiness(targets,url,port),'invalid');
});
