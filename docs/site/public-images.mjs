import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// These reviewed originals are the entire allowlist. Never enumerate capture directories.
export const publicImages=Object.freeze([
 {source:'docs/images/captures/docker-hub-drive/create-where-light-en.png',route:'images/captures/docker-hub-drive/create-where-light-en.png',sha256:'428d89887d3684c240f40251ad45d72430ff1be08884d0e4b5f82a8344869b4d',bytes:67474,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/create-repository-picker-light-en.png',route:'images/captures/docker-hub-drive/create-repository-picker-light-en.png',sha256:'1a02bc5bd14afbeadfbb731b6fd7fd0874ec56a09a5fdfb93a1f8655b43aa83c',bytes:98228,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/create-details-light-en.png',route:'images/captures/docker-hub-drive/create-details-light-en.png',sha256:'fab7f700c2ddce6cd11bbada0b01f4743cbadfd9d829936a53e202c0ca3d6371',bytes:81580,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/docker-hub-storage-after-backup-light-en.png',route:'images/captures/docker-hub-drive/docker-hub-storage-after-backup-light-en.png',sha256:'9427e92c8bca5e2802f55cb6e0646cbbf28b64f12d2bc2c526a4f73de894534d',bytes:95808,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/open-picker-drive-cards-light-en.png',route:'images/captures/docker-hub-drive/open-picker-drive-cards-light-en.png',sha256:'1061d59e0914cac60a35d34d062a6b1db2fcb099b490af54560ac98baf72df60',bytes:95427,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/open-snapshots-light-en.png',route:'images/captures/docker-hub-drive/open-snapshots-light-en.png',sha256:'83edb1466536384cbb1bb40be077e9dd4cf60b52d6514a6364746a71313fa650',bytes:77125,width:1440,height:900},
 {source:'docs/images/captures/docker-hub-drive/open-unlock-light-en.png',route:'images/captures/docker-hub-drive/open-unlock-light-en.png',sha256:'77c80594e0cb0043f122454b122343a71c46c6db2b1aae3e40d05f57a710fba6',bytes:67842,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/home-light.png',route:'images/captures/redesign-v2-3227a1cc/home-light.png',sha256:'c06a31d22371df7cef346d6666c0a34a1d63e86c0efe124ede7529bb38a08783',bytes:58523,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/home-dark.png',route:'images/captures/redesign-v2-3227a1cc/home-dark.png',sha256:'65db2661bd18abd93f3254c06f962e2473ebfbfd22cefda0312ad1da0d4ba6b6',bytes:60571,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/drive-list-light-1024.png',route:'images/captures/redesign-v2-3227a1cc/drive-list-light-1024.png',sha256:'f15888633931df0382b5d83b24d46a87e70e86a8b729107c9262976ab54415b9',bytes:48513,width:1024,height:768},
 {source:'docs/images/captures/redesign-v2-3227a1cc/drive-new-menu-light-1024.png',route:'images/captures/redesign-v2-3227a1cc/drive-new-menu-light-1024.png',sha256:'c43f21a5dd6f6bc66d798cf54cc83a630b003ea0830d2896cd540b547d6ca482',bytes:55809,width:1024,height:768},
 {source:'docs/images/captures/redesign-v2-3227a1cc/local-tools-light.png',route:'images/captures/redesign-v2-3227a1cc/local-tools-light.png',sha256:'5f38618c1d78155e53fb034f3f3b334715ab75d8d90a502b87051b76b14fa49f',bytes:99922,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/local-tools-dark.png',route:'images/captures/redesign-v2-3227a1cc/local-tools-dark.png',sha256:'4addad949f47bad3b47415abd0812453e60e4647ea6592ea8fb654729acf3572',bytes:100460,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/settings-light.png',route:'images/captures/redesign-v2-3227a1cc/settings-light.png',sha256:'0a4e98904333d7446ec81fdc679013dfc9440a8ab7ebb181fb75c06053058ca2',bytes:81262,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/settings-backup-light.png',route:'images/captures/redesign-v2-3227a1cc/settings-backup-light.png',sha256:'87d86d7d42968fd5f4eb60604e202e9bf7eb837ec0bfba92f9b147a70d85fcbb',bytes:87137,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/settings-help-mode-light.png',route:'images/captures/redesign-v2-3227a1cc/settings-help-mode-light.png',sha256:'fbf7a88f77802c0868e036a034b9998633cf8b79deccbe85059dcd84bacd9780',bytes:90620,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/tooltip-focus-light-1024.png',route:'images/captures/redesign-v2-3227a1cc/tooltip-focus-light-1024.png',sha256:'2a91dfbff262664994d9ceefbf917cf3004140e240d148b001ccb38f6348c4b0',bytes:54361,width:1024,height:768},
 {source:'docs/images/captures/redesign-v2-3227a1cc/history-light.png',route:'images/captures/redesign-v2-3227a1cc/history-light.png',sha256:'e706ae995e3a2351dcbd387fac7c2f5675186cb584740a68218cae306e4af70b',bytes:57200,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/recycle-bin-light.png',route:'images/captures/redesign-v2-3227a1cc/recycle-bin-light.png',sha256:'451cc537819fb381e9706cb7f3c3e52545cfab2a9fdfa2217cadef2cb12c4549',bytes:56986,width:1440,height:900},
 {source:'docs/images/captures/redesign-v2-3227a1cc/drive-list-light-360.png',route:'images/captures/redesign-v2-3227a1cc/drive-list-light-360.png',sha256:'c07ea9277bff2f8dfdcc1e9dba3f5d9685c5200f982bdc7f5e4e04ba04e0287f',bytes:18053,width:360,height:780},
 {source:'docs/images/captures/redesign-v2-3227a1cc/navigation-drawer-light-360.png',route:'images/captures/redesign-v2-3227a1cc/navigation-drawer-light-360.png',sha256:'afd070c4223d4c9c16b151a00ed213e04bd36cb88b170bd5eecf87029638b27f',bytes:24733,width:360,height:780},
 {source:'docs/images/captures/redesign-dc166dc9/home-locked-light-en.png',route:'images/captures/redesign-dc166dc9/home-locked-light-en.png',sha256:'546c3e43d1595a5f0733528c98d90c2b79eb288b949f12a3afd8d6b3aa8a2606',bytes:89132,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/home-mounted-light-en.png',route:'images/captures/redesign-dc166dc9/home-mounted-light-en.png',sha256:'3405ce0b4b98c29486010aa2ac34073668764a8142bba5ae9c6f0f09b829b342',bytes:100954,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/home-mounted-dark-en.png',route:'images/captures/redesign-dc166dc9/home-mounted-dark-en.png',sha256:'285df9429baf832409977c96a449f17aefb5b5fe9ee87682c7583a7245d554ec',bytes:102662,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/home-mounted-light-bilingual.png',route:'images/captures/redesign-dc166dc9/home-mounted-light-bilingual.png',sha256:'9d472c13cc8e666302eecb3e6b57be4d171593ccb1f3069e187512a2fd055153',bytes:204817,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/new-tab-catalog-light-en.png',route:'images/captures/redesign-dc166dc9/new-tab-catalog-light-en.png',sha256:'b5f19f0c515c475eb8c4f2052859c9f03b1dbc73c5e7711ab7a9e5e0cf6bbf00',bytes:91266,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/settings-menu-light-en.png',route:'images/captures/redesign-dc166dc9/settings-menu-light-en.png',sha256:'517af8274a3d10bc8e7f9770bb25ad3837c6d71ab785d19297ad5e4846878f15',bytes:61636,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-locked-light-en.png',route:'images/captures/redesign-dc166dc9/drive-locked-light-en.png',sha256:'b4d60dc3a9da60fa75d0dcbbdcc246cab4fe810df03de614ac9e9626b6450e9a',bytes:66522,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/create-drive-dialog-light-en.png',route:'images/captures/redesign-dc166dc9/create-drive-dialog-light-en.png',sha256:'b0152e4d47c4d70f841201270075f59ded7d963195ccabf8fe2e393da84546fe',bytes:92879,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-files-light-en.png',route:'images/captures/redesign-dc166dc9/drive-files-light-en.png',sha256:'ce312b4639765f6726cd44e1ba7fa1381cdc26db468d9c9cce4d895e49b58792',bytes:110546,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-file-selected-light-en.png',route:'images/captures/redesign-dc166dc9/drive-file-selected-light-en.png',sha256:'8dee262af7b03184d349c0517ad29b2a3d97425009bcb16cc32b0c41169e6ab6',bytes:109818,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-command-bar-overflow-light-en.png',route:'images/captures/redesign-dc166dc9/drive-command-bar-overflow-light-en.png',sha256:'a9c0f4dda0c32d46208e2c21e7c7df2ebdc99f74043c64f73ec0e9c87710fcc0',bytes:97897,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-files-dark-en.png',route:'images/captures/redesign-dc166dc9/drive-files-dark-en.png',sha256:'b5ef8f9bf455a801bde01fd96e56965004c0beb5f3ac15a40001def02b672461',bytes:110588,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/drive-files-dark-bilingual.png',route:'images/captures/redesign-dc166dc9/drive-files-dark-bilingual.png',sha256:'8468379b622010ad63919ab0488886fa4be38d72277d3b748fc69fb30338dc4b',bytes:187905,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/history-light-en.png',route:'images/captures/redesign-dc166dc9/history-light-en.png',sha256:'9132f8c0408604b1522c1af6d08543119f669f44e58738629b9f14ca25f3d553',bytes:77251,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/recycle-bin-light-en.png',route:'images/captures/redesign-dc166dc9/recycle-bin-light-en.png',sha256:'fe97a43d65936b0273687530899515dca91c4460d932f97be17457afa62d11e2',bytes:65932,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/available-offline-light-en.png',route:'images/captures/redesign-dc166dc9/available-offline-light-en.png',sha256:'1e0f53f6fa78ddbb88441e72b527ef58610e7e8e07cf6e336ab24b343a89bd96',bytes:92649,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/local-tools-light-en.png',route:'images/captures/redesign-dc166dc9/local-tools-light-en.png',sha256:'ea96d079659b230e0cefc19b1f21098b3b484247c0f7f90ec036e019e5c91124',bytes:96524,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/local-tools-dark-en.png',route:'images/captures/redesign-dc166dc9/local-tools-dark-en.png',sha256:'6203ffbc13ca2ba5466f193ec164b4093e0df3e5c8c63d9c201171f2ff8350d8',bytes:97165,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/local-tools-dark-bilingual.png',route:'images/captures/redesign-dc166dc9/local-tools-dark-bilingual.png',sha256:'0c16c65a824c5fd742ae3a660f3cd5d80a2bdfcc6e37fd532908c9db2aae5a59',bytes:171435,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/regex-builder-closed-light-en.png',route:'images/captures/redesign-dc166dc9/regex-builder-closed-light-en.png',sha256:'4b4e8dea61a208a8a5fcdeb09fbb7bdf764c61c690fe242ff9e5f7b17d1222c1',bytes:108001,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/regex-builder-expression-light-en.png',route:'images/captures/redesign-dc166dc9/regex-builder-expression-light-en.png',sha256:'dba85f2a3abdb0241e4d8b7246253897c648ac565991a6060442c2ca9ac72aab',bytes:100417,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-base64-light-en.png',route:'images/captures/redesign-dc166dc9/tool-base64-light-en.png',sha256:'772e3e2e0554e194c9e6ad6c1beccd3ad4c3b6cb80f37d826813bfe3ce8be978',bytes:74432,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-type-generator-light-en.png',route:'images/captures/redesign-dc166dc9/tool-type-generator-light-en.png',sha256:'4d2a63a9d4074ee15fa2251616d0a5c24be5836b8388bab587d74f1908bf6bd1',bytes:84492,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-virtual-disks-light-en.png',route:'images/captures/redesign-dc166dc9/tool-virtual-disks-light-en.png',sha256:'c93ee518356dc09d7c2b1b5609f481f80163561d84810b16cece00c961e1f18c',bytes:91824,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-live-charts-mounted-light-en.png',route:'images/captures/redesign-dc166dc9/tool-live-charts-mounted-light-en.png',sha256:'728be3b022fb0c05eda14f23165ce70e0d284dde1068f65a21b9e240f29e14c4',bytes:79212,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-sketch-board-light-en.png',route:'images/captures/redesign-dc166dc9/tool-sketch-board-light-en.png',sha256:'6cf56b09e48260139b29dd122dbe418a3e09313e0e656bc23791e1769132f113',bytes:61212,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/tool-server-preparation-light-en.png',route:'images/captures/redesign-dc166dc9/tool-server-preparation-light-en.png',sha256:'9d48d4f720027fd8b9c644859ce0488af77f2375709035bfff226137a2dbbe8e',bytes:88790,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/world-generator-options-light-en.png',route:'images/captures/redesign-dc166dc9/world-generator-options-light-en.png',sha256:'a012f136d329d0e79a7a090e7f0d284a04febd7d9b0975ae1ec8f7d67f85b31b',bytes:78179,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/world-generator-area-light-en.png',route:'images/captures/redesign-dc166dc9/world-generator-area-light-en.png',sha256:'c75885161d88440ab252e65f8049c32974e0589b329446f5ffd92ba4ddfa76a1',bytes:58580,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/world-generator-output-light-en.png',route:'images/captures/redesign-dc166dc9/world-generator-output-light-en.png',sha256:'e14535b4232f0160b4482a160da89659933cd6091e8cffdbb11c9baff224f85b',bytes:65952,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/home-390x844-light-en.png',route:'images/captures/redesign-dc166dc9/home-390x844-light-en.png',sha256:'fb30ecb9ca0d455f29770b504fb876d5505aa4522e76aef3738ef8412a59081b',bytes:37862,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/navigation-drawer-390x844-light-en.png',route:'images/captures/redesign-dc166dc9/navigation-drawer-390x844-light-en.png',sha256:'9a911436c19bfc2ac43441bf9a6c258429633763b873d319f5c499d23061f0d5',bytes:39952,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/local-tools-390x844-light-en.png',route:'images/captures/redesign-dc166dc9/local-tools-390x844-light-en.png',sha256:'2fd9dcf64e2ddd8682c605c657e2164f81946ac6c33c07e3d20d357943f2b27a',bytes:40805,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/drive-files-390x844-light-en.png',route:'images/captures/redesign-dc166dc9/drive-files-390x844-light-en.png',sha256:'0542e5fa089f90692a19eb55ce26738c14a09d974a5c222f363cfe71c38f5302',bytes:39969,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/drive-command-bar-overflow-390x844-light-en.png',route:'images/captures/redesign-dc166dc9/drive-command-bar-overflow-390x844-light-en.png',sha256:'df2dfd58a3827da40d9918e54db7a298b78a97a99fb6376edfbf2ae35c4454d3',bytes:24080,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/home-390x844-dark-bilingual.png',route:'images/captures/redesign-dc166dc9/home-390x844-dark-bilingual.png',sha256:'0aedee99c4c9a6f7ea683521236d61a2282f26fe9e84ae8f8df743832da24dc2',bytes:73674,width:390,height:844},
 {source:'docs/images/captures/redesign-dc166dc9/settings-startup-storage-light-en.png',route:'images/captures/redesign-dc166dc9/settings-startup-storage-light-en.png',sha256:'4d348881c537225609e0c45b9ae4e74b04d2b625287b3f3ca73d4af91ab5a7f1',bytes:102153,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/settings-appearance-light-en.png',route:'images/captures/redesign-dc166dc9/settings-appearance-light-en.png',sha256:'fda652657a2f69a0072687c3dcc5ecfb924e1881fece9802e21d3f60da93fd34',bytes:102382,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/settings-high-contrast-text-130-light-en.png',route:'images/captures/redesign-dc166dc9/settings-high-contrast-text-130-light-en.png',sha256:'aa5dfc6ffe183c0c6548254beb1e1d185e7b9140eed466ee9e5ee391bc95190e',bytes:118456,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/settings-appearance-light-bilingual.png',route:'images/captures/redesign-dc166dc9/settings-appearance-light-bilingual.png',sha256:'cb6c0d22f07e82fdf377aa928dfb722285a9ad208b5b3d3875c38a58fabb2c2c',bytes:175913,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/settings-appearance-dark-bilingual.png',route:'images/captures/redesign-dc166dc9/settings-appearance-dark-bilingual.png',sha256:'6178efd1898cb0a4ea2f618704bef3eca1e4e5e240caed44bd3dfeaa4c26e52d',bytes:175820,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/personalization-language-light-en.png',route:'images/captures/redesign-dc166dc9/personalization-language-light-en.png',sha256:'97e7f873c94753c83c929e0916092983bd37b886ba77ac67262c60fca07ced6f',bytes:77707,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/personalization-appearance-light-en.png',route:'images/captures/redesign-dc166dc9/personalization-appearance-light-en.png',sha256:'f979ca18142ac403d57c3c91de0f5b91864d1519bca9750e0eec0637f18db18e',bytes:70622,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/motion-editor-profiles-light-en.png',route:'images/captures/redesign-dc166dc9/motion-editor-profiles-light-en.png',sha256:'256269f7f8dd07cd1500c2ef352a6f4285075c6e6beb1e1e9c4407d83ac43ff6',bytes:84555,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/local-access-light-en.png',route:'images/captures/redesign-dc166dc9/local-access-light-en.png',sha256:'55e38b02489a96118a49d4b1750828f924835355884630e1a556ba975dfa870e',bytes:68169,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/docker-hub-initial-light-en.png',route:'images/captures/redesign-dc166dc9/docker-hub-initial-light-en.png',sha256:'84c72447d8e72d808f0350e0c1d98efaf64ce3066b952dd07194013625537357',bytes:102282,width:1440,height:900},
 {source:'docs/images/captures/redesign-dc166dc9/docker-hub-sign-in-unfinished-light-en.png',route:'images/captures/redesign-dc166dc9/docker-hub-sign-in-unfinished-light-en.png',sha256:'e5f046570098ccec8ffcabcf03a30ab745b5a2058c8920f5f98315bd3b793970',bytes:103128,width:1440,height:900},
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
