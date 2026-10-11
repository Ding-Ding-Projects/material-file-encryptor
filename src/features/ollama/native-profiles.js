import {execFile} from 'node:child_process';
import path from 'node:path';
import {modelName} from './client.js';
export const PROFILE_RECIPES=Object.freeze({version:{name:'Ollama version check',args:['--version']},models:{name:'Installed model list',args:['list']},inspect:{name:'Model metadata inspection',args:['show','{model}']}});
const cleanEnvironment=()=>Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','USERPROFILE','HOME'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]).concat([['OLLAMA_HOST','127.0.0.1:11434'],['OLLAMA_NO_CLOUD','1']]));
// Picker callbacks must be native dialogs. No renderer-provided filesystem path
// or argument string is accepted by the registration operation.
export function createNativeProfileAdapter({pickExecutable,pickOwnedDirectory,verifyExecutable,executeFile=execFile}={}){
  const validateProfile=async p=>path.basename(p.executable).toLowerCase()==='ollama.exe'&&Object.values(PROFILE_RECIPES).some(recipe=>JSON.stringify(recipe.args)===JSON.stringify(p.args))&&Object.keys(p.env||{}).length===0;
  return {
    verifyExecutable,validateProfile,
    async pickProfile({recipe}={}){
      if(!Object.hasOwn(PROFILE_RECIPES,recipe))throw new Error('Select a built-in profile recipe.');if(!pickExecutable||!pickOwnedDirectory||!verifyExecutable)throw new Error('The host has not enabled native profile pickers and executable trust verification.');
      const executable=await pickExecutable({title:'Select the trusted Ollama executable',extensions:['exe'],filename:'ollama.exe'});if(!executable)return null;
      const cwd=await pickOwnedDirectory({title:'Select an owned working directory'});if(!cwd)return null;
      if(await verifyExecutable(executable)!==true)throw new Error('The chosen executable did not pass the native trust policy.');
      return {id:'ollama-'+recipe,name:PROFILE_RECIPES[recipe].name,executable,cwd,args:[...PROFILE_RECIPES[recipe].args],env:{},requiredFiles:[]};
    },
    async launcher(profile){
      if(!await validateProfile(profile)||!verifyExecutable||await verifyExecutable(profile.executable)!==true)throw new Error('Profile failed native launch validation.');
      const args=profile.args.map(arg=>arg==='{model}'?modelName(profile.model):arg);
      const abort=new AbortController();let child;
      const completion=new Promise(resolve=>{child=executeFile(profile.executable,args,{cwd:profile.cwd,env:cleanEnvironment(),windowsHide:true,timeout:15000,maxBuffer:1024*1024,signal:abort.signal},error=>resolve({ready:!error,exitCode:error?.code??0}));});
      return {pid:child?.pid??null,completion,async stop(){abort.abort();await completion;}};
    },
    async healthCheck(process){const result=await process.completion;return result.ready===true;},
  };
}
