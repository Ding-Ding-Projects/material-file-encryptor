import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const repository='https://github.com/Ding-Ding-Projects/material-file-encryptor';
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const slug=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
export const route=source=>`articles/${source.replace(/\.md$/i,'').replaceAll('/','--')}.html`;

export function renderMarkdown(markdown,source,routeMap,prefix='../') {
 const headings=new Map();
 const inline=text=>{
  const tokens=[];
  const save=html=>`\u0000${tokens.push(html)-1}\u0000`;
  let value=text.replace(/`([^`]+)`/g,(_,code)=>save(`<code>${escapeHtml(code)}</code>`));
  value=value.replace(/(!?)\[([^\]]+)\]\(([^\s)]+)\)/g,(_,image,label,url)=>{
   if(/^[a-z][a-z0-9+.-]*:/i.test(url)&&! /^(https?:|mailto:)/i.test(url))throw new Error('Unsupported documentation URL');
   let target=url;
   if(!/^(?:https?:|mailto:|#)/i.test(url)) {
    const [file,anchor]=url.split('#');const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(source),file));
    target=routeMap.has(resolved)?prefix+routeMap.get(resolved)+(anchor?'#'+anchor:''):`${repository}/blob/main/${resolved}`;
   }
   if(!/^(?:https?:|mailto:|#|\.\.\/articles\/|articles\/)/i.test(target)) throw new Error('Unsupported documentation URL');
   if(image) throw new Error('Documentation image needs an explicit local asset entry');
   return save(`<a href="${escapeHtml(target)}">${escapeHtml(label)}</a>`);
  });
  value=escapeHtml(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return value.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[Number(i)]);
 };
 const lines=markdown.replaceAll('\r\n','\n').split('\n');let output='',paragraph=[],list=null;
 const flush=()=>{if(paragraph.length){output+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}if(list){output+=`</${list}>`;list=null;}};
 for(let i=0;i<lines.length;i++) {
  const line=lines[i];
  if(line.startsWith('```')){flush();const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);if(i===lines.length)throw new Error('Unclosed documentation fence');output+=`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;continue;}
  const heading=/^(#{1,6})\s+(.+)$/.exec(line);
  if(heading){flush();const base=slug(heading[2]),count=headings.get(base)||0;headings.set(base,count+1);const id=base+(count?'-'+count:'');const level=Math.min(6,heading[1].length+1);output+=`<h${level} id="${id}">${inline(heading[2])}<a class="heading-link" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;continue;}
  if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')) {
   flush();const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
   output+='<div class="table-scroll" tabindex="0" role="region" aria-label="Documentation table"><table><thead><tr>'+cells(line).map(cell=>`<th>${inline(cell)}</th>`).join('')+'</tr></thead><tbody>';i++;
   while(i+1<lines.length&&lines[i+1].includes('|'))output+='<tr>'+cells(lines[++i]).map(cell=>`<td>${inline(cell)}</td>`).join('')+'</tr>';
   output+='</tbody></table></div>';continue;
  }
  const item=/^\s*(?:([-*+])|\d+\.)\s+(.+)$/.exec(line);
  if(item){if(paragraph.length)flush();const kind=item[1]?'ul':'ol';if(list!==kind){flush();output+=`<${kind}>`;list=kind;}output+=`<li>${inline(item[2])}</li>`;continue;}
  if(!line.trim()){flush();continue;}
  if(list)flush();paragraph.push(line.replace(/^>\s?/,''));
 }
 flush();return output;
}

export function pageShell(home,title,body,{depth=0,search=true}={}) {
 const prefix=depth?'../':'./';
 const header=home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
 const footer=home.match(/<footer class="container site-footer">[\s\S]*?<\/footer>/)[0];
 const dialog=home.match(/<dialog id="preferences-dialog"[\s\S]*?<\/dialog>/)[0];
 const navigation=(header+footer).replace(/href="#([^\"]+)"/g,(_,anchor)=>`href="${prefix}index.html#${anchor}"`);
 const linkedNavigation=navigation.replace(/href="(library|wiki|gallery)\.html"/g,(_,name)=>`href="${prefix}${name}.html"`);
 const split=linkedNavigation.indexOf('<footer');
 const searchBox=`<div class="search-wrap publication-search" ${search?'':'hidden'}><label for="doc-search">Find in this page</label><div class="search-field"><input id="doc-search" type="search" maxlength="160" autocomplete="off"><button id="search-clear" type="button" aria-label="Clear documentation search" hidden>×</button></div><p id="search-status" class="small" role="status"></p></div>`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} · Material File Encryptor</title><meta name="description" content="Complete product documentation and source-bound capture records."><link rel="icon" href="${prefix}favicon.svg"><link rel="stylesheet" href="${prefix}site.css"><script type="module" src="${prefix}site.js"></script></head><body><a class="skip-link" href="#main">Skip to content</a>${linkedNavigation.slice(0,split)}<main id="main" class="container publication"><nav class="publication-nav" aria-label="Documentation navigation"><a href="${prefix}index.html">Home</a><a href="${prefix}library.html">Documentation library</a><a href="${prefix}wiki.html">Wiki</a><a href="${prefix}gallery.html">Capture gallery</a></nav>${searchBox}${body}<p id="no-results" class="no-results" hidden>No entries match this search.</p></main>${linkedNavigation.slice(split)}${dialog}</body></html>`;
}

async function markdownFiles(directory) {
 const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await markdownFiles(file));else if(entry.name.endsWith('.md'))result.push(file);
 }return result;
}

