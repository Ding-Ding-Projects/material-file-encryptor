import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
import {resolveLayoutTargets,composedLayoutExpression} from '../scripts/gui-acceptance-layout.mjs';
test('boxless wrapper resolves only its explicit visible native dialog path',()=>{
 const inner={getClientRects:()=>[{}]},md={shadowRoot:{querySelectorAll:selector=>selector==='dialog'?[inner]:[]}},outer={getClientRects:()=>[],shadowRoot:{querySelectorAll:selector=>selector==='md-dialog'?[md]:[]}};
 const context={document:{querySelectorAll:selector=>selector==='#vault-dialog'?[outer]:[]}};
 const resolve=selector=>vm.runInNewContext(`(${resolveLayoutTargets.toString()})(${JSON.stringify(selector)})`,context);
 assert.equal(resolve('#vault-dialog').length,0);assert.equal(resolve('#vault-dialog >>> md-dialog >>> dialog')[0],inner);
 assert.throws(()=>resolve('#absent >>> dialog'),/missing or ambiguous/);
 outer.shadowRoot.querySelectorAll=()=>[md,md];assert.throws(()=>resolve('#vault-dialog >>> md-dialog >>> dialog'),/missing or ambiguous/);
 new vm.Script(composedLayoutExpression('#vault-dialog >>> md-dialog >>> dialog'));
});
test('all three existing creation states explicitly measure the inner dialog',async()=>{
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url)));
 for(const id of ['create-password','create-key-file','create-private-repository'])assert.equal(inventory.states.find(state=>state.id===id).layoutSelector,'#vault-dialog >>> md-dialog >>> dialog');
});
