import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {stageBundledFonts,verifyFontAsset} from './stage-bundled-fonts.mjs';
import {BUNDLED_FONT_MANIFEST} from '../src/shared/fonts/manifest.js';
export async function stageFontOutputs({root=process.cwd(),rendererDirectory,siteDirectory,cache=process.env.MFE_BUNDLED_FONT_CACHE,signal,fetchAsset}={}){
 const staged=await stageBundledFonts({output:path.join(root,'font-assets'),cache:cache||path.join(root,'.cache','bundled-fonts'),signal,fetchAsset});
 const identity=createHash('sha256').update(JSON.stringify(BUNDLED_FONT_MANIFEST)).digest('hex');if(staged.identity!==identity)throw Error('Bundled font staging identity differs.');
 const receipt={schemaVersion:1,identity,status:'staged-not-rendered',assets:BUNDLED_FONT_MANIFEST.assets.map(({name,bytes,sha256})=>({name,bytes,sha256}))};
 for(const [source,destination]of [[staged.rendererDirectory,rendererDirectory],[staged.siteDirectory,siteDirectory]]){if(!destination)continue;signal?.throwIfAborted();const absolute=path.resolve(destination);let cursor=path.parse(absolute).root;for(const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);try{if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Linked font output is unsupported.');}catch(error){if(error.code!=='ENOENT')throw error;}}await fs.mkdir(absolute,{recursive:true});await fs.cp(source,absolute,{recursive:true});for(const asset of BUNDLED_FONT_MANIFEST.assets){signal?.throwIfAborted();await verifyFontAsset(path.join(absolute,'assets',asset.name),asset);}const actual=await fs.readFile(path.join(absolute,'fonts.css')),expected=await fs.readFile(new URL('../src/shared/fonts/fonts.css',import.meta.url));if(!actual.equals(expected))throw Error('Copied font CSS differs.');await fs.writeFile(path.join(absolute,'receipt.mjs'),'export default '+JSON.stringify(receipt)+';\n');}
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await stageFontOutputs({rendererDirectory:path.resolve('src/renderer/fonts')})));
