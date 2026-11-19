/** Pure helpers for the file hosting dialog. */
export const fill = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

export function formatBytes(value) {
  if (!Number.isFinite(value)) return '—';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']; let n = value, i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : String(n)) + ' ' + units[i];
}
/** A date and 24-hour time. */
export function formatClock(value, language = 'en') {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'zh-HK' ? 'zh-HK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(date);
}
export function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const EXPIRY_CHOICES = [{ id: '1h', label: 'exp1h' }, { id: '1d', label: 'exp1d' }, { id: '7d', label: 'exp7d' }, { id: '30d', label: 'exp30d' }, { id: 'custom', label: 'expCustom' }];
export const LIMIT_CHOICES = [{ id: 'none', label: 'limitNone' }, { id: '1', label: 'limit1' }, { id: '3', label: 'limit3' }, { id: '10', label: 'limit10' }, { id: 'custom', label: 'limitCustom' }];
const SPANS = { '1h': 3600e3, '1d': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };

/** The expiry in milliseconds, or null when the custom time is missing or outside one minute to one year. */
export function expiryFrom(choice, custom, now = Date.now()) {
  const at = choice === 'custom' ? new Date(custom).getTime() : now + (SPANS[choice] ?? NaN);
  if (!Number.isFinite(at) || at <= now + 60000 || at > now + 365 * 86400e3) return null;
  return Math.floor(at);
}

export function linkStateKey(link) {
  if (link.state === 'active') return 'linkActive';
  if (link.state === 'missing' || link.endedReason === 'missing') return 'linkMissing';
  if (link.endedReason === 'expired') return 'linkExpired';
  if (link.endedReason === 'limit') return 'linkUsedUp';
  return 'linkEnded';
}

export function defaultSettings() {
  return { name: 'files', target: 'local', port: 8790, cacheGb: 10, tunnel: 'quick', publicUrl: '', ssh: { host: '', user: '', port: 22, keyPath: '' } };
}

/** A short reason the draft cannot leave the given step, or null. The main process validates again. */
export function settingsFromDraft(draft, step) {
  if (step >= 0 && draft.target === 'ssh') {
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(String(draft.ssh.host).trim()) || String(draft.ssh.host).startsWith('-')) return 'SSH host';
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(draft.ssh.user).trim()) || String(draft.ssh.user).startsWith('-')) return 'SSH user';
    const port = Number(draft.ssh.port); if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return 'SSH port';
  }
  if (step >= 1) {
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(String(draft.name).trim().toLowerCase())) return 'Instance name: 3 to 32 lowercase letters, digits and hyphens';
    const port = Number(draft.port); if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) return 'Web port: 1024 to 65535';
    const cache = Number(draft.cacheGb); if (!Number.isFinite(cache) || cache < 1 || cache > 2000) return 'Cache size: 1 to 2000 GB';
  }
  if (step >= 2 && draft.tunnel === 'named') {
    let url; try { url = new URL(String(draft.publicUrl).trim()); } catch { return 'Public URL'; }
    if (url.protocol !== 'https:') return 'Public URL must start with https://';
  }
  return null;
}
