// Packaged acquisition uses the existing proven launch/CDP/probe lifecycle.
// This module does not inject replacement services, import source components,
// certify visual inspection, or claim native pointer/physical DPI coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {withCdpConnectionProof} from './cdp-connection-plan.mjs';
import {layoutExpression,settledMotionExpression,assertMeasurement} from './modern-ui-check.mjs';
import {matrixFor,tupleKey,validateBinding,sha256,admitRow,verifyFiles} from './gui-acceptance.mjs';
import {inspectSurface} from './gui-acceptance-components.mjs';

const q=JSON.stringify;
const poll=(id,expression)=>({id,op:'poll',expression,equals:true,intervalMs:100});
// Open shadow roots are part of the production component graph. Only rendered
// enabled controls are eligible. Calling click is explicitly a DOM activation.
function deepFind(selector){const found=[];const visit=root=>{for(const element of root.querySelectorAll('*')){if(element.matches(selector))found.push(element);if(element.shadowRoot)visit(element.shadowRoot);}};visit(document);return found.filter(element=>element.getClientRects().length&&!element.closest('[hidden]'));}
const find=selector=>`(${deepFind.toString()})(${q(selector)})`;
const activate=(id,selector)=>({id,op:'evaluate',expression:`(()=>{const rows=${find(selector)};if(rows.length!==1)throw Error('Expected one visible control');const node=rows[0];if(node.disabled||node.getAttribute('aria-disabled')==='true')throw Error('Control is disabled');node.click();return {activation:'dom-click',count:1};})()`});
const groups={converter:'tools',ollama:'tools','server-manager':'tools',storage:'tools',details:'tools',settings:'settings',personalization:'settings',access:'settings',help:'help'};
function navigate(steps,view,id){
 const group=groups[view]||view;steps.push(activate(id+'-navigation',`mfe-navigation-rail [data-destination="${group}"]`.replace('mfe-navigation-rail ','')));
 if(groups[view]){const menu=`${find('mfe-context-menu')}.find(node=>!node.hidden)`;steps.push(poll(id+'-menu',`(()=>{const menu=${menu};return Boolean(menu&&menu.itemsHost?.querySelectorAll('md-menu-item').length===menu.items.length);})()`),{id:id+'-destination',op:'evaluate',expression:`(()=>{const menu=${menu};if(!menu||menu.search.value)throw Error('Unfiltered navigation menu required');const index=menu.items.findIndex(item=>item.id===${q(view)});const button=menu.itemsHost.querySelectorAll('md-menu-item')[index];if(index<0||!button||button.disabled)throw Error('Destination unavailable');button.click();return {activation:'dom-click',count:1};})()`});}
 steps.push(poll(id+'-visible',`(()=>{const node=document.querySelector(${q('#view-'+(view==='offline'?'drive':view))});return Boolean(node&&!node.hidden&&node.getClientRects().length);})()`));
}

