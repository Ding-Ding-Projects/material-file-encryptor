import {publicImages,stagePublicImages} from '../docs/site/public-images.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {renderReadmeFlowchart} from '../docs/site/readme-flowchart.mjs';import {renderMarkdown,buildDocumentation} from '../docs/site/publication.mjs';import {stagePublicProofs,publicProofs} from '../docs/site/public-proofs.mjs';
test('all three README flowcharts preserve declared nodes and arrows as accessible local SVG',async()=>{
 const readme=(await fs.readFile('README.md','utf8')).replaceAll('\r\n','\n'),graphs=[...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m=>m[1]);assert.equal(graphs.length,3);
 const expectedEdges=[['Desktop>Main','Main>Host','Explorer>Driver','Driver>Host','Host>Core','Core>Cache','Core>Backing','Backing>Provider'],['Write>Encrypt','Encrypt>Durable','Durable>Close','Close>Pack','Pack>Queue','Queue>Backing','Durable>Read','Read>Verify','Verify>Plain'],['Source>Build','Build>Package','Package>Bytes','Bytes>Install','Install>Runtime','Runtime>Evidence','Evidence>Release']];
 for(const [i,graph]of graphs.entries()){const svg=renderReadmeFlowchart(graph,i),nodes=new Set([...graph.matchAll(/([A-Za-z][A-Za-z0-9_]*)\["/g)].map(m=>m[1]));assert.equal((svg.match(/data-node=/g)||[]).length,nodes.size);for(const node of nodes)assert.ok(svg.includes(`data-node="${node}"`));assert.equal((svg.match(/class="diagram-edge"/g)||[]).length,(graph.match(/-->/g)||[]).length);assert.deepEqual([...svg.matchAll(/data-from="([^"]+)" data-to="([^"]+)"/g)].map(m=>m[1]+'>'+m[2]),expectedEdges[i]);assert.match(svg,/role="img" aria-labelledby=/);assert.match(svg,/<desc /);assert.match(svg,/tabindex="0" role="region" aria-label="Scrollable flowchart"/);assert.ok(svg.includes('Diagram source'));assert.ok(!/(?:href|src)="https?:/.test(svg));}
 const architecture=renderReadmeFlowchart(graphs[0]);const x=id=>Number(new RegExp('<g data-node="'+id+'"><rect[^>]* x="([0-9]+)"').exec(architecture)[1]);assert.equal(x('Host')-(x('Main')+260),180);assert.ok(architecture.includes('Private pipe'));const workflow=renderReadmeFlowchart(graphs[1]);assert.ok(workflow.includes('x="12" y="152" width="260"'));
 const output=renderMarkdown(readme,'README.md',new Map(),'../',new Map(publicImages.map(image=>[image.source,image])));assert.equal((output.match(/<svg /g)||[]).length,3);const css=await fs.readFile('docs/site/site.css','utf8');assert.match(css,/\.diagram-scroll\{max-width:100%;overflow:auto/);assert.match(css,/max-width:none/);assert.match(css,/font-size:18px/);
});
test('README diagram subset rejects unsupported directives cycles missing nodes and hostile syntax',()=>{
 for(const graph of ['flowchart XX\nA["A"] --> B["B"]','flowchart LR\nclick A "https://example.com"','flowchart LR\nA["A"] --> B["B"]\nB --> A','flowchart TD\nA["A"] --> B','flowchart LR\nA["A"] --> A','flowchart LR\nA["A"] --> B["B"]\nA --> B'])assert.throws(()=>renderReadmeFlowchart(graph),/UNSUPPORTED_README_FLOWCHART_SYNTAX/);
 const escaped=renderReadmeFlowchart('flowchart LR\nA["<script>"] --> B["Done"]');assert.ok(escaped.includes('&lt;script&gt;'));assert.ok(!escaped.includes('<script>'));
});
test('reviewed public proof allowlist rejects content changes and never copies neighboring evidence',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-reviewed-proof-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));await fs.mkdir(path.join(temp,'docs/evidence'),{recursive:true});const source=publicProofs[0].source,bytes=await fs.readFile(source);for(const proof of publicProofs)await fs.writeFile(path.join(temp,proof.source),await fs.readFile(proof.source));await fs.writeFile(path.join(temp,'docs/evidence/private-neighbor.json'),'private');const output=path.join(temp,'output');await stagePublicProofs(temp,output);assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,source),'utf8')),JSON.parse(bytes));await assert.rejects(fs.access(path.join(output,'docs/evidence/private-neighbor.json')));await fs.writeFile(path.join(temp,source),bytes.toString().replace('994','993'));await assert.rejects(stagePublicProofs(temp,output),/PUBLIC_PROOF_NOT_REVIEWED/);await fs.writeFile(path.join(temp,source),'x'.repeat(16385));await assert.rejects(stagePublicProofs(temp,output),/PUBLIC_PROOF_NOT_REVIEWED/);
});
test('actual documentation publication contains README SVGs and self-contained proof links',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-readme-publication-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));await buildDocumentation(process.cwd(),output,await fs.readFile('docs/site/index.html','utf8'));const html=await fs.readFile(path.join(output,'articles/README.html'),'utf8');assert.equal((html.match(/<figure class="documentation-diagram"/g)||[]).length,3);assert.ok(html.includes('href="../docs/evidence/main-performance-20261012.json"'));assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'docs/evidence/main-performance-20261012.json'),'utf8')),JSON.parse(await fs.readFile('docs/evidence/main-performance-20261012.json','utf8')));assert.ok((await fs.readFile(path.join(output,'library.html'),'utf8')).includes('articles/README.html'));
});

