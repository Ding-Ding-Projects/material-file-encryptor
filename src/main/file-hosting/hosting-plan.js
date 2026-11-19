import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellQuote, sshBaseArgs } from '../../features/server-manager/launch-plans.js';

/**
 * Pure planning for a file hosting instance: validated settings, the files written beside its compose.yaml,
 * and the exact docker and ssh arguments. Nothing here runs a process.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
export const HOSTING_ROOT = path.resolve(here, '../../../file-hosting');
export const SERVER_VERSION = JSON.parse(readFileSync(path.join(HOSTING_ROOT, 'server', 'package.json'), 'utf8')).version;
export const DEFAULT_IMAGE = `ghcr.io/ding-ding-projects/material-file-encryptor-hosting:${SERVER_VERSION}`;
export const COMPOSE_TEXT = readFileSync(path.join(HOSTING_ROOT, 'compose.yaml'), 'utf8');
export const REMOTE_BASE = 'material-file-encryptor-hosting';

const NAME = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]{0,200}(?::[A-Za-z0-9._-]{1,128})?(?:@sha256:[a-f0-9]{64})?$/;
const TOKEN = /^[A-Za-z0-9_=+/.-]{20,4096}$/;
export const TUNNELS = ['none', 'quick', 'named'];
export const TARGETS = ['local', 'ssh'];

export function planError(field, message) { const error = Error(message); error.code = 'INVALID_SETTINGS'; error.field = field; return error; }

/** Checks and normalises the wizard's settings. Secrets are checked here and never echoed back in an error. */
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw planError('settings', 'The settings are not valid.');
  const name = String(value.name ?? '').trim().toLowerCase();
  if (!NAME.test(name)) throw planError('name', 'Use 3 to 32 lowercase letters, digits and hyphens for the instance name.');
  if (!TARGETS.includes(value.target)) throw planError('target', 'Choose this computer or an SSH host.');
  const port = Number(value.port);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw planError('port', 'Choose a port between 1024 and 65535.');
  const cacheGb = Number(value.cacheGb ?? 10);
  if (!Number.isFinite(cacheGb) || cacheGb < 1 || cacheGb > 2000) throw planError('cacheGb', 'Choose a cache size between 1 and 2000 GB.');
  if (!TUNNELS.includes(value.tunnel ?? 'none')) throw planError('tunnel', 'Choose how the server is reached from outside.');
  const tunnel = value.tunnel ?? 'none';
  let publicUrl = null;
  if (tunnel === 'named') {
    let url; try { url = new URL(String(value.publicUrl ?? '')); } catch { throw planError('publicUrl', 'Type the public address, for example https://files.example.com'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname.includes('.')) throw planError('publicUrl', 'The public address must be a plain https:// address.');
    publicUrl = url.origin + url.pathname.replace(/\/+$/, '');
    if (value.tunnelToken !== undefined && value.tunnelToken !== null && !TOKEN.test(String(value.tunnelToken).trim())) throw planError('tunnelToken', 'The tunnel token does not look right. Copy it again from the Cloudflare dashboard.');
  }
  const image = String(value.image ?? DEFAULT_IMAGE).trim();
  if (!IMAGE.test(image)) throw planError('image', 'The image name is not valid.');
  let ssh = null;
  if (value.target === 'ssh') {
    const raw = value.ssh ?? {};
    ssh = { host: String(raw.host ?? '').trim(), user: String(raw.user ?? '').trim(), port: Number(raw.port ?? 22), keyPath: raw.keyPath ? String(raw.keyPath).trim() : null };
    try { sshBaseArgs(ssh); } catch { throw planError('ssh', 'Check the SSH host, user, port and key file.'); }
  }
  return { name, target: value.target, port, cacheGb, tunnel, publicUrl, image, ssh };
}

const envLine = (key, value) => { const text = String(value); if (/[\r\n]/.test(text)) throw planError(key, 'A setting contains a line break.'); return `${key}=${text}\n`; };

