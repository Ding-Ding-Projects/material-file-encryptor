import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {localEndpoint} from '../features/ollama/endpoint.js';

/** A local port preference, never a caller-supplied host, URL or environment. */
export function createOllamaConfiguration({directory,filesystem=fs}) {
  const filename=path.join(directory,'ollama-connection.json');let changing=false;
  async function read(){
    let text;try{const info=await filesystem.stat(filename);if(!info.isFile()||info.size>4096)throw Error('Invalid local runtime configuration.');text=await filesystem.readFile(filename,'utf8');}
    catch(error){if(error.code==='ENOENT')return 11434;throw error;}
    const value=JSON.parse(text);
    if(!value||value.version!==1||Object.keys(value).some(key=>!['version','port'].includes(key)))throw Error('Invalid local runtime configuration.');
    localEndpoint(value.port);return value.port;
  }
  async function apply({port},{canChange,confirm,retire}){
    localEndpoint(port);
    if(changing)throw Error('Local runtime configuration is already changing.');
    changing=true;
    try{
      if(!canChange())throw Error('Wait for local model work to finish before changing its port.');
      const previous=await read();if(port===previous)return {port,changed:false};
      if(!await confirm(port))return {port:previous,changed:false,cancelled:true};
      if(!canChange())throw Error('Local model work began before the port could change.');
      await retire();
      await filesystem.mkdir(directory,{recursive:true});
      const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
      try{handle=await filesystem.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify({version:1,port}),'utf8');await handle.sync();await handle.close();handle=null;await filesystem.rename(temporary,filename);}
      finally{await handle?.close();await filesystem.rm(temporary,{force:true});}
      return {port,changed:true};
    }finally{changing=false;}
  }
  return {read,apply,get changing(){return changing;}};
}
