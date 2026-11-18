/** Renderer-facing share methods. The service validates meaning; this checks shape only. */
export const SHARE_METHODS = new Set(['shareCreate', 'shareStatus', 'shareCancel', 'shareList', 'shareCommand', 'shareRevoke', 'shareRevokeAll', 'shareForget',
  'shareReceive', 'shareReceiveSave', 'shareReceiveDiscard']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const invalid = () => new Error('Invalid share request.');

export function validateShareRequest(method, value = {}) {
  if (!plain(value)) throw invalid();
  switch (method) {
    case 'shareCreate':
      if (!keys(value, ['entryId', 'passphrase']) || !text(value.entryId, 32767) || (value.passphrase !== undefined && value.passphrase !== null && !text(value.passphrase, 1024))) throw invalid();
      return { entryId: value.entryId, passphrase: value.passphrase || null };
    case 'shareCommand': case 'shareRevoke': case 'shareForget':
      if (!keys(value, ['id']) || !UUID.test(value.id ?? '')) throw invalid();
      return { id: value.id };
    case 'shareReceive':
      if (!keys(value, ['command', 'incomingId', 'passphrase']) || (value.command === undefined) === (value.incomingId === undefined) ||
          (value.command !== undefined && !text(value.command, 4096)) || (value.incomingId !== undefined && !UUID.test(value.incomingId)) ||
          (value.passphrase !== undefined && value.passphrase !== null && typeof value.passphrase !== 'string') || (typeof value.passphrase === 'string' && value.passphrase.length > 1024)) throw invalid();
      return { ...(value.command !== undefined ? { command: value.command } : { incomingId: value.incomingId }), passphrase: value.passphrase || null };
    case 'shareReceiveSave':
      if (!keys(value, ['receiveId', 'destination']) || !UUID.test(value.receiveId ?? '') || !['file', 'drive'].includes(value.destination)) throw invalid();
      return { receiveId: value.receiveId, destination: value.destination };
    case 'shareReceiveDiscard':
      if (!keys(value, ['receiveId']) || !UUID.test(value.receiveId ?? '')) throw invalid();
      return { receiveId: value.receiveId };
    default:
      if (Object.keys(value).length) throw invalid();
      return {};
  }
}

export function dispatchShare(service, method, params) {
  switch (method) {
    case 'shareCreate': return service.create(params);
    case 'shareStatus': return service.status();
    case 'shareCancel': return service.cancel();
    case 'shareList': return service.list();
    case 'shareCommand': return service.command(params.id);
    case 'shareRevoke': return service.revoke(params.id);
    case 'shareRevokeAll': return service.revokeAll();
    case 'shareForget': return service.forget(params.id);
    case 'shareReceive': return service.receive(params);
    case 'shareReceiveSave': return service.save(params);
    case 'shareReceiveDiscard': return service.discard(params.receiveId);
    default: throw new Error('Unsupported request.');
  }
}

/** The share passed on the command line, as --receive "<command or link>". */
export function receiveArgument(argv) {
  if (!Array.isArray(argv)) return null;
  const index = argv.indexOf('--receive');
  if (index >= 0) return typeof argv[index + 1] === 'string' ? argv[index + 1] : null;
  // A bare link (some launchers drop the switch) is accepted only as the last argument.
  const last = argv.at(-1);
  return typeof last === 'string' && last.startsWith('material-file-encryptor://') ? last : null;
}
