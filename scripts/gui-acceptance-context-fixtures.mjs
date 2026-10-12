import assert from 'node:assert/strict';
import {createContextAppearancePersistence} from './gui-acceptance-context-persistence.mjs';
import {requireContextStartupReadiness} from './gui-acceptance-context-readiness.mjs';

// Browser input reaches the production controls. Evaluation only observes state;
// it never supplies application records, menu items or successful action results.
export function createContextFoundationFixture({opened,prepare,restore,identity,list,removeTarget,activationKey='Enter'}){
 assert.ok(['Enter','Space'].includes(activationKey),'Unsupported context activation key');
 const {page,target}=opened;let viewport=null,capturedId=null;
 const receipt=extra=>({ownedSyntheticFixture:true,sourceCommit:target.sourceCommit,...extra});
 const rowSelector=id=>'#file-list tr[data-file-id='+JSON.stringify(id)+']';
 const menuState=()=>page.evaluate(()=>{
  const menus=[...document.querySelectorAll('mfe-context-menu')].filter(n=>!n.hidden&&n.menu?.open);
  const menu=menus[0];let focus=document.activeElement;while(focus?.shadowRoot?.activeElement)focus=focus.shadowRoot.activeElement;
  const parent=n=>n?.parentElement||n?.getRootNode?.().host;
  let focusRow=focus;while(focusRow&&!focusRow.matches?.('tr[data-file-id]'))focusRow=parent(focusRow);
  return {count:menus.length,targetId:menu?.target?.closest('tr[data-file-id]')?.dataset.fileId||null,
   selectedIds:[...document.querySelectorAll('#file-list tr.selected')].map(n=>n.dataset.fileId),
   focusConnected:Boolean(focus?.isConnected),focusFileId:focusRow?.dataset.fileId||null};
 });
 const closed=()=>page.waitForFunction(()=>![...document.querySelectorAll('mfe-context-menu')].some(n=>!n.hidden&&n.menu?.open),undefined,{timeout:10000});
 const dismiss=async()=>{
  // Two independent Escape actions close a menu and any earlier appearance editor.
  for(let i=0;i<2;i++){
   const open=await page.evaluate(()=>[...document.querySelectorAll('mfe-context-menu')].some(n=>!n.hidden&&n.menu?.open)||[...document.querySelectorAll('.appearance-editor')].some(n=>!n.hidden));
   if(!open)break;await page.keyboard.press('Escape');await closed();
  }
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.appearance-editor')].some(n=>!n.hidden)),false,'Appearance editor did not close');
 };
 async function activateAppearance(context,retainEditor=false){
   await identity(context);const before=await menuState();assert.equal(before.count,1);assert.equal(before.targetId,capturedId);
   await page.locator('mfe-context-menu mfe-search md-outlined-text-field.query').click();
   await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');
   await page.waitForFunction(()=>{const m=[...document.querySelectorAll('mfe-context-menu')].find(n=>!n.hidden&&n.menu?.open);return m&&m.itemsHost.querySelectorAll('md-menu-item').length===m.items.length;},undefined,{timeout:10000});
   const action=await page.evaluate(()=>{
    const menu=[...document.querySelectorAll('mfe-context-menu')].find(n=>!n.hidden&&n.menu?.open);
    const nodes=[...menu.itemsHost.querySelectorAll('md-menu-item')],node=nodes[menu.items.findIndex(item=>item.id==='appearance.edit')];
    return {index:nodes.filter(n=>!n.disabled&&!n.hidden).indexOf(node),label:menu.target.getAttribute('aria-label'),query:menu.search.input.value};
   });
   assert.ok(action.index>=0);assert.ok(action.label);assert.equal(action.query,'','Unfiltered menu required for keyboard action');
   // Observe the real action's render effect without wrapping its handler. Each
   // production editor render appends one direct h2; duplicate renders fail.
   const observation=await page.evaluateHandle(()=>{
    const panel=document.querySelector('.appearance-editor');if(!panel?.hidden)throw Error('Closed appearance editor required');
    const result={renders:0,headings:[]};const observer=new MutationObserver(records=>{
     for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.localName==='h2'){result.renders++;result.headings.push(node.textContent);}
    });observer.observe(panel,{childList:true});return {result,stop(){observer.disconnect();return result;}};
   });
   let effect;
   try{
    // Start at the search field using actual input, then traverse to the action.
    await page.locator('mfe-context-menu mfe-search md-outlined-text-field.query').click();
    for(let index=0;index<=action.index;index++)await page.keyboard.press('ArrowDown');
    await page.keyboard.press(activationKey);
    await page.waitForFunction(label=>{const panel=document.querySelector('.appearance-editor');return panel&&!panel.hidden&&panel.querySelector('h2')?.textContent.endsWith(': '+label);},action.label,{timeout:10000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    effect=await observation.evaluate(handle=>handle.stop());
   }finally{await observation.evaluate(handle=>handle.stop());await observation.dispose();}
   assert.equal(effect.renders,1,'One keyboard activation must produce exactly one target editor render');
   assert.ok(effect.headings[0].endsWith(': '+action.label));
   const focusInEditor=await page.evaluate(()=>document.querySelector('.appearance-editor')?.contains(document.activeElement));assert.equal(focusInEditor,true);
   if(retainEditor)return receipt({activated:true,activation:'cdp-key',activationKey,capturedTargetId:capturedId,selectedId:before.selectedIds[0],effect:{kind:'appearance-editor-render',count:effect.renders,targetMatches:true},focusInEditor,editorRetained:true});
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.appearance-editor')?.hidden,undefined,{timeout:10000});
   const after=await menuState();assert.equal(after.count,0);assert.equal(after.focusFileId,capturedId);
   return receipt({activated:true,activation:'cdp-key',activationKey,capturedTargetId:capturedId,selectedId:before.selectedIds[0],effect:{kind:'appearance-editor-render',count:effect.renders,targetMatches:true},focusInEditor,focusRestored:true,observation:after});
 }
 const api={
  requireActionProof:true,
  async prepare(context){await identity(context);await dismiss();const startup=await requireContextStartupReadiness({page,identity,context});const prepared=await prepare(context);return {...prepared,startup};},
  async restore(context){
   await identity(context);
   const errors=[];let result,appearanceRestored=false;
   const attempt=async(name,operation)=>{try{await operation();}catch(cause){errors.push(new Error('Context restoration failed: '+name,{cause}));}};
   await attempt('appearance persistence',async()=>{const value=await persistence.restore(context);assert.equal(value.restored,true);appearanceRestored=true;});
   await attempt('dismissal',dismiss);
   await attempt('viewport',async()=>{if(viewport){await page.setViewportSize(viewport);viewport=null;}});
   // UI transport failures must not skip separately identity/hash-checked files.
   if(appearanceRestored)await attempt('native files',async()=>{result=await restore(context);assert.equal(result?.restored,true,'Native restoration was not confirmed');});
   capturedId=null;
   if(errors.length)throw new AggregateError(errors,'Context fixture restoration incomplete');
   return result;
  },
  async 'open-context'(context){
   await identity(context);await dismiss();const listing=await list();assert.equal(listing.more,false);
   const find=name=>listing.rows.find(row=>row.path.replace(/^[/\\]+/,'')===name)?.id;
   const selectedId=find('Acceptance A.txt'),targetId=find('Acceptance B.txt');
   assert.equal(listing.rows.length,2);assert.ok(selectedId&&targetId&&selectedId!==targetId,'Two distinct owned files required');
   await page.locator(rowSelector(selectedId)+' md-radio').click();
   await page.waitForFunction(id=>document.querySelector('#file-list tr.selected')?.dataset.fileId===id,selectedId,{timeout:10000});
   await page.locator(rowSelector(targetId)+' md-radio').click({button:'right'});
   await page.waitForFunction(()=>[...document.querySelectorAll('mfe-context-menu')].some(n=>!n.hidden&&n.menu?.open),undefined,{timeout:10000});
   const observation=await menuState();assert.equal(observation.count,1);assert.equal(observation.targetId,targetId);
   assert.deepEqual(observation.selectedIds,[selectedId],'Right-click must preserve the earlier selection');capturedId=targetId;
   return receipt({activated:true,activation:'native-pointer',inputRoute:'browser-pointer',selectedId,capturedTargetId:targetId,observation});
  },
  async resize(context){
   await identity(context);const before=await menuState();assert.equal(before.count,1);assert.equal(before.targetId,capturedId);
   const current=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));viewport??=current;
   await page.setViewportSize({width:current.width+1,height:current.height});await closed();
   const observation=await menuState();assert.equal(observation.focusFileId,capturedId,'Resize dismissal must restore target focus');
   await page.setViewportSize(current);viewport=null;
   return receipt({activated:true,activation:'production-api',inputRoute:'browser-viewport-resize',physicalDpiVerified:false,capturedTargetId:capturedId,before,observation,viewportRestored:current});
  },
  'select-action':context=>activateAppearance(context),
  'open-editor':context=>activateAppearance(context,true),
  async 'target-removal'(context){
   await identity(context);const before=await menuState();assert.equal(before.count,1);assert.equal(before.targetId,capturedId);
   const removal=await removeTarget(context,capturedId);await closed();
   await page.waitForFunction(id=>![...document.querySelectorAll('#file-list tr')].some(n=>n.dataset.fileId===id),capturedId,{timeout:10000});
   const observation=await menuState();assert.equal(observation.count,0);assert.equal(observation.focusConnected,true);
   return receipt({activated:true,activation:'production-api',inputRoute:'owned-native-filesystem',capturedTargetId:capturedId,removal,before,observation});
  }
 };
 const persistence=createContextAppearancePersistence({page,identity,contextFixture:api});
 api['verify-persistence']=context=>persistence.run(context);
 api['restore-persistence']=context=>persistence.restore(context);
 return api;
}
