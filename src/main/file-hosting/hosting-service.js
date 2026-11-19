import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { validateSettings, instanceFiles, SECRET_FILES, composeArgs, remoteDocker, remoteWrite, remoteRemove, sshArgsFor, sshForwardArgs, quickTunnelUrl, lanAddress, routedAddress, linkBase, planError } from './hosting-plan.js';
import { createSocket as createUdpSocket } from 'node:dgram';

const coded = (code, message) => Object.assign(Error(message), { code });
const SAFE_CODES = new Set(['INVALID_SETTINGS', 'BUSY', 'CANCELLED', 'NOT_FOUND', 'DOCKER_MISSING', 'SSH_UNAVAILABLE', 'PULL_FAILED', 'START_FAILED', 'UNHEALTHY', 'ADMIN_FAILED',
  'PORT_TAKEN', 'SHARE_NOT_ACTIVE', 'NO_ADDRESS', 'ACTION_FAILED', 'STORE_UNAVAILABLE']);
export const DEPLOY_PHASES = ['check', 'files', 'pull', 'start', 'health', 'address'];
const MINUTE = 60000;

/**
 * Deploys and manages file hosting instances, on this computer through Docker or on an SSH host, and creates
 * download links on them for files already shared through Docker Hub.
 *   exec(command, args, options)   resolves { stdout, stderr }, rejects with { code, stderr }
 *   spawn                          node:child_process spawn (ssh uploads and port forwards)
 *   shares                         { entry(id), command(id), revoke(id) } from the share service
 */
