import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_GUIDANCE,MOTION_GUIDANCE_COPY,motionGuidanceDescriptor} from '../src/renderer/features/personalization/motion-guidance.js';
import {readFile} from 'node:fs/promises';
test('handwritten motion explanations preserve unique concepts and bilingual operational details',()=>{
 const required=['Duration','Start delay','End delay','Repeat count','Iteration start','Playback rate','Repeat delay','Direction','Fill','Global easing','Animated property','After track identifier','Track name','Parallel group','Sequence offset','Stagger offset','Target scope','Target state','Composition','Iteration composition','Trigger','From state','To state','Progress threshold','Debounce','Retrigger behavior','Cancel on exit','Priority','Timeline source','Timeline element','Timeline axis','View inset','Attachment start','Attachment end','Keyframe offset','Absolute keyframe time','Relative keyframe time','Keyframe value','Segment easing','Keyframe composition','Hold segment','Timeline zoom','Timeline snapping','Playback range start','Playback range end','Preview frame rate','Loop preview','Playhead','Preview playback speed','Schedule name','Schedule enabled','Scheduled preset','Schedule start time','Schedule end time','Schedule first date','Schedule last date','Schedule timezone','Schedule priority','Schedule weekdays'];
 assert.deepEqual(MOTION_GUIDANCE.map(row=>row.label),required);assert.equal(new Set(MOTION_GUIDANCE.map(row=>row.purpose)).size,required.length);
 const validate=rows=>{for(const label of required){const row=rows.find(row=>row.label===label);assert.ok(row);assert.match(row.help,/animation-transition\.md#/);for(const key of['purpose','options','default','effects','example','validation','recovery']){assert.ok(row[key]);assert.ok(MOTION_GUIDANCE_COPY[row[key]]);}assert.equal(row.steps.length,3);}};
 validate(MOTION_GUIDANCE);for(const label of required)assert.throws(()=>validate(MOTION_GUIDANCE.filter(row=>row.label!==label)));
 assert.equal(motionGuidanceDescriptor('Duration','layer:frame:duration').id,'motion:layer:frame:duration');assert.equal(motionGuidanceDescriptor('Unregistered', 'unknown'),null);
});
test('each preserved timing concept reaches an exact anchor in both complete articles',async()=>{
 for(const file of['animation-transition.md','animation-transition.zh-HK.md']){const raw=await readFile(new URL('../docs/features/interface/'+file,import.meta.url),'utf8'),text=raw.replace(/\r\n?/g,'\n');assert.equal(text,text.replaceAll('\n','\r\n').replace(/\r\n?/g,'\n'));for(const row of MOTION_GUIDANCE)assert.ok(text.includes('### '+row.concept+'\n'));}
});
