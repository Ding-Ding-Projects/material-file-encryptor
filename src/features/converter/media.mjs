import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
export const MEDIA_IDS=Object.freeze(['image-png','image-jpeg','audio-wav','audio-flac','audio-mp3','video-mp4']);
/** Validate only the bounded metadata emitted by the fixed native probe command. */
export function mediaSummary(probe,id){
 if(!probe||!Array.isArray(probe.streams)||!probe.streams.length||probe.streams.length>2)throw new Error('Expected one media stream and at most one audio stream.');
 const streams=probe.streams;const video=streams.filter(s=>s.codec_type==='video'),audio=streams.filter(s=>s.codec_type==='audio');
 if(video.length+audio.length!==streams.length||video.length>1||audio.length>1)throw new Error('Attachments, data and additional streams are not supported.');
 const image=id.startsWith('image-'),sound=id.startsWith('audio-');
 if(image?(video.length!==1||audio.length!==0):sound?(audio.length!==1||video.length!==0):video.length!==1)throw new Error('Detected media streams do not match the selected adapter.');
 const v=video[0],a=audio[0];
 if(image&&!['png_pipe','jpeg_pipe','image2'].includes(probe.format?.format_name))throw new Error('Only single-frame PNG and JPEG images are supported.');
 if(v){if(!Number.isSafeInteger(v.width)||!Number.isSafeInteger(v.height)||v.width<1||v.height<1||v.width>4096||v.height>4096||v.width*v.height>8388608)throw new Error('Image dimensions exceed 4096 pixels per side or 8 megapixels.');if(v.tags?.rotate||v.side_data_list?.some(s=>Number(s.rotation)!==0))throw new Error('Rotated media must be normalized before conversion.');if(!image&&(v.width>1920||v.height>1080||v.width%2||v.height%2))throw new Error('Video requires even dimensions no larger than 1920 by 1080.');if(image&&v.nb_frames&&v.nb_frames!=='N/A'&&Number(v.nb_frames)!==1)throw new Error('Animated images are not supported.');}
 const duration=Number(probe.format?.duration??a?.duration??v?.duration);
 if(!image&&(!Number.isFinite(duration)||duration<=0||duration>(sound?600:60)))throw new Error('Audio is limited to 10 minutes and video to 60 seconds.');
 if(a&&(!Number.isInteger(a.channels)||a.channels<1||a.channels>2||!Number.isFinite(Number(a.sample_rate))||Number(a.sample_rate)<8000||Number(a.sample_rate)>48000))throw new Error('Audio requires one or two channels and 8 to 48 kHz.');
 return {kind:image?'image':sound?'audio':'video',width:v?.width,height:v?.height,videoCodec:v?.codec_name,audioCodec:a?.codec_name,channels:a?.channels,sampleRate:a?Number(a.sample_rate):undefined,duration:image?undefined:duration};
}
export function validateMediaOutput(before,after,id){
 const expected={'image-png':'png','image-jpeg':'mjpeg','audio-wav':'pcm_s16le','audio-flac':'flac','audio-mp3':'mp3','video-mp4':'h264'}[id];
 if(!expected||(id.startsWith('audio-')?after.audioCodec:after.videoCodec)!==expected)throw new Error('Output codec validation failed.');
 for(const key of ['width','height','channels','sampleRate'])if(before[key]!==after[key])throw new Error('Output geometry or audio layout changed.');
 if(before.duration!==undefined&&Math.abs(before.duration-after.duration)>Math.max(.15,before.duration*.01))throw new Error('Output duration changed.');
 if(id==='video-mp4'&&before.audioCodec&&after.audioCodec!=='aac')throw new Error('Output audio codec validation failed.');
}
/** No executable is discovered through PATH. Every staged binary is pinned. */
export async function createMediaLauncher(config){
 const {launcherPath,launcherSha256,launcherCompanionHashes={},ffmpegPath,ffmpegSha256,ffprobePath,ffprobeSha256}=config;
 const files=[[launcherPath,launcherSha256],[ffmpegPath,ffmpegSha256],[ffprobePath,ffprobeSha256]];
 for(const suffix of ['.dll','.runtimeconfig.json','.deps.json']){const p=launcherPath.slice(0,-4)+suffix;if(await fs.access(p).then(()=>true,()=>false))files.push([p,launcherCompanionHashes[path.basename(p)]]);}
 async function verify(){for(const[p,h]of files)if(!path.isAbsolute(p)||!/^[a-f0-9]{64}$/.test(h)||await hash(p)!==h)throw new Error('Media executable verification failed.');}
 await verify();
 function stage(operation,bytes){let child,root,stopped=false;const nonce=randomBytes(32).toString('hex');
 const result=(async()=>{try{await verify();if(stopped)throw new Error('Cancelled.');if(bytes.length<1||bytes.length>67108864)throw new Error('Media input byte limit exceeded.');const capacity=await fs.statfs(os.tmpdir());if(Number(capacity.bavail)*Number(capacity.bsize)<384*1024*1024)throw new Error('Insufficient media temporary capacity.');root=await fs.mkdtemp(path.join(os.tmpdir(),'converter-media-'));const payload=path.join(root,'payload'),work=path.join(root,'work');await fs.mkdir(payload);await fs.mkdir(work);const executable=operation==='probe'?'ffprobe.exe':'ffmpeg.exe';await fs.copyFile(operation==='probe'?ffprobePath:ffmpegPath,path.join(payload,executable));await fs.writeFile(path.join(work,'input-0.bin'),bytes,{flag:'wx'});const request=path.join(root,'launcher.json');await fs.writeFile(request,JSON.stringify({schema:1,nonce,runtime:path.join(payload,executable),directory:root,timeoutMs:30000,memoryBytes:268435456,media:{operation}}),{flag:'wx'});if(stopped)throw new Error('Cancelled.');
 const receipt=await new Promise((resolve,reject)=>{child=spawn(launcherPath,['--request',request],{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:os.tmpdir(),TMP:os.tmpdir()}});let text='';const timer=setTimeout(()=>{child.kill();reject(new Error('Media sandbox timeout.'));},40000);child.stdout.on('data',b=>{text+=b;if(text.length>8192){child.kill();reject(new Error('Media receipt too large.'));}});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);try{const r=JSON.parse(text);if(code!==0||r.schema!==1||r.nonce!==nonce||r.isolated!==true||r.exitCode!==0||r.timedOut||r.cancelled||r.killedForStorage||r.profileDeleted!==true||r.networkCapabilities!==0||r.activeProcessLimit!==1||r.memoryBytes!==268435456||r.timeoutMs!==30000||r.appContainerVerified!==true||r.capabilityCount!==0||r.jobLimitsVerified!==true)throw new Error('Media isolation or conversion failed.');resolve(r);}catch(e){reject(e);}});});
 if(stopped)throw new Error('Cancelled.');const p=path.join(work,'result.json'),st=await fs.lstat(p);if(!st.isFile()||st.isSymbolicLink()||st.size>1048576||await hash(p)!==receipt.resultSha256)throw new Error('Invalid media result receipt.');const value=JSON.parse(await fs.readFile(p,'utf8'));if(value.schema!==1||value.nonce!==nonce||!Array.isArray(value.outputs)||value.outputs.length>1)throw new Error('Invalid media result.');const outputs=[];for(const o of value.outputs){if(o.filename!=='result-0.bin')throw new Error('Invalid media filename.');const file=path.join(work,o.filename),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==o.bytes||stat.size<1||stat.size>67108864)throw new Error('Invalid media output size.');outputs.push({name:o.name,bytes:await fs.readFile(file)});}return {outputs,details:value.details};
 }finally{if(root)await fs.rm(root,{recursive:true,force:true,maxRetries:3});}})();return {result,terminate:async()=>{stopped=true;if(root&&child)await fs.writeFile(path.join(root,'work','cancel.signal'),'cancel').catch(()=>{});}};}
 const provider={preview(bytes,id){const worker=stage('probe',bytes);return{result:worker.result.then(value=>mediaSummary(value.details,id)),terminate:worker.terminate};},launch({adapterId,inputs}){let current,stopped=false;const result=(async()=>{if(!MEDIA_IDS.includes(adapterId)||inputs.length!==1)throw new Error('Unsupported media request.');async function run(op,bytes){if(stopped)throw new Error('Cancelled.');current=stage(op,bytes);return current.result;}
 const source=await run('probe',inputs[0]),before=mediaSummary(source.details,adapterId);const converted=await run(adapterId,inputs[0]);if(converted.outputs.length!==1)throw new Error('Missing media output.');const bytes=converted.outputs[0].bytes,output=await run('probe',bytes),after=mediaSummary(output.details,adapterId);validateMediaOutput(before,after,adapterId);await run('validate',bytes);if(stopped)throw new Error('Cancelled.');return {outputs:converted.outputs,details:{source:before,output:after,decoded:true,metadataRemoved:true}};})();return {result,terminate:async()=>{stopped=true;await current?.terminate();}};}};
 const wav=Buffer.alloc(204);wav.write('RIFF');wav.writeUInt32LE(196,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(160,40);
 await provider.launch({adapterId:'audio-wav',inputs:[wav]}).result;
 return provider;
}
