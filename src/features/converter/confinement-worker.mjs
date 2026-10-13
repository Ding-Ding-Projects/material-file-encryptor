import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const argument=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error('Missing probe argument.');return process.argv[i+1];};
const requestPath=argument('--request'),resultPath=argument('--result'),nonce=argument('--nonce');
const work=path.dirname(requestPath),payload=path.dirname(fileURLToPath(import.meta.url));
const code=error=>['EACCES','EPERM','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ENOENT','ERR_ACCESS_DENIED'].includes(error?.code)?error.code:'unavailable';
try{
 const bytes=await fs.readFile(requestPath);
 if(bytes.length>4096)throw new Error('Probe request limit.');
 const request=JSON.parse(bytes);
 if(request.schema!==1||request.nonce!==nonce||!/^[0-9a-f]{64}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(request.challenge)||!path.isAbsolute(request.outside)||!Number.isInteger(request.port)||request.port<1||request.port>65535)throw new Error('Invalid probe request.');
 const details={schema:1,workVerified:false,outsideRead:'unavailable',payloadWrite:'unavailable',network:'unavailable'};
 const workMarker=path.join(work,'probe-work.bin');
 await fs.writeFile(workMarker,'synthetic',{flag:'wx'});
 details.workVerified=(await fs.readFile(workMarker,'utf8'))==='synthetic';
 await fs.unlink(workMarker);
 try{await fs.readFile(request.outside);details.outsideRead='allowed';}catch(error){details.outsideRead=code(error);}
 try{await fs.writeFile(path.join(payload,'probe-payload.bin'),'modified',{flag:'r+'});details.payloadWrite='allowed';}catch(error){details.payloadWrite=code(error);}
 details.network=await new Promise(resolve=>{
  let socket,done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);socket?.destroy();resolve(value);};
  const timer=setTimeout(()=>finish('timeout'),2000);
  try{socket=net.connect({host:'127.0.0.1',port:request.port});socket.once('connect',()=>finish('connected'));socket.once('error',error=>finish(code(error)));}
  catch(error){finish(code(error));}
 });
 await fs.writeFile(resultPath,JSON.stringify({schema:1,nonce,outputs:[],details}),{flag:'wx'});
}catch{process.exitCode=1;}
