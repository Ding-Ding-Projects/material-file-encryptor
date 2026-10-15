import fs from 'node:fs/promises';
import path from 'node:path';
import {fetchJson, sha256OfFile} from './bounded-http.js';

/** Plugin and mod sources for a managed server.
 *
 * Two sources exist. A file the person chose in the desktop file chooser (the main process receives the path, the renderer
 * never does) and a Modrinth project resolved through the public `api.modrinth.com/v2` API. A Modrinth file is accepted only
 * when the API published a SHA-512 for it, the download host is `cdn.modrinth.com`, and the received bytes match that digest
 * and stay under the size bound. A local file has no upstream digest to compare; its SHA-256 is recorded and the record says
 * it was never verified against a publisher. */
export const MODRINTH_API = 'https://api.modrinth.com/v2';
export const MAX_EXTENSION_BYTES = 128 * 1024 * 1024;
export const EXTENSION_HOSTS = Object.freeze({api: ['api.modrinth.com'], cdn: ['cdn.modrinth.com']});
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,122}\.jar$/;

const KINDS = Object.freeze({
  paper: {directory: 'plugins', projectType: 'plugin', loaders: ['paper', 'spigot', 'bukkit']},
  purpur: {directory: 'plugins', projectType: 'plugin', loaders: ['purpur', 'paper', 'spigot', 'bukkit']},
  fabric: {directory: 'mods', projectType: 'mod', loaders: ['fabric']},
  forge: {directory: 'mods', projectType: 'mod', loaders: ['forge']},
  neoforge: {directory: 'mods', projectType: 'mod', loaders: ['neoforge']},
});
export const extensionKind = flavor => Object.hasOwn(KINDS, flavor) ? {...KINDS[flavor], loaders: [...KINDS[flavor].loaders]} : null;
export const validProjectSlug = value => typeof value === 'string' && SLUG.test(value);

export function safeJarName(name) {
  const base = String(name).replaceAll(' ', '_');
  if (/[\\/]/.test(base) || !FILE_NAME.test(base) || base.includes('..')) throw Error('The extension file name is not allowed.');
  return base;
}

/** Search results are reduced to fixed, bounded fields; markup in descriptions is never rendered by the interface. */
export async function searchExtensions({flavor, minecraft, query}, {fetchImpl = fetch, signal} = {}) {
  const kind = extensionKind(flavor);
  if (!kind) throw Error('This flavor has no plugin or mod repository.');
  if (typeof query !== 'string' || query.length > 64 || /[\u0000-\u001f\u007f]/.test(query)) throw Error('Invalid extension search.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/.test(minecraft)) throw Error('Invalid server version.');
  const facets = JSON.stringify([['project_type:' + kind.projectType], ['versions:' + minecraft], kind.loaders.map(loader => 'categories:' + loader)]);
  const url = MODRINTH_API + '/search?query=' + encodeURIComponent(query) + '&limit=20&facets=' + encodeURIComponent(facets);
  const body = await fetchJson(fetchImpl, url, EXTENSION_HOSTS.api, {signal, maxBytes: 2 * 1024 * 1024});
  if (!Array.isArray(body.hits)) throw Error('Extension source returned an unexpected shape.');
  return body.hits.slice(0, 20).filter(hit => validProjectSlug(hit?.slug)).map(hit => ({project: hit.slug, title: String(hit.title ?? hit.slug).slice(0, 80), summary: String(hit.description ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200), downloads: Number.isSafeInteger(hit.downloads) ? hit.downloads : 0}));
}

/** Resolves one project (and optionally one version) to a single bounded, digest-carrying file. Downloads nothing. */
export async function resolveModrinthFile({flavor, minecraft, project, version = null}, {fetchImpl = fetch, signal} = {}) {
  const kind = extensionKind(flavor);
  if (!kind) throw Error('This flavor has no plugin or mod repository.');
  if (!validProjectSlug(project) || version !== null && !/^[A-Za-z0-9]{6,16}$/.test(version)) throw Error('Invalid extension request.');
  const url = MODRINTH_API + '/project/' + encodeURIComponent(project) + '/version?loaders=' + encodeURIComponent(JSON.stringify(kind.loaders)) + '&game_versions=' + encodeURIComponent(JSON.stringify([minecraft]));
  const versions = await fetchJson(fetchImpl, url, EXTENSION_HOSTS.api, {signal, maxBytes: 4 * 1024 * 1024});
  if (!Array.isArray(versions)) throw Error('Extension source returned an unexpected shape.');
  const chosen = versions.find(item => (version === null || item?.id === version) && Array.isArray(item?.files) && item.files.length);
  if (!chosen) throw Error('No compatible release exists for this server version.');
  const file = chosen.files.find(item => item?.primary === true) ?? chosen.files[0];
  const sha512 = typeof file?.hashes?.sha512 === 'string' && /^[a-f0-9]{128}$/.test(file.hashes.sha512.toLowerCase()) ? file.hashes.sha512.toLowerCase() : null;
  if (!sha512) throw Error('The repository published no SHA-512 for this file; it is refused.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_EXTENSION_BYTES) throw Error('The extension file exceeds its size bound.');
  const fileName = safeJarName(file.filename);
  const download = new URL(String(file.url));
  if (download.protocol !== 'https:' || !EXTENSION_HOSTS.cdn.includes(download.hostname)) throw Error('Untrusted extension download source.');
  return {source: 'modrinth', project, version: String(chosen.id).slice(0, 16), versionNumber: String(chosen.version_number ?? '').slice(0, 40), fileName, url: download.href, hashAlgorithm: 'sha512', hash: sha512, size: file.size, directory: kind.directory};
}

/** A file chosen by the person in the main process. Regular `.jar` files only, never a link, bounded, ZIP magic required. */
export async function inspectLocalExtension(file, flavor) {
  const kind = extensionKind(flavor);
  if (!kind) throw Error('This flavor has no plugin or mod directory.');
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw Error('A regular extension file is required.');
  if (stat.size <= 0 || stat.size > MAX_EXTENSION_BYTES) throw Error('The extension file exceeds its size bound.');
  const fileName = safeJarName(path.basename(file));
  const handle = await fs.open(file, 'r');
  try { const head = Buffer.alloc(4); await handle.read(head, 0, 4, 0); if (!head.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw Error('The file is not a jar archive.'); } finally { await handle.close(); }
  return {source: 'local', fileName, size: stat.size, sha256: await sha256OfFile(file), directory: kind.directory};
}
