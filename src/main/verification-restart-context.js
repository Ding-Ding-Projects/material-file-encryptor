import fs from 'node:fs';
import path from 'node:path';

export const VERIFICATION_CONTEXT_ENV = 'MFE_VERIFICATION_RESTART_CONTEXT';
export const VERIFICATION_MARKER = '.verification-restart-context.json';
const MAX_BYTES = 16384;
function fail(){throw Error('Verification restart context is unavailable or invalid.');}
function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();}
function safePath(value){if(typeof value!=='string'||!path.isAbsolute(value)||value!==path.resolve(value)||/[\x00-\x1f]/.test(value))fail();return value;}
function noLinks(filename,{missingLeaf=false}={}){const resolved=safePath(filename);const parsed=path.parse(resolved);let current=parsed.root;for(const component of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,component);let info;try{info=fs.lstatSync(current);}catch(error){if(missingLeaf&&error.code==='ENOENT'&&current===resolved)return;throw error;}if(info.isSymbolicLink()||fs.realpathSync.native(current).toLowerCase()!==current.toLowerCase())fail();}}
function readRecord(filename){noLinks(filename);const descriptor=fs.openSync(filename,fs.constants.O_RDONLY| (fs.constants.O_NOFOLLOW||0));try{const info=fs.fstatSync(descriptor);if(!info.isFile()||info.size<2||info.size>MAX_BYTES)fail();const bytes=Buffer.alloc(info.size+1);const length=fs.readSync(descriptor,bytes,0,bytes.length,0);if(length!==info.size)fail();return JSON.parse(bytes.subarray(0,length).toString('utf8'));}finally{fs.closeSync(descriptor);}}
function validate(record){exactKeys(record,['schemaVersion','installationRoot','profile','sourceCommit','version','debugHost','debugPort']);if(record.schemaVersion!==1||!/^([a-f0-9]{40})$/.test(record.sourceCommit)||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(record.version)||record.debugHost!=='127.0.0.1'||!Number.isInteger(record.debugPort)||record.debugPort<1024||record.debugPort>65535)fail();safePath(record.installationRoot);safePath(record.profile);if(record.profile.toLowerCase()===record.installationRoot.toLowerCase()||record.profile.toLowerCase().startsWith(record.installationRoot.toLowerCase()+path.sep))fail();return record;}
/** Read the installation expectation before accessing application profile data.
 * This is a verification boundary, not authentication or a production setting. */
export function selectVerificationRestartContext({executable,packaged,version,environment=process.env,readBuildMetadata}={}){
 const raw=environment[VERIFICATION_CONTEXT_ENV];if(!packaged){if(raw!==undefined)fail();return null;}
 const installationRoot=path.resolve(path.dirname(executable),'..'),marker=path.join(installationRoot,VERIFICATION_MARKER);let exists;try{fs.lstatSync(marker);exists=true;}catch(error){if(error.code==='ENOENT')exists=false;else throw error;}
 if(!exists){if(raw!==undefined)fail();return null;}
 try{const expected=validate(readRecord(marker));if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_BYTES)fail();const supplied=validate(JSON.parse(raw));for(const key of Object.keys(expected))if(supplied[key]!==expected[key])fail();if(expected.installationRoot!==installationRoot||expected.version!==version||path.basename(path.dirname(executable))!=='app-'+version)fail();noLinks(installationRoot);noLinks(expected.profile);if(!fs.statSync(expected.profile).isDirectory())fail();const metadata=readBuildMetadata?.();if(metadata?.sourceCommit!==expected.sourceCommit||metadata?.version!==version)fail();return Object.freeze({...expected});}catch{fail();}
}
