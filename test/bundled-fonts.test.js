import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {BUNDLED_FONT_MANIFEST,bundledFontDescriptors} from '../src/shared/fonts/index.js';
import {stageBundledFonts,verifyFontAsset} from '../scripts/stage-bundled-fonts.mjs';
test('complete pinned local inventory keeps fonts unavailable until staging and rejects network origins',async()=>{
 const faces=bundledFontDescriptors({baseURL:pathToFileURL(process.cwd()+'/font-assets/').href});assert.equal(faces.length,3);assert.ok(faces.every(face=>face.availability==='unavailable'));assert.ok(faces.every(face=>face.completeSource));assert.deepEqual(faces.map(face=>face.version),['2.008','2.008','2.004']);assert.ok(faces[2].languages.includes('zh-HK'));assert.equal(faces[2].axes[0].max,900);
 assert.throws(()=>bundledFontDescriptors({baseURL:'https://unrelated.example/fonts/'}),/same-origin/);
 const css=await fs.readFile(new URL('../src/shared/fonts/fonts.css',import.meta.url),'utf8');assert.doesNotMatch(css,/https?:|unicode-range/);for(const face of faces)assert.ok(css.includes(face.cssFamily));
 for(const asset of BUNDLED_FONT_MANIFEST.assets){assert.match(asset.revision,/^[a-f0-9]{40}$/);assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert.ok(asset.bytes>0);assert.ok(asset.url.includes(asset.revision));}assert.equal(BUNDLED_FONT_MANIFEST.license,'OFL-1.1');
});
test('font publication rejects incomplete hashes and cancellation without publishing a tree',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bundled-font-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'asset'),bytes=Buffer.from('fixture');await fs.writeFile(file,bytes);const asset={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};assert.equal(await verifyFontAsset(file,asset),true);await assert.rejects(verifyFontAsset(file,{...asset,sha256:'0'.repeat(64)}),/hash/);await assert.rejects(verifyFontAsset(file,{...asset,bytes:1}),/size/);
 const output=path.join(root,'output'),cache=path.join(root,'cache');await assert.rejects(stageBundledFonts({output,cache,fetchAsset:async()=>new Response(bytes)}),/size|hash/);assert.deepEqual(await fs.readdir(output),[]);
 const controller=new AbortController();controller.abort();await assert.rejects(stageBundledFonts({output,cache,signal:controller.signal,fetchAsset:()=>{throw Error('Cancelled download reached network');}}),/abort/i);assert.deepEqual(await fs.readdir(output),[]);
});
test('reused valid trees reject initial and verification-time cancellation without publication or network',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bundled-reuse-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const original=BUNDLED_FONT_MANIFEST.assets,bytes=Buffer.from('verified fixture'),asset={name:'fixture.ttf',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 BUNDLED_FONT_MANIFEST.assets=[asset];try{
  const identity=createHash('sha256').update(JSON.stringify(BUNDLED_FONT_MANIFEST)).digest('hex'),output=path.join(root,'output'),cache=path.join(root,'cache'),published=path.join(output,identity);await fs.mkdir(cache);for(const target of ['renderer','site']){await fs.mkdir(path.join(published,target,'assets'),{recursive:true});await fs.writeFile(path.join(published,target,'assets',asset.name),bytes);await fs.copyFile(new URL('../src/shared/fonts/fonts.css',import.meta.url),path.join(published,target,'fonts.css'));}
  const before=await fs.readdir(output),network=()=>{throw Error('Reuse attempted network');},initial=new AbortController();initial.abort();await assert.rejects(stageBundledFonts({output,cache,signal:initial.signal,fetchAsset:network}),/abort/i);
  const during=new AbortController();let verified=0;await assert.rejects(stageBundledFonts({output,cache,signal:during.signal,fetchAsset:network,onProgress:event=>{if(event.phase==='verify'){verified++;during.abort();}}}),/abort/i);assert.equal(verified,1);assert.deepEqual(await fs.readdir(output),before);
  for(const target of ['renderer','site'])assert.deepEqual(await fs.readFile(path.join(published,target,'assets',asset.name)),bytes);
 }finally{BUNDLED_FONT_MANIFEST.assets=original;}
});
