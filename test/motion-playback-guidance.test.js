import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument,FixtureCSSStyleSheet} from './helpers/local-access-dom.js';
import {mountMotionEditor} from '../src/renderer/features/personalization/motion-editor.js';
import {defaultMotion,newMotionTrack,validateMotion} from '../src/renderer/features/personalization/motion-model.js';
import {newMotionSchedule} from '../src/renderer/features/personalization/motion-schedules.js';
function scene(mount=mountMotionEditor){
 const doc=createAccessDocument(),create=doc.createElement.bind(doc),definitions=new Map(),Base=create('span').constructor;class Element extends Base{constructor(){super(doc,'mfe-control-guidance');}attachShadow(){this.shadowRoot=doc.createElement('section');}}
 doc.documentElement={lang:'en'};doc.defaultView={Event,HTMLElement:Element,CSSStyleSheet:FixtureCSSStyleSheet,customElements:{get:tag=>definitions.get(tag),define:(tag,C)=>definitions.set(tag,C)},getComputedStyle:()=>({length:0})};doc.createElement=tag=>{const C=definitions.get(tag),node=C?new C():create(tag);node.style={};node.hidden=false;node.disabled=false;node.readOnly=false;node.before=function(other){other.remove();other.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),0,other);};return node;};doc.createElementNS=(_,tag)=>doc.createElement(tag);
 const frames=new Map();let frameId=0,runtime=null;doc.defaultView.performance={now:()=>0};doc.defaultView.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};doc.defaultView.cancelAnimationFrame=id=>frames.delete(id);
 const host=doc.createElement('section'),target=doc.createElement('button');doc.body.append(host,target);let model=defaultMotion(),writes=0,reads=0,locked=false;model.tracks=[newMotionTrack('sample-live')];model.markers=[{name:'Live marker',time:200}];model.unknown.presets={Live:defaultMotion()};model.unknown.schedules=[newMotionSchedule('Live','test-rule-a'),newMotionSchedule('Live','test-rule-b')];let adapter=value=>{model=validateMotion(value);writes++;return true;};const editor=mount(host,{target,getRuntime:()=>runtime,getMotion:()=>{reads++;return model;},setMotion:value=>adapter(value),disabled:()=>locked});return{doc,host,editor,frames,setRuntime:value=>runtime=value,get model(){return model;},get writes(){return writes;},get reads(){return reads;},setAdapter:fn=>adapter=fn,lock:()=>locked=true,field:label=>[...host.querySelectorAll('md-outlined-text-field'),...host.querySelectorAll('md-outlined-select')].find(node=>node.label===label),guide:key=>host.querySelectorAll('mfe-control-guidance').find(node=>node.dataset.guidanceId?.startsWith('motion.remaining:'+key+':'))};
}
async function wizard(guide){await guide.shadowRoot.querySelector('md-icon-button').click();const panel=guide.shadowRoot.querySelectorAll('section').find(row=>row.getAttribute('class')==='panel');await panel.querySelectorAll('md-filled-button').find(row=>row.textContent==='Open guided operation').click();const wizard=panel.children[5];await wizard.querySelector('md-filled-button').click();return{panel,wizard};}