export async function buildDocumentation(root,output,home) {
 const catalog=JSON.parse(await fs.readFile(path.join(root,'docs/site/content-catalog.json'),'utf8'));
 if(catalog.version!==1||!Array.isArray(catalog.articles)||new Set(catalog.articles).size!==catalog.articles.length||catalog.articles.some(file=>!/^docs\/features\/[a-z0-9/-]+\.md$/i.test(file)&&file!=='DESIGN.md'))throw new Error('Invalid documentation catalogue');
 if(!/^[a-f0-9]{40}$/.test(catalog.wiki.sourceCommit)||catalog.wiki.source!==repository+'/wiki'||catalog.wiki.files.some(file=>!/^[-a-z0-9]+\.md$/i.test(file)))throw new Error('Invalid wiki provenance');
 const actual=(await markdownFiles(path.join(root,'docs/features'))).map(file=>path.relative(root,file).replaceAll('\\','/')).sort();
 const expected=catalog.articles.filter(file=>file.startsWith('docs/features/')).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Documentation inventory differs from feature articles');
 const wikiFiles=(await markdownFiles(path.join(root,'docs/site/wiki'))).map(file=>path.basename(file)).sort();
 if(JSON.stringify(wikiFiles)!==JSON.stringify([...catalog.wiki.files].sort()))throw new Error('Wiki snapshot inventory differs');
 const routes=new Map(catalog.articles.map(source=>[source,route(source)]));
 for(const file of wikiFiles)routes.set('docs/site/wiki/'+file,route('wiki/'+file));
 const articles=[];
 for(const [source,url]of routes){const markdown=await fs.readFile(path.join(root,source),'utf8');articles.push({source,url,markdown,title:/^#\s+(.+)$/m.exec(markdown)?.[1]||path.basename(source,'.md'),sha256:digest(markdown),category:source.startsWith('docs/features/')?source.split('/')[2]:'reference'});}
 await fs.mkdir(path.join(output,'articles'),{recursive:true});await fs.mkdir(path.join(output,'categories'),{recursive:true});
 const links=(list,prefix='')=>`<ul class="article-links">${list.map(a=>`<li><a href="${prefix}${a.url}">${escapeHtml(a.title)}</a></li>`).join('')}</ul>`;
 for(const article of articles){const related=articles.filter(a=>a!==article&&a.category===article.category);const body=`<article class="guide documentation-article" id="article" data-search="${escapeHtml(article.title)}"><p class="eyebrow">Complete source article</p>${renderMarkdown(article.markdown,article.source,routes)}<p class="small source-reference">Source: <a href="${article.source.startsWith('docs/site/wiki/')?catalog.wiki.source+'/'+path.basename(article.source,'.md'):repository+'/blob/main/'+article.source}">${escapeHtml(article.source.startsWith('docs/site/wiki/')?'Wiki '+path.basename(article.source,'.md'):article.source)}</a> · SHA-256 <code>${article.sha256}</code></p><nav aria-label="Suggested articles"><h2>Suggested articles</h2>${links(related.length?related:articles.filter(a=>a!==article).slice(0,3),'../')}<a href="../library.html">All documentation categories</a></nav></article>`;await fs.writeFile(path.join(output,article.url),pageShell(home,article.title,body,{depth:1}));}
 let categories='';
 for(const category of catalog.categories){const list=articles.filter(a=>a.category===category);if(!list.length)throw new Error('Empty documentation category');const name=category[0].toUpperCase()+category.slice(1);categories+=`<section class="guide category-index" id="category-${category}" data-search="${category}"><h2><a href="categories/${category}.html">${name}</a></h2>${links(list)}</section>`;await fs.writeFile(path.join(output,'categories',category+'.html'),pageShell(home,name+' documentation',`<section class="guide category-index" id="category-${category}"><h1>${name} documentation</h1>${links(list,'../')}</section>`,{depth:1}));}
 await fs.writeFile(path.join(output,'library.html'),pageShell(home,'Documentation library',`<h1>Documentation library</h1><p>Complete articles are available here without leaving this website. Commands and source articles retain their original language. This website documents the separate Windows application; it cannot open a vault.</p>${categories}<section class="guide" id="references"><h2>Project reference and wiki</h2>${links(articles.filter(a=>a.category==='reference'||a.source==='docs/features/README.md'))}</section>`));
 const wiki=articles.filter(a=>a.source.startsWith('docs/site/wiki/'));
 await fs.writeFile(path.join(output,'wiki.html'),pageShell(home,'Wiki',`<h1>Wiki</h1><p>The complete ${wiki.length}-page Markdown snapshot from wiki revision <code>${catalog.wiki.sourceCommit}</code> is included below. Earlier access was unavailable; the subsequent Git CLI read succeeded.</p>${wiki.map(a=>`<section class="guide documentation-article" id="wiki-${slug(a.title)}"><h2>${escapeHtml(a.title)}</h2>${renderMarkdown(a.markdown,a.source,routes,'').replace(/id="([^"]+)"/g,(_,id)=>`id="wiki-${slug(a.title)}-${id}"`).replace(/href="#([^"]+)"/g,(_,id)=>`href="#wiki-${slug(a.title)}-${id}"`)}<a href="${a.url}">Open this wiki article</a></section>`).join('')}`));
 await fs.writeFile(path.join(output,'documentation-inventory.json'),JSON.stringify({version:1,articles:articles.map(({markdown,...a})=>a),wiki:catalog.wiki,categories:catalog.categories},null,2));
 return articles;
}

export async function galleryRecords(root) {
 const linux=JSON.parse(await fs.readFile(path.join(root,'docs/images/captures/provenance.json'),'utf8'));
 const windows=JSON.parse(await fs.readFile(path.join(root,'docs/images/captures/windows/provenance.json'),'utf8'));
 const preview=JSON.parse(await fs.readFile(path.join(root,'docs/images/captures/preview/inventory.json'),'utf8'));
 const extra=JSON.parse(await fs.readFile(path.join(root,'docs/site/gallery-additions.json'),'utf8'));
 const records=[];
 for(const [inventory,folder,platform]of [[linux,'','Linux'],[windows,'windows/','Windows']])for(const image of inventory.images)records.push({id:platform.toLowerCase()+'-'+image.state,path:'images/captures/'+folder+image.file,sourceCommit:inventory.sourceCommit,sha256:image.sha256,width:image.width,height:image.height,state:image.state,theme:image.theme,scale:image.scale,capturedAt:null,timeZone:null,method:'Actual application renderer capture on '+platform,scope:platform==='Linux'?'Historical interface-only evidence; no Windows mount proof.':'Historical packaged renderer evidence; native drive and installer verdicts are separate.',historical:true});
 for(const image of preview.records)records.push({id:image.id,path:image.path.replace(/^docs\//,''),sourceCommit:image.sourceCommit,sha256:image.captureSha256,width:image.width,height:image.height,state:image.state,theme:image.theme,scale:image.scale,capturedAt:image.capturedAt,timeZone:image.timeZone,method:'Packaged Windows application, CDP renderer capture',scope:'Recorded renderer scale; physical Windows display scaling is not established by this image.',historical:true});
 for(const image of extra.records){if(image.approval!=='approved'||image.privacy!=='public-safe'||image.inspectionStatus!=='inspected')throw new Error('Unapproved gallery addition');records.push(image);}
 const ids=new Set();for(const record of records){
  if(ids.has(record.id)||!/^[a-z0-9-]+$/.test(record.id))throw new Error('Invalid gallery identity');ids.add(record.id);
  if(!/^images\/captures\/[A-Za-z0-9_./-]+\.png$/.test(record.path)||record.path.split('/').includes('..'))throw new Error('Invalid gallery asset');
  if(!/^[a-f0-9]{40}$/.test(record.sourceCommit)||!/^[a-f0-9]{64}$/.test(record.sha256))throw new Error('Missing gallery source/hash');
  if(typeof record.theme!=='string'||!record.theme||typeof record.state!=='string'||!record.state||typeof record.method!=='string'||!record.method||typeof record.scope!=='string'||!record.scope||!Number.isInteger(record.width)||record.width<1||!Number.isInteger(record.height)||record.height<1||!Number.isFinite(record.scale)||record.scale<=0)throw new Error('Missing gallery method/scope');
  if(record.capturedAt===null&&record.timeZone!==null)throw new Error('Capture timezone without timestamp');
  if(record.capturedAt!==null&&(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(record.capturedAt)||!Number.isFinite(Date.parse(record.capturedAt))||!record.timeZone))throw new Error('Invalid capture time provenance');
  const bytes=await fs.readFile(path.join(root,'docs',record.path));if(digest(bytes)!==record.sha256)throw new Error('Gallery image hash mismatch');
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==record.width||bytes.readUInt32BE(20)!==record.height)throw new Error('Gallery image dimensions mismatch');
 }return records;
}

export async function buildGallery(root,output,home) {
 const records=await galleryRecords(root);
 const figures=records.map(r=>`<figure class="guide" id="capture-${r.id}" data-search="${escapeHtml(r.state+' '+r.theme+' '+r.method)}"><a href="${r.path}"><img src="${r.path}" alt="${escapeHtml(r.state+' · '+r.method)}" width="${r.width}" height="${r.height}" loading="lazy"></a><figcaption><h2>${escapeHtml(r.state.replaceAll('-',' '))}</h2><p>${escapeHtml(r.method)}</p><p>${escapeHtml(r.scope)}</p><dl><dt>Source revision</dt><dd><a href="${repository}/commit/${r.sourceCommit}"><code>${r.sourceCommit}</code></a></dd><dt>Image dimensions</dt><dd>${r.width} × ${r.height} pixels</dd><dt>Theme / recorded scale</dt><dd>${escapeHtml(r.theme)} / ${r.scale}</dd><dt>Actual capture time</dt><dd>${r.capturedAt?`<time datetime="${r.capturedAt}">${escapeHtml(r.capturedAt)} (${escapeHtml(r.timeZone)})</time>`:'Unavailable in the original per-image provenance.'}</dd><dt>Original image SHA-256</dt><dd><code>${r.sha256}</code></dd></dl><p class="small">${r.historical?'Historical source-bound image; not proof of a later build.':'Reviewed source-bound image; verification scope is stated above.'}</p><a href="${r.path}">Open original image</a></figcaption></figure>`).join('');
 await fs.writeFile(path.join(output,'gallery.html'),pageShell(home,'Capture gallery',`<h1>Capture gallery</h1><p>Original application images with exact source, dimensions, method and recorded time provenance. Native operation, renderer emulation and physical display scaling are different claims. Missing timestamps stay unavailable.</p><p class="development-note">New candidate images remain pending review and approval. They are not silently added to this historical catalogue.</p><div class="capture-gallery publication-gallery">${figures}</div>`));
 await fs.writeFile(path.join(output,'gallery-inventory.json'),JSON.stringify({version:1,records},null,2));return records;
}