export function createHostingService({ store, shares, exec, spawn, fetcher = fetch, userDir, interfaces = () => ({}), localAddress = () => routedAddress(createUdpSocket), randomBytes = nodeRandomBytes, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), healthTimeoutMs = 90000 }) {
  let active = null;
  const secretsOf = item => [item?.adminToken, item?.tunnelToken].filter(Boolean);
  const clean = (text, item) => { let out = String(text || '').slice(-600); for (const secret of secretsOf(item)) out = out.split(secret).join('[hidden]'); return out.trim(); };
  function safe(error, fallback) {
    if (error?.name === 'AbortError' || active?.controller.signal.aborted && error?.code !== 'CANCELLED') return coded('CANCELLED', 'Deployment was cancelled. Anything already started keeps running; remove the instance to clean it up.');
    if (SAFE_CODES.has(error?.code)) return Object.assign(coded(error.code, error.message), error.field ? { field: error.field } : {}, error.detail ? { detail: error.detail } : {});
    return coded('FAILED', fallback);
  }
  const localDir = name => path.join(userDir, name);

  /* ------------------------------------------------------------------ running commands */
  async function docker(item, args, { timeout = 5 * MINUTE, signal } = {}) {
    try {
      if (item.target === 'local') return await exec('docker', args, { cwd: localDir(item.name), timeout, signal, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      return await exec('ssh', sshArgsFor(item, remoteDocker(item, args)), { timeout, signal, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    } catch (error) { throw Object.assign(Error('docker failed'), { code: 'COMMAND_FAILED', detail: clean(error?.stderr || error?.message, item), signalAborted: signal?.aborted }); }
  }
  function sshWrite(item, name, content, signal) {
    return new Promise((resolve, reject) => {
      const child = spawn('ssh', sshArgsFor(item, remoteWrite(item, name)), { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      let stderr = '';
      const abort = () => child.kill();
      signal?.addEventListener('abort', abort, { once: true });
      child.stderr.on('data', chunk => { if (stderr.length < 4000) stderr += chunk; });
      child.once('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
      child.once('exit', code => { signal?.removeEventListener('abort', abort); code === 0 ? resolve() : reject(Object.assign(Error('upload failed'), { detail: clean(stderr, item) })); });
      child.stdin.on('error', () => {});
      child.stdin.end(content);
    });
  }
  async function writeFiles(item, files, signal) {
    if (item.target === 'local') {
      const directory = localDir(item.name);
      await fs.mkdir(directory, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        const target = path.join(directory, name), temporary = target + '.part';
        await fs.writeFile(temporary, content, { mode: SECRET_FILES.has(name) ? 0o600 : 0o644 });
        await fs.rename(temporary, target);
      }
      if (!files['tunnel.env']) await fs.rm(path.join(directory, 'tunnel.env'), { force: true });
      return;
    }
    for (const [name, content] of Object.entries(files)) await sshWrite(item, name, content, signal);
  }

  /* ------------------------------------------------------------------ reaching the server */
  const healthBase = item => item.target === 'local' ? `http://127.0.0.1:${item.port}` : `http://${item.ssh.host}:${item.port}`;
  async function getJson(url, { headers = {}, method = 'GET', body, timeout = 10000, signal } = {}) {
    const response = await fetcher(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
    const text = await response.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: response.status, ok: response.ok, json };
  }
  async function freePort() {
    return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
  }
  /** Runs fn(baseUrl) with an address where the admin API is reachable without crossing the network in the clear. */
  async function withAdmin(item, fn) {
    if (item.target === 'local') return fn(`http://127.0.0.1:${item.port}`);
    const port = await freePort();
    const child = spawn('ssh', sshForwardArgs(item, port), { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let exited = false; child.once('exit', () => { exited = true; }); child.once('error', () => { exited = true; });
    try {
      for (let i = 0; i < 50; i++) {
        if (exited) throw coded('SSH_UNAVAILABLE', 'The SSH connection to the host could not be opened.');
        const open = await new Promise(resolve => { const socket = net.connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
        if (open) return await fn(`http://127.0.0.1:${port}`);
        await sleep(200);
      }
      throw coded('SSH_UNAVAILABLE', 'The SSH connection to the host did not open in time.');
    } finally { child.kill(); }
  }
  async function admin(item, method, route, body) {
    return withAdmin(item, async base => {
      let result;
      try { result = await getJson(base + route, { method, body, headers: { Authorization: `Bearer ${item.adminToken}` }, timeout: 60000 }); }
      catch { throw coded('ADMIN_FAILED', 'The file hosting server did not answer.'); }
      if (!result.ok) throw Object.assign(coded('ADMIN_FAILED', result.json?.error?.message || 'The file hosting server refused the request.'), { status: result.status, serverCode: result.json?.error?.code });
      return result.json;
    });
  }
  async function waitHealthy(item, signal) {
    const deadline = now() + healthTimeoutMs;
    while (now() < deadline) {
      signal?.throwIfAborted();
      try { const result = await getJson(healthBase(item) + '/api/health', { timeout: 4000, signal }); if (result.ok && result.json?.ok === true) return result.json; } catch { /* not yet */ }
      await sleep(1500);
    }
    throw coded('UNHEALTHY', 'The server started but did not answer its health check in time. Open Logs to see why.');
  }
  async function readQuickUrl(item, signal, waitMs = 45000) {
    const deadline = now() + waitMs;
    for (;;) {
      const { stdout } = await docker(item, composeArgs(item, 'tunnel-logs'), { timeout: 30000, signal });
      const url = quickTunnelUrl(stdout);
      if (url) return url;
      if (now() >= deadline) return null;
      await sleep(2000);
    }
  }
  const thisComputer = async () => (await localAddress().catch(() => null)) || lanAddress(interfaces());
  const lanUrlFor = async item => {
    const host = item.target === 'local' ? await thisComputer() : item.ssh.host;
    return host ? `http://${host}:${item.port}` : null;
  };

  /* ------------------------------------------------------------------ deploy */
  async function deploy({ settings: raw, tunnelToken = null }) {
    if (active) throw coded('BUSY', 'A deployment is already running.');
    const settings = validateSettings(raw);
    const controller = new AbortController(), signal = controller.signal;
    active = { controller, name: settings.name, phases: Object.fromEntries(DEPLOY_PHASES.map(id => [id, 'waiting'])), current: null };
    const phase = (id, state) => { active.phases[id] = state; active.current = id; };
    let item = null;
    try {
      if (!store.persistent) throw coded('STORE_UNAVAILABLE', 'Windows protected storage is unavailable, so the admin key could not be kept safely. Nothing was deployed.');
      const all = await store.instances();
      const existing = await store.byName(settings.name, settings.target, settings.ssh?.host ?? null);
      const clash = all.find(other => other.id !== existing?.id && other.target === settings.target && (other.ssh?.host ?? null) === (settings.ssh?.host ?? null) && other.port === settings.port);
      if (clash) throw Object.assign(coded('PORT_TAKEN', `Port ${settings.port} is already used by the instance "${clash.name}". Choose another port.`), { field: 'port' });
      const token = settings.tunnel === 'named' ? (tunnelToken?.trim() || existing?.tunnelToken || null) : null;
      if (settings.tunnel === 'named' && !token) throw Object.assign(planError('tunnelToken', 'Paste the tunnel token from the Cloudflare dashboard.'));
      item = { ...(existing ?? {}), ...settings, adminToken: existing?.adminToken ?? randomBytes(32).toString('base64url'), tunnelToken: token, quickUrl: null };

      phase('check', 'running');
      try { await (item.target === 'local' ? exec('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 20000, signal, windowsHide: true }) : exec('ssh', sshArgsFor(item, 'docker version --format {{.Server.Version}}'), { timeout: 30000, signal, windowsHide: true })); }
      catch (error) {
        if (signal.aborted) throw error;
        throw item.target === 'local' ? coded('DOCKER_MISSING', 'Docker is not running on this computer. Start Docker Desktop, then deploy again.')
          : Object.assign(coded('SSH_UNAVAILABLE', 'The SSH host could not be reached, or Docker is not available there. Check that you have connected once with ssh so its key is trusted, and that your user can run docker.'), { detail: clean(error?.stderr, item) });
      }
      phase('check', 'done');

      phase('files', 'running');
      await writeFiles(item, instanceFiles(item, { adminToken: item.adminToken, tunnelToken: item.tunnelToken }), signal);
      phase('files', 'done');

      phase('pull', 'running');
      let usedLocalImage = false;
      try { await docker(item, composeArgs(item, 'pull'), { timeout: 20 * MINUTE, signal }); }
      catch (error) {
        if (signal.aborted) throw error;
        // Offline, or the registry is unreachable: an exact copy already on the host is still the requested image.
        try { await docker(item, ['image', 'inspect', '--format', '{{.Id}}', item.image], { timeout: 30000, signal }); usedLocalImage = true; }
        catch { throw Object.assign(coded('PULL_FAILED', 'The server image could not be downloaded. Check the internet connection on the host.'), { detail: error.detail }); }
      }
      phase('pull', 'done');

      phase('start', 'running');
      try { await docker(item, composeArgs(item, 'up'), { timeout: 5 * MINUTE, signal }); }
      catch (error) { if (signal.aborted) throw error; throw Object.assign(coded('START_FAILED', 'The containers could not start. The port may be in use by another program.'), { detail: error.detail }); }
      phase('start', 'done');

      phase('health', 'running');
      const health = await waitHealthy(item, signal);
      phase('health', 'done');

      phase('address', 'running');
      item.lanUrl = await lanUrlFor(item);
      if (item.tunnel === 'quick') item.quickUrl = await readQuickUrl(item, signal);
      item.deployedAt = new Date(now()).toISOString();
      const saved = await store.putInstance(item);
      let publicReachable = null;
      if (item.publicUrl || item.quickUrl) {
        const base = item.publicUrl || item.quickUrl;
        for (let i = 0; i < 6 && !publicReachable; i++) { try { publicReachable = (await getJson(base + '/api/health', { timeout: 8000, signal })).json?.ok === true; } catch { publicReachable = false; } if (!publicReachable) await sleep(3000); }
      }
      phase('address', 'done');
      return { instance: store.instanceView(saved), health: { checkedAt: new Date(now()).toISOString(), version: health.version }, publicReachable, usedLocalImage };
    } catch (error) {
      if (active?.current && active.phases[active.current] === 'running') active.phases[active.current] = 'failed';
      throw safe(error, 'Deployment failed.');
    } finally { active = null; }
  }

  /* ------------------------------------------------------------------ instance actions */
  async function requireInstance(id) { const item = await store.instance(id); if (!item) throw coded('NOT_FOUND', 'That file hosting instance is no longer recorded.'); return item; }
  async function health(id) {
    const item = await requireInstance(id);
    const checkedAt = new Date(now()).toISOString();
    try {
      const result = await getJson(healthBase(item) + '/api/health', { timeout: 6000 });
      if (!result.ok || result.json?.ok !== true) return { healthy: false, checkedAt, reason: 'The server answered, but not with a healthy status.' };
      let status = null; try { status = await admin(item, 'GET', '/api/admin/status'); } catch { status = null; }
      if (item.tunnel === 'quick') {
        try { const url = await readQuickUrl(item, undefined, 0); if (url && url !== item.quickUrl) { item.quickUrl = url; await store.putInstance(item); } } catch { /* logs unavailable */ }
      }
      return { healthy: true, checkedAt, version: result.json.version, uptimeSeconds: result.json.uptimeSeconds, cache: status?.cache ?? null, links: status?.links ?? null, instance: store.instanceView(item) };
    } catch { return { healthy: false, checkedAt, reason: 'The server did not answer. It may be stopped.' }; }
  }
  async function action(id, name) {
    const item = await requireInstance(id);
    try {
      switch (name) {
        case 'start': await docker(item, composeArgs(item, 'up')); break;
        case 'restart': await docker(item, composeArgs(item, 'restart')); break;
        case 'stop': await docker(item, composeArgs(item, 'stop')); break;
        case 'update': await docker(item, composeArgs(item, 'pull'), { timeout: 20 * MINUTE }); await docker(item, composeArgs(item, 'up')); break;
        case 'logs': { const { stdout } = await docker(item, composeArgs(item, 'logs'), { timeout: 60000 }); return { logs: clean(stdout, item).slice(-60000) }; }
        case 'remove':
          try { await docker(item, composeArgs(item, 'down'), { timeout: 3 * MINUTE }); } catch { /* already gone */ }
          if (item.target === 'local') await fs.rm(localDir(item.name), { recursive: true, force: true });
          else await exec('ssh', sshArgsFor(item, remoteRemove(item)), { timeout: 60000, windowsHide: true }).catch(() => {});
          await store.removeInstance(id);
          return { removed: true };
        default: throw coded('ACTION_FAILED', 'Unknown action.');
      }
    } catch (error) { if (error?.code === 'COMMAND_FAILED') throw Object.assign(coded('ACTION_FAILED', 'Docker did not finish that action.'), { detail: error.detail }); throw error; }
    if (['start', 'restart', 'update'].includes(name)) { try { await waitHealthy(item); } catch { return { done: true, healthy: false }; } return { done: true, healthy: true }; }
    return { done: true };
  }

  /* ------------------------------------------------------------------ links */
  async function removeFromHub(instanceId, record) {
    if (!record?.removeFromHub || record.hubRemoved) return;
    try { await shares.revoke(record.shareId); await store.updateLink(instanceId, record.linkId, { hubRemoved: true, hubError: null }); }
    catch (error) { await store.updateLink(instanceId, record.linkId, { hubError: error?.message?.slice(0, 200) || 'Docker Hub did not confirm the removal.' }); }
  }
  async function links(instanceId) {
    const item = await requireInstance(instanceId);
    const records = await store.links(instanceId);
    const remote = (await admin(item, 'GET', '/api/admin/links')).links || [];
    const byId = new Map(remote.map(link => [link.id, link]));
    for (const record of records) { const server = byId.get(record.linkId); if (server?.state === 'ended') await removeFromHub(instanceId, record); }
    const fresh = await store.links(instanceId);
    return { links: fresh.map(record => { const server = byId.get(record.linkId);
      return { linkId: record.linkId, shareId: record.shareId, name: record.name, removeFromHub: record.removeFromHub, hubRemoved: record.hubRemoved, hubError: record.hubError ?? null,
        expiresAt: server?.expiresAt ?? record.expiresAt, maxDownloads: server?.maxDownloads ?? record.maxDownloads, downloads: server?.downloads ?? null,
        state: server ? server.state : 'missing', endedReason: server?.endedReason ?? null, cached: server?.cached ?? false, createdAt: record.createdAt }; }) };
  }
  async function createLink({ instanceId, shareId, expiresAt, maxDownloads = null, removeFromHub: remove = false, prefetch = true }) {
    const item = await requireInstance(instanceId);
    const entry = await shares.entry(shareId);
    if (!entry || entry.state !== 'active') throw coded('SHARE_NOT_ACTIVE', 'That shared file is not active on Docker Hub any more. Share it again first.');
    const command = await shares.command(shareId);
    const hash = command.indexOf('#');
    if (hash < 0) throw coded('SHARE_NOT_ACTIVE', 'The share command is not available.');
    const base = linkBase(item);
    if (!base) throw coded('NO_ADDRESS', 'This instance has no address yet. Open File hosting and check its health.');
    let created;
    try { created = await admin(item, 'POST', '/api/admin/links', { repository: entry.repository, digest: entry.digest, expiresAt, maxDownloads, prefetch }); }
    catch (error) {
      if (error?.serverCode === 'INVALID_EXPIRY') throw coded('INVALID_SETTINGS', 'Choose an expiry between one minute and one year from now.');
      if (error?.serverCode === 'NOT_FOUND') throw coded('SHARE_NOT_ACTIVE', 'The server could not find this file on Docker Hub. It may have been revoked.');
      throw error;
    }
    const url = `${base}/d/${created.id}#${command.slice(hash + 1)}`;
    await store.addLink({ instanceId, linkId: created.id, shareId, name: entry.name, url, expiresAt: created.expiresAt, maxDownloads: created.maxDownloads, removeFromHub: Boolean(remove) });
    return { linkId: created.id, url, expiresAt: created.expiresAt, maxDownloads: created.maxDownloads, passphrase: entry.passphrase };
  }
  async function linkUrl(instanceId, linkId) {
    const record = await store.link(instanceId, linkId);
    if (!record) throw coded('NOT_FOUND', 'That link is no longer recorded.');
    return { url: record.url };
  }
  async function endLink(instanceId, linkId) {
    const item = await requireInstance(instanceId);
    try { await admin(item, 'DELETE', `/api/admin/links/${linkId}`); }
    catch (error) { if (error?.status !== 404) throw error; }
    await removeFromHub(instanceId, await store.link(instanceId, linkId));
    return { ended: true };
  }

  const run = (fn, fallback) => async (...args) => { try { return await fn(...args); } catch (error) { throw safe(error, fallback); } };
  return {
    get pending() { return Boolean(active); },
    status: () => active ? { state: 'deploying', name: active.name, phases: { ...active.phases }, current: active.current } : { state: 'idle' },
    cancel() { active?.controller.abort(); return { cancelled: Boolean(active) }; },
    async instances() { return { instances: (await store.instances()).map(store.instanceView), persistent: store.persistent, error: store.loadError, lanAddress: await thisComputer() }; },
    deploy,
    health: run(health, 'The health check failed.'),
    action: run(action, 'The action failed.'),
    links: run(links, 'The links could not be listed.'),
    createLink: run(createLink, 'The link could not be created.'),
    linkUrl: run(linkUrl, 'The link is not available.'),
    endLink: run(endLink, 'The link could not be ended.'),
    forgetLink: run(async (instanceId, linkId) => { await store.forgetLink(instanceId, linkId); return { removed: true }; }, 'The link could not be removed from the list.'),
    close() { active?.controller.abort(); }
  };
}
