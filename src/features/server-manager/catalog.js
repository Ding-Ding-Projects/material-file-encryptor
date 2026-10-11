import {createHash} from 'node:crypto';

export const JAVA_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const metadataHosts = new Set(['piston-meta.mojang.com', 'launchermeta.mojang.com']);
const distributionHosts = new Set(['piston-data.mojang.com', 'launcher.mojang.com']);
function officialUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password || url.hash) throw new Error('Untrusted distribution source.');
  return url.href;
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function date(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid source timestamp.'); return value; }
function digest(value) { if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('Invalid SHA-1 identity.'); return value; }
function identifier(value) { if (typeof value !== 'string' || !value.length || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid version identity.'); return value; }

export function parseJavaManifest(bytes, retrievedAt) {
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('Catalogue exceeds size limit.');
  const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!object(value) || !object(value.latest) || !Array.isArray(value.versions) || value.versions.length === 0 || value.versions.length > 20000) throw new Error('Invalid complete catalogue.');
  const ids = new Set();
  const versions = value.versions.map(row => {
    if (!object(row)) throw new Error('Invalid catalogue row.');
    const id = identifier(row.id);
    if (ids.has(id)) throw new Error('Duplicate version identity.');
    ids.add(id);
    return {id, channel:identifier(row.type), metadataUrl:officialUrl(row.url, metadataHosts), metadataSha1:digest(row.sha1), releaseTime:date(row.releaseTime), updatedAt:date(row.time), distribution:{state:'unresolved', reason:'Selected version metadata has not been resolved.'}};
  });
  for (const key of ['release','snapshot']) if (!ids.has(value.latest[key])) throw new Error('Latest version is absent from complete catalogue.');
  return {schemaVersion:1, edition:'java', sourceUrl:JAVA_MANIFEST_URL, sourceSha256:createHash('sha256').update(bytes).digest('hex'), retrievedAt:date(retrievedAt), latest:{release:value.latest.release,snapshot:value.latest.snapshot}, catalogueComplete:true, distributionComplete:false, runtimeVerified:false, versions};
}

export async function readOfficialBytes(url, {fetchImpl=fetch, signal, maxBytes=4*1024*1024}={}) {
  officialUrl(url, metadataHosts);
  const response = await fetchImpl(url, {redirect:'error', signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)});
  if (!response.ok || !response.body) throw new Error('Official metadata is unavailable.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Metadata exceeds size limit.');
  const chunks=[]; let size=0;
  try { for await (const chunk of response.body) { size+=chunk.byteLength; if(size>maxBytes) throw new Error('Metadata exceeds size limit.'); chunks.push(Buffer.from(chunk)); } }
  catch(error) { await response.body.cancel?.().catch(()=>{}); throw error; }
  return Buffer.concat(chunks,size);
}

export async function refreshJavaCatalogue({fetchImpl, signal, now=()=>new Date().toISOString()}={}) {
  return parseJavaManifest(await readOfficialBytes(JAVA_MANIFEST_URL,{fetchImpl,signal}),now());
}

export function catalogueState(snapshot, {offline=false, now=Date.now(), staleAfterMs=86400000}={}) {
  if (!snapshot) return {state:'unavailable', catalogueComplete:false, reason:'No verified catalogue is cached.'};
  if (!Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new Error('Invalid freshness boundary.');
  const retrieved=Date.parse(snapshot.retrievedAt);
  if (!Number.isFinite(retrieved) || retrieved>now) throw new Error('Invalid catalogue retrieval time.');
  return {state:offline?'offline':now-retrieved>staleAfterMs?'stale':'current', catalogueComplete:snapshot.catalogueComplete===true, distributionComplete:false, runtimeVerified:false, retrievedAt:snapshot.retrievedAt, sourceSha256:snapshot.sourceSha256, snapshot};
}

export async function resolveJavaDistribution(row, {fetchImpl,signal}={}) {
  const bytes=await readOfficialBytes(officialUrl(row.metadataUrl,metadataHosts),{fetchImpl,signal});
  if(createHash('sha1').update(bytes).digest('hex')!==digest(row.metadataSha1)) throw new Error('Version metadata integrity mismatch.');
  const metadata=JSON.parse(bytes.toString('utf8'));
  if(!object(metadata)||metadata.id!==row.id) throw new Error('Version metadata identity mismatch.');
  const source={version:row.id,metadataUrl:row.metadataUrl,metadataSha1:row.metadataSha1};
  const server=metadata.downloads?.server;
  if(server===undefined) return {...source,state:'unavailable',reason:'Official version metadata contains no dedicated-server distribution.',runtimeVerified:false};
  if(!object(server)||!Number.isSafeInteger(server.size)||server.size<=0||server.size>4*1024*1024*1024) throw new Error('Invalid server distribution metadata.');
  const java=metadata.javaVersion;
  const runtime=java===undefined?{state:'unresolved',reason:'Official metadata does not specify the Java runtime.'}:Number.isSafeInteger(java.majorVersion)&&java.majorVersion>0&&typeof java.component==='string'?{state:'specified',majorVersion:java.majorVersion,component:java.component}:null;
  if(!runtime) throw new Error('Invalid Java runtime metadata.');
  return {...source,state:'resolved',url:officialUrl(server.url,distributionHosts),sha1:digest(server.sha1),size:server.size,runtime,bytesVerified:false,runtimeVerified:false,eulaAccepted:false};
}

export const BEDROCK_CATALOGUE = Object.freeze({edition:'bedrock',state:'unavailable',catalogueComplete:false,distributionComplete:false,reason:'A complete authoritative historical dedicated-server catalogue is not established. Current download links do not prove historical availability.',sourceUrl:'https://www.minecraft.net/en-us/download/server/bedrock',runtimeVerified:false});
