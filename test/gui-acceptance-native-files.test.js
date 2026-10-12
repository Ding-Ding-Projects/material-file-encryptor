import test from 'node:test';import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createMountedFoundationFixtures} from '../scripts/gui-acceptance-native-files.mjs';

test('mounted-file producer refuses reserved drive and locked or foreign state before writes',async()=>{
 let writes=0;const fixture={driveLetter:'N:',storageDir:'owned',cacheDir:'cache'};
 const target={kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40),expectedUrl:'file:///owned'};
 const opened={connectionOwned:true,target,fixture,page:{url:()=>target.expectedUrl,evaluate:async()=>({...fixture,locked:true,mounted:false,operation:null})}};
 assert.throws(()=>createMountedFoundationFixtures({opened:{...opened,fixture:{...fixture,driveLetter:'M:'}}}));
 const producer=createMountedFoundationFixtures({opened,io:{writeFile:async()=>{writes++;}}});
 await assert.rejects(producer['drive-populated'].prepare({binding:{sourceCommit:target.sourceCommit}}),/fresh auto-unlocked/);assert.equal(writes,0);
 await assert.rejects(producer['drive-populated'].prepare({binding:{sourceCommit:'b'.repeat(40)}}));assert.equal(writes,0);
 opened.page.evaluate=async()=>({...fixture,storageDir:'unrelated',locked:false,mounted:true,operation:null});
 await assert.rejects(producer['drive-populated'].prepare({binding:{sourceCommit:target.sourceCommit}}),/identity changed/);assert.equal(writes,0);
});

function offlineFixture(options={}){
 const data=new Map(),rows=new Map(),calls=[],fixture={driveLetter:'N:',storageDir:'owned',cacheDir:'cache'};
 let mode=options.mode,locked=false,more=false;
 const target={kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40),expectedUrl:'file:///owned'};
 const drive={
  status:async()=>({...fixture,locked,mounted:!locked,operation:null,sync:{running:false,error:null}}),
  listFiles:async()=>({items:[...rows.values()].map(row=>({...row})),nextCursor:more?'next':null}),sync:async()=>{},
  keepOffline:async id=>{calls.push(['pin',id]);if(mode==='reject')throw Error('Pin unavailable');if(mode!=='no-effect')rows.get(id).offline=true;if(mode==='coalesced')for(const row of rows.values())row.offline=true;},
  releaseOffline:async id=>{calls.push(['release',id]);if(mode==='release-reject')throw Error('Release unavailable');rows.get(id).offline=false;}
 };
 const page={url:()=>target.expectedUrl,evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(argument)',{window:{drive},argument:arg,Promise,setTimeout:()=>0}),waitForFunction:async()=>{}};
 const io={writeFile:async(p,text,{flag})=>{assert.equal(flag,'wx');assert.equal(data.has(p),false);calls.push(['write',p]);data.set(p,Buffer.from(text));const name=p.slice(3),id=name.includes(' A.')?'a':'b';rows.set(id,{id,path:name,offline:options.prePinned===true});},readFile:async p=>{assert.ok(data.has(p));return data.get(p);},unlink:async p=>{calls.push(['unlink',p]);data.delete(p);for(const [id,row]of rows)if(row.path===p.slice(3))rows.delete(id);}};
 const all=createMountedFoundationFixtures({opened:{connectionOwned:true,target,fixture,page},io});
 return{subject:all['offline-populated'],all,data,rows,calls,context:{binding:{sourceCommit:target.sourceCommit}},mode:value=>mode=value,lock:()=>locked=true,more:()=>more=true};
}

test('offline acquisition pins exact synthetic files, reacquires released flags and restores independently',async()=>{
 const f=offlineFixture();assert.ok(f.subject);const proof=await f.subject.prepare(f.context);assert.equal(proof.pinnedCount,2);assert.equal(proof.accepted,false);assert.deepEqual(f.calls.filter(x=>x[0]==='pin'),[['pin','a'],['pin','b']]);
 f.rows.get('a').offline=false;await f.subject.prepare(f.context);assert.equal(f.calls.filter(x=>x[0]==='pin').length,3);
 f.rows.get('b').offline=false;const result=await f.subject.restore(f.context);assert.equal(result.restored,true);assert.deepEqual(f.calls.filter(x=>x[0]==='release'),[['release','a']]);assert.equal(f.data.size,0);
});

test('unproved pin completion and coalesced flags preserve bytes and forbid release or deletion',async()=>{
 for(const mode of ['reject','no-effect','coalesced']){const f=offlineFixture({mode});await assert.rejects(f.subject.prepare(f.context));const before=[...f.data];await assert.rejects(f.subject.restore(f.context),/unproved/);await assert.rejects(f.all['drive-populated'].restore(f.context));assert.deepEqual([...f.data],before);assert.equal(f.calls.some(x=>['release','unlink'].includes(x[0])),false);}
});

test('pre-existing pins are never adopted or removed',async()=>{
 const f=offlineFixture({prePinned:true});await assert.rejects(f.subject.prepare(f.context),/not owned/);await assert.rejects(f.subject.restore(f.context));assert.equal(f.calls.some(x=>['pin','release','unlink'].includes(x[0])),false);assert.equal(f.data.size,2);
});

test('changed native identities, bytes, pagination and locked state prevent restoration mutation',async()=>{
 for(const change of [f=>f.rows.get('a').id='foreign',f=>f.rows.get('a').offline=undefined,f=>f.data.set('N:\\Acceptance A.txt',Buffer.from('changed')),f=>f.more(),f=>f.lock(),f=>f.rows.set('foreign',{id:'foreign',path:'other.txt',offline:true})]){const f=offlineFixture();await f.subject.prepare(f.context);change(f);await assert.rejects(f.subject.restore(f.context));assert.equal(f.calls.some(x=>['release','unlink'].includes(x[0])),false);assert.equal(f.data.size,2);}
});

test('uncertain release retains remaining files and cannot be retried as proven completion',async()=>{
 const f=offlineFixture();await f.subject.prepare(f.context);f.mode('release-reject');await assert.rejects(f.subject.restore(f.context));f.mode(null);await assert.rejects(f.subject.restore(f.context),/unproved/);assert.equal(f.calls.filter(x=>x[0]==='release').length,1);assert.equal(f.calls.some(x=>x[0]==='unlink'),false);
});

test('offline preparation rejects a foreign source before any file or pin mutation',async()=>{
 const f=offlineFixture();await assert.rejects(f.subject.prepare({binding:{sourceCommit:'b'.repeat(40)}}));assert.deepEqual(f.calls,[]);assert.equal(f.data.size,0);
});
