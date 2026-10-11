import test from 'node:test';import assert from 'node:assert/strict';
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
