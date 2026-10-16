import {assertAllowedUrl, fetchJson, fetchText} from './bounded-http.js';

/** Server flavor catalogues, one adapter per official public API.
 *
 * Integrity is recorded honestly per flavor and never upgraded:
 *   vanilla  Mojang publishes SHA-1 and the exact size in the version metadata.
 *   paper    api.papermc.io publishes SHA-256 for every build.
 *   purpur   api.purpurmc.org publishes MD5 only. MD5 is not collision resistant; the result says so.
 *   fabric   meta.fabricmc.net publishes no digest for the generated server launcher. The result is unverified upstream and
 *            the caller pins the SHA-256 of the received bytes instead.
 *   forge    maven.minecraftforge.net sidecar checksum files are consulted; when none exists the result is unverified upstream.
 *   neoforge maven.neoforged.net sidecar checksum files are consulted; when none exists the result is unverified upstream.
 * Forge and NeoForge ship an installer that must be run once (documented `--installServer`); the installer jar is the verified
 * artifact, not the finished server. Nothing here executes anything. */
export const FLAVOR_IDS = Object.freeze(['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge']);
export const FLAVOR_NAMES = Object.freeze({vanilla: 'Vanilla', paper: 'Paper', purpur: 'Purpur', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge'});
export const MAX_SERVER_JAR_BYTES = 256 * 1024 * 1024;
export const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;
const MAX_VERSIONS = 600;

const HOSTS = Object.freeze({
  vanilla: ['piston-meta.mojang.com', 'piston-data.mojang.com'],
  paper: ['api.papermc.io'],
  purpur: ['api.purpurmc.org'],
  fabric: ['meta.fabricmc.net'],
  forge: ['files.minecraftforge.net', 'maven.minecraftforge.net'],
  neoforge: ['maven.neoforged.net'],
});
export const flavorHosts = flavor => [...HOSTS[flavor]];
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;
export const validVersion = value => typeof value === 'string' && VERSION.test(value);

const compare = (a, b) => {
  const x = String(a).split(/[.+-]/).map(part => Number.parseInt(part, 10)), y = String(b).split(/[.+-]/).map(part => Number.parseInt(part, 10));
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (Number.isNaN(x[i]) ? -1 : x[i] ?? -1) - (Number.isNaN(y[i]) ? -1 : y[i] ?? -1); if (d) return d; }
  return 0;
};
const newestFirst = ids => [...ids].sort((a, b) => compare(b, a));
const need = (condition, message = 'Server source returned an unexpected shape.') => { if (!condition) throw Error(message); };
const array = value => { need(Array.isArray(value)); return value; };
const hex = (value, length) => typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$').test(value.toLowerCase()) ? value.toLowerCase() : null;

/** Minecraft version a flavor build targets, used to pick the Java major and to filter plugin search. */
export function neoForgeMinecraft(version) {
  const match = /^(\d{2})\.(\d{1,2})\.\d{1,5}$/.exec(version);
  if (!match || Number(match[1]) < 20 || Number(match[1]) > 25) return null;
  return '1.' + match[1] + (match[2] === '0' ? '' : '.' + match[2]);
}
/** Java major required by a Minecraft release (documented Mojang requirements). */
export function requiredJavaMajor(minecraft) {
  // Year-based releases (26.1 and later) and their weekly snapshots (26w14a) need Java 25.
  const modern = /^(\d{2})\.\d+(?:\.\d+)?|^(\d{2})w\d{2}[a-z]/.exec(String(minecraft));
  if (modern) { const year = Number(modern[1] ?? modern[2]); if (year >= 26) return 25; if (year >= 24) return 21; }
  const match = /^1\.(\d+)(?:\.(\d+))?/.exec(minecraft);
  if (!match) return 21;
  const minor = Number(match[1]), patch = Number(match[2] ?? 0);
  if (minor > 20 || minor === 20 && patch >= 5) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

async function vanillaVersions(ctx) {
  const manifest = await fetchJson(ctx.fetchImpl, 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', HOSTS.vanilla, ctx);
  return array(manifest.versions).filter(row => validVersion(row?.id)).slice(0, 2000).map(row => ({id: row.id, channel: row.type === 'release' ? 'release' : row.type === 'snapshot' ? 'snapshot' : row.type === 'old_beta' ? 'old_beta' : 'old_alpha'}));
}
async function paperVersions(ctx) {
  const project = await fetchJson(ctx.fetchImpl, 'https://api.papermc.io/v2/projects/paper', HOSTS.paper, ctx);
  return newestFirst(array(project.versions).filter(validVersion)).map(id => ({id, channel: /-(pre|rc)/i.test(id) ? 'snapshot' : 'release'}));
}
async function purpurVersions(ctx) {
  const project = await fetchJson(ctx.fetchImpl, 'https://api.purpurmc.org/v2/purpur', HOSTS.purpur, ctx);
  return newestFirst(array(project.versions).filter(validVersion)).map(id => ({id, channel: 'release'}));
}
async function fabricVersions(ctx) {
  const rows = array(await fetchJson(ctx.fetchImpl, 'https://meta.fabricmc.net/v2/versions/game', HOSTS.fabric, ctx));
  return rows.filter(row => validVersion(row?.version)).map(row => ({id: row.version, channel: row.stable === true ? 'release' : 'snapshot'}));
}
async function forgePromotions(ctx) {
  const promos = (await fetchJson(ctx.fetchImpl, 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', HOSTS.forge, ctx)).promos;
  need(promos && typeof promos === 'object' && !Array.isArray(promos));
  return promos;
}
const forgeSupported = minecraft => { const m = /^1\.(\d+)/.exec(minecraft); return !!m && Number(m[1]) >= 18; };
async function forgeVersions(ctx) {
  const promos = await forgePromotions(ctx), seen = new Set();
  for (const key of Object.keys(promos)) { const m = /^(.+)-(latest|recommended)$/.exec(key); if (m && validVersion(m[1]) && forgeSupported(m[1]) && typeof promos[key] === 'string') seen.add(m[1]); }
  return newestFirst(seen).map(id => ({id, channel: 'release'}));
}
async function neoForgeAll(ctx) {
  const body = await fetchJson(ctx.fetchImpl, 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', HOSTS.neoforge, ctx);
  return array(body.versions).filter(version => typeof version === 'string' && neoForgeMinecraft(version));
}
async function neoForgeVersions(ctx) {
  return newestFirst(new Set((await neoForgeAll(ctx)).map(neoForgeMinecraft))).map(id => ({id, channel: 'release'}));
}

const LISTERS = {vanilla: vanillaVersions, paper: paperVersions, purpur: purpurVersions, fabric: fabricVersions, forge: forgeVersions, neoforge: neoForgeVersions};

/** Lists the Minecraft versions an official flavor API offers, newest first, bounded. */
export async function listFlavorVersions(flavor, {fetchImpl = fetch, signal} = {}) {
  if (!FLAVOR_IDS.includes(flavor)) throw Error('Unsupported server flavor.');
  const versions = await LISTERS[flavor]({fetchImpl, signal});
  return {flavor, source: HOSTS[flavor][0], total: versions.length, versions: versions.slice(0, MAX_VERSIONS)};
}

const result = (flavor, version, fields) => ({flavor, version, build: null, artifact: 'server-jar', hashAlgorithm: null, hash: null, hashSource: 'none', size: null, maxBytes: MAX_SERVER_JAR_BYTES, ...fields, integrity: fields.hash ? (fields.hashAlgorithm === 'md5' ? 'verified-md5-weak' : 'verified-' + fields.hashAlgorithm) : 'unverified-upstream'});

async function sidecar(ctx, url) {
  for (const [algorithm, length] of [['sha256', 64], ['sha1', 40]]) {
    const text = await fetchText(ctx.fetchImpl, url + '.' + algorithm, HOSTS[ctx.flavor], ctx);
    const digest = text === null ? null : hex(text.trim().split(/\s+/)[0], length);
    if (digest) return {hashAlgorithm: algorithm, hash: digest, hashSource: 'sidecar'};
  }
  return {};
}

const RESOLVERS = {
  async vanilla(version, ctx) {
    const manifest = await fetchJson(ctx.fetchImpl, 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', HOSTS.vanilla, ctx);
    const row = array(manifest.versions).find(item => item?.id === version);
    need(row, 'Choose a version from the official catalogue.');
    const detail = await fetchJson(ctx.fetchImpl, row.url, ['piston-meta.mojang.com'], ctx);
    const server = detail?.downloads?.server;
    need(server && typeof server.url === 'string' && hex(server.sha1, 40) && Number.isSafeInteger(server.size) && server.size > 0 && server.size <= MAX_SERVER_JAR_BYTES, 'This version has no bounded server download.');
    assertAllowedUrl(server.url, ['piston-data.mojang.com']);
    return result('vanilla', version, {fileName: 'server.jar', url: server.url, hashAlgorithm: 'sha1', hash: hex(server.sha1, 40), hashSource: 'api', size: server.size});
  },
  async paper(version, ctx) {
    const builds = array((await fetchJson(ctx.fetchImpl, 'https://api.papermc.io/v2/projects/paper/versions/' + encodeURIComponent(version) + '/builds', HOSTS.paper, ctx)).builds);
    const stable = builds.filter(item => item?.channel === 'default' && Number.isSafeInteger(item.build));
    need(stable.length, 'No stable Paper build exists for this version.');
    const build = stable.reduce((best, item) => item.build > best.build ? item : best);
    const application = build.downloads?.application;
    need(application && /^[A-Za-z0-9._-]+\.jar$/.test(application.name) && hex(application.sha256, 64));
    return result('paper', version, {build: String(build.build), fileName: 'server.jar', url: 'https://api.papermc.io/v2/projects/paper/versions/' + encodeURIComponent(version) + '/builds/' + build.build + '/downloads/' + application.name, hashAlgorithm: 'sha256', hash: hex(application.sha256, 64), hashSource: 'api'});
  },
  async purpur(version, ctx) {
    const detail = await fetchJson(ctx.fetchImpl, 'https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(version), HOSTS.purpur, ctx);
    const latest = String(detail?.builds?.latest ?? '');
    need(/^\d{1,6}$/.test(latest));
    const build = await fetchJson(ctx.fetchImpl, 'https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(version) + '/' + latest, HOSTS.purpur, ctx);
    const md5 = hex(build?.md5, 32);
    return result('purpur', version, {build: latest, fileName: 'server.jar', url: 'https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(version) + '/' + latest + '/download', ...(md5 ? {hashAlgorithm: 'md5', hash: md5, hashSource: 'api'} : {})});
  },
  async fabric(version, ctx) {
    need((await fabricVersions(ctx)).some(row => row.id === version), 'Choose a version from the official catalogue.');
    const stable = rows => { const row = array(rows).find(item => item?.stable === true && validVersion(item.version)); need(row, 'No stable Fabric component is available.'); return row.version; };
    const loader = stable(await fetchJson(ctx.fetchImpl, 'https://meta.fabricmc.net/v2/versions/loader', HOSTS.fabric, ctx));
    const installer = stable(await fetchJson(ctx.fetchImpl, 'https://meta.fabricmc.net/v2/versions/installer', HOSTS.fabric, ctx));
    return result('fabric', version, {build: loader + '/' + installer, fileName: 'server.jar', url: 'https://meta.fabricmc.net/v2/versions/loader/' + encodeURIComponent(version) + '/' + encodeURIComponent(loader) + '/' + encodeURIComponent(installer) + '/server/jar'});
  },
  async forge(version, ctx) {
    need(forgeSupported(version), 'Forge servers are supported from Minecraft 1.18.');
    const promos = await forgePromotions(ctx);
    const build = promos[version + '-recommended'] ?? promos[version + '-latest'];
    need(typeof build === 'string' && validVersion(build), 'No Forge build is promoted for this version.');
    const name = version + '-' + build, url = 'https://maven.minecraftforge.net/net/minecraftforge/forge/' + name + '/forge-' + name + '-installer.jar';
    return result('forge', version, {build, artifact: 'installer', fileName: 'installer.jar', url, maxBytes: MAX_INSTALLER_BYTES, ...await sidecar({...ctx, flavor: 'forge'}, url)});
  },
  async neoforge(version, ctx) {
    const all = (await neoForgeAll(ctx)).filter(item => neoForgeMinecraft(item) === version);
    need(all.length, 'No NeoForge build exists for this version.');
    const build = all.sort(compare).at(-1);
    const url = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/' + build + '/neoforge-' + build + '-installer.jar';
    return result('neoforge', version, {build, artifact: 'installer', fileName: 'installer.jar', url, maxBytes: MAX_INSTALLER_BYTES, ...await sidecar({...ctx, flavor: 'neoforge'}, url)});
  },
};

/** Resolves one flavor and Minecraft version to a single bounded download description. Does not download the artifact. */
export async function resolveFlavorDistribution(flavor, version, {fetchImpl = fetch, signal} = {}) {
  if (!FLAVOR_IDS.includes(flavor)) throw Error('Unsupported server flavor.');
  if (!validVersion(version)) throw Error('Invalid server version.');
  const distribution = await RESOLVERS[flavor](version, {fetchImpl, signal, flavor});
  distribution.hosts = flavorHosts(flavor);
  return distribution;
}

/** The Minecraft release a flavor build runs, used to look up the Java requirement. */
function minecraftOf(flavor, version) {
  if (flavor === 'neoforge') return neoForgeMinecraft(version) ?? version;
  return version;
}

/** The Java major a prepared server needs. Mojang's version metadata (`javaVersion.majorVersion`) is the source of truth for
 * every flavor, because Paper, Purpur, Fabric, Forge and NeoForge all run a Mojang release and none of their public APIs
 * publishes a stricter requirement. When the metadata cannot be read the documented release table is used and the source is
 * reported as `table`, never presented as verified. */
export async function resolveJavaRequirement(flavor, version, {fetchImpl = fetch, signal} = {}) {
  const minecraft = minecraftOf(flavor, version);
  try {
    const manifest = await fetchJson(fetchImpl, 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', HOSTS.vanilla, {signal});
    const row = array(manifest.versions).find(item => item?.id === minecraft);
    need(row && typeof row.url === 'string');
    const detail = await fetchJson(fetchImpl, row.url, ['piston-meta.mojang.com'], {signal});
    const major = detail?.javaVersion?.majorVersion;
    need(Number.isSafeInteger(major) && major >= 8 && major <= 99);
    return {major, source: 'mojang'};
  } catch (error) {
    if (signal?.aborted) throw error;
    return {major: requiredJavaMajor(minecraft), source: 'table'};
  }
}
