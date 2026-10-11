import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const MEDIA_RELEASE=Object.freeze({version:'9.0.2',archiveUrl:'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip',archiveSha256:'60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',sourceCommit:'946fcce07b',publisher:'https://www.gyan.dev/ffmpeg/builds/',upstream:'https://ffmpeg.org/download.html',signature:'Not Authenticode signed; HTTPS publisher archive SHA-256 verified.',ffmpegSha256:'3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec',ffprobeSha256:'f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52'});
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
/** Build-time only. Download is never reachable from the conversion service. */
export async function prepareMediaRuntime(destination){
 if(process.platform!=='win32')throw new Error('This pinned runtime targets Windows x64.');
 destination=path.resolve(destination);await fs.mkdir(destination,{recursive:true});
 const pinned=[['ffmpeg.exe',MEDIA_RELEASE.ffmpegSha256],['ffprobe.exe',MEDIA_RELEASE.ffprobeSha256]];
 if((await Promise.all(pinned.map(async([name,h])=>await hash(path.join(destination,name)).catch(()=>null)===h))).every(Boolean)&&await fs.access(path.join(destination,'LICENSE')).then(()=>true,()=>false))return manifest(destination);
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'converter-media-download-'));
 try{const response=await fetch(MEDIA_RELEASE.archiveUrl,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw new Error('Pinned media archive unavailable.');const archive=path.join(scratch,'runtime.zip'),handle=await fs.open(archive,'wx');let size=0;try{for await(const chunk of response.body){size+=chunk.length;if(size>160*1024*1024)throw new Error('Media archive exceeds download limit.');await handle.write(chunk);}}finally{await handle.close();}
 if(await hash(archive)!==MEDIA_RELEASE.archiveSha256)throw new Error('Pinned media archive hash mismatch.');
 const extract=path.join(scratch,'extracted');await fs.mkdir(extract);const tar=path.join(process.env.SystemRoot||'C:/Windows','System32','tar.exe');await new Promise((resolve,reject)=>{const p=spawn(tar,['-xf',archive,'-C',extract],{windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',c=>c===0?resolve():reject(new Error('Verified archive extraction failed.')));});
 const root=path.join(extract,'ffmpeg-9.0.2-essentials_build');for(const[name,h]of pinned){const p=path.join(root,'bin',name);if(await hash(p)!==h)throw new Error('Pinned media executable hash mismatch.');await fs.copyFile(p,path.join(destination,name));}for(const name of ['LICENSE','README.txt'])await fs.copyFile(path.join(root,name),path.join(destination,name));const value=manifest(destination);await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({...MEDIA_RELEASE,ffmpeg:'ffmpeg.exe',ffprobe:'ffprobe.exe'},null,2)+'\n');return value;
 }finally{await fs.rm(scratch,{recursive:true,force:true,maxRetries:3});}
}
function manifest(root){return{version:MEDIA_RELEASE.version,ffmpegPath:path.join(root,'ffmpeg.exe'),ffmpegSha256:MEDIA_RELEASE.ffmpegSha256,ffprobePath:path.join(root,'ffprobe.exe'),ffprobeSha256:MEDIA_RELEASE.ffprobeSha256};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw new Error('Usage: node scripts/converter-media-runtime.mjs <destination>');console.log(JSON.stringify(await prepareMediaRuntime(process.argv[2])));}
