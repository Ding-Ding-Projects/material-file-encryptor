import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationAudio} from '../src/shared/surface/notification-audio.js';
test('audio requires explicit enable and releases its context',async()=>{
 let started=0,closed=0;class Context{state='suspended';currentTime=0;destination={};async resume(){this.state='running';}createOscillator(){return{frequency:{value:0},connect(){},start(){started++;},stop(){},disconnect(){}};}createGain(){return{gain:{value:0},connect(){},disconnect(){}};}close(){closed++;}}
 const audio=createNotificationAudio({Context});assert.equal(audio.play(),false);assert.equal(await audio.enable(true),true);assert.equal(audio.play(),true);assert.equal(started,1);await audio.enable(false);assert.equal(audio.play(),false);audio.destroy();assert.equal(closed,1);
});
