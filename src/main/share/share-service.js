import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto';
import { sealShare, openShare, wrapShareKey, unwrapShareKey, sealedSize, shareError } from './share-crypto.js';
import { formatShareCommand, parseShareCommand, shareRepositoryFor, shareLink, shareCommandLine, DOCKER_HUB_REGISTRY_HOST } from './share-command.js';
import { publishShare, fetchShare, anonymousPullAuthorization, shareStorage, SHARE_TAG } from './share-registry.js';

const SAFE_CODES = new Set(['INVALID_KEY', 'TAMPERED', 'TRUNCATED', 'UNKNOWN_VERSION', 'INVALID_METADATA', 'WRONG_PASSPHRASE', 'PASSPHRASE_REQUIRED', 'TOO_LARGE',
  'SOURCE_CHANGED', 'INVALID_NAME', 'COMMAND_INVALID', 'FOREIGN_HOST', 'FOREIGN_REPOSITORY', 'SIGN_IN_REQUIRED', 'LOCKED', 'NOT_MOUNTED', 'NOT_FOUND', 'REGISTRY_UNVERIFIED',
  'PROVIDER_UNAVAILABLE', 'REPOSITORY_CREATE_DENIED', 'REPOSITORY_PRIVATE', 'REPOSITORY_NOT_WRITABLE', 'BUSY', 'EXPIRED', 'CANCELLED', 'REVOKE_UNVERIFIED']);
const coded = (code, message) => { const error = Error(message); error.code = code; return error; };
const RECEIVE_TTL = 10 * 60 * 1000;

/** Only fixed, key-free messages leave the service. Anything unexpected becomes one generic message. */
function safe(error, fallback) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return coded('CANCELLED', 'The share was cancelled.');
  if (SAFE_CODES.has(error?.code)) return coded(error.code, error.message);
  if (error?.code === 'AUTHENTICATION_REQUIRED') return coded('SIGN_IN_REQUIRED', 'Sign in to Docker Hub again, then retry.');
  return coded('FAILED', fallback);
}

/**
 * Share a vault file through Docker Hub, and receive one.
 *   docker          the Docker Hub transport: inspectRegistrySignIn, ensurePublicRepository, registryAuthorization, deleteShareTag
 *   readSource(id)  { name, size, modified, open(signal) => AsyncIterable<Uint8Array> } for an unlocked, mounted vault file
 *   store           the encrypted share list
 *   chooseSaveFile(name)   a native Save as dialog: an absolute path, or null when cancelled
 *   driveTarget(name)      a new path inside the mounted drive for a received file
 */
