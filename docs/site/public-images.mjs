import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// These reviewed originals are the entire allowlist. Never enumerate capture directories.
export const publicImages=Object.freeze([
 {source:'docs/images/captures/site-guidance-normal-83e14d86.png',route:'images/captures/site-guidance-normal-83e14d86.png',sha256:'78701c8aea8f8db63db13da2d11cf342817f8a841769efdc2f063ec8038a1f89',bytes:146518,width:1280,height:900},
 {source:'docs/images/captures/site-guidance-narrow-83e14d86.png',route:'images/captures/site-guidance-narrow-83e14d86.png',sha256:'5db524e0a6375aa4ee7385b5014a39f43e10b6bc1076a5af6d110bc2b0bacf99',bytes:210730,width:640,height:1600},
 {source:'docs/images/captures/material-2a9cb388/drive-light-en.png',route:'images/captures/material-2a9cb388/drive-light-en.png',sha256:'2db466fd4da82ef74e7e39071ccee3640d5bba9da6b3a830262f29da7bbf2472',bytes:106874,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/converter-dark-en.png',route:'images/captures/material-2a9cb388/converter-dark-en.png',sha256:'b57f0af7bce88fe4175817b2e2cfece0cad6eb74d659cae6bdf5d9be8e2572d3',bytes:80536,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/workflow-light-yue.png',route:'images/captures/material-2a9cb388/workflow-light-yue.png',sha256:'ae0cb8eb2d05780eabd78ae192a7bf74aa40f5f7eac6762e6a2450e3a8064b5f',bytes:116022,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/converter-light-bilingual.png',route:'images/captures/material-2a9cb388/converter-light-bilingual.png',sha256:'cf54deb49bd40faedc90bd7aad3ea3a34ee7e8fccdb7cc835d57d296deaa0762',bytes:140294,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/dialog-consent-light-en.png',route:'images/captures/material-2a9cb388/dialog-consent-light-en.png',sha256:'a8595fed1676b3c17f7b9fa8a2b1afb5f22faa99e0f7397a77a53a47d7309026',bytes:46800,width:839,height:402},
 {source:'docs/images/captures/material-2a9cb388/dialog-consent-dark-en.png',route:'images/captures/material-2a9cb388/dialog-consent-dark-en.png',sha256:'9e44ce0dd21480c5255e22f835e8b54ab0c33ee60274df740ed6299e85fa9b5c',bytes:46359,width:839,height:402},
].map(Object.freeze));

export function resolvePublicImage(source,url,images) {
 const reject=()=>{throw new Error('Documentation image needs an explicit local asset entry');};
 if(!/^[A-Za-z0-9_./-]+\.png$/.test(url)||url.startsWith('/'))return reject();
 const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(source),url));
 if(resolved==='..'||resolved.startsWith('../'))return reject();
 const image=images.get(resolved);
 if(!image||!publicImages.includes(image))return reject();
 return image;
}

async function containedFile(root,relative) {
 const base=await fs.realpath(root),parts=relative.split('/');
 let current=base;
 for(const part of parts){
  if(!part||part==='.'||part==='..')throw new Error('PUBLIC_IMAGE_NOT_REVIEWED');
  current=path.join(current,part);
  if((await fs.lstat(current)).isSymbolicLink())throw new Error('PUBLIC_IMAGE_NOT_REVIEWED');
 }
 const real=await fs.realpath(current),distance=path.relative(base,real);
 if(distance.startsWith('..'+path.sep)||distance==='..'||path.isAbsolute(distance))throw new Error('PUBLIC_IMAGE_NOT_REVIEWED');
 return current;
}

export async function stagePublicImages(root,output) {
 const images=new Map();
 for(const image of publicImages){
  const filename=await containedFile(root,image.source),info=await fs.lstat(filename);
  if(!info.isFile()||info.size!==image.bytes)throw new Error('PUBLIC_IMAGE_NOT_REVIEWED');
  const bytes=await fs.readFile(filename);
  if(bytes.length!==image.bytes||createHash('sha256').update(bytes).digest('hex')!==image.sha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==image.width||bytes.readUInt32BE(20)!==image.height)throw new Error('PUBLIC_IMAGE_NOT_REVIEWED');
  const target=path.join(output,image.route);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,bytes);
  images.set(image.source,image);
 }
 return images;
}
