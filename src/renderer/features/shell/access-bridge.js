/** Renderer adapters only. The privileged host owns authorization and identity. */
export function createRendererAccessBridge({request,settingsIntegrity,onUnavailable=()=>{}}){
 const accessHost=(action,payload={})=>request(action,payload);
 const restoreDisplayName=value=>{if(typeof value!=='string')throw Error('The restored display name is invalid.');return settingsIntegrity.applyDisplayNameFromHost(value);};
 return {accessHost,restoreDisplayName,
  resetPreferences({defaults,validate=()=>{}}){validate();settingsIntegrity.assertCanUpdate(defaults);if(settingsIntegrity.store.get().displayName!==defaults.displayName)throw Error('Reset the display name through its authorized control first, then reset the remaining preferences. A combined reset across protected and local storage is unavailable.');return settingsIntegrity.store.reset();},
  async initializeDisplayName(){try{const result=await accessHost('displayNameRead',{});if(!result||!Object.hasOwn(result,'value')||(result.value!==null&&typeof result.value!=='string'))throw Error('The host returned an invalid display name.');settingsIntegrity.applyDisplayNameFromHost(result.value);return true;}catch(error){onUnavailable(error);return false;}},
  async recordDisplayName(value){if(typeof value!=='string'||!value.trim())throw Error('A non-empty display name is required.');return accessHost('displayNameSet',{value});}
 };
}
