/**
 * Compatibility entry points for the retired permission-only converter launcher.
 * Unknown process.permission scopes also return false, so has('net') cannot
 * establish network isolation. This module has no OS confinement mechanism.
 * Use the separately verified Windows AppContainer provider for execution.
 */
export function probeRestrictedRuntime() {
 return false;
}

// Do not inspect request fields or start a child before rejecting this route.
export function createRestrictedProcess() {
 throw Object.assign(new Error('Converter capability unavailable: verified operating-system isolation with enforced network denial is required. Use the verified AppContainer provider; the permission-only launcher is disabled.'), {
  code: 'ERR_CONVERTER_NETWORK_ISOLATION_UNAVAILABLE'
 });
}
