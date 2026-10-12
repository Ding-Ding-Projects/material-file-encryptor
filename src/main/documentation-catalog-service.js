import {readFile} from 'node:fs/promises';

function freezeCatalog(value) {
 const pending=[value];
 while(pending.length){const item=pending.pop();if(item===null||typeof item!=='object'||Object.isFrozen(item))continue;for(const child of Object.values(item))if(child!==null&&typeof child==='object')pending.push(child);Object.freeze(item);}
 return value;
}

/** Immutable mode is a trusted packaged-runtime decision, never a path heuristic. */
export function createDocumentationCatalogService({filename,immutable=false,read=readFile}={}) {
 let cached=null,closed=false;
 const ensureOpen=()=>{if(closed)throw Error('Application is closing.');};
 async function load(){const text=await read(filename,'utf8');ensureOpen();const catalog=JSON.parse(text);return immutable?freezeCatalog(catalog):catalog;}
 async function request(action){
  ensureOpen();if(!['catalog','changelog'].includes(action))throw Error('Unsupported documentation action.');
  let loading;
  if(immutable){if(!cached){const candidate=load();cached=candidate;candidate.catch(()=>{if(cached===candidate)cached=null;});}loading=cached;}else loading=load();
  const catalog=await loading;ensureOpen();return action==='catalog'?catalog:catalog.changelog||[];
 }
 return {request,close(){closed=true;cached=null;}};
}
