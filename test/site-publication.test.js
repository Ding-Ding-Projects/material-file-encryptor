import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildDocumentation,buildGallery,galleryRecords,projectGalleryRecord,groupGalleryRecords,renderGallery,validateGalleryReview,pageShell,renderMarkdown,route} from '../docs/site/publication.mjs';
const root=process.cwd();
const catalog=JSON.parse(await fs.readFile('docs/site/content-catalog.json','utf8'));
const articleCount=catalog.articles.length+catalog.wiki.files.length;
const reviewed=JSON.parse(await fs.readFile('docs/site/gallery-review.json','utf8'));
const approvedPaths=[...reviewed.approvedOriginals].sort();
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
 const records=await galleryRecords(root);assert.deepEqual(records.map(r=>r.path).sort(),approvedPaths);assert.equal(new Set(records.map(r=>r.id)).size,records.length);
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
 const result=await stageSite(root,output);assert.equal(result.images,approvedPaths.length);assert.equal(result.articles,articleCount);assert.ok(result.preservedPrevious);
 for(const file of ['images/captures/windows/desktop-mounted.png','images/captures/windows/desktop-offline.png','raw-receipt.json','images/captures/desktop-linux.webm','images/captures/windows/unapproved.png','images/captures/windows/provenance.json','images/captures/preview/inventory.json','images/captures/preview/verification-summary.json','publication.mjs','wiki/Home.md'])await assert.rejects(fs.access(path.join(output,file)));
 await fs.access(path.join(output,'images/captures/windows/desktop-locked.png'));await fs.access(path.join(output,'gallery-inventory.json'));
 const html=await fs.readFile(path.join(output,'index.html'),'utf8');assert.ok(!html.includes('desktop-mounted.png'));assert.ok(!html.includes('desktop-offline.png'));
 const inventory=JSON.parse(await fs.readFile(path.join(output,'gallery-inventory.json'),'utf8'));assert.deepEqual(inventory.records.map(r=>r.path).sort(),approvedPaths);assert.deepEqual(inventory.withheld,reviewed.withheld);
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


test('public projection drops all unknown fields and validates explicit provenance',async()=>{
 const [record]=await galleryRecords(root);
 const projected=projectGalleryRecord({...record,rawReceipt:{secret:'PRIVATE_MARKER'},machinePath:'PRIVATE_MARKER',processIdentity:'PRIVATE_MARKER',approval:'approved'});
 assert.equal(JSON.stringify(projected).includes('PRIVATE_MARKER'),false);
 assert.equal('approval' in projected,false);
 assert.throws(()=>projectGalleryRecord({...record,historical:false}),/promotion receipt/);
 assert.throws(()=>projectGalleryRecord({...record,artifactSha256:'invalid'}),/provenance hash/);
 assert.throws(()=>projectGalleryRecord({...record,viewportWidth:320}),/viewport/);
});

test('review inventory rejects extra bindings, overlapping exclusions and duplicate workflows',()=>{
 for(const mutate of [r=>r.reviewedBindings['images/captures/unknown.png']={},r=>r.withheld[0].path=r.approvedOriginals[0],r=>r.workflows.push(r.workflows[0]),r=>r.approvedOriginals.push(r.approvedOriginals[0])]){
  const copy=structuredClone(reviewed);mutate(copy);assert.throws(()=>validateGalleryReview(copy),/Invalid|differ/);
 }
});

test('445 approved occurrence records keep exact provenance while identical bytes render once',async()=>{
 const [base]=await galleryRecords(root);
 const records=Array.from({length:445},(_,i)=>({...base,id:'synthetic-'+i,path:`images/captures/synthetic-${i}.png`,workflow:reviewed.workflows[i%reviewed.workflows.length].id,sourceCommit:String(i).padStart(40,'0')}));
 const groups=groupGalleryRecords(records,reviewed.workflows);
 assert.equal(groups.flatMap(g=>g.images).length,1);
 assert.deepEqual(groups[0].images[0].occurrences,records);
 const html=renderGallery(records,reviewed);
 assert.equal([...html.matchAll(/<img /g)].length,1);
 assert.equal([...html.matchAll(/class="capture-occurrence"/g)].length,445);
 for(const record of records){assert.ok(html.includes(`id="occurrence-${record.id}"`));assert.ok(html.includes(`href="${record.path}"`));assert.ok(html.includes(record.sourceCommit));}
 assert.ok(html.includes('loading="lazy"'));assert.ok(html.includes('decoding="async"'));
 assert.ok(!html.includes('<section class="guide" id="withheld"'));
 assert.throws(()=>groupGalleryRecords([base,{...base,width:base.width+1}],reviewed.workflows),/dimensions differ/);
 const distinct=groupGalleryRecords([base,{...base,id:'different',sha256:'f'.repeat(64)}],reviewed.workflows);
 assert.equal(distinct.flatMap(g=>g.images).length,2);
});