export function createShareService({ docker, readSource, store, chooseSaveFile, driveTarget, testDestination = null, anonymousAuthorize = anonymousPullAuthorization(),
  storageFactory, maxObjectBytes = 1024 ** 3, randomBytes = nodeRandomBytes, now = Date.now }) {
  let active = null;
  const receiving = new Map(), incoming = new Map();
  const registryHost = testDestination ? new URL(testDestination.endpoint).host : DOCKER_HUB_REGISTRY_HOST;
  const storage = (repository, authorize) => shareStorage({ repository, authorize, testDestination, maxObjectBytes, ...(storageFactory ? { factory: storageFactory } : {}) });
  // The newest link that arrived before the window was ready to listen, so the renderer can pick it up.
  const status = () => { sweep(); const latest = [...incoming.keys()].at(-1) ?? null; return active ? { state: active.state, name: active.name, size: active.size, incomingId: latest } : { state: 'idle', incomingId: latest }; };
  function sweep() {
    for (const [id, item] of receiving) if (item.expires < now()) { item.key.fill(0); receiving.delete(id); }
    for (const [id, item] of incoming) if (item.expires < now()) incoming.delete(id);
  }
  async function account(signal) {
    const inspection = await docker.inspectRegistrySignIn(signal);
    if (inspection?.state === 'signed-in' && inspection.account) return inspection.account;
    throw coded('SIGN_IN_REQUIRED', 'Sign in to Docker Hub first.');
  }

  async function create({ entryId, passphrase = null }) {
    if (active) throw coded('BUSY', 'Another file is being shared. Wait for it to finish.');
    const controller = new AbortController(), signal = controller.signal;
    active = { state: 'preparing', controller, name: null, size: null };
    let key = null;
    try {
      const source = await readSource(entryId);
      active.name = source.name; active.size = source.size;
      if (sealedSize(source.size) > maxObjectBytes) throw shareError('TOO_LARGE');
      const repository = shareRepositoryFor(await account(signal));
      active.state = 'repository';
      await docker.ensurePublicRepository(repository, signal);
      key = randomBytes(32);
      active.state = 'encrypting';
      // Wrap first, so a passphrase problem stops the share before anything is uploaded.
      const wrapped = passphrase ? await wrapShareKey(key, passphrase, { randomBytes }) : null;
      const ciphertext = await sealShare({ key, source: source.open(signal), name: source.name, size: source.size, modified: source.modified, maxBytes: maxObjectBytes, randomBytes, signal });
      active.state = 'uploading';
      const client = storage(repository, (name, authSignal, visibility) => docker.registryAuthorization(name, authSignal, visibility));
      const published = await publishShare({ storage: client, ciphertext, signal });
      active.state = 'saving';
      const command = formatShareCommand({ host: registryHost, repository, digest: published.digest, ...(wrapped ? { wrapped } : { key }) });
      const { entry, saved } = await store.add({ name: source.name, size: source.size, repository, digest: published.digest, tag: published.tag, passphrase: Boolean(wrapped), command });
      return { entry, command, link: shareLink(command), commandLine: shareCommandLine(command), listSaved: saved, persistent: store.persistent };
    } catch (error) { throw safe(error, 'The file could not be shared. Nothing readable was uploaded.'); }
    finally { key?.fill(0); active = null; }
  }

  async function revoke(id) {
    const entry = await store.get(id);
    if (!entry) throw coded('NOT_FOUND', 'That shared file is no longer in the list.');
    if (entry.state === 'revoked') return { entry, revoked: true, verified: true };
    if (!SHARE_TAG.test(entry.tag)) throw coded('NOT_FOUND', 'That shared file is no longer in the list.');
    // The command names the manifest digest. Deleting only the tag leaves the untagged manifest downloadable on
    // Docker Hub, so the manifest itself is deleted (with a delete-scoped token), then the tag as a cleanup.
    try { await storage(entry.repository, (name, authSignal) => docker.registryDeleteAuthorization(name, authSignal)).artifacts.deleteManifest(entry.digest); }
    catch (error) { throw safe(error, 'Docker Hub did not remove the shared file. It is still available. Try again.'); }
    try { await docker.deleteShareTag(entry.repository, entry.tag); } catch { /* the verification below decides */ }
    // The command is only forgotten once an anonymous reader can no longer resolve either reference.
    const reader = storage(entry.repository, anonymousAuthorize);
    const gone = async reference => { try { await reader.artifacts.getManifest(reference); return false; } catch (error) { return error?.code === 'NOT_FOUND'; } };
    const verified = await gone(entry.digest) && await gone(entry.tag);
    if (!verified) throw coded('REVOKE_UNVERIFIED', 'Docker Hub has not confirmed that the shared file is gone. It may still be downloadable. Try Revoke again.');
    return { entry: await store.markRevoked(id), revoked: true, verified };
  }

  async function prepareReceive({ command, incomingId, passphrase = null }) {
    sweep();
    let text = command;
    if (incomingId !== undefined) { const item = incoming.get(incomingId); if (!item) throw coded('EXPIRED', 'This request expired. Open the link or paste the command again.'); text = item.command; }
    const parsed = parseShareCommand(text, { allowTestHosts: Boolean(testDestination) });
    if (testDestination && parsed.host !== registryHost) throw coded('FOREIGN_HOST', 'This share points somewhere other than Docker Hub, so it was not opened.');
    let key;
    if (parsed.needsPassphrase) {
      if (passphrase === null || passphrase === undefined || passphrase === '') return { needsPassphrase: true };
      key = await unwrapShareKey(parsed.wrapped, passphrase);
    } else key = Buffer.from(parsed.key);
    try {
      const client = storage(parsed.repository, anonymousAuthorize);
      let blob;
      try { blob = await fetchShare({ storage: client, digest: parsed.digest, maxObjectBytes }); }
      catch (error) { if (error?.code === 'NOT_FOUND') throw coded('NOT_FOUND', 'The shared file was not found. It may have been removed by the person who shared it.'); throw error; }
      const { metadata } = openShare(blob, key);
      const id = randomUUID();
      receiving.set(id, { blob, key, metadata, expires: now() + RECEIVE_TTL });
      key = null;
      if (incomingId !== undefined) incoming.delete(incomingId);
      return { receiveId: id, name: metadata.name, size: metadata.size, modified: metadata.modified };
    } finally { key?.fill(0); }
  }

  async function writeReceived(target, item) {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(6).toString('hex')}.receiving`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    let done = false;
    try {
      const { content } = openShare(item.blob, item.key);
      for (const piece of content()) await handle.write(piece);
      await handle.sync(); await handle.close();
      await fs.rename(temporary, target); done = true;
    } finally {
      if (!done) { await handle.close().catch(() => {}); await fs.rm(temporary, { force: true }).catch(() => {}); }
    }
  }

  async function saveReceive({ receiveId, destination }) {
    sweep();
    const item = receiving.get(receiveId);
    if (!item) throw coded('EXPIRED', 'This download expired. Paste the command again.');
    const target = destination === 'drive' ? await driveTarget(item.metadata.name) : await chooseSaveFile(item.metadata.name);
    if (!target) return { saved: false };
    try { await writeReceived(target, item); }
    catch (error) { throw safe(error, 'The shared file could not be saved. Nothing was kept.'); }
    discard(receiveId);
    return { saved: true, name: path.basename(target), size: item.metadata.size };
  }

  function discard(receiveId) { const item = receiving.get(receiveId); if (item) { item.key.fill(0); receiving.delete(receiveId); } return { discarded: true }; }

  return {
    create, revoke, status,
    get pending() { return Boolean(active); },
    cancel() { active?.controller.abort(); return { cancelled: Boolean(active) }; },
    async list() { return { entries: await store.list(), persistent: store.persistent, error: store.loadError }; },
    async command(id) {
      const command = await store.command(id);
      if (!command) throw coded('NOT_FOUND', 'The command for this share is not available.');
      return { command, link: shareLink(command), commandLine: shareCommandLine(command) };
    },
    async revokeAll() {
      const results = [];
      for (const entry of await store.list()) if (entry.state === 'active') {
        try { results.push({ id: entry.id, ...(await revoke(entry.id)) }); }
        catch (error) { results.push({ id: entry.id, revoked: false, error: safe(error, 'Docker Hub did not remove this shared file.').message }); }
      }
      return { results };
    },
    async forget(id) { await store.remove(id); return { removed: true }; },
    /** Accepts a command from a link or the command line. Returns an id so the key does not travel to the renderer. */
    acceptIncoming(text) {
      sweep();
      try { parseShareCommand(text, { allowTestHosts: Boolean(testDestination) }); } catch { return null; }
      const id = randomUUID(); incoming.set(id, { command: text, expires: now() + RECEIVE_TTL });
      return id;
    },
    async receive(params) { try { return await prepareReceive(params); } catch (error) { throw safe(error, 'The shared file could not be downloaded.'); } },
    save: saveReceive,
    discard,
    close() { active?.controller.abort(); for (const id of [...receiving.keys()]) discard(id); incoming.clear(); },
  };
}
