import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {LOGO_PRACTICE,LOGO_PRACTICE_COPY} from '../src/shared/local-ux/logo-practice.js';
import {createPracticeSession,mountGuidancePlayground,assertPracticeCoverage} from '../src/shared/surface/guidance-playground.js';
import {createAccessDocument} from './helpers/local-access-dom.js';
const labels=['Crop left','Crop top','Crop width','Crop height','Logo safe area','Logo preset'];
test('six extra logo controls have exact bindings and translated worked examples',async()=>{
 assert.deepEqual(Object.keys(LOGO_PRACTICE),labels);const rows=labels.map(label=>({id:'logo.authoring.'+label.toLowerCase().replace(/[^a-z]+/g,'-'),practice:LOGO_PRACTICE[label]})),ids=rows.map(row=>row.id);assertPracticeCoverage(ids,rows);assert.throws(()=>assertPracticeCoverage(ids,rows.slice(1)),/mismatch/);
 const source=await fs.readFile(new URL('../src/renderer/features/personalization/logo.js',import.meta.url),'utf8');assert.match(source,/const descriptor=\{practice:LOGO_PRACTICE\[label\]/);
 for(const fixture of Object.values(LOGO_PRACTICE))for(const key of ['label','input','action','expected'])assert.ok(LOGO_PRACTICE_COPY[fixture[key]],fixture.id+': '+key);
});
test('normalized logo crop rejects overflow and safe area preserves equal square margins',()=>{
 const crop=createPracticeSession(LOGO_PRACTICE['Crop left']);assert.equal(crop.edit(.21).valid,false);assert.equal(crop.edit(.2).valid,true);assert.equal(crop.result.source[0],25.6);assert.equal(crop.reset().source[0],12.8);
 const safe=createPracticeSession(LOGO_PRACTICE['Logo safe area']),other=createPracticeSession(LOGO_PRACTICE['Logo safe area']);assert.deepEqual(safe.edit(.25).destination,[25,25,50,50]);assert.equal(safe.edit(.26).valid,false);assert.deepEqual(other.result.destination,[0,0,100,100]);assert.deepEqual(safe.reset().destination,[0,0,100,100]);
});
test('isolated Material select draws local lock and key paths and resets without file conversion',async()=>{
 const doc=createAccessDocument(),prototype=Object.getPrototypeOf(doc.body),previous=Object.getOwnPropertyDescriptor(prototype,'style');Object.defineProperty(prototype,'style',{configurable:true,get(){return this._style||={};}});
 try{const mount=doc.createElement('section');doc.body.append(mount);const sample=mountGuidancePlayground(mount,{fixture:LOGO_PRACTICE['Logo preset'],t:value=>LOGO_PRACTICE_COPY[value]||value}),select=mount.querySelector('md-outlined-select');assert.equal(select.menuPositioning,'absolute');assert.equal(select.children[1].textContent,'鎖頭標誌');select.value='lock';await select.dispatchEvent({type:'change'});const lock=mount.querySelector('path').getAttribute('d');select.value='key';await select.dispatchEvent({type:'change'});assert.notEqual(mount.querySelector('path').getAttribute('d'),lock);assert.equal(mount.querySelectorAll('image').length,0);assert.equal(mount.querySelectorAll('canvas').length,0);await mount.querySelectorAll('md-text-button').find(row=>row.textContent==='Reset example').click();assert.equal(select.value,'custom');assert.equal(mount.querySelector('path'),null);sample.destroy();assert.equal(select.listeners.get('change').length,0);}
 finally{if(previous)Object.defineProperty(prototype,'style',previous);else delete prototype.style;}
});
