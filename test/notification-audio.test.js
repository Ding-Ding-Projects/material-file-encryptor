import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationAudio} from '../src/shared/surface/notification-audio.js';
test('audio requires explicit enable and releases its context',async()=>{
 let started=0,closed=0;class Context{state='suspended';currentTime=0;destination={};async resume(){this.state='running';}createOscillator(){return{frequency:{value:0},connect(){},start(){started++;},stop(){},disconnect(){}};}createGain(){return{gain:{value:0},connect(){},disconnect(){}};}close(){closed++;}}
 const audio=createNotificationAudio({Context});assert.equal(audio.play(),false);assert.equal(await audio.enable(true),true);assert.equal(audio.play(),true);assert.equal(started,1);await audio.enable(false);assert.equal(audio.play(),false);audio.destroy();assert.equal(closed,1);
});
test('low stimulation lowers the cue volume and pitch without disabling the explicit switch',async()=>{
 const seen=[];class Context{state='suspended';currentTime=0;destination={};async resume(){this.state='running';}createOscillator(){const o={frequency:{value:0},connect(){},start(){seen.push(['pitch',o.frequency.value]);},stop(){},disconnect(){}};return o;}createGain(){const g={gain:{value:0},connect(){},disconnect(){}};seen.push(['gain',g]);return g;}close(){}}
 let calm=false;const audio=createNotificationAudio({Context,calm:()=>calm});await audio.enable(true);
 audio.play();calm=true;audio.play();
 const pitches=seen.filter(item=>item[0]==='pitch').map(item=>item[1]),gains=seen.filter(item=>item[0]==='gain').map(item=>item[1].gain.value);
 assert.deepEqual(pitches,[660,440]);assert.ok(gains[1]<gains[0]/2);
 assert.equal(audio.play(),true);audio.destroy();
});
