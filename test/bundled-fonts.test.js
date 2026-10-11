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