test('diagram roots retain native dimensions while ordinary SVG icons keep their 24px rule',async()=>{
 const readme=(await fs.readFile('README.md','utf8')).replaceAll('\r\n','\n'),graphs=[...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(match=>match[1]);
 const diagrams=graphs.map((graph,index)=>renderReadmeFlowchart(graph,index));
 const css=await fs.readFile('docs/site/site.css','utf8');
 const check=(styles,images)=>{
  const generic=styles.match(/(?:^|\})\s*svg\s*\{([^}]*)\}/)?.[1];assert.ok(generic,'shared SVG paint rule');
  assert.doesNotMatch(generic,/(?:^|;)\s*(?:width|height)\s*:/,'generic paint must not impose icon dimensions');
  assert.match(styles,/svg:not\(\.documentation-flowchart\)\{width:24px;height:24px\}/);
  const expected=[[2484,250],[604,950],[3364,110]];assert.equal(images.length,expected.length);
  images.forEach((html,index)=>{const opening=html.match(/<svg\b[^>]*>/)?.[0];assert.ok(opening);assert.match(opening,/class="documentation-flowchart"/);assert.doesNotMatch(opening,/\sstyle=/);const [width,height]=expected[index];assert.ok(opening.includes(`width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`));assert.match(html,/class="diagram-scroll" tabindex="0" role="region" aria-label="Scrollable flowchart"/);});
  assert.match(styles,/\.diagram-scroll\{max-width:100%;overflow:auto/);assert.match(styles,/\.diagram-scroll svg\{[^}]*max-width:none/);
 };
 check(css,diagrams);
 // Source-level negative regressions, not browser geometry evidence.
 assert.throws(()=>check(css.replace('svg{','svg{width:24px;height:24px;'),diagrams));
 assert.throws(()=>check(css.replace('svg:not(.documentation-flowchart)','svg'),diagrams));
 assert.throws(()=>check(css,diagrams.map(html=>html.replace('class="documentation-flowchart"',''))));
 assert.throws(()=>check(css,diagrams.map(html=>html.replace('width="2484"','width="24"'))));
});

