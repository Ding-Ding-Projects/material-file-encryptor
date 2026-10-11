import fs from 'node:fs/promises';
import path from 'node:path';
import {safeArchiveName} from './archive.mjs';
export async function outputLocation(root,name,{createParents=false}={}){
 const relative=safeArchiveName(name);if(relative.endsWith('/'))throw new Error('Output must be a file.');
 const parts=relative.split('/');let parent=root;
 for(const part of parts.slice(0,-1)){
  parent=path.join(parent,part);let stat;try{stat=await fs.lstat(parent);}catch(error){if(error.code!=='ENOENT')throw error;if(createParents){await fs.mkdir(parent);stat=await fs.lstat(parent);}else continue;}
  if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('Output parent is not a safe directory.');
  if(stat&&path.resolve(await fs.realpath(parent)).toLowerCase()!==path.resolve(parent).toLowerCase())throw new Error('Output directory redirects outside its grant.');
 }
 return path.join(root,...parts);
}