export const stateRoutes=Object.freeze({
 ...Object.fromEntries(['bulk-all','bulk-invert','bulk-range','export-selected','export-filtered','export-format'].map(name=>['p-history-'+name,{view:'personalization',tab:'#view-personalization md-primary-tab[id$="-tab-history"]'}])),
 ...Object.fromEntries(['preset','crop','safe-area','background'].map(name=>['p-logo-'+name,{view:'personalization',tab:'#view-personalization md-primary-tab[id$="-tab-appearance"]'}])),
 'drive-locked':{view:'drive'},'drive-empty':{view:'drive'},'drive-populated':{view:'drive'},'drive-selected':{view:'drive'},'drive-busy':{view:'drive'},'drive-error':{view:'drive'},
 'offline-populated':{view:'offline'},'history-populated':{view:'history'},'recycle-selected':{view:'recycle'},'settings-default':{view:'settings'},'help-default':{view:'help'},
 'create-password':{view:'drive',dialog:'password'},'create-key-file':{view:'drive',dialog:'keyFile'},'create-private-repository':{view:'drive',dialog:'privateGit'},
 ...Object.fromEntries(['source','formats','options','queue'].map((name,index)=>['converter-'+name,{view:'converter',tab:'#converter-tab-'+index}])),
 ...Object.fromEntries(['model-store','pull-cart','chat','profiles','help'].map((name,index)=>['ollama-'+name,{view:'ollama',tab:'#ollama-panel-'+(index+1)+'-tab'}])),
 'server-prepare':{view:'server-manager'},'server-progress':{view:'server-manager'},
 ...Object.fromEntries(['busy','running','unavailable','invalid-size','paused'].map(name=>['storage-'+name,{view:'storage'}])),
 ...Object.fromEntries(['versions','preview'].map(name=>['file-details-'+name,{view:'details'}])),
 ...Object.fromEntries(['profile','profile-locked','profile-unlocked','waiting'].map(name=>['access-'+name,{view:'access',tab:'#access-tab-profile'}])),
 ...Object.fromEntries(['locks','once','locks-empty','lock-wizard','unlock'].map(name=>['access-'+name,{view:'access',tab:'#access-tab-locks'}])),
 ...Object.fromEntries(['authenticators','authenticator-list','authenticator-registration','qr-hidden'].map(name=>['access-'+name,{view:'access',tab:'#access-tab-authenticator'}])),
 ...Object.fromEntries(['support','removal','confirmation'].map(name=>['access-'+name,{view:'access',tab:'#access-tab-support'}])),
 ...Object.fromEntries(['language','school-enabled','narrator','appearance','schedules-draft','attention','history-locked','history-unlocked','schedule-narrator','schedule-attention','schedule-appearance-ref','schedule-logo-ref','schedule-active-override','schedule-restored-base'].map(name=>['p-'+name,{view:'personalization',tab:`#view-personalization md-primary-tab[id$="-tab-${name.startsWith('schedule')?'schedules':name.startsWith('history')?'history':['appearance','attention'].includes(name)?name:'language'}"]`}])),
 ...Object.fromEntries(['context-pointer','context-keyboard','edit-normal','edit-layer-locked','edit-image','motion-track','motion-transition','history-rollback'].map(name=>['appearance-'+name,{view:'personalization',tab:'#view-personalization md-primary-tab[id$="-tab-appearance"]'}])),
 'tools-default':{view:'converter'},'drive-overflow':{view:'drive'},'drive-search':{view:'drive'},'drive-notifications':{view:'drive'}
});

export function acquisitionCapabilities(inventory,adapters={}){
 return inventory.states.map(state=>({state:state.id,navigation:Boolean(stateRoutes[state.id]),fixture:typeof adapters[state.id]?.prepare==='function',observable:typeof adapters[state.id]?.assertState==='function',actions:state.actions.filter(id=>typeof adapters[state.id]?.actions?.[id]==='function'),missingActions:state.actions.filter(id=>typeof adapters[state.id]?.actions?.[id]!=='function')}));
}
export function composeAdapters(inventory,...areas){
 const known=new Set(inventory.states.map(state=>state.id)),combined={};
 for(const area of areas){assert.ok(area&&typeof area==='object');for(const [id,adapter]of Object.entries(area)){
  assert.ok(known.has(id),`Adapter has no inventoried state: ${id}`);assert.ok(!Object.hasOwn(combined,id),`Duplicate state adapter: ${id}`);
  assert.equal(typeof adapter?.prepare,'function',`Missing fixture preparation: ${id}`);assert.equal(typeof adapter?.assertState,'function',`Missing state observation: ${id}`);assert.ok(adapter.actions&&typeof adapter.actions==='object');combined[id]=adapter;
 }}return combined;
}

