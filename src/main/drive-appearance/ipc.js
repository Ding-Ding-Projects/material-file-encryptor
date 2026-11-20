/** Renderer-facing drive appearance methods. Shape checks only; files are chosen in the main process. */
export const APPEARANCE_METHODS = new Set(['driveAppearanceList', 'driveAppearanceChoose', 'driveAppearanceRemove', 'openStorageFolder']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => new Error('Invalid drive appearance request.');
const SESSION = /^[A-Za-z0-9_-]{1,64}$/;

export function validateAppearanceRequest(method, value = {}) {
  if (!plain(value)) throw invalid();
  if (method === 'driveAppearanceList') { if (Object.keys(value).length) throw invalid(); return {}; }
  if (method === 'openStorageFolder') { if (Object.keys(value).some(key => key !== 'sessionId' && key !== 'which') || !SESSION.test(value.sessionId ?? '') || (value.which !== undefined && value.which !== 'storage' && value.which !== 'cache')) throw invalid(); return value.which === 'cache' ? { sessionId: value.sessionId, which: 'cache' } : { sessionId: value.sessionId }; }
  const allowed = method === 'driveAppearanceChoose' ? ['sessionId', 'kind', 'acknowledged'] : ['sessionId', 'kind'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || !SESSION.test(value.sessionId ?? '') || !['icon', 'banner'].includes(value.kind)) throw invalid();
  if (method === 'driveAppearanceChoose' && value.acknowledged !== true) throw invalid();
  return method === 'driveAppearanceChoose' ? { sessionId: value.sessionId, kind: value.kind, acknowledged: true } : { sessionId: value.sessionId, kind: value.kind };
}
