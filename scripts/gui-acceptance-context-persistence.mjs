import assert from 'node:assert/strict';
import {requireContextStartupReadiness} from './gui-acceptance-context-readiness.mjs';

// Observations return only the isolated profile's bounded appearance records.
// The provider retains them in memory and emits only counts and booleans.
export function observeContextAppearance({targetId}){
 const rows=[...document.querySelectorAll('#file-list tr[data-file-id]')].filter(row=>row.dataset.fileId===targetId);
 if(rows.length!==1)throw Error('Exact owned context target is unavailable');
 const targets=rows[0].querySelectorAll('md-radio');if(targets.length!==1)throw Error('Exact owned context control is unavailable');
 const target=targets[0],key='m4e.appearance.v1',journalKey='material-file-encryptor.appearance-journal.v1';
 const raw=localStorage.getItem(key),index=localStorage.getItem(journalKey);
 if((raw?.length||0)>300000||(index?.length||0)>4096)throw Error('Appearance observation exceeds bounds');
 const state=raw===null?null:JSON.parse(raw),ids=index===null?[]:JSON.parse(index);
 if(!Array.isArray(ids)||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[-\w]{1,80}$/.test(id)))throw Error('Owned appearance journal is unavailable');
 const journal=ids.map((id,i)=>{const text=localStorage.getItem(journalKey+':'+id);if(!text||text.length>300000)throw Error('Appearance revision is unavailable');const row=JSON.parse(text);if(row.version!==1||row.id!==id||row.previous!==(ids[i-1]??null)||!row.snapshot||row.omitted!=='Local image pixels are omitted.')throw Error('Appearance journal chain differs');return{id,previous:row.previous,snapshot:row.snapshot};});
 const field=document.querySelector('.appearance-editor .appearance-property[data-search-text="opacity"] md-outlined-text-field');
 return {targetId,appearanceId:target.dataset.appearanceId||null,connected:target.isConnected,opacity:Number(getComputedStyle(target).opacity),editorOpen:document.querySelector('.appearance-editor')?.hidden===false,fieldValue:field?.value??null,fieldDisabled:field?.disabled===true,state,journal};
}

