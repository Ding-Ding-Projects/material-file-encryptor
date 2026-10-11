/** Explicit local snapshots. Schedule documents carry references, never these bytes. */
export const LOCAL_SNAPSHOT_LIMITS=Object.freeze({entries:20,bytes:4*1024*1024,reference:80,label:120});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function createLocalSnapshotRegistry({storage,key,validate}={}){
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof validate!=='function')throw Error('Local snapshot storage is unavailable.');
 const reference=value=>{if(typeof value!=='string'||!value||value.length>LOCAL_SNAPSHOT_LIMITS.reference||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw Error('Choose a valid local snapshot reference.');return value;};
 const label=value=>{if(typeof value!=='string'||!value.trim()||value.length>LOCAL_SNAPSHOT_LIMITS.label||/[\x00-\x1f\x7f]/.test(value))throw Error('Choose a bounded local snapshot name.');return value.trim();};
 const read=()=>{const raw=storage.getItem(key);if(!raw)return{version:1,entries:[]};if(new TextEncoder().encode(raw).byteLength>LOCAL_SNAPSHOT_LIMITS.bytes)throw Error('Local snapshot storage exceeds its limit.');const value=JSON.parse(raw);if(!value||value.version!==1||!Array.isArray(value.entries)||value.entries.length>LOCAL_SNAPSHOT_LIMITS.entries)throw Error('Local snapshot storage is invalid.');const seen=new Set();return{version:1,entries:value.entries.map(row=>{const id=reference(row?.id);if(seen.has(id))throw Error('Local snapshot references must be unique.');seen.add(id);return{id,label:label(row.label),snapshot:validate(row.snapshot)};})};};
 return{
  list(){return read().entries.map(({id,label})=>({id,label}));},
  resolve(id){reference(id);const row=read().entries.find(row=>row.id===id);if(!row)throw Error('The selected local snapshot is unavailable.');return structuredClone(row.snapshot);},
  register(id,snapshot,name=id){reference(id);const entry={id,label:label(name),snapshot:validate(snapshot)},next=read(),index=next.entries.findIndex(row=>row.id===id);if(index<0){if(next.entries.length>=LOCAL_SNAPSHOT_LIMITS.entries)throw Error('Local snapshot storage is full.');next.entries.push(entry);}else next.entries[index]=entry;if(bytes(next)>LOCAL_SNAPSHOT_LIMITS.bytes)throw Error('Local snapshot storage exceeds its limit.');storage.setItem(key,JSON.stringify(next));return{id,label:entry.label};},
  remove(id){reference(id);const next=read();next.entries=next.entries.filter(row=>row.id!==id);storage.setItem(key,JSON.stringify(next));}
 };
}
