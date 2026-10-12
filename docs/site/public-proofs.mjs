import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// This reviewed public file is the entire allowlist. Never enumerate evidence directories.
export const publicProofs=Object.freeze([{source:'docs/evidence/main-performance-20261012.json',route:'docs/evidence/main-performance-20261012.json',sha256:'3c761bcb52261ce0cc0ed9124e8940df5c8c8a5a75019a11bec6400a96b6974b'},{source:'docs/evidence/hosted-update-1344-20261012.json',route:'docs/evidence/hosted-update-1344-20261012.json',sha256:'311794143f7731bb3ec960de0ff01605ea9a0835f5edb5df507117f3f44a50df'}].map(proof=>Object.freeze(proof)));
export async function stagePublicProofs(root,output){
 for(const proof of publicProofs){const filename=path.join(root,proof.source),info=await fs.lstat(filename);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw Error('PUBLIC_PROOF_NOT_REVIEWED');const raw=await fs.readFile(filename);const bytes=Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(raw).replaceAll('\r\n','\n'));if(createHash('sha256').update(bytes).digest('hex')!==proof.sha256)throw Error('PUBLIC_PROOF_NOT_REVIEWED');const value=JSON.parse(bytes.toString('utf8'));if(value.schemaVersion!==1)throw Error('PUBLIC_PROOF_NOT_REVIEWED');const target=path.join(output,proof.route);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
}
