import fs from 'node:fs/promises';
import path from 'node:path';
const argument=name=>{const i=process.argv.indexOf(name);if(i<0)throw new Error('Missing argument.');return process.argv[i+1];};
const requestPath=argument('--request'),resultPath=argument('--result'),expectedNonce=argument('--nonce');
const directory=path.dirname(requestPath);
try {
 const job=JSON.parse(await fs.readFile(requestPath,'utf8'));
 if(job.nonce!==expectedNonce||job.schema!==1||!/^[0-9a-f]{64}$/.test(job.nonce)||!Array.isArray(job.inputs)||job.inputs.length>32)throw new Error('Invalid request.');
 const inputs=[];let total=0;for(const name of job.inputs){if(!/^input-\d+\.bin$/.test(name))throw new Error('Invalid input.');const bytes=await fs.readFile(path.join(directory,name));total+=bytes.length;if(total>64*1024*1024)throw new Error('Input limit.');inputs.push(bytes);}
 const {convertRequest}=await import('./code/convert.mjs');
 const result=await convertRequest(job.adapterId,inputs,job.options);
 let outputTotal=0;const outputs=[];if(result.outputs.length>1000)throw new Error('Output count limit.');for(let i=0;i<result.outputs.length;i++){const output=result.outputs[i];outputTotal+=output.bytes.length;if(outputTotal>128*1024*1024)throw new Error('Output limit.');const filename=`result-${i}.bin`;await fs.writeFile(path.join(directory,filename),output.bytes,{flag:'wx'});outputs.push({name:output.name,filename,bytes:output.bytes.length});}
 await fs.writeFile(resultPath,JSON.stringify({schema:1,nonce:job.nonce,outputs,details:result.details}),{flag:'wx'});
}catch(error){try{await fs.writeFile(path.join(directory,'error.json'),JSON.stringify({name:error.name,code:error.code||'CONVERSION_FAILED'}));}catch{}process.exitCode=1;}
