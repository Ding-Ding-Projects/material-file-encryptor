import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { modelName } from './client.js';
export const BUILTIN_PROFILES=Object.freeze([
  {id:'local-chat',name:'Local chat',kind:'internal',description:'Use the built-in bounded streaming chat. No external executable.'},
  {id:'model-inspection',name:'Model inspection',kind:'internal',description:'Inspect documented model metadata and hardware evidence.'},
]);
// The host registers verified picker results, never renderer-provided executable paths.
export class ProfileManager {
  constructor({launcher,verifyExecutable,validateProfile,healthCheck}={}) {this.launcher=launcher;this.verifyExecutable=verifyExecutable;this.validateProfile=validateProfile;this.healthCheck=healthCheck;this.profiles=new Map(BUILTIN_PROFILES.map(p=>[p.id,p]));this.snapshots=[];}
  async registerPicked(profile) {
    if(!this.verifyExecutable||!this.validateProfile)throw new Error('External profiles require the host executable picker, signature verifier, and executable-specific argument schema.');
    if(!profile || !/^[a-z0-9-]{1,64}$/.test(profile.id)||typeof profile.name!=='string'||profile.name.length>100||!path.isAbsolute(profile.executable)||!path.isAbsolute(profile.cwd))throw new Error('Invalid picked profile.');
    if(!await this.verifyExecutable(profile.executable))throw new Error('Executable is not in the host allowlist.');
    if(!Array.isArray(profile.args)||profile.args.length>16||profile.args.some(a=>typeof a!=='string'||a.length>512||/[\r\n\0;&|`$<>]/.test(a)))throw new Error('Profile arguments contain unsupported shell syntax.');
    if(profile.env && Object.keys(profile.env).length)throw new Error('Environment values are not accepted. Use the host credential vault.');
    if(await this.validateProfile(structuredClone(profile))!==true)throw new Error('Profile does not match an executable-specific host allowlist schema.');
    const stat=await fs.stat(profile.cwd);if(!stat.isDirectory())throw new Error('Working directory is unavailable.');
    if(this.profiles.has(profile.id))throw new Error('Choose a new profile identifier.');
    const clean={id:profile.id,name:profile.name,kind:'external',executable:profile.executable,cwd:profile.cwd,args:[...profile.args],env:{},requiredFiles:[]};this.profiles.set(clean.id,clean);return clean;
  }
  preflight(id,model,fit) {modelName(model);const p=this.profiles.get(id);if(!p)throw new Error('Select a registered profile.');const blockers=[];if(p.kind==='external'&&(!this.launcher||!this.healthCheck))blockers.push('The host has not registered a process launcher and readiness verifier.');if(fit?.verdict==='Unlikely')blockers.push(fit.reason);return {profile:{...p},model,fit:fit||{verdict:'Unknown'},environmentKeys:[],blockers,ready:blockers.length===0};}
  async launch(id,model,fit) {const preview=this.preflight(id,model,fit);if(!preview.ready)throw new Error(preview.blockers.join(' '));const snapshot={id:randomUUID(),at:new Date().toISOString(),profiles:[...this.profiles.values()].map(p=>structuredClone(p)),configuration:'No Ollama environment or server configuration is mutated.'};this.snapshots.push(snapshot);if(this.snapshots.length>20)this.snapshots.shift();if(preview.profile.kind==='internal')return {state:'ready',internal:preview.profile.id,snapshotId:snapshot.id};let process;try{process=await this.launcher({...preview.profile,model});if(!await this.healthCheck(process,preview))throw new Error('Profile did not become ready.');return {state:'ready',snapshotId:snapshot.id};}catch{await process?.stop?.();this.restore(snapshot.id);return {state:'failed',rolledBack:true,snapshotId:snapshot.id,reason:'Launch or readiness verification failed; the profile snapshot was restored.'};}}
  restore(id){const s=this.snapshots.find(s=>s.id===id);if(!s)throw new Error('Snapshot not found.');this.profiles=new Map(s.profiles.map(p=>[p.id,structuredClone(p)]));return {state:'restored',snapshotId:id};}
}
