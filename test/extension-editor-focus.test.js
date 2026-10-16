import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../browser-extension/options.js',import.meta.url),'utf8');
test('production editor callbacks transfer focus into pending actions and back after cancellation',async()=>{
 const controls=new Map();let focused,resume;const $=id=>{if(!controls.has(id))controls.set(id,{focus(){focused=id;},addEventListener(_type,fn){this.click=fn;}});return controls.get(id);};
 const context={$: $,confirmDestructive:(_id,run)=>run(),editorAvailable:true,editorPending:false,busy:false,generation:0,connection:true,protection:{},prefs:{language:'yue'},render(){},chrome:{runtime:{sendMessage:message=>message.type==='disconnect'?Promise.resolve({paired:false}):new Promise(resolve=>{assert.equal(message.language,'yue');resume=resolve;})}}};
 vm.createContext(context);for(const id of ['editor-open','editor-cancel']){const row=source.split(/\r?\n/).find(line=>line.startsWith("$('"+id+"').addEventListener"));assert.ok(row);vm.runInContext(row,context);}
 const pending=$('editor-open').click();assert.equal(focused,'editor-cancel');$('editor-cancel').click();assert.equal(focused,'refresh');resume({schemaVersion:1,outcome:'opened'});await pending;assert.equal(focused,'refresh');assert.equal(context.connection,false);
 context.editorAvailable=true;context.busy=false;const again=$('editor-open').click();resume({schemaVersion:1,outcome:'opened'});await again;assert.equal(focused,'editor-open');
});
