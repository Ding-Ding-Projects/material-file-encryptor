import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictPage, choicesForConflict, conflictRequest, appendConflictPage, restoredConflictPaths } from '../src/renderer/features/storage-maintenance/registry-conflicts-model.js';
import { CONFLICT_COPY } from '../src/renderer/features/storage-maintenance/registry-conflicts-copy.js';
class Node {
  constructor(tag) { this.localName=tag; this.disabled=false; this.checked=false; this.value=''; this.children=[]; this.attributes={}; this.listeners={}; this.dataset={}; }
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;} attachShadow(){return this.shadowRoot=new Node('shadow');}
  setAttribute(key,value){this.attributes[key]=value;} addEventListener(key,value){this.listeners[key]=value;} remove(){this.removed=true;} focus(){this.focused=true;}
}
globalThis.HTMLElement=Node; globalThis.CSSStyleSheet=class{replaceSync(){}};
globalThis.customElements={map:new Map(),get(key){return this.map.get(key);},define(key,value){this.map.set(key,value);}};
globalThis.document={createElement:tag=>customElements.get(tag)?new(customElements.get(tag))():new Node(tag)};
const { RegistryConflictsPanel }=await import('../src/renderer/features/storage-maintenance/registry-conflicts-panel.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='a'.repeat(64), currentVersion='b'.repeat(64), preservedVersion='c'.repeat(64);
const conflict=(patch={})=>({conflictId:id,kind:'file-edit',current:{entryId:'d'.repeat(64),path:'report.txt',versionId:currentVersion,isDirectory:false},preserved:{entryId:'e'.repeat(64),path:'report-conflict.txt',versionId:preservedVersion,isDirectory:false},supportedChoices:['keep-current','use-preserved','keep-both'],unsupportedReason:null,...patch});
const state=(sessionId='main')=>({sessionId,storageDir:`C:\\${sessionId}`,locked:false});
async function fixture(overrides={}){
 let selected=state(); const calls=[];
 const services={listRegistryConflicts:async payload=>{calls.push(['list',selected.sessionId,payload]);return{items:[conflict()],nextCursor:null};},resolveRegistryConflict:async payload=>{calls.push(['resolve',selected.sessionId,payload]);return{...payload,resolved:true};},...overrides};
 const panel=new RegistryConflictsPanel();panel.configure({services,getVaultState:()=>selected});await tick();
 return{panel,calls,setState(value){selected=value;panel.setVaultState(value);}};
}
test('bounded conflict pages reject malformed sides and conflicting duplicate records',()=>{
 const page=conflictPage({items:[conflict()],nextCursor:null});assert.equal(Object.isFrozen(page.items[0].current),true);
 for(const row of [conflict({current:undefined}),conflict({supportedChoices:['x'.repeat(100)]}),conflict({preserved:{...conflict().preserved,versionId:''}})])assert.throws(()=>conflictPage({items:[row],nextCursor:null}));
 assert.throws(()=>conflictPage({items:[conflict(),conflict()],nextCursor:null}));
 assert.throws(()=>appendConflictPage(page.items,conflictPage({items:[conflict({current:{...conflict().current,path:'changed.txt'}})],nextCursor:null})));
 assert.deepEqual(choicesForConflict(conflict({kind:'unknown'})),[]);assert.deepEqual(choicesForConflict(conflict({current:null})),[]);
 assert.throws(()=>conflictRequest(conflict(),'delete-everything'));
});
test('selection never resolves; explicit Apply forwards only the frozen reviewed versions',async()=>{
 const {panel,calls}=await fixture();panel.select(id);assert.equal(panel.current().choice,'');assert.equal(panel.buttons.apply.disabled,true);assert.equal(calls.length,1);
 panel.choose('use-preserved');assert.equal(panel.buttons.apply.disabled,false);assert.match(panel.consequence.textContent,/Replace the current file contents/);
 await panel.apply();assert.deepEqual(calls[1],['resolve','main',{conflictId:id,choice:'use-preserved',currentVersion,preservedVersion}]);
 assert.equal(calls[2][0],'list');assert.match(panel.status.textContent,/native service recorded/);assert.equal(panel.current().choice,'');assert.equal(panel.buttons.apply.disabled,true);
});
test('unsupported kinds, missing sides and directories stay visible and non-actionable',async()=>{
 const rows=[conflict({kind:'rename',unsupportedReason:'Rename recovery pending.'}),conflict({conflictId:'f'.repeat(64),kind:'delete',current:null}),conflict({conflictId:'9'.repeat(64),current:{...conflict().current,isDirectory:true}})];
 const {panel,calls}=await fixture({listRegistryConflicts:async()=>({items:rows,nextCursor:null})});
 for(const row of rows){panel.select(row.conflictId);panel.choose('keep-current');await panel.apply();assert.equal(panel.buttons.apply.hidden,true);assert.equal(panel.unsupported.hidden,false);}
 assert.equal(calls.length,0);assert.equal(panel.current().rows.length,3);panel.select('f'.repeat(64));assert.equal(panel.sideNodes.current.missing.hidden,false);
});
test('opaque cursor pagination is explicit and repeated cursors fail closed',async()=>{
 const cursor='opaque-page-2',pageCalls=[];const {panel}=await fixture({listRegistryConflicts:async payload=>{pageCalls.push(['page',payload]);return payload.cursor?{items:[conflict({conflictId:'f'.repeat(64)})],nextCursor:null}:{items:[conflict()],nextCursor:cursor};}});
 await panel.more();assert.deepEqual(pageCalls.at(-1),['page',{limit:25,cursor}]);assert.equal(panel.current().rows.length,2);assert.equal(panel.buttons.more.hidden,true);
 panel.services.listRegistryConflicts=async()=>({items:[conflict()],nextCursor:cursor});await panel.refresh();await panel.more();assert.equal(panel.current().rows,null);assert.match(panel.error.textContent,/could not be validated/);
});
test('a stale exact-version result refreshes the native list and requires a new choice',async()=>{
 let newer=false;const {panel}=await fixture({listRegistryConflicts:async()=>({items:[conflict({current:{...conflict().current,versionId:newer?'8'.repeat(64):currentVersion}})],nextCursor:null}),resolveRegistryConflict:async()=>{newer=true;throw Error('The file versions changed. Refresh the conflict list before choosing.');}});
 panel.select(id);panel.choose('keep-current');await panel.apply();assert.match(panel.status.textContent,/may have changed/);assert.equal(panel.current().selected,null);assert.equal(panel.buttons.apply.disabled,true);
 panel.select(id);assert.equal(panel.sideNodes.current.rows.versionId.value.textContent,'8'.repeat(64));assert.equal(panel.current().choice,'');
});
test('pending resolution cannot be cancelled or duplicated; its response must match the request',async()=>{
 let finish;let resolutions=0;const {panel}=await fixture({resolveRegistryConflict:()=>{resolutions++;return new Promise(resolve=>{finish=resolve;});}});
 panel.select(id);panel.choose('keep-both');const operation=panel.apply();await panel.apply();panel.cancel();assert.equal(resolutions,1);assert.equal(panel.buttons.cancel.disabled,true);assert.match(panel.status.textContent,/cannot be cancelled/);
 finish({conflictId:'other',choice:'keep-both',resolved:true});await operation;assert.match(panel.status.textContent,/unverified/);
});
test('cancel review invalidates an in-flight list without cancelling registry work',async()=>{
 const {panel,calls}=await fixture();let finish;panel.services.listRegistryConflicts=()=>new Promise(resolve=>{finish=resolve;});
 const reading=panel.refresh();panel.cancel();finish({items:[conflict()],nextCursor:null});await reading;assert.equal(panel.current().rows,null);assert.match(panel.status.textContent,/Review cancelled/);assert.equal(calls.some(call=>call[0]==='resolve'),false);
});
test('session changes and destroy fence late responses and retain no actionable old selection',async()=>{
 let finish;const {panel,setState}=await fixture({resolveRegistryConflict:()=>new Promise(resolve=>{finish=resolve;})});panel.select(id);panel.choose('keep-both');const resolving=panel.apply();
 setState(state('other'));await tick();finish({conflictId:id,choice:'keep-both',resolved:true});await resolving;assert.equal(panel.current().selected,null);assert.doesNotMatch(panel.status.textContent,/native service recorded/);
  setState(state());await tick();assert.equal(panel.current().pending,null);assert.equal(panel.buttons.refresh.disabled,false);
 let listDone;panel.services.listRegistryConflicts=()=>new Promise(resolve=>{listDone=resolve;});const reading=panel.refresh();panel.destroy();listDone({items:[conflict()],nextCursor:null});await reading;assert.equal(panel.sessions.size,0);
});
test('all copy has three language modes and safe text for external paths and unsupported reasons',async()=>{
 for(const [key,pair]of Object.entries(CONFLICT_COPY)){assert.ok(pair[0],key);assert.ok(pair[1],key);}
 const {panel}=await fixture({listRegistryConflicts:async()=>({items:[conflict({kind:'rename',unsupportedReason:'<script>text</script>'})],nextCursor:null})});
 panel.setLanguage('zh-HK');assert.equal(panel.heading.textContent,CONFLICT_COPY.title[1]);panel.setLanguage('bilingual');assert.match(panel.heading.textContent,/Review synchronization conflicts · /);
 panel.select(id);assert.equal(panel.reason.textContent,'<script>text</script>');assert.equal(panel.status.attributes.role,'status');assert.equal(panel.error.attributes.role,'alert');
});
test('historical divergence sides retain version evidence and never offer live-file choices',async()=>{
 const historical={...conflict().preserved,isLive:false,historyVersionId:'7'.repeat(32)};
 const {panel}=await fixture({listRegistryConflicts:async()=>({items:[conflict({kind:'resolution-divergence',preserved:historical,unsupportedReason:'Causal review required.'})],nextCursor:null})});
 panel.select(id);assert.equal(panel.buttons.apply.hidden,true);assert.equal(panel.sideNodes.preserved.rows.historyVersionId.value.textContent,'7'.repeat(32));assert.match(panel.sideNodes.preserved.rows.liveState.value.textContent,/Historical record/);
 assert.deepEqual(choicesForConflict(conflict({preserved:historical})),[]);
});
test('ordinary file rename offers only advertised choices with exact rename consequences',async()=>{
 const {panel,calls}=await fixture({listRegistryConflicts:async()=>({items:[conflict({kind:'rename',supportedChoices:['use-preserved']})],nextCursor:null})});
 panel.select(id);panel.choose('keep-current');assert.equal(panel.current().choice,'');panel.choose('use-preserved');
 assert.match(panel.consequence.textContent,/preserved path and contents/);assert.match(panel.consequence.textContent,/original logical entry identity/);
 await panel.apply();assert.deepEqual(calls[0],['resolve','main',{conflictId:id,choice:'use-preserved',currentVersion,preservedVersion}]);
});
test('file deletion review renders separate intent and forwards its exact transaction with null preserved version',async()=>{
 const deletion={deletionCommitId:'6'.repeat(32),path:'report.txt',entryId:'d'.repeat(64),expectedVersion:'7'.repeat(32)};
 const row=conflict({kind:'delete-versus-edit',preserved:null,deletion,supportedChoices:['keep-change','apply-deletion']});
 const {panel,calls}=await fixture({listRegistryConflicts:async()=>({items:[row],nextCursor:null})});
 panel.select(id);assert.equal(panel.sideNodes.preserved.missing.hidden,false);assert.equal(panel.deletionBlock.hidden,false);assert.equal(panel.deletionRows.deletionCommitId.value.textContent,deletion.deletionCommitId);
 assert.equal(panel.current().choice,'');panel.choose('apply-deletion');assert.match(panel.consequence.textContent,/No directory or subtree/);
 await panel.apply();assert.deepEqual(calls[0],['resolve','main',{conflictId:id,choice:'apply-deletion',currentVersion,preservedVersion:null,deletionCommitId:deletion.deletionCommitId}]);
 assert.deepEqual(choicesForConflict({...row,current:{...row.current,isDirectory:true}}),[]);
 assert.deepEqual(choicesForConflict({...row,deletion:null}),[]);
});
test('advertised divergence recovery uses frozen versions and displays only two actual returned paths',async()=>{
 const row=conflict({kind:'resolution-divergence',recoveryDirectory:'',current:{...conflict().current,isLive:false,historyVersionId:'1'.repeat(32)},preserved:{...conflict().preserved,isLive:false,historyVersionId:'2'.repeat(32)},supportedChoices:['keep-both']});
 let sent;const {panel}=await fixture({listRegistryConflicts:async()=>({items:[row],nextCursor:null}),resolveRegistryConflict:async value=>{sent=value;return{...value,resolved:true,restoredPaths:['recovered-one.txt','recovered-two.txt']};}});
 panel.select(id);assert.equal(panel.current().choice,'');assert.equal(panel.recoveryBlock.hidden,true);panel.choose('keep-current');assert.equal(panel.current().choice,'');panel.choose('keep-both');assert.match(panel.consequence.textContent,/new unique paths/);
 await panel.apply();assert.deepEqual(sent,{conflictId:id,choice:'keep-both',currentVersion,preservedVersion});assert.equal(panel.recoveryBlock.hidden,false);assert.deepEqual(panel.recoveryList.children.map(node=>node.textContent),['recovered-one.txt','recovered-two.txt']);
 panel.services.resolveRegistryConflict=async value=>({...value,resolved:true,restoredPaths:['only-one.txt']});panel.select(id);panel.choose('keep-both');await panel.apply();assert.match(panel.status.textContent,/unverified/);assert.equal(panel.recoveryBlock.hidden,true);
 for(const paths of [null,[],['one'],['same','SAME'],['ok',''],['ok','bad\npath']])assert.throws(()=>restoredConflictPaths(paths));
 assert.deepEqual(choicesForConflict({...row,supportedChoices:[]}),[]);assert.deepEqual(choicesForConflict({...row,current:{...row.current,historyVersionId:null}}),[]);
 assert.deepEqual(choicesForConflict({...row,recoveryDirectory:undefined}),[]);assert.deepEqual(choicesForConflict({...row,recoveryDirectory:'old-parent'}),[]);
 assert.throws(()=>conflictPage({items:[{...row,recoveryDirectory:'old-parent'}],nextCursor:null}));
});
