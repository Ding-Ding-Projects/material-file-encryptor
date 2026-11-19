import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * File hosting instances and the links created on them. Each instance keeps its admin key and, for an own
 * Cloudflare tunnel, its tunnel token; each link keeps its full address, which carries the share key after #.
 * So the whole record is sealed with Windows protected storage before it touches the disk. Without protected
 * storage nothing is written and the records last only for this session.
 */
const MAX_FILE = 4 * 1024 * 1024;
const MAX_LINKS = 1000;

export function createHostingStore({ file, protection, newId = randomUUID, now = () => new Date() }) {
  let data = null, loadError = null;
  const persistent = () => Boolean(protection?.available?.());
  async function load() {
    if (data) return data;
    data = { version: 1, instances: [], links: [] };
    if (!persistent()) return data;
    let bytes;
    try { bytes = await fs.readFile(file); } catch (error) { if (error.code !== 'ENOENT') loadError = 'The file hosting settings could not be read.'; return data; }
    try {
      if (bytes.length > MAX_FILE) throw Error();
      const value = JSON.parse(protection.decrypt(bytes));
      if (value?.version !== 1 || !Array.isArray(value.instances) || !Array.isArray(value.links)) throw Error();
      data = value;
    } catch { loadError = 'The file hosting settings could not be read. They were kept unchanged.'; data = { version: 1, instances: [], links: [] }; }
    return data;
  }
  async function save() {
    if (!persistent() || loadError) return false;
    const sealed = protection.encrypt(JSON.stringify(data));
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, sealed, { mode: 0o600 });
    await fs.rename(temporary, file);
    return true;
  }
  /** What the renderer may see: never the admin key, the tunnel token or a link address. */
  const instanceView = item => ({ id: item.id, name: item.name, target: item.target, ssh: item.ssh ? { host: item.ssh.host, user: item.ssh.user, port: item.ssh.port, keyPath: item.ssh.keyPath } : null,
    port: item.port, cacheGb: item.cacheGb, tunnel: item.tunnel, publicUrl: item.publicUrl, quickUrl: item.quickUrl ?? null, lanUrl: item.lanUrl ?? null, image: item.image,
    createdAt: item.createdAt, deployedAt: item.deployedAt ?? null, hasTunnelToken: Boolean(item.tunnelToken) });
  return {
    get persistent() { return persistent() && !loadError; },
    get loadError() { return loadError; },
    instanceView,
    async instances() { return (await load()).instances; },
    async instance(id) { return (await load()).instances.find(item => item.id === id) ?? null; },
    async byName(name, target, host = null) { return (await load()).instances.find(item => item.name === name && item.target === target && (item.ssh?.host ?? null) === host) ?? null; },
    async putInstance(record) {
      await load();
      const existing = data.instances.findIndex(item => item.id === record.id);
      const value = { ...record, id: record.id ?? newId(), createdAt: record.createdAt ?? now().toISOString() };
      if (existing >= 0) data.instances[existing] = value; else data.instances.push(value);
      await save(); return value;
    },
    async removeInstance(id) {
      await load();
      data.instances = data.instances.filter(item => item.id !== id);
      data.links = data.links.filter(item => item.instanceId !== id);
      await save();
    },
    async links(instanceId) { return (await load()).links.filter(item => item.instanceId === instanceId); },
    async link(instanceId, linkId) { return (await load()).links.find(item => item.instanceId === instanceId && item.linkId === linkId) ?? null; },
    async addLink(record) {
      await load();
      data.links.unshift({ ...record, createdAt: now().toISOString(), hubRemoved: false });
      if (data.links.length > MAX_LINKS) data.links.length = MAX_LINKS;
      await save();
    },
    async updateLink(instanceId, linkId, patch) {
      await load();
      const link = data.links.find(item => item.instanceId === instanceId && item.linkId === linkId);
      if (link) { Object.assign(link, patch); await save(); }
      return link ?? null;
    },
    async forgetLink(instanceId, linkId) { await load(); data.links = data.links.filter(item => !(item.instanceId === instanceId && item.linkId === linkId)); await save(); }
  };
}
