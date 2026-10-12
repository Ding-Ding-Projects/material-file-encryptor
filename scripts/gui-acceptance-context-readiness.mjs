import assert from 'node:assert/strict';

// Read only the actual mounted renderer. Never inspect private field contents,
// configure a lock, patch a component getter or supply a completion flag.
export function observeContextStartupReadiness(){
 try{
  const access=document.querySelector('#view-access .access-workspace');
  const wizard=access?.querySelector('[data-access-wizard]');
  const policies=wizard?[...wizard.querySelectorAll('md-outlined-select')].filter(node=>[...node.querySelectorAll('md-select-option')].some(option=>option.value==='pin')):[];
  const policy=policies.length===1?policies[0]:null;
  const allowed=policy?[...policy.querySelectorAll('md-select-option')].map(option=>option.value):[];
  const editor=document.querySelector('.appearance-editor');
  const language=document.querySelector('#language-setting'),theme=document.querySelector('#theme-setting');
  return Boolean(access?.isConnected&&wizard?.isConnected&&policy?.isConnected&&!policy.disabled&&allowed.includes(policy.value)&&policy.value==='pin'&&editor?.isConnected&&editor.hidden&&language?.isConnected&&['en','yue','bilingual'].includes(language.value)&&theme?.isConnected&&['light','dark','system'].includes(theme.value)&&document.querySelector('#main-error')?.hidden===true);
 }catch{return false;}
}

export async function requireContextStartupReadiness({page,identity,context}){
 await identity(context);
 await page.waitForFunction(observeContextStartupReadiness,undefined,{timeout:10000});
 assert.equal(await page.evaluate(observeContextStartupReadiness),true,'Actual startup select and appearance readiness are unverified');
 await identity(context);
 return {sourceCommit:context.binding.sourceCommit,readOnly:true,registeredSelectReady:true,appearanceEditorMounted:true,privateValuesRead:false};
}