export function makeAcquisitionPlan({launch,receipt,tuple,state,outputRoot}){
 assert.equal(tuple.state,state.id);assert.ok(path.isAbsolute(outputRoot));assert.ok(path.isAbsolute(receipt));assert.ok(launch.cdp.expectedUrl.startsWith('file:'));
 assert.ok(Number.isInteger(launch.cdp.port)&&launch.cdp.port>=1024&&launch.cdp.port<=65535);
 const route=stateRoutes[state.id];assert.ok(route,'Missing state navigation');
 const id=tupleKey(tuple).replaceAll('/','-'),steps=[{id:id+'-emulate',op:'emulate',width:tuple.width,height:tuple.height,scale:tuple.scale,mobile:false,touch:false}];
 navigate(steps,'settings',id+'-settings');
 for(const [field,value]of [['theme',tuple.theme],['language',tuple.language]])steps.push({id:id+'-'+field,op:'evaluate',expression:`(()=>{const node=document.querySelector(${q('#'+field+'-setting')});if(!node||node.disabled)throw Error('Setting unavailable');node.value=${q(value)};node.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`});
 steps.push(poll(id+'-tuple',`innerWidth===${tuple.width}&&innerHeight===${tuple.height}&&Math.abs(devicePixelRatio-${tuple.scale})<0.01&&document.documentElement.dataset.theme===${q(tuple.theme)}&&document.querySelector('#language-setting').value===${q(tuple.language)}`));
 navigate(steps,route.view,id+'-state');if(route.tab)steps.push(activate(id+'-tab',route.tab));
 if(route.dialog){steps.push(activate(id+'-create','#create-button'),poll(id+'-dialog',"document.querySelector('#vault-dialog').open"));if(route.dialog==='keyFile')steps.push(activate(id+'-key-mode','.credential-selector md-radio[value="keyFile"]'));if(route.dialog==='privateGit')steps.push({id:id+'-transport',op:'evaluate',expression:"(()=>{const node=document.querySelector('#transport-mode');node.value='privateGit';node.dispatchEvent(new Event('change',{bubbles:true}));return true;})()"});}
 return withCdpConnectionProof({version:1,receipt,endpoint:`http://127.0.0.1:${launch.cdp.port}`,expectedUrl:launch.cdp.expectedUrl,allowEvaluate:true,timeoutMs:90000,steps},'control');
}