test('search hides empty workflow groups and their links, and restores them on clear',async()=>{
 const {updateGalleryGroups}=await import('../docs/site/preferences.js');
 const figures=[{hidden:true},{hidden:false}];
 const groups=figures.map((figure,i)=>({id:'group-'+i,hidden:false,querySelectorAll:()=>[figure]}));
 const links=groups.map(g=>({hidden:false,dataset:{galleryGroupLink:g.id}}));
 updateGalleryGroups(groups,links);
 assert.deepEqual(groups.map(g=>g.hidden),[true,false]);assert.deepEqual(links.map(l=>l.hidden),[true,false]);
 figures[0].hidden=false;updateGalleryGroups(groups,links);assert.ok(groups.every(g=>!g.hidden)&&links.every(l=>!l.hidden));
 figures.forEach(f=>f.hidden=true);updateGalleryGroups(groups,links);assert.ok(groups.every(g=>g.hidden)&&links.every(l=>l.hidden));
});

test('gallery additions cannot publish unreviewed metadata or raw receipt fields',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-gallery-review-'));
 try{
  await fs.cp(path.join(root,'docs/images'),path.join(temp,'docs/images'),{recursive:true});
  await fs.mkdir(path.join(temp,'docs/site'),{recursive:true});
  const original=JSON.parse(await fs.readFile('docs/site/gallery-additions.json','utf8'));
  const [base]=await galleryRecords(root);
  const addition={...base,id:'new-approved',path:'images/captures/new-approved.png',historical:false,promotionReceiptSha256:'a'.repeat(64),approval:'approved',privacy:'public-safe',inspectionStatus:'inspected',rawReceipt:{private:'PRIVATE_MARKER'}};
  await fs.copyFile(path.join(temp,'docs',base.path),path.join(temp,'docs',addition.path));
  const review=structuredClone(reviewed);review.approvedOriginals.push(addition.path);review.reviewedBindings[addition.path]={sourceCommit:addition.sourceCommit,sha256:addition.sha256,workflow:addition.workflow};
  await fs.writeFile(path.join(temp,'docs/site/gallery-additions.json'),JSON.stringify({...original,records:[addition]}));
  await fs.writeFile(path.join(temp,'docs/site/gallery-review.json'),JSON.stringify(review));
  await assert.rejects(galleryRecords(temp),/metadata differs/);
  const {createHash}=await import('node:crypto');review.reviewedBindings[addition.path].metadataSha256=createHash('sha256').update(JSON.stringify(projectGalleryRecord(addition))).digest('hex');
  await fs.writeFile(path.join(temp,'docs/site/gallery-review.json'),JSON.stringify(review));
  const records=await galleryRecords(temp);assert.equal(records.length,approvedPaths.length+1);assert.equal(JSON.stringify(records).includes('PRIVATE_MARKER'),false);
  addition.scope='Changed after review';await fs.writeFile(path.join(temp,'docs/site/gallery-additions.json'),JSON.stringify({...original,records:[addition]}));await assert.rejects(galleryRecords(temp),/metadata differs/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});


test('gallery source remains valid UTF-8 without replacement characters',async()=>{
 const decoder=new TextDecoder('utf-8',{fatal:true});
 for(const file of ['publication.mjs','locales.js','preferences.js','site.js']){
  const source=decoder.decode(await fs.readFile('docs/site/'+file));assert.equal(source.includes('\uFFFD'),false,file);
 }
});


test('public projection rejects nested objects and arrays in every scalar field',async()=>{
 const [base]=await galleryRecords(root);
 for(const key of ['id','path','sourceCommit','sha256','state','theme','method','scope','workflow','width','height','scale','capturedAt','timeZone','historical','artifactSha256','promotionReceiptSha256','viewportWidth','viewportHeight'])for(const value of [{nested:'SYNTHETIC_MARKER'},['SYNTHETIC_MARKER']]){
  assert.throws(()=>projectGalleryRecord({...base,[key]:value}),/Invalid|Missing/,key);
 }
 assert.throws(()=>projectGalleryRecord({...base,capturedAt:'2026-10-10T00:00:00Z',timeZone:{nested:'SYNTHETIC_MARKER'}}),/time provenance/);
 assert.throws(()=>projectGalleryRecord({...base,capturedAt:'2026-10-10T00:00:00Z',timeZone:'Not/A_Timezone'}),/timezone/);
 for(const key of ['artifactSha256','promotionReceiptSha256'])assert.throws(()=>projectGalleryRecord({...base,[key]:['a'.repeat(64)]}),/provenance hash/);
});