const turn=()=>new Promise(resolve=>setImmediate(resolve));
const runtime=overrides=>({status:()=>[],snapshot:()=>[],playback:()=>{},trigger:()=>{},...overrides});
test('missing original playback and trigger consumers reject guidance instead of reporting readiness',async()=>{
 for(const key of ['playback-play','scrub','explicit-trigger']){const f=scene();try{const {panel,wizard:steps}=await wizard(f.guide(key));await steps.querySelector('md-filled-button').click();assert.ok(panel.textContent.includes('No live motion consumer is available for this target.'),key);assert.equal(panel.textContent.includes('Ready. Review the original control and its result.'),false,key);assert.equal(f.frames.size,0);}finally{f.editor.destroy();}}
});
test('guided playback, scrub and explicit trigger retain rejected original promises exactly once',async()=>{
 for(const key of ['playback-pause','scrub','explicit-trigger']){const f=scene();try{let reject,calls=0;const action=()=>{calls++;return new Promise((yes,no)=>reject=no);};f.setRuntime(runtime({playback:action,trigger:action}));const {panel,wizard:steps}=await wizard(f.guide(key)),pending=steps.querySelector('md-filled-button').click();await turn();assert.equal(calls,1,key);assert.equal(steps.querySelector('md-filled-button').disabled,true,key);assert.equal(panel.textContent.includes('Ready. Review the original control and its result.'),false);reject(Error('Synthetic playback rejection'));await pending;assert.ok(panel.textContent.includes('Synthetic playback rejection'));assert.equal(calls,1);assert.equal(f.frames.size,0);}finally{f.editor.destroy();}}
});
test('play waits for both original start and scoped seek before observing, including seek rejection',async()=>{
 const f=scene();try{const calls=[];let resolveStart,rejectSeek;f.setRuntime(runtime({playback:(...args)=>{calls.push(args);return args[0]==='play'?new Promise(yes=>resolveStart=yes):new Promise((yes,no)=>rejectSeek=no);}}));const {panel,wizard:steps}=await wizard(f.guide('playback-play')),pending=steps.querySelector('md-filled-button').click();await turn();assert.deepEqual(calls,[['play',undefined,undefined]]);assert.equal(f.frames.size,0);resolveStart();await turn();assert.deepEqual(calls[1],['seek',0,{trackId:f.model.tracks[0].id}]);assert.equal(steps.querySelector('md-filled-button').disabled,true);assert.equal(f.frames.size,0);rejectSeek(Error('Synthetic seek rejection'));await pending;assert.ok(panel.textContent.includes('Synthetic seek rejection'));assert.equal(calls.length,2);assert.equal(f.frames.size,0);}finally{f.editor.destroy();}
});
test('synchronous original method order is preserved and stale asynchronous completion cannot restart observation',async()=>{
 const f=scene();try{const calls=[];f.setRuntime(runtime({playback:(...args)=>calls.push(args)}));f.editor.playback('play');assert.deepEqual(calls.map(row=>row[0]),['play','seek']);assert.equal(f.frames.size,1);f.editor.playback('stop');assert.equal(f.frames.size,0);
 let resolve;f.setRuntime(runtime({playback:command=>command==='play'?new Promise(yes=>resolve=yes):undefined}));const pending=f.editor.playback('play');f.editor.playback('stop');resolve();await assert.rejects(pending,/unavailable/);assert.equal(f.frames.size,0);
 }finally{f.editor.destroy();}
});
test('numeric playhead and named marker actions return the original seek promise',async()=>{
 const f=scene();try{let reject,calls=0;f.setRuntime(runtime({playback:()=>{calls++;return new Promise((yes,no)=>reject=no);}}));const field=f.field('Playhead');field.value='123';await field.dispatchEvent({type:'change'});reject(Error('Synthetic numeric seek rejection'));await turn();assert.equal(field.error,true);assert.equal(calls,1);
 const marker=f.host.querySelectorAll('md-outlined-button').find(row=>row.textContent==='Live marker');await marker.click();reject(Error('Synthetic marker seek rejection'));await turn();assert.ok(f.host.textContent.includes('Synthetic marker seek rejection'));assert.equal(calls,2);
 }finally{f.editor.destroy();}
});
async function damagedEditor(transform){const base=new URL('../src/renderer/features/personalization/motion-editor.js',import.meta.url),source=transform(fs.readFileSync(base,'utf8')).replace(/from '([^']+)'/g,(_,path)=>`from '${new URL(path,base).href}'`);return(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).mountMotionEditor;}
test('negative mutations prove missing-consumer and lost-promise assertions reject regressions',async()=>{
 const absent=await damagedEditor(source=>source.replace("function playback(command,value){","function playback(command,value){if(!getRuntime())return;")),f=scene(absent);try{assert.throws(()=>assert.throws(()=>f.editor.playback('pause'),/No live/));}finally{f.editor.destroy();}
 const dropped=await damagedEditor(source=>source.replace("settled=(result,next)=>result&&typeof result.then==='function'?Promise.resolve(result).then(next):next(result);","settled=(result,next)=>next();")),g=scene(dropped);try{let resolve;g.setRuntime(runtime({playback:()=>new Promise(yes=>resolve=yes)}));const result=g.editor.playback('pause');assert.throws(()=>assert.equal(typeof result?.then,'function'));resolve();}finally{g.editor.destroy();}
});