// Each state adapter prepares only an explicitly owned native fixture, observes
// the mounted production state, and exercises its individually named actions.
// Missing adapters stop before acquisition instead of producing misleading PNGs.
export async function acquireMatrix({inventory,binding,launch,receipt,outputRoot,executePlan,createProbeEvidence,adapters,tuples=matrixFor(inventory),resume=new Map(),report=()=>{}}){
 validateBinding(binding,inventory);assert.ok(path.isAbsolute(outputRoot));
 const planned=new Map(matrixFor(inventory).map(tuple=>[tupleKey(tuple),tuple]));const results=[],unavailableStates=new Map();
 for(const tuple of tuples){
  const key=tupleKey(tuple);assert.deepEqual(tuple,planned.get(key),'Unknown matrix tuple');
  const state=inventory.states.find(item=>item.id===tuple.state),adapter=adapters[state.id];
  if(resume.has(key)){try{admitRow(resume.get(key),{tuple,state,binding});await verifyFiles(resume.get(key),outputRoot);results.push({key,status:'reused'});continue;}catch{/* Changed or incomplete evidence must be acquired again. */}}
  if(unavailableStates.has(state.id)){results.push({key,status:'unavailable',reason:unavailableStates.get(state.id),notRetried:true});continue;}
  const capabilities=acquisitionCapabilities({states:[state]},adapters)[0];
  if(!capabilities.navigation||!capabilities.fixture||!capabilities.observable||capabilities.missingActions.length){results.push({key,status:'unavailable',capabilities});continue;}
  const tupleDirectory=path.join(outputRoot,key.replaceAll('/','-'));await fs.mkdir(tupleDirectory,{recursive:true});
  const directory=await fs.mkdtemp(path.join(tupleDirectory,'attempt-'));
  const record={schemaVersion:1,tuple,binding,scope:'packaged-acquisition',status:'started',physicalDpiVerified:false};
  const save=()=>fs.writeFile(path.join(directory,'acquisition.json'),JSON.stringify(record,null,2));await save();report({key,status:'started'});
  try{
   assert.equal(typeof createProbeEvidence,'function','A per-attempt native probe factory is required');
   const probeEvidence=await createProbeEvidence({outputRoot:directory,tuple,binding});
   assert.equal(typeof probeEvidence?.observe,'function');assert.equal(typeof probeEvidence?.persist,'function');
   const prepared=await adapter.prepare({tuple,binding,executePlan});assert.equal(prepared?.ownedSyntheticFixture,true);assert.equal(prepared?.sourceCommit,binding.sourceCommit);record.fixture=prepared;
   const setup=makeAcquisitionPlan({launch,receipt,tuple,state,outputRoot:directory});await executePlan(setup);await adapter.enter?.({tuple,binding,executePlan,prepared});
   const observed=await adapter.assertState({tuple,executePlan});assert.equal(observed?.passed,true);assert.equal(observed?.observable,state.observable);assert.ok(observed.evidence&&typeof observed.evidence==='object','State observation evidence is required');record.state=observed;
   record.actions=[];for(const id of state.actions){const action=await adapter.actions[id]({tuple,binding,executePlan,prepared});assert.equal(action?.id,id);assert.equal(action?.activated,true);assert.equal(action?.observablePassed,true);assert.ok(action.evidence&&typeof action.evidence==='object','Action evidence is required');const actionName='action-'+record.actions.length+'.json',bytes=Buffer.from(JSON.stringify({...action,schemaVersion:1,tuple,binding},null,2));await fs.writeFile(path.join(directory,actionName),bytes,{flag:'wx'});record.actions.push({...action,evidencePath:path.relative(outputRoot,path.join(directory,actionName)),evidenceSha256:sha256(bytes)});await save();}
   // Actions can change the surface. Restore through the adapter and then
   // navigate normally before taking the state-specific capture.
   const restored=await adapter.prepare({tuple,binding,executePlan});assert.equal(restored?.ownedSyntheticFixture,true);assert.equal(restored?.sourceCommit,binding.sourceCommit);await executePlan(setup);await adapter.enter?.({tuple,binding,executePlan,prepared:restored});assert.equal((await adapter.assertState({tuple,executePlan}))?.passed,true);
   const capturePlan=withCdpConnectionProof({...setup,observeRuntime:true,steps:[poll('state-motion-settled',settledMotionExpression(state.selector)),{id:'state-surface-audit',op:'evaluate',expression:`(${inspectSurface.toString()})(document)`},{id:'state-measure',op:'evaluate',expression:layoutExpression(state.selector)},{id:'state-capture',op:'capture',path:path.join(directory,'capture.png'),overwrite:false}]},'capture');
   const before=await probeEvidence.observe();const captured=await executePlan(capturePlan);record.raw=captured;await save();
   const measurements=(captured.results||[]).filter(step=>step.id==='state-measure');assert.equal(measurements.length,1);assertMeasurement(measurements[0].value,tuple);
   const audit=captured.results.find(step=>step.id==='state-surface-audit')?.value;assert.ok(audit,'Shadow DOM audit missing');record.surfaceAudit=audit;assert.deepEqual(audit.genericControls,[]);assert.deepEqual(audit.unregisteredControls,[]);assert.deepEqual(audit.clipped,[]);assert.equal(audit.outerFrameScroll,false);
   const after=await probeEvidence.observe();assert.equal(await probeEvidence.persist({before,after,plan:capturePlan,result:captured,measurements,tuple}),1);
   const bytes=await fs.readFile(path.join(directory,'capture.png'));record.capture={path:path.relative(outputRoot,path.join(directory,'capture.png')),sha256:sha256(bytes)};
   record.status='captured-awaiting-inspection-and-reference';record.accepted=false;
  }catch(error){record.status='failed';record.reason=error.message;if(String(error.message).startsWith('CAPABILITY_UNAVAILABLE:')){record.status='unavailable';unavailableStates.set(state.id,error.message);}}
  finally{try{if(adapter.restore)record.restoration=await adapter.restore({tuple,binding,executePlan});}catch(error){record.status='restoration-failed';record.restorationReason=error.message;}await save();results.push({key,status:record.status,path:path.join(directory,'acquisition.json')});report(results.at(-1));}
 }
 return {schemaVersion:1,binding,results,accepted:false};
}
