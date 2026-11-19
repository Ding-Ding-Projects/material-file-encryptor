/**
 * Pure view model for the automatic backup table: groups drives by repository, names each drive's state, and
 * builds the summary line. Every value comes from the host's automatic backup status; nothing is invented.
 */
export const TAG_LIMIT = 1000;
export const TAG_WARNING = 800;

/** Percent of the running step, from bytes when known, otherwise from counted items. Null when unknown. */
export function progressPercent(progress) {
  if (!progress) return null;
  // The same blend as the page's bar: files and bytes averaged, so many small objects still move the number.
  const byBytes = Number.isFinite(progress.totalBytes) && progress.totalBytes > 0 ? progress.completedBytes / progress.totalBytes : null;
  const byFiles = Number.isFinite(progress.totalFiles) && progress.totalFiles > 0 ? progress.completedFiles / progress.totalFiles : null;
  const ratio = byBytes !== null && byFiles !== null ? (byBytes + byFiles) / 2 : byBytes ?? byFiles;
  return ratio === null || !Number.isFinite(ratio) ? null : Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** A short relative time: { key, count } where key is a copy key. */
export function relativeTime(iso, now = Date.now()) {
  const time = Date.parse(iso ?? '');
  if (!Number.isFinite(time)) return { key: 'Never' };
  const minutes = Math.floor(Math.max(0, now - time) / 60000);
  if (minutes < 1) return { key: 'just now' };
  if (minutes < 60) return { key: '{count} min ago', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: '{count} h ago', count: hours };
  return { key: 'date', time };
}

/** One state per drive row: { key, tone, percent }. tone is ok, busy, warn, error or muted. */
export function driveState(drive) {
  if (drive.phase === 'unavailable') return { key: 'No encrypted storage', tone: 'muted' };
  if (!drive.enabled) return { key: 'Backup off', tone: 'muted' };
  if (drive.phase === 'backing-up') return { key: 'Backing up…', tone: 'busy', percent: progressPercent(drive.progress) };
  if (drive.phase === 'paused') return { key: 'Paused while you use the drive', tone: 'busy' };
  if (drive.phase === 'waiting-connection') return { key: 'Waiting for connection', tone: 'warn' };
  if (drive.phase === 'needs-attention') return { key: 'Needs attention', tone: 'error' };
  if (drive.dirty) return { key: 'Changes waiting', tone: 'busy' };
  if (drive.lastBackup) return { key: 'Backed up', tone: 'ok' };
  return { key: 'Waiting for the first backup', tone: 'muted' };
}

/** Repository groups, configured ones first and in name order; drives without a destination last. */
export function groupDrives(drives = []) {
  const groups = new Map();
  for (const drive of drives) {
    const key = drive.repository || '';
    if (!groups.has(key)) groups.set(key, { repository: drive.repository || null, visibility: drive.visibility || null, drives: [], tagCount: null });
    const group = groups.get(key);
    group.drives.push(drive);
    if (Number.isSafeInteger(drive.tagCount)) group.tagCount = Math.max(group.tagCount ?? 0, drive.tagCount);
  }
  return [...groups.values()].map(group => ({ ...group, nearLimit: Number.isSafeInteger(group.tagCount) && group.tagCount >= TAG_WARNING }))
    .sort((a, b) => (a.repository === null) - (b.repository === null) || String(a.repository).localeCompare(String(b.repository)));
}

/** The page summary and the matching status bar text. */
export function summary(status, now = Date.now()) {
  if (!status) return { key: 'Loading the drive list…', tone: 'muted' };
  if (!status.signedIn) return { key: 'Sign in to Docker Hub to back up automatically', tone: 'muted' };
  if (status.noticeRequired) return { key: 'Read the notice below to turn on automatic backup', tone: 'warn' };
  if (!status.settings.enabled) return { key: 'Automatic backup is off', tone: 'muted' };
  const active = status.drives.filter(drive => drive.enabled && drive.phase !== 'unavailable');
  const running = active.find(drive => drive.phase === 'backing-up');
  if (running) return { key: 'Backing up… {percent}%', percent: progressPercent(running.progress), tone: 'busy' };
  if (!status.online || active.some(drive => drive.phase === 'waiting-connection')) return { key: 'Waiting for connection', tone: 'warn' };
  if (active.some(drive => drive.phase === 'needs-attention')) return { key: 'Needs attention', tone: 'error' };
  const latest = active.map(drive => Date.parse(drive.lastBackup ?? '')).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (!Number.isFinite(latest)) return { key: 'Automatic backup is on', tone: 'ok' };
  return { key: 'Backed up {ago}', ago: relativeTime(new Date(latest).toISOString(), now), tone: 'ok' };
}

/** The first 6 characters of a device or vault id, for display beside a label. */
export const shortId = value => typeof value === 'string' && /^[a-f0-9]{6,}$/.test(value) ? value.slice(0, 6) : '';

/**
 * The status bar line for one drive: { key, tone, percent?, ago? }, or null when automatic backup does not cover the
 * drive (no status yet, or a drive whose storage is not a folder), so the caller keeps its own storage wording.
 */
export function statusBarState(status, sessionId, now = Date.now()) {
  const drive = status?.drives?.find(item => item.sessionId === sessionId);
  if (!drive || drive.phase === 'unavailable') return null;
  if (!status.settings?.enabled || !drive.enabled || status.noticeRequired) return { key: 'Automatic backup off', tone: 'muted' };
  if (drive.phase === 'backing-up') {
    const percent = progressPercent(drive.progress);
    const done = drive.progress?.completedFiles, total = drive.progress?.totalFiles;
    // With file counts the line keeps moving while thousands of small objects are sent and the byte share is still 0%.
    if (percent !== null && Number.isSafeInteger(done) && Number.isSafeInteger(total) && total > 0)
      return { key: 'Backing up… {percent}% · {done} of {total} files', percent, done: done.toLocaleString(), total: total.toLocaleString(), tone: 'busy' };
    return percent === null ? { key: 'Backing up…', tone: 'busy' } : { key: 'Backing up… {percent}%', percent, tone: 'busy' };
  }
  if (drive.phase === 'paused') return { key: 'Paused', tone: 'busy' };
  if (drive.phase === 'needs-attention') return { key: 'Needs attention', tone: 'error' };
  if (drive.phase === 'waiting-connection' || status.online === false) return { key: 'Waiting for connection', tone: 'warn' };
  if (!status.signedIn) return { key: 'Sign in to back up', tone: 'muted' };
  if (drive.dirty) return { key: 'Changes waiting', tone: 'busy' };
  if (drive.lastBackup) return { key: 'Backed up {ago}', ago: relativeTime(drive.lastBackup, now), tone: 'ok' };
  return { key: 'Waiting for the first backup', tone: 'muted' };
}

/**
 * The details pane sentence for one drive: the status bar state, but it says whether backup is off for
 * this drive only or for every drive, and why a backup is paused. null when automatic backup does not
 * know the drive, so the caller can fall back to the older per-drive destination.
 */
export function detailsPaneState(status, sessionId, now = Date.now()) {
  const line = statusBarState(status, sessionId, now);
  if (!line) return null;
  const drive = status.drives.find(item => item.sessionId === sessionId);
  if (line.key === 'Automatic backup off' && status.settings?.enabled && !status.noticeRequired && !drive.enabled) return { key: 'Automatic backup is off for this drive', tone: 'muted' };
  if (line.key === 'Paused') return { key: 'Paused while you use the drive', tone: 'busy' };
  return line;
}
