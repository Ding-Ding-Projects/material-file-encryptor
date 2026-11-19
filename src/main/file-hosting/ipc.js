/** Renderer-facing file hosting methods. The service validates meaning; this checks shape only. */
export const HOSTING_METHODS = new Set(['hostingInstances', 'hostingStatus', 'hostingDeploy', 'hostingCancel', 'hostingHealth', 'hostingAction', 'hostingLinks',
  'hostingCreateLink', 'hostingLinkUrl', 'hostingEndLink', 'hostingForgetLink']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LINK = /^[A-Za-z0-9_-]{22}$/;
const only = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const invalid = () => new Error('Invalid file hosting request.');
const short = (value, max) => value === undefined || value === null || (typeof value === 'string' && value.length <= max);

export function validateHostingRequest(method, value = {}) {
  if (!plain(value)) throw invalid();
  switch (method) {
    case 'hostingDeploy': {
      if (!only(value, ['settings', 'tunnelToken']) || !plain(value.settings) || !short(value.tunnelToken, 4096)) throw invalid();
      const s = value.settings;
      if (!only(s, ['name', 'target', 'port', 'cacheGb', 'tunnel', 'publicUrl', 'image', 'ssh']) || !short(s.name, 64) || !short(s.publicUrl, 400) || !short(s.image, 400) ||
          (s.ssh !== undefined && s.ssh !== null && (!plain(s.ssh) || !only(s.ssh, ['host', 'user', 'port', 'keyPath']) || !short(s.ssh.host, 255) || !short(s.ssh.user, 64) || !short(s.ssh.keyPath, 400)))) throw invalid();
      return { settings: s, tunnelToken: value.tunnelToken ?? null };
    }
    case 'hostingHealth': case 'hostingLinks':
      if (!only(value, ['id']) || !UUID.test(value.id ?? '')) throw invalid();
      return { id: value.id };
    case 'hostingAction':
      if (!only(value, ['id', 'action']) || !UUID.test(value.id ?? '') || !['start', 'restart', 'stop', 'update', 'logs', 'remove'].includes(value.action)) throw invalid();
      return { id: value.id, action: value.action };
    case 'hostingCreateLink':
      if (!only(value, ['instanceId', 'shareId', 'expiresAt', 'maxDownloads', 'removeFromHub', 'prefetch']) || !UUID.test(value.instanceId ?? '') || !UUID.test(value.shareId ?? '') ||
          !Number.isSafeInteger(value.expiresAt) || !(value.maxDownloads === null || value.maxDownloads === undefined || (Number.isSafeInteger(value.maxDownloads) && value.maxDownloads >= 1 && value.maxDownloads <= 100000)) ||
          (value.removeFromHub !== undefined && typeof value.removeFromHub !== 'boolean') || (value.prefetch !== undefined && typeof value.prefetch !== 'boolean')) throw invalid();
      return { instanceId: value.instanceId, shareId: value.shareId, expiresAt: value.expiresAt, maxDownloads: value.maxDownloads ?? null, removeFromHub: Boolean(value.removeFromHub), prefetch: value.prefetch !== false };
    case 'hostingLinkUrl': case 'hostingEndLink': case 'hostingForgetLink':
      if (!only(value, ['instanceId', 'linkId']) || !UUID.test(value.instanceId ?? '') || !LINK.test(value.linkId ?? '')) throw invalid();
      return { instanceId: value.instanceId, linkId: value.linkId };
    default:
      if (Object.keys(value).length) throw invalid();
      return {};
  }
}

export function dispatchHosting(service, method, params) {
  switch (method) {
    case 'hostingInstances': return service.instances();
    case 'hostingStatus': return service.status();
    case 'hostingDeploy': return service.deploy(params);
    case 'hostingCancel': return service.cancel();
    case 'hostingHealth': return service.health(params.id);
    case 'hostingAction': return service.action(params.id, params.action);
    case 'hostingLinks': return service.links(params.id);
    case 'hostingCreateLink': return service.createLink(params);
    case 'hostingLinkUrl': return service.linkUrl(params.instanceId, params.linkId);
    case 'hostingEndLink': return service.endLink(params.instanceId, params.linkId);
    case 'hostingForgetLink': return service.forgetLink(params.instanceId, params.linkId);
    default: throw new Error('Unsupported request.');
  }
}
