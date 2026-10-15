import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// These reviewed originals are the entire allowlist. Never enumerate capture directories.
export const publicImages=Object.freeze([
 {source:'docs/images/captures/refresh-e96a0f0/site/home-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/site/home-1280x900-light-en.png',sha256:'4265be11ad891cec56b7fe300ddcc411435fd3629a1317305ce9324a3625bda4',bytes:89679,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/home-320x800-dpr2-light-en.png',route:'images/captures/refresh-e96a0f0/site/home-320x800-dpr2-light-en.png',sha256:'dfbb0107c4f3fd1015caa7fd2fc686442030a86793f70673217e120cfc358ca5',bytes:111481,width:640,height:1600},
 {source:'docs/images/captures/material-2a9cb388/drive-light-en.png',route:'images/captures/material-2a9cb388/drive-light-en.png',sha256:'2db466fd4da82ef74e7e39071ccee3640d5bba9da6b3a830262f29da7bbf2472',bytes:106874,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/converter-dark-en.png',route:'images/captures/material-2a9cb388/converter-dark-en.png',sha256:'b57f0af7bce88fe4175817b2e2cfece0cad6eb74d659cae6bdf5d9be8e2572d3',bytes:80536,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/workflow-light-yue.png',route:'images/captures/material-2a9cb388/workflow-light-yue.png',sha256:'ae0cb8eb2d05780eabd78ae192a7bf74aa40f5f7eac6762e6a2450e3a8064b5f',bytes:116022,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/converter-light-bilingual.png',route:'images/captures/material-2a9cb388/converter-light-bilingual.png',sha256:'cf54deb49bd40faedc90bd7aad3ea3a34ee7e8fccdb7cc835d57d296deaa0762',bytes:140294,width:1792,height:1139},
 {source:'docs/images/captures/material-2a9cb388/dialog-consent-light-en.png',route:'images/captures/material-2a9cb388/dialog-consent-light-en.png',sha256:'a8595fed1676b3c17f7b9fa8a2b1afb5f22faa99e0f7397a77a53a47d7309026',bytes:46800,width:839,height:402},
 {source:'docs/images/captures/material-2a9cb388/dialog-consent-dark-en.png',route:'images/captures/material-2a9cb388/dialog-consent-dark-en.png',sha256:'9e44ce0dd21480c5255e22f835e8b54ab0c33ee60274df740ed6299e85fa9b5c',bytes:46359,width:839,height:402},
 {source:'docs/images/captures/refresh-e96a0f0/extension/home-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/home-1280x900-light-en.png',sha256:'a079a525d4177227165f21e355b186b1973154b4ed9c535de55a05a41863072b',bytes:77522,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/popup-380-light-en.png',route:'images/captures/refresh-e96a0f0/extension/popup-380-light-en.png',sha256:'d00158d05af0fe62dc33fd8e24d3f0779e27039089753f5a5c7005453e32b1ab',bytes:37806,width:380,height:760},
 {source:'docs/images/captures/refresh-e96a0f0/extension/models-connected-light-en.png',route:'images/captures/refresh-e96a0f0/extension/models-connected-light-en.png',sha256:'151028e8bdb683456dc0620f8b8a9d28370b0a29a72eecf4c1ff7b8c6a6d3b6d',bytes:65006,width:1100,height:1000},
 {source:'docs/images/captures/refresh-e96a0f0/extension/models-chat-light-en.png',route:'images/captures/refresh-e96a0f0/extension/models-chat-light-en.png',sha256:'66f20c093816bd293cdd4bd4a153f2fdd5d8607f071542364117ef4a43be1060',bytes:88820,width:1100,height:1300},
 {source:'docs/images/captures/refresh-e96a0f0/extension/status-release-light-en.png',route:'images/captures/refresh-e96a0f0/extension/status-release-light-en.png',sha256:'1023a36ec6bd4b6a24259056f419b3e0d0c06a09484db54dee0830dede93b14a',bytes:309288,width:1100,height:1100},
 {source:'docs/images/captures/refresh-e96a0f0/extension/status-coverage-narrow-light-en.png',route:'images/captures/refresh-e96a0f0/extension/status-coverage-narrow-light-en.png',sha256:'a38ac6f438d67b699e816212d7a29f0aea6322471d8947e238f2cc5e5ef3e24f',bytes:67207,width:360,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/library-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/site/library-1280x900-light-en.png',sha256:'d240574ca4b62c9fbf065a7479a390186b786cb302d1ecf39850019eb5a93e1d',bytes:64943,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/section-publishing-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/section-publishing-1280x900-light-en.png',sha256:'f3cb6dbf91cb189f6a447e150db9b3632def8f68918b910f99d5a04731bd8025',bytes:63622,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/section-servers-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/section-servers-1280x900-light-en.png',sha256:'c3e807559bc62a97f255d4a1d4590f60b4b312e366a296103a3506d51e4b8340',bytes:49874,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/article-local-models-360x800-light-en.png',route:'images/captures/refresh-e96a0f0/site/article-local-models-360x800-light-en.png',sha256:'1aa11bac8c93e764a1b9a9f03b595c6050ee57967b2906efd8c21dc3158c03a6',bytes:37381,width:360,height:800},
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
