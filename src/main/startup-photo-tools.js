import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const expected={gh:{relativePath:'gh/bin/gh.exe',version:'2.102.0'},git:{relativePath:'git/cmd/git.exe',version:'2.56.0.windows.2'}};
export function validateForgeToolReceipt(value){if(!value||value.schemaVersion!==1||Object.hasOwn(value,'schema'))throw new Error('Invalid forge tool receipt schema.');for(const[key,item]of Object.entries(expected)){if(value[key]?.relativePath!==item.relativePath||value[key]?.version!==item.version||! /^[a-f0-9]{64}$/.test(value[key]?.sha256||''))throw new Error('Invalid pinned forge tool receipt.');}return value;}
async function digestFile(filename){const file=await fs.open(filename,'r');const buffer=Buffer.alloc(65536);try{const before=await file.stat();if(!before.isFile()||before.size>256*1024*1024)throw new Error();const digest=createHash('sha256');let total=0;for(;;){const{bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>256*1024*1024)throw new Error();digest.update(buffer.subarray(0,bytesRead));}const after=await file.stat(),current=await fs.stat(filename);if(total!==before.size||!['dev','ino','size','mtimeMs','ctimeMs'].every(key=>before[key]===after[key]&&before[key]===current[key]))throw new Error();return digest.digest('hex');}finally{buffer.fill(0);await file.close();}}

/** The build supplies this receipt after verifying both complete portable trees. */
export function createForgeToolResolver(directory){
 let receipt;
 return async name=>{
  try{
   if(!Object.hasOwn(expected,name)||typeof directory!=='string'||!path.isAbsolute(directory))throw new Error();
   if(!receipt){const filename=path.join(directory,'forge-executables.json'),stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw new Error();receipt=validateForgeToolReceipt(JSON.parse(await fs.readFile(filename,'utf8')));}
   const filename=path.join(directory,expected[name].relativePath),stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||path.resolve(await fs.realpath(filename)).toLowerCase()!==path.resolve(filename).toLowerCase()||await digestFile(filename)!==receipt[name].sha256)throw new Error();return filename;
  }catch{throw new Error('Verified bundled forge tools are unavailable or changed. Rebuild or reinstall the application.');}
 };
}
