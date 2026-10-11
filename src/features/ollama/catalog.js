import { createHash } from 'node:crypto';
const ORIGIN='https://ollama.com';
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const plain=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
export function parsePage(html, url, family=null) {
  const links=[...html.matchAll(/href=["']([^"']+)["']/g)].map(m=>decode(m[1]));
  const families=[...new Set(links.filter(p=>/^\/library\/[a-zA-Z0-9._-]+$/.test(p)).map(p=>p.slice(9)))];
  const familyMetadata={};
  for(const m of html.matchAll(/<a\b[^>]*href=["']\/library\/([a-zA-Z0-9._-]+)["'][^>]*>([\s\S]*?)<\/a>/g)){
    const body=m[2],description=plain(body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1]||'');
    const spans=[...body.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(s=>plain(s[1]));
    familyMetadata[m[1]]={description,capabilities:spans.filter(s=>['vision','tools','embedding','thinking','audio','cloud'].includes(s))};
  }
  const tags=[]; const seen=new Set();
  for(const m of html.matchAll(/<a\b[^>]*href=["'](\/library\/([^"'?]+:[^"'?]+))["'][^>]*>([\s\S]*?)<\/a>/g)) {
    const tag=decode(m[2]);if(family && !tag.startsWith(family+':'))continue;if(seen.has(tag))continue;seen.add(tag);
    // Only metadata inside this tag's anchor belongs to this variant. Adjacent
    // variants may have values even when this one deliberately omits them.
    const fragment=plain(m[3]);
    const size=fragment.match(/\b(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\b/i), context=fragment.match(/\b(\d+(?:\.\d+)?)\s*([KM]?)\s+context/i);
    tags.push({tag,family:tag.split(':')[0],variant:tag.split(':')[1],sizeBytes:size?Number(size[1])*({KB:1e3,MB:1e6,GB:1e9,TB:1e12}[size[2].toUpperCase()]):null,contextLength:context?Number(context[1])*({K:1000,M:1e6,'':1}[context[2].toUpperCase()]):null,description:plain(m[3]),capabilities:[],quantization:null,parameterCount:null,source:ORIGIN+m[1]});
  }
  const next=[...new Set(links.filter(p=>/[?&](?:page|cursor|after)=/.test(p)).map(p=>new URL(p,url).href))];
  return {families,familyMetadata,tags,next,identity:createHash('sha256').update(html).digest('hex')};
}
export class OfficialCatalog {
  constructor({fetchImpl=fetch,now=()=>new Date().toISOString()}={}) {this.fetch=fetchImpl;this.now=now;}
  async refresh(previous=null,{signal}={}) {
    const pages=[],variants=new Map(),families=new Set(),visited=new Set(),metadata={};
    const read=async(url,family)=>{
      const parsed=new URL(url);if(parsed.origin!==ORIGIN || !/^\/library(?:\/[a-zA-Z0-9._-]+(?:\/tags)?)?$/.test(parsed.pathname))throw new Error('Catalog link left the official catalog boundary.');
      if(visited.has(url))return null;if(visited.size>=4096)throw new Error('Catalog pagination limit reached; refresh is incomplete.');visited.add(url);
      const response=await this.fetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`Official catalog returned HTTP ${response.status}.`);
      const reader=response.body.getReader(),decoder=new TextDecoder();let html='',bytes=0;try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>8*1024*1024)throw new Error('Catalog page exceeded its limit.');html+=decoder.decode(p.value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
      const page=parsePage(html,url,family);pages.push({url,sha256:page.identity});return page;
    };
    try {
      const queue=[ORIGIN+'/library'];while(queue.length){const page=await read(queue.shift());if(!page)continue;page.families.forEach(f=>families.add(f));Object.assign(metadata,page.familyMetadata);queue.push(...page.next.filter(u=>!visited.has(u)));}
      if(!families.size)throw new Error('Official catalog markup was not recognized.');
      const pending=[...families];let index=0;
      const workers=await Promise.allSettled(Array.from({length:4},async()=>{while(index<pending.length){if(signal?.aborted)throw new Error('Catalog refresh cancelled.');const family=pending[index++],q=[`${ORIGIN}/library/${family}/tags`];let count=0;while(q.length){const page=await read(q.shift(),family);if(!page)continue;page.tags.forEach(v=>{variants.set(v.tag,v);count++;});q.push(...page.next.filter(u=>!visited.has(u)));}if(!count)throw new Error(`No published tags found for ${family}; refresh is incomplete.`);}}));
      const failure=workers.find(result=>result.status==='rejected');if(failure)throw failure.reason;
      if((previous?.enumerationComplete||previous?.complete) && previous.variants.some(v=>!variants.has(v.tag)))throw new Error('Previously verified tags disappeared. The prior catalog is retained until the source change is reviewed.');
      const completedAt=this.now();return {version:1,source:ORIGIN+'/library',refreshAt:completedAt,lastSuccessfulRefresh:completedAt,complete:null,enumerationComplete:true,completeness:'unknown',verdict:'observed-pages-enumerated-global-completeness-unknown',scope:'Every family and tag linked by the observed official catalog and its pagination. Source markup changes fail closed; Ollama supplies no independent global total, so overall completeness is unknown.',familyCount:families.size,pageCount:pages.length,pages,revision:createHash('sha256').update(JSON.stringify(pages.sort((a,b)=>a.url.localeCompare(b.url)))).digest('hex'),variants:[...variants.values()].map(v=>({...v,...metadata[v.family]})).sort((a,b)=>a.tag.localeCompare(b.tag)),stale:false,error:null};
    } catch(error) { return {...(previous||{version:1,variants:[],pages:[],pageCount:0,familyCount:0,complete:false,lastSuccessfulRefresh:null}),refreshAt:this.now(),stale:true,error:error.name==='AbortError'?'Catalog refresh cancelled.':error.message}; }
  }
}
export function reconcile(catalog,installed=[],running=[]) {
  const map=new Map((catalog?.variants||[]).map(v=>[v.tag,{...v,catalog:true}]));
  for(const m of installed){const tag=m.name||m.model;if(!tag)continue;map.set(tag,{...(map.get(tag)||{tag,family:tag.split(':')[0],variant:tag.split(':')[1]||'latest',catalog:false}),installed:true,sizeBytes:m.size??map.get(tag)?.sizeBytes??null,details:m.details||{},capabilities:m.capabilities||map.get(tag)?.capabilities||[],quantization:m.details?.quantization_level||map.get(tag)?.quantization||null,parameterCount:m.details?.parameter_size||map.get(tag)?.parameterCount||null});}
  for(const m of running){const tag=m.name||m.model;if(!tag)continue;map.set(tag,{...(map.get(tag)||{tag,family:tag.split(':')[0],catalog:false}),running:true});}
  return [...map.values()];
}
