import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { modelName } from './client.js';
export const BUILTIN_PROFILES=Object.freeze([
  {id:'local-chat',name:'Local chat',kind:'internal',description:'Use the built-in bounded streaming chat. No external executable.'},
  {id:'model-inspection',name:'Model inspection',kind:'internal',description:'Inspect documented model metadata and hardware evidence.'},
]);
const inside=(root,target)=>{const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
export class ProfileManager {
  constructor({launcher,verifyExecutable,validateProfile,healthCheck,ownedRoots=[],onStateChange=async()=>{}}={}) {
    this.launcher=launcher;this.verifyExecutable=verifyExecutable;this.validateProfile=validateProfile;this.healthCheck=healthCheck;this.ownedRoots=ownedRoots;this.onStateChange=onStateChange;
    this.profiles=new Map(BUILTIN_PROFILES.map(p=>[p.id,p]));this.snapshots=[];this.lastLaunch=null;
  }
  async validateExternal(profile) {
    if(!this.verifyExecutable||!this.validateProfile||!this.ownedRoots.length)throw new Error('External profiles require verified host pickers, an executable-specific schema and owned directory roots.');
    if(!profile||Object.keys(profile).some(k=>!['id','name','kind','executable','cwd','args','env','requiredFiles'].includes(k))||!/^[a-z0-9-]{1,64}$/.test(profile.id)||typeof profile.name!=='string'||profile.name.length>100||!path.isAbsolute(profile.executable)||!path.isAbsolute(profile.cwd))throw new Error('Invalid picked profile.');
    if(BUILTIN_PROFILES.some(p=>p.id===profile.id))throw new Error('Built-in profile identifiers cannot be replaced.');
    if(!Array.isArray(profile.args)||profile.args.length>16||profile.args.some(a=>typeof a!=='string'||a.length>512||/[\r\n\0;&|`$<>]/.test(a)))throw new Error('Profile arguments contain unsupported shell syntax.');
    if(profile.env&&Object.keys(profile.env).length)throw new Error('Environment values are not accepted. Use the host credential vault.');
    const roots=await Promise.all(this.ownedRoots.map(root=>fs.realpath(root)));
    const cwd=await fs.realpath(profile.cwd),executable=await fs.realpath(profile.executable);
    if(!roots.some(root=>inside(root,cwd))||!(await fs.stat(cwd)).isDirectory())throw new Error('The working directory is outside owned profile roots.');
    if(!await this.verifyExecutable(executable))throw new Error('Executable is not in the host allowlist.');
    const requiredFiles=profile.requiredFiles||[];
    if(!Array.isArray(requiredFiles)||requiredFiles.length>32)throw new Error('Too many required profile files.');
    const files=[];
    for(const file of requiredFiles){if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Invalid required profile file.');const resolved=await fs.realpath(file);if(!roots.some(root=>inside(root,resolved))||!(await fs.stat(resolved)).isFile())throw new Error('A required file is outside owned profile roots.');files.push(resolved);}
    const clean={id:profile.id,name:profile.name,kind:'external',executable,cwd,args:[...profile.args],env:{},requiredFiles:files};
    if(await this.validateProfile(structuredClone(clean))!==true)throw new Error('Profile does not match an executable-specific host allowlist schema.');
    return clean;
  }
  async registerPicked(profile){const clean=await this.validateExternal(profile);if(this.profiles.has(clean.id))throw new Error('Choose a new profile identifier.');if(this.profiles.size>=100)throw new Error('Profile limit reached.');this.profiles.set(clean.id,clean);await this.onStateChange();return clean;}
  state(){return {version:1,profiles:[...this.profiles.values()].filter(p=>p.kind==='external'),snapshots:structuredClone(this.snapshots),lastLaunch:this.lastLaunch?{...this.lastLaunch}:null};}
  async importState(state){
    if(!state||state.version!==1||!Array.isArray(state.profiles)||state.profiles.length>98||!Array.isArray(state.snapshots)||state.snapshots.length>20)throw new Error('Invalid saved profile state.');
    const entries=await Promise.all(state.profiles.map(p=>this.validateExternal(p)));const snapshots=[];
    for(const saved of state.snapshots){if(typeof saved.id!=='string'||!Number.isFinite(Date.parse(saved.at))||!Array.isArray(saved.profiles)||saved.profiles.length>100)throw new Error('Invalid profile snapshot.');const external=await Promise.all(saved.profiles.filter(p=>p.kind!=='internal').map(p=>this.validateExternal(p)));snapshots.push({id:saved.id,at:saved.at,profiles:[...BUILTIN_PROFILES,...external],configuration:'Only application-owned profile state; no Ollama server settings.'});}
    const importedProfiles=new Map([...BUILTIN_PROFILES,...entries].map(p=>[p.id,p]));let lastLaunch=null;
    if(state.lastLaunch!==null&&state.lastLaunch!==undefined){
      const launch=state.lastLaunch;
      if(typeof launch!=='object'||Array.isArray(launch)||Object.keys(launch).some(key=>!['state','at','profileId','snapshotId'].includes(key))||!['ready','failed','starting','interrupted','restored'].includes(launch.state)||typeof launch.at!=='string'||launch.at.length>40||!Number.isFinite(Date.parse(launch.at))||typeof launch.snapshotId!=='string'||launch.snapshotId.length>128||!snapshots.some(s=>s.id===launch.snapshotId)||(launch.profileId!==undefined&&(typeof launch.profileId!=='string'||launch.profileId.length>64||!importedProfiles.has(launch.profileId)))||(launch.state!=='restored'&&launch.profileId===undefined))throw new Error('Invalid saved launch state.');
      lastLaunch={state:launch.state==='starting'?'interrupted':launch.state,at:launch.at,snapshotId:launch.snapshotId,...(launch.profileId===undefined?{}:{profileId:launch.profileId})};
    }
    this.profiles=importedProfiles;this.snapshots=snapshots;this.lastLaunch=lastLaunch;
  }
  async preflight(id,model,fit){modelName(model);let p=this.profiles.get(id);if(!p)throw new Error('Select a registered profile.');const blockers=[];if(p.kind==='external'){try{p=await this.validateExternal(p);}catch(error){blockers.push(error.message);}if(!this.launcher||!this.healthCheck)blockers.push('The host has not registered a process launcher and readiness verifier.');}if(fit?.verdict==='Unlikely')blockers.push(fit.reason);return {profile:{...p},model,fit:fit||{verdict:'Unknown'},environmentKeys:[],blockers,ready:blockers.length===0};}
  async launch(id,model,fit){
    const preview=await this.preflight(id,model,fit);if(!preview.ready)throw new Error(preview.blockers.join(' '));
    const snapshot={id:randomUUID(),at:new Date().toISOString(),profiles:[...this.profiles.values()].map(p=>structuredClone(p)),configuration:'Only application-owned profile state; no Ollama server settings.'};this.snapshots.push(snapshot);if(this.snapshots.length>20)this.snapshots.shift();
    this.lastLaunch={state:'starting',profileId:id,snapshotId:snapshot.id,at:new Date().toISOString()};await this.onStateChange();
    if(preview.profile.kind==='internal'){this.lastLaunch.state='ready';await this.onStateChange();return {state:'ready',internal:id,snapshotId:snapshot.id};}
    let process;
    try{process=await this.launcher({...preview.profile,model});if(!await this.healthCheck(process,preview))throw new Error('Profile did not become ready.');this.lastLaunch.state='ready';await this.onStateChange();return {state:'ready',snapshotId:snapshot.id};}
    catch{await process?.stop?.();await this.restore(snapshot.id);this.lastLaunch={state:'failed',profileId:id,snapshotId:snapshot.id,at:new Date().toISOString()};await this.onStateChange();return {state:'failed',rolledBack:true,snapshotId:snapshot.id,reason:'Launch or readiness verification failed; the profile snapshot was restored.'};}
  }
  async restore(id){const s=this.snapshots.find(s=>s.id===id);if(!s)throw new Error('Snapshot not found.');const external=await Promise.all(s.profiles.filter(p=>p.kind!=='internal').map(p=>this.validateExternal(p)));this.profiles=new Map([...BUILTIN_PROFILES,...external].map(p=>[p.id,p]));this.lastLaunch={state:'restored',snapshotId:id,at:new Date().toISOString()};await this.onStateChange();return {state:'restored',snapshotId:id};}
}
