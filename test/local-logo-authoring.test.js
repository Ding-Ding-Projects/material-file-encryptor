import test from 'node:test';
import assert from 'node:assert/strict';
import {logoGeometry,convertLogo} from '../src/renderer/features/personalization/logo.js';
test('logo crop preserves zero focal coordinates, aspect ratio and safe area',()=>{const left=logoGeometry(256,128,{fit:'cover',x:0,y:0});assert.deepEqual(left.destination,[0,0,256,128]);const right=logoGeometry(256,128,{fit:'cover',x:1});assert.equal(right.destination[0],-128);const crop=logoGeometry(400,200,{cropX:.25,cropY:0,cropWidth:.5,cropHeight:1,safeArea:.125});assert.deepEqual(crop.source,[100,0,200,200]);assert.deepEqual(crop.destination,[16,16,96,96]);assert.deepEqual(crop.clip,[16,16,96,96]);});
test('logo crop rejects invalid bounds before canvas drawing',()=>{for(const options of [{cropX:.9,cropWidth:.2},{cropHeight:0},{safeArea:.5},{x:NaN},{y:Infinity}])assert.throws(()=>logoGeometry(128,128,options));});
test('oversized logo file is rejected before reading bytes',async()=>{let read=false;await assert.rejects(convertLogo({size:5*1024*1024,arrayBuffer:async()=>{read=true;}}),/4 MiB/);assert.equal(read,false);});