/** The files written next to compose.yaml. hosting.env and tunnel.env hold secrets and are written owner-only. */
export function instanceFiles(settings, { adminToken, tunnelToken = null }) {
  if (typeof adminToken !== 'string' || adminToken.length < 32) throw planError('adminToken', 'The admin key is missing.');
  const files = {
    'compose.yaml': COMPOSE_TEXT,
    '.env': envLine('INSTANCE', `mfe-${settings.name}`) + envLine('PORT', settings.port) + envLine('CACHE_MAX_GB', settings.cacheGb) + envLine('FILE_HOSTING_IMAGE', settings.image),
    'hosting.env': envLine('ADMIN_TOKEN', adminToken)
  };
  if (settings.tunnel === 'named') {
    if (!tunnelToken) throw planError('tunnelToken', 'Paste the tunnel token from the Cloudflare dashboard.');
    files['tunnel.env'] = envLine('TUNNEL_TOKEN', tunnelToken.trim());
  }
  return files;
}
export const SECRET_FILES = new Set(['hosting.env', 'tunnel.env']);

export function profileArgs(settings) {
  return settings.tunnel === 'quick' ? ['--profile', 'quick-tunnel'] : settings.tunnel === 'named' ? ['--profile', 'named-tunnel'] : [];
}

/** docker compose arguments for an action, run from the instance directory. */
export function composeArgs(settings, action) {
  const base = ['compose', ...profileArgs(settings)];
  switch (action) {
    case 'pull': return [...base, 'pull', '--quiet'];
    case 'up': return [...base, 'up', '-d', '--remove-orphans'];
    case 'restart': return [...base, 'restart'];
    case 'stop': return [...base, 'stop'];
    case 'down': return [...base, 'down', '--volumes', '--remove-orphans'];
    case 'logs': return [...base, 'logs', '--no-color', '--tail', '200'];
    case 'tunnel-logs': return [...base, 'logs', '--no-color', '--tail', '400', 'quick-tunnel'];
    case 'ps': return [...base, 'ps', '--format', 'json'];
    default: throw planError('action', 'Unknown action.');
  }
}

/** The instance directory on an SSH host, relative to the login directory. */
export const remoteDirectory = name => { if (!NAME.test(name)) throw planError('name', 'Invalid instance name.'); return `${REMOTE_BASE}/${name}`; };

/** One remote shell command: cd into the instance directory and run docker with quoted arguments. */
export function remoteDocker(settings, args) {
  return 'cd ' + shellQuote(remoteDirectory(settings.name)) + ' && docker ' + args.map(shellQuote).join(' ');
}
/** Writes stdin to a file in the instance directory, owner-only, through a temporary name. */
export function remoteWrite(settings, fileName) {
  if (!/^(?:compose\.yaml|\.env|hosting\.env|tunnel\.env)$/.test(fileName)) throw planError('file', 'Unexpected file.');
  const directory = shellQuote(remoteDirectory(settings.name));
  return `umask 077 && mkdir -p ${directory} && cd ${directory} && tee -- ${shellQuote(fileName + '.part')} > /dev/null && mv ${shellQuote(fileName + '.part')} ${shellQuote(fileName)}`;
}
export const remoteRemove = settings => 'rm -rf -- ' + shellQuote(remoteDirectory(settings.name));
export const sshArgsFor = (settings, command) => [...sshBaseArgs(settings.ssh), command];
/** Forwards a local loopback port to the instance's port on the SSH host, for admin requests that must not cross the network in the clear. */
export const sshForwardArgs = (settings, localPort) => ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${localPort}:127.0.0.1:${settings.port}`, ...sshBaseArgs(settings.ssh)];

/** The trycloudflare.com address in quick tunnel logs, if one has been printed. */
export function quickTunnelUrl(logText) {
  const matches = String(logText).match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com/g);
  return matches ? matches.at(-1) : null;
}

/** A private IPv4 address of this computer for the LAN link, preferring the usual home ranges. */
export function lanAddress(interfaces) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces || {})) for (const item of list || []) {
    if (item.family !== 'IPv4' && item.family !== 4) continue;
    if (item.internal || /^169\.254\./.test(item.address)) continue;
    if (/vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback/i.test(name)) continue;
    const score = /^192\.168\./.test(item.address) ? 0 : /^10\./.test(item.address) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(item.address) ? 2 : 3;
    candidates.push({ address: item.address, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.address ?? null;
}

/** The base address links are built on: own tunnel, then quick tunnel, then the LAN. */
export function linkBase(instance) {
  return instance.publicUrl || instance.quickUrl || instance.lanUrl || null;
}
