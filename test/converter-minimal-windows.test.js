import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {createMediaLauncher} from '../src/features/converter/media.mjs';import {MEDIA_RELEASE} from '../scripts/converter-media-runtime.mjs';
const root=process.env.CONVERTER_MINIMAL_TEST_ROOT,generator=process.env.CONVERTER_MEDIA_TEST_ROOT;
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
test('source-built minimal runtime converts and decodes all six formats in AppContainer',{skip:!root||!generator||process.platform!=='win32'},async()=>{
 const receipt=JSON.parse(await fs.readFile(path.join(root,'build-receipt.json'),'utf8')),bin=path.join(root,'ffmpeg-9.0.2');
 const ffmpegPath=path.join(bin,'ffmpeg.exe'),ffprobePath=path.join(bin,'ffprobe.exe');assert.equal(await hash(ffmpegPath),receipt.outputs['ffmpeg.exe']);assert.equal(await hash(ffprobePath),receipt.outputs['ffprobe.exe']);
 const fixtureTool=path.join(generator,'ffmpeg.exe');assert.equal(await hash(fixtureTool),MEDIA_RELEASE.ffmpegSha256);
 const launcherPath=path.resolve('src/features/converter/native/bin/Release/net8.0-windows/ConverterSandbox.exe');const launcherCompanionHashes=Object.fromEntries(await Promise.all(['.dll','.runtimeconfig.json','.deps.json'].map(async s=>[path.basename(launcherPath.slice(0,-4)+s),await hash(launcherPath.slice(0,-4)+s)])));
 const media=await createMediaLauncher({launcherPath,launcherSha256:await hash(launcherPath),launcherCompanionHashes,ffmpegPath,ffmpegSha256:await hash(ffmpegPath),ffprobePath,ffprobeSha256:await hash(ffprobePath),profile:'minimal-v1'});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'converter-minimal-fixture-'));
 const generate=args=>new Promise((resolve,reject)=>{const child=spawn(fixtureTool,['-hide_banner','-loglevel','error','-nostdin',...args],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',c=>c===0?resolve():reject(new Error('Synthetic fixture generation failed.')));});
 try{await generate(['-f','lavfi','-i','color=c=blue:s=32x16','-frames:v','1',path.join(dir,'image.png')]);await generate(['-f','lavfi','-i','sine=frequency=440:duration=0.1','-ar','44100',path.join(dir,'audio.wav')]);await generate(['-f','lavfi','-i','color=c=blue:s=32x16:r=5:d=0.2','-c:v','mpeg4','-pix_fmt','yuv420p',path.join(dir,'video.mp4')]);
 for(const id of ['image-png','image-jpeg','audio-wav','audio-flac','audio-mp3','video-mp4']){const source=id.startsWith('image-')?'image.png':id.startsWith('audio-')?'audio.wav':'video.mp4';const result=await media.launch({adapterId:id,inputs:[await fs.readFile(path.join(dir,source))]}).result;assert.equal(result.outputs.length,1,id);assert.equal(result.details.decoded,true,id);assert.equal(result.details.profile,'minimal-v1');if(id==='video-mp4')assert.equal(result.details.output.videoCodec,'mpeg4');}
 const cancelled=media.launch({adapterId:'video-mp4',inputs:[await fs.readFile(path.join(dir,'video.mp4'))]});await cancelled.terminate();await assert.rejects(cancelled.result,/Cancelled/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