export function createContextAppearancePersistence({page,identity,contextFixture}){
 let session=null;
 const field='.appearance-editor .appearance-property[data-search-text="opacity"] md-outlined-text-field';
 const details='.appearance-editor details:has(.appearance-property[data-search-text="opacity"])';
 const observe=async context=>{await identity(context);const value=await page.evaluate(observeContextAppearance,{targetId:session.targetId});assert.equal(value.targetId,session.targetId);assert.equal(value.connected,true);return value;};
 const sameTarget=value=>{assert.ok(value.appearanceId,'Appearance target identity missing');if(session.appearanceId)assert.equal(value.appearanceId,session.appearanceId,'Appearance target changed');else session.appearanceId=value.appearanceId;};
 const openEditor=async context=>{
  await identity(context);const opened=await contextFixture['open-context'](context);assert.equal(opened.capturedTargetId,session.targetId,'Context target changed');
  const activated=await contextFixture['open-editor'](context);assert.equal(activated.capturedTargetId,session.targetId);assert.equal(activated.effect?.count,1);assert.equal(activated.focusInEditor,true);assert.equal(activated.editorRetained,true);
  const current=await observe(context);sameTarget(current);assert.equal(current.editorOpen,true);return current;
 };
 const close=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.appearance-editor')?.hidden===true,undefined,{timeout:10000});};
 const reload=async context=>{await identity(context);await page.reload({waitUntil:'domcontentloaded',timeout:10000});await requireContextStartupReadiness({page,identity,context});};
 const journalAdvance=(before,after)=>{assert.equal(after.length,before.length+1,'Exactly one appearance revision required');assert.deepEqual(after.slice(0,-1),before,'Earlier appearance revisions changed');};
 const assertChanged=value=>{sameTarget(value);assert.equal(value.fieldDisabled,false);assert.equal(value.fieldValue,'0.37');assert.ok(Math.abs(value.opacity-.37)<.001,'Saved opacity has no live effect');assert.equal(value.state?.elements?.[session.appearanceId]?.normal?.[0]?.properties?.opacity,'0.37');assert.deepEqual(Object.keys(value.state.elements),[session.appearanceId],'Unexpected appearance target mutation');};
 async function finishRestoration(context){
  await close();await reload(context);const reloaded=await observe(context);assert.deepEqual(reloaded.state,session.expectedState);assert.deepEqual(reloaded.journal,session.expectedJournal);assert.ok(Math.abs(reloaded.opacity-session.originalOpacity)<.001,'Restored live appearance differs');
  const result={restored:true,mutated:true,normalControl:'Reset element',reloadVerified:true,targetAppearanceRestored:true,revisionCount:reloaded.journal.length,journalRetained:true,originalStorageAbsent:session.originalStorageAbsent,defaultRecordRetained:true};session=null;return result;
 }
 async function restore(context){
  if(!session)return{restored:true,mutated:false,journalRetained:true};
  await identity(context);
  if(!session.writeAttempted){await page.keyboard.press('Escape');session=null;return{restored:true,mutated:false,journalRetained:true};}
  if(session.resetApplied)return finishRestoration(context);
  // Restoration is independent of the run's success. Reopen the actual editor,
  // then activate Reset element. Never replace localStorage or erase revisions.
  await page.keyboard.press('Escape');const before=await openEditor(context);sameTarget(before);
  if(before.state===null&&before.journal.length===0){await close();assert.ok(Math.abs(before.opacity-session.originalOpacity)<.001);session=null;return{restored:true,mutated:false,journalRetained:true};}
  assert.ok(session.expectedState,'Unobserved appearance mutation prevents restoration');
  assert.deepEqual(before.state,session.expectedState,'Appearance changed outside the observed mutation');
  assert.deepEqual(before.journal,session.expectedJournal,'Appearance revisions changed outside the observed mutation');
  assert.ok(before.state&&Object.keys(before.state.elements||{}).every(id=>id===session.appearanceId),'Unexpected appearance state prevents restoration');
  const history='.appearance-editor details[data-appearance-section="History, presets and transfer"]';
  if(!await page.locator(history).evaluate(node=>node.open))await page.locator(history+' > summary').click();
  const buttons=page.locator(history+' md-outlined-button').filter({hasText:/^(Reset element(?: \/ 重設元素)?|重設元素)$/});
  assert.equal(await buttons.count(),1,'Exact normal Reset element control is unavailable');
  await identity(context);await buttons.click();
  await page.waitForFunction(({targetId})=>{const state=JSON.parse(localStorage.getItem('m4e.appearance.v1')||'null');return state&&Object.keys(state.elements||{}).length===0;},{targetId:session.targetId},{timeout:10000});
  const after=await observe(context);journalAdvance(before.journal,after.journal);assert.deepEqual(after.state.elements,{});
  const previous={...before.state,elements:{}},restored={...after.state};assert.deepEqual(restored,previous,'Unrelated appearance settings changed during restoration');
  assert.deepEqual(after.journal.at(-1).snapshot,after.state,'Restoration revision differs from saved state');
  session.expectedState=structuredClone(after.state);session.expectedJournal=structuredClone(after.journal);session.resetApplied=true;
  return finishRestoration(context);
 }
 async function run(context){
  assert.equal(session,null,'Earlier persistence sequence requires restoration');await identity(context);
  const opened=await contextFixture['open-context'](context);session={targetId:opened.capturedTargetId,appearanceId:null,writeAttempted:false};
  let primary,restoration,result;
  try{
   const baseline=await observe(context);assert.equal(baseline.state,null,'Persistence sequence requires a fresh owned appearance profile');assert.deepEqual(baseline.journal,[],'Persistence sequence requires an empty owned appearance journal');assert.ok(Number.isFinite(baseline.opacity));session.originalOpacity=baseline.opacity;session.originalStorageAbsent=true;
   await page.keyboard.press('Escape');await openEditor(context);
   if(!await page.locator(details).evaluate(node=>node.open))await page.locator(details+' > summary').click();
   const ready=await observe(context);sameTarget(ready);assert.equal(ready.fieldDisabled,false);assert.equal(ready.fieldValue,'1');
   await identity(context);session.writeAttempted=true;
   await page.locator(field+' input').fill('0.37');await page.locator(field+' input').press('Tab');
   await page.waitForFunction(()=>{const state=JSON.parse(localStorage.getItem('m4e.appearance.v1')||'null');return state&&Object.values(state.elements||{}).some(value=>value.normal?.[0]?.properties?.opacity==='0.37');},undefined,{timeout:10000});
   const changed=await observe(context);session.expectedState=structuredClone(changed.state);session.expectedJournal=structuredClone(changed.journal);assertChanged(changed);journalAdvance(baseline.journal,changed.journal);assert.deepEqual(changed.journal.at(-1).snapshot,changed.state,'Saved revision differs from appearance');
   await close();await reload(context);await openEditor(context);const persisted=await observe(context);assertChanged(persisted);assert.deepEqual(persisted.state,changed.state);assert.deepEqual(persisted.journal,changed.journal);
   result={sourceCommit:context.binding.sourceCommit,ownedSyntheticFixture:true,scope:'context-appearance-persistence',actualControlInput:true,liveEffectVerified:true,reloadVerified:true,saveReadbackVerified:true,revisionCount:changed.journal.length,privateRecordsRetained:false,accepted:false};
  }catch(error){primary=error;}
  try{restoration=await restore(context);}catch(error){if(primary)throw new AggregateError([primary,error],'Context persistence and independent restoration failed');throw error;}
  if(primary)throw primary;return {...result,restoration};
 }
 return {run,restore};
}
