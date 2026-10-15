import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// These reviewed originals are the entire allowlist. Never enumerate capture directories.
export const publicImages=Object.freeze([
 {source:'docs/images/captures/refresh-e96a0f0/site/home-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/site/home-1280x900-light-en.png',sha256:'0657cd407bcdf8894168b76857b62e187fe0a7e46455dd2840b87f00096131fd',bytes:92799,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/home-320x800-dpr2-light-en.png',route:'images/captures/refresh-e96a0f0/site/home-320x800-dpr2-light-en.png',sha256:'5b0ca161e2766f3bfd6a5d0390b2de183af7355aef69aef6009b0808c0e58272',bytes:109460,width:640,height:1600},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/drive-locked-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/drive-locked-light-en.png',sha256:'274ad94ac5bdcf03295dc78163cb47cc0d3b4fcb87045f4c99bad9c1e18ceb25',bytes:106303,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/tools-converter-dark-en.png',route:'images/captures/refresh-e96a0f0/desktop/tools-converter-dark-en.png',sha256:'b8c2b9fd727901087a4d618820603da189c69cba096c98c5582c60668631f9f1',bytes:84151,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/tools-documents-light-yue.png',route:'images/captures/refresh-e96a0f0/desktop/tools-documents-light-yue.png',sha256:'3f5fc7ca1029782ea3efdcd1235002af22e51d26d4724a6b03a3e4af6da675dc',bytes:125233,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/tools-converter-light-bilingual.png',route:'images/captures/refresh-e96a0f0/desktop/tools-converter-light-bilingual.png',sha256:'e88f8d51faea93d3aacbcebe019248844e9862b5d1ac2d7a10c54d82f5b682c7',bytes:142184,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/force-lock-dialog-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/force-lock-dialog-light-en.png',sha256:'4d9b1a72c6aa2c8f4614c1ea43594ba7bf48f99e7e82291cf7f448b74498c716',bytes:63454,width:861,height:473},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/force-lock-dialog-dark-en.png',route:'images/captures/refresh-e96a0f0/desktop/force-lock-dialog-dark-en.png',sha256:'b27049c25b3f2b9867215f5c70e0dd7d6d301aa77f82cfa205e43171881dbe1f',bytes:63254,width:861,height:503},
 {source:'docs/images/captures/refresh-e96a0f0/extension/home-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/home-1280x900-light-en.png',sha256:'a079a525d4177227165f21e355b186b1973154b4ed9c535de55a05a41863072b',bytes:77522,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/popup-380-light-en.png',route:'images/captures/refresh-e96a0f0/extension/popup-380-light-en.png',sha256:'d00158d05af0fe62dc33fd8e24d3f0779e27039089753f5a5c7005453e32b1ab',bytes:37806,width:380,height:760},
 {source:'docs/images/captures/refresh-e96a0f0/extension/models-connected-light-en.png',route:'images/captures/refresh-e96a0f0/extension/models-connected-light-en.png',sha256:'151028e8bdb683456dc0620f8b8a9d28370b0a29a72eecf4c1ff7b8c6a6d3b6d',bytes:65006,width:1100,height:1000},
 {source:'docs/images/captures/refresh-e96a0f0/extension/models-chat-light-en.png',route:'images/captures/refresh-e96a0f0/extension/models-chat-light-en.png',sha256:'66f20c093816bd293cdd4bd4a153f2fdd5d8607f071542364117ef4a43be1060',bytes:88820,width:1100,height:1300},
 {source:'docs/images/captures/refresh-e96a0f0/extension/status-release-light-en.png',route:'images/captures/refresh-e96a0f0/extension/status-release-light-en.png',sha256:'1023a36ec6bd4b6a24259056f419b3e0d0c06a09484db54dee0830dede93b14a',bytes:309288,width:1100,height:1100},
 {source:'docs/images/captures/refresh-e96a0f0/extension/status-coverage-narrow-light-en.png',route:'images/captures/refresh-e96a0f0/extension/status-coverage-narrow-light-en.png',sha256:'a38ac6f438d67b699e816212d7a29f0aea6322471d8947e238f2cc5e5ef3e24f',bytes:67207,width:360,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/library-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/site/library-1280x900-light-en.png',sha256:'a4b10e365c5ed81e0f2883d0f098df66483dbbda1972a9e8fba3a969be7a3957',bytes:61473,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/section-publishing-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/section-publishing-1280x900-light-en.png',sha256:'f3cb6dbf91cb189f6a447e150db9b3632def8f68918b910f99d5a04731bd8025',bytes:63622,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/extension/section-servers-1280x900-light-en.png',route:'images/captures/refresh-e96a0f0/extension/section-servers-1280x900-light-en.png',sha256:'c3e807559bc62a97f255d4a1d4590f60b4b312e366a296103a3506d51e4b8340',bytes:49874,width:1280,height:900},
 {source:'docs/images/captures/refresh-e96a0f0/site/article-local-models-360x800-light-en.png',route:'images/captures/refresh-e96a0f0/site/article-local-models-360x800-light-en.png',sha256:'3192a1359b1eff59c20ef133eaa06c97e22eabda445699720b0b7418d71f8122',bytes:36148,width:360,height:800},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/home-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/home-light-en.png',sha256:'f14f1091b78f675fab9a281cec246ca0c6e4d928b234da0e7d9d6ed9757960d4',bytes:149812,width:1920,height:1200},
 {source:'docs/images/captures/refresh-1c5be9a/desktop/newtab-popover-light-en.png',route:'images/captures/refresh-1c5be9a/desktop/newtab-popover-light-en.png',sha256:'078bddbcd61d36c6b043f79bcf5a080cd25630648302f1e74a191cbbb644dbc6',bytes:140149,width:1920,height:1200},
 {source:'docs/images/captures/refresh-1c5be9a/desktop/newtab-popover-dark-en.png',route:'images/captures/refresh-1c5be9a/desktop/newtab-popover-dark-en.png',sha256:'4d2d75e0e59faf8d26aafe2c3a099c788bfded8da567f29e8566461f8ed0ccf1',bytes:137943,width:1920,height:1200},
 {source:'docs/images/captures/refresh-1c5be9a/desktop/newtab-popover-light-bilingual.png',route:'images/captures/refresh-1c5be9a/desktop/newtab-popover-light-bilingual.png',sha256:'88ba49caf83bd53da381a32c0a77fa5838ec9ace5b27c5307b9746a3667fa3d7',bytes:262303,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/history-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/history-light-en.png',sha256:'c99c2daac5b1e6be24b3e2a73e0c9895622bde98723231f66e1668f3663795bc',bytes:108265,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/recycle-bin-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/recycle-bin-light-en.png',sha256:'f627395b33b837e940b606e2b8fd3aa0c5b4fb9fed420dfa975469dc001ac53c',bytes:87760,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/settings-dark-en.png',route:'images/captures/refresh-e96a0f0/desktop/settings-dark-en.png',sha256:'782cdb7116a74974db7eaedd764774ba4c7024b0c677e46030f074bc55626134',bytes:145263,width:1920,height:1200},
 {source:'docs/images/captures/refresh-e96a0f0/desktop/help-how-it-works-light-en.png',route:'images/captures/refresh-e96a0f0/desktop/help-how-it-works-light-en.png',sha256:'91df8ce7f243ae1e3cce9f24d18e6c02cc5f2b541a37efbc76451ff1afe7e2f0',bytes:148296,width:1920,height:1200},
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