test('diagram labels have no inherited stroke and end panning retains the full terminal node',async()=>{
 const css=await fs.readFile('docs/site/site.css','utf8'),readme=(await fs.readFile('README.md','utf8')).replaceAll('\r\n','\n');
 const diagrams=[...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m,i)=>renderReadmeFlowchart(m[1],i));
 const paint=styles=>{assert.match(styles,/\.documentation-flowchart :is\(text,tspan\)\{stroke:none\}/);assert.match(styles,/\.diagram-edge\{[^}]*stroke:var\(--primary/);assert.match(styles,/\.diagram-node\{[^}]*stroke:var\(--outline/);assert.match(styles,/\.diagram-scroll svg\{[^}]*font-size:18px/);};
 const geometry=html=>{
  const [,w,h]=html.match(/<svg[^>]* width="(\d+)" height="(\d+)"/),width=Number(w),height=Number(h);
  const nodes=[...html.matchAll(/<rect class="diagram-node" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map(m=>({x:+m[1],y:+m[2],w:+m[3],h:+m[4]}));
  assert.ok(nodes.length>0);const right=Math.max(...nodes.map(n=>n.x+n.w)),bottom=Math.max(...nodes.map(n=>n.y+n.h));
  assert.equal(Math.min(...nodes.map(n=>n.x)),12);assert.equal(Math.min(...nodes.map(n=>n.y)),12);assert.equal(width-right,12);assert.equal(height-bottom,12);
  for(const node of nodes.filter(n=>n.x+n.w===right)){const leftAtEnd=node.x-(width-279);assert.ok(leftAtEnd>=0);assert.ok(leftAtEnd+node.w<=279);}
  for(const m of html.matchAll(/class="diagram-edge" d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/g)){assert.ok(+m[1]>=0&&+m[3]<=width);assert.ok(+m[2]>=0&&+m[4]<=height);}
 };
 paint(css);diagrams.forEach(geometry);
 assert.throws(()=>paint(css.replace('stroke:none}','stroke:currentColor}')));
 assert.throws(()=>geometry(diagrams[0].replace('width="2484" height="250"','width="2680" height="250"')));
});


test('reviewed image staging preserves exact bytes and excludes neighboring files',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-reviewed-images-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 await fs.mkdir(path.join(temp,'docs/images/captures'),{recursive:true});
 for(const image of publicImages)await fs.copyFile(image.source,path.join(temp,image.source));
 await fs.writeFile(path.join(temp,'docs/images/captures/private-neighbor.png'),'private');
 const output=path.join(temp,'output');const images=await stagePublicImages(temp,output);assert.equal(images.size,2);
 for(const image of publicImages)assert.deepEqual(await fs.readFile(path.join(output,image.route)),await fs.readFile(image.source));
 await assert.rejects(fs.access(path.join(output,'images/captures/private-neighbor.png')));
 const changed=await fs.readFile(path.join(temp,publicImages[0].source));changed[changed.length-1]^=1;await fs.writeFile(path.join(temp,publicImages[0].source),changed);
 await assert.rejects(stagePublicImages(temp,path.join(temp,'changed')),/PUBLIC_IMAGE_NOT_REVIEWED/);
 await fs.writeFile(path.join(temp,publicImages[0].source),changed.subarray(0,24));
 await assert.rejects(stagePublicImages(temp,path.join(temp,'short')),/PUBLIC_IMAGE_NOT_REVIEWED/);
});

test('actual README publishes only registered image routes with reviewed dimensions and escaped alt text',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-readme-images-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 await buildDocumentation(process.cwd(),output,await fs.readFile('docs/site/index.html','utf8'));
 const html=await fs.readFile(path.join(output,'articles/README.html'),'utf8');
 for(const image of publicImages){assert.ok(html.includes('src="../'+image.route+'"'));assert.ok(html.includes('width="'+image.width+'" height="'+image.height+'"'));assert.deepEqual(await fs.readFile(path.join(output,image.route)),await fs.readFile(image.source));}
 const escaped=renderMarkdown('![<unsafe>](docs/images/captures/site-guidance-normal-83e14d86.png)','README.md',new Map(),'../',new Map(publicImages.map(image=>[image.source,image])));assert.match(escaped,/alt="&lt;unsafe&gt;"/);
});


test('reviewed images reject linked source directories without copying outside bytes',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-linked-images-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const outside=path.join(temp,'outside');await fs.mkdir(outside);await fs.mkdir(path.join(temp,'root/docs/images'),{recursive:true});
 for(const image of publicImages)await fs.copyFile(image.source,path.join(outside,path.basename(image.source)));
 await fs.symlink(outside,path.join(temp,'root/docs/images/captures'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(stagePublicImages(path.join(temp,'root'),path.join(temp,'output')),/PUBLIC_IMAGE_NOT_REVIEWED/);
 await assert.rejects(fs.access(path.join(temp,'output')));
});
