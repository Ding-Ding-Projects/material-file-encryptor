import { convertRequest } from './convert.mjs';
const permission=process.permission;
if(!permission||permission.has('net')||permission.has('child')||permission.has('worker')||permission.has('fs.write')||permission.has('addons'))process.exit(72);
process.once('message',async data=>{try {const {inputs,adapterId,options}=data;if(!Array.isArray(inputs)||inputs.reduce((n,b)=>n+b.length,0)>64*1024*1024)throw new Error('Input budget exceeded.');const result=await convertRequest(adapterId,inputs,options);process.send({ok:true,result});}catch{process.send({ok:false});}});
