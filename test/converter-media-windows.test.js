import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createMediaLauncher} from '../src/features/converter/media.mjs';
import {MEDIA_RELEASE} from '../scripts/converter-media-runtime.mjs';
const root=process.env.CONVERTER_MEDIA_TEST_ROOT;
const launcher=path.resolve('src/features/converter/native/bin/Release/net8.0-windows/ConverterSandbox.exe');
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
test('native media route inspects converts and decodes all six fixed adapters',{skip:!root||process.platform!=='win32'},async()=>{
 const ffmpegPath=path.join(root,'ffmpeg.exe'),ffprobePath=path.join(root,'ffprobe.exe');
 assert.equal(await hash(ffmpegPath),MEDIA_RELEASE.ffmpegSha256);assert.equal(await hash(ffprobePath),MEDIA_RELEASE.ffprobeSha256);
 const launcherCompanionHashes=Object.fromEntries(await Promise.all(['.dll','.runtimeconfig.json','.deps.json'].map(async s=>[path.basename(launcher.slice(0,-4)+s),await hash(launcher.slice(0,-4)+s)])));
 const media=await createMediaLauncher({launcherPath:launcher,launcherSha256:await hash(launcher),launcherCompanionHashes,ffmpegPath,ffprobePath,ffmpegSha256:MEDIA_RELEASE.ffmpegSha256,ffprobeSha256:MEDIA_RELEASE.ffprobeSha256});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'converter-media-test-'));
 const generate=async(args)=>new Promise((resolve,reject)=>{const child=spawn(ffmpegPath,['-hide_banner','-loglevel','error','-nostdin',...args],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Fixture generation failed.')));});
 try{
 await generate(['-f','lavfi','-i','color=c=blue:s=32x16','-frames:v','1',path.join(dir,'image.png')]);
 await generate(['-f','lavfi','-i','sine=frequency=440:duration=0.1','-ar','8000',path.join(dir,'audio.wav')]);
 await generate(['-f','lavfi','-i','color=c=blue:s=32x16:r=5:d=0.2','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'video.mp4')]);
 for(const id of ['image-png','image-jpeg','audio-wav','audio-flac','audio-mp3','video-mp4']){const source=id.startsWith('image-')?'image.png':id.startsWith('audio-')?'audio.wav':'video.mp4';const result=await media.launch({adapterId:id,inputs:[await fs.readFile(path.join(dir,source))]}).result;assert.equal(result.outputs.length,1,id);assert.equal(result.details.decoded,true,id);assert.ok(result.outputs[0].bytes.length>0,id);}
 const cancelled=media.launch({adapterId:'video-mp4',inputs:[await fs.readFile(path.join(dir,'video.mp4'))]});await cancelled.terminate();await assert.rejects(cancelled.result,/Cancelled/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
