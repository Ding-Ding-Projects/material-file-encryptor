import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function resolveNativeExecutable(python,requested,{execute=promisify(execFile),readFile=fs.readFile}={}) {
 if(typeof requested!=='string'||!path.isAbsolute(requested))throw Error('Absolute selected executable required.');
 const target=path.resolve(requested);
 const {stdout}=await execute(python,[fileURLToPath(new URL('./renderer-native-path.py',import.meta.url)),target],{windowsHide:true,timeout:10000,maxBuffer:65536});
 const receipt=JSON.parse(stdout);
 const fields=['volume','indexHigh','indexLow','sizeHigh','sizeLow','writtenHigh','writtenLow'];
 const validIdentity=value=>value&&Object.keys(value).sort().join(',')===fields.slice().sort().join(',')&&fields.every(field=>Number.isInteger(value[field])&&value[field]>=0&&value[field]<=0xffffffff);
 if(receipt.version!==1||receipt.requestedPath!==target||typeof receipt.finalPath!=='string'||!path.isAbsolute(receipt.finalPath)||!validIdentity(receipt.fileIdentity)||!validIdentity(receipt.finalIdentity)||fields.some(field=>receipt.fileIdentity[field]!==receipt.finalIdentity[field])||! /^[a-f0-9]{64}$/.test(receipt.sha256))throw Error('Native executable resolution binding differs.');
 const bytes=await readFile(receipt.finalPath);
 if(receipt.fileIdentity.sizeHigh*4294967296+receipt.fileIdentity.sizeLow!==bytes.length)throw Error('Resolved executable size differs.');
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(hash!==receipt.sha256)throw Error('Resolved executable bytes changed.');
 return receipt;
}
