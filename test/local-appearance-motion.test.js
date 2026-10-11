import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMotion,newMotionTrack,newTransition,validateMotion,compileMotionFrames,resolveMotionSequence,motionConflicts,MOTION_CAPABILITIES} from '../src/renderer/features/personalization/motion-model.js';
import {createTargetMotionRuntime,createMotionRegistry} from '../src/renderer/features/personalization/motion-runtime.js';
import {defaultAppearance,newLayer,validateAppearance} from '../src/renderer/features/personalization/appearance.js';
import {readFile} from 'node:fs/promises';
function fixture(){
 const calls=[],statuses=[],styles=new Map(),attrs=new Map();let mutation;
 class Observer{constructor(fn){mutation=fn;}observe(){}disconnect(){this.disconnected=true;}}
 const doc=new EventTarget();doc.defaultView={CSS:{supports:(_p,v)=>v!=='bad'},MutationObserver:Observer,getComputedStyle:()=>({getPropertyValue:p=>p==='opacity'?'0.4':'none',length:0}),setTimeout,clearTimeout};doc.scrollingElement={};
 const target=new EventTarget();target.ownerDocument=doc;target.style={setProperty:(p,v,priority)=>styles.set(p,{value:v,priority}),getPropertyValue:p=>styles.get(p)?.value||'',getPropertyPriority:p=>styles.get(p)?.priority||''};target.getAttribute=name=>attrs.get(name)||null;target.matches=()=>false;target.contains=node=>node===target;
 target.animate=(frames,options)=>{const h={frames,options,currentTime:0,playbackRate:1,playState:'running',effect:{iterationComposite:'replace',getComputedTiming:()=>({duration:options.duration})},play(){this.playState='running';},pause(){this.playState='paused';},cancel(){this.playState='idle';this.cancelled=true;},reverse(){this.playbackRate=-this.playbackRate;}};calls.push(h);return h;};
 return{target,doc,calls,statuses,styles,attrs,mutate:()=>mutation?.(),options:{onStatus:s=>statuses.push(s)}};
}
test('portable motion joins appearance persistence, layer presets and unknown-capability round trips',()=>{
 const value=defaultAppearance(),layer=newLayer();layer.motion=defaultMotion();layer.motion.tracks.push(newMotionTrack('alpha'));layer.motion.tracks[0].unknown.spring={stiffness:100,damping:10};layer.motion.futureRendererSetting={range:'portable'};value.elements.target={normal:[layer]};value.presets.Motion=[layer];const valid=validateAppearance(value);assert.deepEqual(validateAppearance(JSON.parse(JSON.stringify(valid))),valid);assert.deepEqual(valid.elements.target.normal[0].motion.unknown.futureRendererSetting,{range:'portable'});assert.equal(valid.presets.Motion[0].motion.tracks[0].id,'alpha');
});
test('timing, keyframe, CSS and sequence validation reject invalid authoring without losing precision',()=>{
 const m=defaultMotion(),a=newMotionTrack('a'),b=newMotionTrack('b');a.timing={...a.timing,duration:200.125,delay:-10,endDelay:5,iterations:2,playbackRate:-.5};b.after='a';b.offset=2;m.tracks=[a,b];assert.equal(resolveMotionSequence(validateMotion(m).tracks).get('b'),397.25);
 a.keyframes=[{time:0,value:'computed'},{relativeTime:100,value:'.5',hold:true},{time:200.125,value:'1'}];const frames=compileMotionFrames(a,()=>'.25');assert.equal(frames[0].opacity,'.25');assert.equal(frames[1].easing,'steps(1, jump-end)');
 for(const edit of[v=>v.tracks[0].timing.duration=-1,v=>v.tracks[0].timing.playbackRate=NaN,v=>v.tracks[0].keyframes[0].value='url(https://invalid)',v=>v.tracks[0].keyframes[0].offset=2,v=>v.tracks[0].after='b',v=>v.tracks[0].timing.iterations='infinite']){const changed=structuredClone(m);edit(changed);assert.throws(()=>validateMotion(changed));}
 assert.equal(validateMotion({...defaultMotion(),tracks:[{...newMotionTrack('auto'),timing:{...newMotionTrack('auto').timing,duration:'auto',iterations:'infinite'}}]}).tracks[0].timing.duration,'auto');
});
test('actual target API receives authored keyframes, timing, sequencing and playback commands',()=>{
 const f=fixture(),m=defaultMotion(),a=newMotionTrack('a'),b=newMotionTrack('b');a.timing.duration=250;a.timing.delay=-20;a.keyframes[0].value='computed';b.after='a';b.offset=10;b.composition='add';m.tracks=[a,b];const runtime=createTargetMotionRuntime(f.target,{...f.options,motion:m});assert.equal(f.calls.length,2);assert.equal(f.calls[0].frames[0].opacity,'0.4');assert.equal(f.calls[1].options.delay,240);assert.equal(f.calls[1].options.composite,'add');runtime.playback('seek',42.25);assert.equal(f.calls[0].currentTime,42.25);runtime.playback('pause');assert.equal(f.calls[0].playState,'paused');runtime.playback('reverse');assert.equal(f.calls[0].playbackRate,-1);runtime.playback('rate',0);assert.equal(f.calls[0].playbackRate,0);runtime.destroy();assert.ok(f.calls.every(h=>h.cancelled));
});
test('muted and solo tracks, target-only events, reentrancy and attribute triggers reach native consumers',()=>{
 const f=fixture(),m=defaultMotion();const a=newMotionTrack('a');a.trigger.kind='click';a.trigger.retrigger='ignore';const muted=newMotionTrack('muted');muted.muted=true;m.tracks=[a,muted];const runtime=createTargetMotionRuntime(f.target,{...f.options,motion:m});assert.equal(f.calls.length,0);f.target.dispatchEvent(new Event('click'));assert.equal(f.calls.length,1);f.target.dispatchEvent(new Event('click'));assert.equal(f.calls.length,1);runtime.destroy();f.target.dispatchEvent(new Event('click'));assert.equal(f.calls.length,1);
 const state=newMotionTrack('selected');state.trigger.kind='selection';state.state='selected';const config={...defaultMotion(),tracks:[state]};const current=createTargetMotionRuntime(f.target,{...f.options,motion:config});f.attrs.set('aria-selected','true');f.mutate();assert.equal(f.calls.length,2);current.destroy();
});
test('transition property lists and renderer capability limits remain explicit',()=>{
 const f=fixture(),rule=newTransition('transition');rule.properties=['opacity'];rule.trigger.kind='click';rule.from='computed';rule.to='0.8';const runtime=createTargetMotionRuntime(f.target,{...f.options,motion:{...defaultMotion(),transitions:[rule]}});f.target.dispatchEvent(new Event('click'));assert.equal(f.calls[0].frames[0].opacity,'0.4');assert.equal(f.calls[0].frames[1].opacity,'0.8');runtime.destroy();
 for(const modify of[t=>t.timing.repeatDelay=10,t=>t.unknown.spring={mass:1},t=>t.timeline.type='scroll',t=>t.scope='layer',t=>t.keyframes[1].value='bad']){const track=newMotionTrack('unsupported');modify(track);const r=createTargetMotionRuntime(f.target,{...f.options,motion:{...defaultMotion(),tracks:[track]}});assert.equal(f.statuses.at(-1).status,'unavailable');r.destroy();}
});
test('reduced motion retains authored data, uses static equivalent and cancels existing handles',()=>{
 const f=fixture(),m={...defaultMotion(),tracks:[newMotionTrack('safe')]};let reduced=false;const runtime=createTargetMotionRuntime(f.target,{...f.options,motion:m,reducedMotion:()=>reduced});assert.equal(f.calls.length,1);reduced=true;runtime.refreshReducedMotion();assert.ok(f.calls[0].cancelled);assert.equal(f.styles.get('opacity').value,'1');assert.equal(runtime.model.tracks[0].timing.duration,300);runtime.playback('play');assert.equal(f.calls.length,1);runtime.destroy();assert.equal(f.styles.get('opacity').value,'');
});
test('registry reuses unchanged targets and cancels replaced or removed consumers',()=>{
 const f=fixture(),m={...defaultMotion(),tracks:[newMotionTrack('track')]},registry=createMotionRegistry(f.options),row={id:'target:normal:0',target:f.target,motion:m};registry.sync([row]);const consumer=registry.get(row.id);registry.sync([row]);assert.equal(registry.get(row.id),consumer);assert.equal(f.calls.length,1);registry.sync([]);assert.ok(f.calls[0].cancelled);registry.destroy();
});
test('handwritten capability inventory and actual tab/consumer integration reject removal',async()=>{
 const model=await readFile(new URL('../src/renderer/features/personalization/motion-model.js',import.meta.url),'utf8'),editor=await readFile(new URL('../src/renderer/features/personalization/motion-editor.js',import.meta.url),'utf8'),appearance=await readFile(new URL('../src/renderer/features/personalization/appearance.js',import.meta.url),'utf8');
 const ids=['tracks','keyframes','timing','easing','sequence','timeline','playback','transitions','triggers','reduced-motion','repeat-delay','spring','layer-surface','properties','persistence'];assert.deepEqual(MOTION_CAPABILITIES.map(row=>row[0]),ids);
 const required=[['model',model,'compileMotionFrames'],['editor',editor,'Animation and Transition'],['editor',editor,'Keyframe composition'],['appearance',appearance,'mountMotionEditor(motionHost'],['appearance',appearance,'motionRegistry.sync(motionRows)']];const validate=rows=>rows.forEach(([,text,needle])=>assert.ok(text.includes(needle)));validate(required);for(let index=0;index<required.length;index++){const damaged=structuredClone(required);damaged[index][1]=damaged[index][1].replaceAll(damaged[index][2],'');assert.throws(()=>validate(damaged));}
 assert.equal(motionConflicts([newMotionTrack('a'),newMotionTrack('b')]).length,1);
});
