import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildDocumentation,buildGallery,galleryRecords,pageShell,renderMarkdown,route} from '../docs/site/publication.mjs';
const root=process.cwd();
const catalog=JSON.parse(await fs.readFile('docs/site/content-catalog.json','utf8'));
const articleCount=catalog.articles.length+catalog.wiki.files.length;
test('complete documentation inventory produces reachable local routes and unique section anchors',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-docs-'));
 const home=await fs.readFile('docs/site/index.html','utf8');
 try {
 const articles=await buildDocumentation(root,output,home); await buildGallery(root,output,home); assert.equal(articles.length,articleCount);
 const pages=['library.html','wiki.html',...articles.map(a=>a.url),...['desktop','drive','interface','release','storage'].map(c=>`categories/${c}.html`)];
 for(const file of pages){const html=await fs.readFile(path.join(output,file),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,file);
 for(const [,href] of html.matchAll(/href="([^"]+)"/g)){if(/^(https?:|mailto:)/.test(href))continue;const [target,hash]=href.split('#');const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target||path.posix.basename(file)));if(resolved==='index.html'||/^(favicon|site)/.test(resolved))continue;const content=await fs.readFile(path.join(output,resolved),'utf8');if(hash)assert.ok(content.includes(`id="${hash}"`),`${file}: ${href}`);}
 }
 assert.equal(route('docs/features/desktop/README.md'),'articles/docs--features--desktop--README.html');
 }finally{await fs.rm(output,{recursive:true,force:true});}
});
test('Markdown escapes active content and rejects unsafe schemes and malformed fences',()=>{
 const rendered=renderMarkdown('# Same\n\n# Same\n\n<script>alert(1)</script>\n\n`<tag>`','docs/test.md',new Map());
 assert.ok(rendered.includes('id="same-1"'));assert.ok(rendered.includes('&lt;script&gt;'));assert.ok(!rendered.includes('<script>'));
 // Unmapped file links remain inert repository references, never executable schemes.
 assert.throws(()=>renderMarkdown('[unsafe](javascript:alert)','docs/test.md',new Map()),/Unsupported/);
 assert.throws(()=>renderMarkdown('```\nunclosed','docs/test.md',new Map()),/Unclosed/);
 assert.throws(()=>renderMarkdown('![image](https://example.com/a.png)','docs/test.md',new Map()),/explicit local/);
});
test('original gallery inventory verifies image bytes, dimensions and exact source hashes',async()=>{
 const records=await galleryRecords(root);assert.ok(records.length>=4);assert.equal(new Set(records.map(r=>r.id)).size,records.length);
 for(const r of records){assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.match(r.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(r.width>0&&r.height>0);if(r.capturedAt===null)assert.equal(r.timeZone,null);}
});
test('nested article navigation points to root collections and shared preference assets',async()=>{
 const html=pageShell(await fs.readFile('docs/site/index.html','utf8'),'Article','<h1>Article</h1>',{depth:1});
 assert.ok(html.includes('href="../library.html"'));assert.ok(!html.includes('href="library.html"'));assert.ok(html.includes('src="../site.js"'));
 const script=await fs.readFile('docs/site/site.js','utf8');assert.ok(!script.includes("localized('Four guides."));
});


test('documentation catalogue rejects duplicate entries, traversal and unbound wiki revision',async()=>{
 const catalog=JSON.parse(await fs.readFile('docs/site/content-catalog.json','utf8'));
 for(const mutate of [c=>c.articles.push(c.articles[0]),c=>c.articles.push('../private.md'),c=>c.wiki.sourceCommit='invalid']){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-invalid-docs-'));
 try{await fs.mkdir(path.join(temp,'docs/site'),{recursive:true});const copy=structuredClone(catalog);mutate(copy);await fs.writeFile(path.join(temp,'docs/site/content-catalog.json'),JSON.stringify(copy));await assert.rejects(buildDocumentation(temp,temp,''),/Invalid/);}finally{await fs.rm(temp,{recursive:true,force:true});}
 }
});

test('fresh staging excludes withheld originals, stale files and raw receipts',async()=>{
 const {stageSite}=await import('../scripts/build-site.mjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-stage-'));const output=path.join(temp,'site');
 try{
 await fs.mkdir(path.join(output,'images/captures/windows'),{recursive:true});
 await fs.writeFile(path.join(output,'images/captures/windows/desktop-mounted.png'),'stale private pixels');
 await fs.writeFile(path.join(output,'raw-receipt.json'),'stale private receipt');
 await fs.writeFile(path.join(output,'images/captures/windows/unapproved.png'),'unapproved original');
 const result=await stageSite(root,output);assert.equal(result.images,14);assert.equal(result.articles,articleCount);assert.ok(result.preservedPrevious);
 for(const file of ['images/captures/windows/desktop-mounted.png','images/captures/windows/desktop-offline.png','raw-receipt.json','images/captures/desktop-linux.webm','images/captures/windows/unapproved.png','images/captures/windows/provenance.json','images/captures/preview/inventory.json','images/captures/preview/verification-summary.json','publication.mjs','wiki/Home.md'])await assert.rejects(fs.access(path.join(output,file)));
 await fs.access(path.join(output,'images/captures/windows/desktop-locked.png'));await fs.access(path.join(output,'gallery-inventory.json'));
 const html=await fs.readFile(path.join(output,'index.html'),'utf8');assert.ok(!html.includes('desktop-mounted.png'));assert.ok(!html.includes('desktop-offline.png'));
 const inventory=JSON.parse(await fs.readFile(path.join(output,'gallery-inventory.json'),'utf8'));assert.equal(inventory.records.length,14);assert.equal(inventory.withheld.length,2);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('wiki underscore basename renders the actual continuation snapshot',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-wiki-name-'));
 try{
 await fs.mkdir(path.join(temp,'docs/site/wiki'),{recursive:true});
 await fs.mkdir(path.join(temp,'docs/features'),{recursive:true});
 const markdown=await fs.readFile('docs/site/wiki/CLOSEOUT_PROMPT.md','utf8');
 await fs.writeFile(path.join(temp,'docs/site/wiki/CLOSEOUT_PROMPT.md'),markdown);
 await fs.writeFile(path.join(temp,'docs/site/content-catalog.json'),JSON.stringify({...catalog,articles:[],categories:[],wiki:{...catalog.wiki,files:['CLOSEOUT_PROMPT.md']}}));
 const output=path.join(temp,'output');
 const articles=await buildDocumentation(temp,output,await fs.readFile('docs/site/index.html','utf8'));
 assert.equal(articles.length,1);assert.equal(articles[0].markdown,markdown);
 const html=await fs.readFile(path.join(output,'articles/wiki--CLOSEOUT_PROMPT.html'),'utf8');
 assert.ok(html.includes('Wiki continuation handoff'));
 assert.ok(html.includes('Wiki CLOSEOUT_PROMPT'));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('wiki basenames reject traversal, separators and unsafe punctuation',async()=>{
 for(const file of ['../CLOSEOUT_PROMPT.md','folder/CLOSEOUT_PROMPT.md','folder\\CLOSEOUT_PROMPT.md','C:closeout.md','closeout?.md','closeout".md','.hidden.md','closeout.md/extra','']){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-wiki-invalid-'));
 try{
 await fs.mkdir(path.join(temp,'docs/site'),{recursive:true});
 await fs.writeFile(path.join(temp,'docs/site/content-catalog.json'),JSON.stringify({...catalog,wiki:{...catalog.wiki,files:[file]}}));
 await assert.rejects(buildDocumentation(temp,temp,''),/Invalid wiki provenance/,file);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
 }
});
