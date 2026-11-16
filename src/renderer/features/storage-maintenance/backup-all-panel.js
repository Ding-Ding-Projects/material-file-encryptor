import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { reducedMotionRequested } from '../../../shared/surface/reduced-motion.js';
import { BACKUP_ALL_COPY } from './backup-all-copy.js';
import { BACKUP_ALL_METHODS, backupAllPlan, backupAllStatus, defaultBackupSelection, backupSummary, validBackupSuffix, fill } from './backup-all-model.js';

const POLL_MS = 800;
const REASON_COPY = { locked: 'backupUnlockToInclude', 'no-storage': 'backupNoStorage', 'not-folder': 'backupNotFolder' };
const STYLE = `
section{border-top:1px solid var(--md-sys-color-outline-variant);padding-top:16px;margin-top:24px;display:grid;gap:12px;min-width:0}
h3,p,li{overflow-wrap:anywhere;margin:0}
.account{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;border-radius:16px;background:var(--md-sys-color-secondary-container,#e4e6ff);color:var(--md-sys-color-on-secondary-container,#0e1a6e)}
.account .dot{width:8px;height:8px;border-radius:4px;background:currentColor;flex:none}
.drives{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.drive{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:12px 14px;border:1px solid var(--md-sys-color-outline-variant);border-radius:16px;background:var(--md-sys-color-surface-container-low,transparent);animation:rise 360ms cubic-bezier(.05,.7,.1,1) both}
.drive[data-disabled=true]{opacity:.7}
.check{display:flex;align-items:center;gap:10px;min-height:48px;min-width:0}
.check input{width:20px;height:20px;flex:none}
.name{font-weight:600}
.repo{grid-column:1 / -1;display:grid;gap:4px}
.repo input{width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--md-sys-color-outline,#777);border-radius:8px;background:transparent;color:inherit;font:inherit}
.times{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--md-sys-color-on-surface-variant,#555)}
.badge{padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;background:var(--md-sys-color-surface-variant,#e4e6f0);color:var(--md-sys-color-on-surface-variant,#3a3c4c);white-space:nowrap}
.badge[data-state=done]{background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31);animation:pop 420ms cubic-bezier(.05,.7,.1,1) both}
.badge[data-state=failed]{background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002)}
.badge[data-state=syncing],.badge[data-state=repository],.badge[data-state=configuring]{background:var(--md-sys-color-primary-container,#e6e8ff);color:var(--md-sys-color-on-primary-container,#26318f)}
.error{grid-column:1 / -1;color:var(--md-sys-color-error);margin:0}
.notice{padding:12px 14px;border-radius:16px;background:var(--md-sys-color-tertiary-container,#ffe0b8);color:var(--md-sys-color-on-tertiary-container,#4a2c00)}
.asis{color:var(--md-sys-color-on-surface-variant,#555)}
.actions{display:flex;flex-wrap:wrap;gap:12px}
md-linear-progress{width:100%}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.1);opacity:1}100%{transform:none}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}
@media(max-width:420px){.drive{grid-template-columns:minmax(0,1fr)}.badge{justify-self:start}}`;

/** One-click backup of every drive. The host does the work; this panel selects drives, names repositories and shows progress. */
export class BackupAllPanel extends SurfaceElement {
  constructor() {
    super();
    this.pollMs = POLL_MS; this.services = {}; this.login = null; this.translateText = value => value; this.disposed = false;
    this.plan = null; this.status = null; this.selected = new Set(); this.names = {}; this.known = new Set();
    this.loading = false; this.pending = null; this.error = ''; this.message = ''; this.timer = null; this.waitingSignIn = false; this.hasRun = false; this.rows = new Map(); this.stopLogin = null;
    this.style(STYLE);
    this.heading = element('h3', { id: 'backup-all-title' }); this.intro = element('p');
    this.account = element('p', { class: 'account', role: 'status', 'aria-live': 'polite' });
    this.driveHeading = element('h3'); this.list = element('ul', { class: 'drives', 'aria-label': '' });
    this.emptyText = element('p');
    this.warning = element('p', { class: 'notice', role: 'note' }); this.asIs = element('p', { class: 'asis' }); this.schedule = element('p', { class: 'asis' });
    this.statusText = element('p', { role: 'status', 'aria-live': 'polite' }); this.errorText = element('p', { class: 'error', role: 'alert' });
    this.progress = element('md-linear-progress', { value: 0 });
    this.buttons = {};
    for (const key of ['start', 'cancel', 'refresh']) {
      const node = element(key === 'start' ? 'md-filled-button' : 'md-outlined-button', { type: 'button' });
      node.addEventListener('click', () => { if (!node.disabled) void this[key](); }); this.buttons[key] = node;
    }
    this.shadowRoot.append(element('section', { 'aria-labelledby': 'backup-all-title' }, [this.heading, this.intro, this.account, this.driveHeading, this.list, this.emptyText,
      this.warning, this.asIs, this.schedule, this.progress, this.statusText, this.errorText, element('div', { class: 'actions' }, Object.values(this.buttons))]));
    this.render();
  }
  t(key, values) {
    const [en, yue] = BACKUP_ALL_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  available() { return BACKUP_ALL_METHODS.every(name => typeof this.services[name] === 'function'); }
  configure({ services = {}, translate = value => value, language = 'en', login = null } = {}) {
    this.services = services; this.translateText = translate; this.language = language;
    if (login && login !== this.login) {
      this.stopLogin?.(); this.login = login;
      this.stopLogin = login.onSignedInChange?.(() => { if (this.waitingSignIn && !this.disposed) { this.waitingSignIn = false; void this.begin(); } else this.render(); });
      login.onRender?.(() => { if (!this.disposed) this.renderAccount(); });
    }
    void this.load(); return this;
  }
  setLanguage(language) { this.language = language; this.render(); }
  setVaultState() { /* Backup covers every drive, so a selection change only needs a fresh plan. */ if (this.available() && !this.pending && !this.loading) void this.load(); }

  async load() {
    if (this.disposed || !this.available()) { this.render(); return; }
    this.loading = true; this.error = ''; this.render();
    try {
      const plan = backupAllPlan(await this.services.backupAllPlan());
      if (this.disposed) return;
      this.plan = plan;
      for (const row of plan.drives) {
        if (!this.known.has(row.sessionId)) { this.known.add(row.sessionId); if (!row.ineligibleReason) this.selected.add(row.sessionId); this.names[row.sessionId] = row.suffix; }
        else if (row.ineligibleReason) this.selected.delete(row.sessionId);
      }
      for (const id of [...this.selected]) if (!plan.drives.some(row => row.sessionId === id)) this.selected.delete(id);
      const status = backupAllStatus(await this.services.backupAllStatus());
      if (this.disposed) return;
      this.status = status; if (status.phase === 'running') { this.hasRun = true; this.schedulePoll(); }
    } catch { if (!this.disposed) { this.error = 'backupStatusUnavailable'; } }
    finally { if (!this.disposed) { this.loading = false; this.render(); } }
  }
  async refresh() { await this.load(); }

  /** Back up the selected drives. Signs in first when needed, and continues by itself once sign-in is verified. */
  async start() {
    if (this.disposed || this.pending || this.status?.phase === 'running' || !this.available()) return;
    this.error = ''; this.message = '';
    if (!this.selected.size) { this.error = 'backupChooseDrive'; this.render(); return; }
    if (this.login && !this.login.signedIn) {
      this.waitingSignIn = true; this.render();
      this.login.root?.scrollIntoView?.({ block: 'center', behavior: reducedMotionRequested() ? 'auto' : 'smooth' });
      await this.login.primary?.(); return;
    }
    await this.begin();
  }
  async begin() {
    if (this.disposed || this.pending) return;
    const ids = this.plan?.drives.filter(row => this.selected.has(row.sessionId) && !row.ineligibleReason).map(row => row.sessionId) || [];
    if (!ids.length) { this.error = 'backupChooseDrive'; this.render(); return; }
    const names = {};
    for (const id of ids) {
      const value = String(this.names[id] ?? '').trim();
      if (!validBackupSuffix(value) || Object.values(names).includes(value)) { this.error = 'backupInvalidName'; this.render(); this.rows.get(id)?.input.focus?.(); return; }
      names[id] = value;
    }
    this.pending = 'start'; this.render();
    try {
      this.status = backupAllStatus(await this.services.backupAllStart({ sessionIds: ids, names }));
      this.hasRun = true; this.schedulePoll();
    } catch (error) {
      if (this.disposed) return;
      if (/Sign in to Docker Hub|account name/i.test(String(error?.message))) { this.waitingSignIn = true; await this.login?.recheck?.(); if (this.login && !this.login.signedIn) await this.login.primary?.(); }
      else this.error = 'backupStartFailed';
    } finally { if (!this.disposed) { this.pending = null; this.render(); } }
  }
  async cancel() {
    if (this.disposed || this.status?.phase !== 'running' || this.pending === 'cancel') return;
    this.pending = 'cancel'; this.render();
    try { this.status = backupAllStatus(await this.services.backupAllCancel()); }
    catch { if (!this.disposed) this.error = 'backupStatusUnavailable'; }
    finally { if (!this.disposed) { this.pending = null; this.render(); } }
  }
  schedulePoll() {
    if (this.timer !== null || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; void this.poll(); }, this.pollMs);
  }
  async poll() {
    if (this.disposed) return;
    try {
      const status = backupAllStatus(await this.services.backupAllStatus());
      if (this.disposed) return;
      const wasRunning = this.status?.phase === 'running'; this.status = status;
      if (status.phase === 'running') this.schedulePoll();
      else if (wasRunning) { this.render(); await this.load(); return; }
    } catch { if (!this.disposed) { this.error = 'backupStatusUnavailable'; this.schedulePoll(); } }
    if (!this.disposed) this.render();
  }
  /** Called by the drive workspace command bar. Brings this panel into view and, when asked, starts at once. */
  focusStart(auto = false) {
    if (this.disposed) return;
    this.scrollIntoView?.({ block: 'start', behavior: reducedMotionRequested() ? 'auto' : 'smooth' });
    this.buttons.start.focus?.();
    if (auto) void this.start();
  }

  formatTime(iso) {
    if (!iso) return this.t('backupNever');
    try { return new Date(iso).toLocaleString(this.language === 'zh-HK' ? 'zh-HK' : undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; }
  }
  renderAccount() {
    const value = this.login?.value;
    const signed = value?.state === 'signed-in';
    this.account.textContent = signed ? `${this.t('backupAccount')}: ${value.account || this.t('loginSignedInUnknown')}` : `${this.t('backupAccount')}: ${this.t('loginNotSignedIn')}`;
  }
  row(drive) {
    let entry = this.rows.get(drive.sessionId);
    if (!entry) {
      const check = element('input', { type: 'checkbox' }), label = element('span', { class: 'name' }), badge = element('span', { class: 'badge' });
      const input = element('input', { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: 100 }), repoLabel = element('label', { class: 'repo' });
      const caption = element('span'), times = element('div', { class: 'times' }), last = element('span'), next = element('span'), error = element('p', { class: 'error', role: 'alert' });
      repoLabel.append(caption, input); times.append(last, next);
      check.addEventListener('change', () => { if (check.checked) this.selected.add(drive.sessionId); else this.selected.delete(drive.sessionId); this.error = ''; this.render(); });
      input.addEventListener('input', () => { this.names[drive.sessionId] = input.value; });
      const item = element('li', { class: 'drive' }, [element('label', { class: 'check' }, [check, label]), badge, repoLabel, times, error]);
      entry = { item, check, label, badge, input, caption, times, last, next, error }; this.rows.set(drive.sessionId, entry);
      input.value = this.names[drive.sessionId] ?? drive.suffix;
    }
    return entry;
  }
  render() {
    const available = this.available(), running = this.status?.phase === 'running', plan = this.plan;
    this.heading.textContent = this.t('backupTitle'); this.intro.textContent = this.t('backupIntro');
    this.driveHeading.textContent = this.t('backupDrives'); this.list.setAttribute('aria-label', this.t('backupDrives'));
    this.warning.textContent = this.t('backupPublicWarning'); this.asIs.textContent = this.t('backupAsIs'); this.schedule.textContent = this.t('backupSchedule');
    this.renderAccount();
    const statusById = new Map((this.status?.drives || []).map(row => [row.sessionId, row]));
    const drives = plan?.drives || [];
    this.emptyText.hidden = Boolean(drives.length) || this.loading; this.emptyText.textContent = this.t('backupNoDrives');
    const items = [];
    for (const drive of drives) {
      const entry = this.row(drive), run = statusById.get(drive.sessionId), locked = Boolean(drive.ineligibleReason);
      const label = `${drive.name || drive.letter}${drive.letter && drive.name ? ` (${drive.letter})` : ''}`;
      entry.label.textContent = label; entry.check.checked = this.selected.has(drive.sessionId) && !locked; entry.check.disabled = locked || running || Boolean(this.pending);
      entry.check.setAttribute('aria-label', `${this.t('backupInclude')}: ${label}`);
      entry.input.disabled = locked || running || Boolean(this.pending); entry.input.setAttribute('aria-label', `${this.t('backupRepositoryName')}: ${label}`);
      entry.caption.textContent = this.t('backupRepositoryName');
      const state = run ? run.state : locked ? 'skipped' : 'ready';
      entry.badge.dataset.state = state; entry.item.dataset.disabled = String(locked);
      entry.badge.textContent = locked && !run ? this.t(REASON_COPY[drive.ineligibleReason]) : this.t('backupState-' + state);
      entry.last.textContent = `${this.t('backupLastSync')}: ${this.formatTime(run?.lastSync ?? drive.lastSync)}`;
      entry.next.textContent = `${this.t('backupNextSync')}: ${this.formatTime(run?.nextSync ?? drive.nextSync)}`;
      entry.times.hidden = locked && !drive.lastSync && !run;
      entry.error.hidden = !(run?.state === 'failed' || run?.state === 'cancelled') || !run.errorCode;
      entry.error.textContent = entry.error.hidden ? '' : this.t('backupError-' + run.errorCode, { repository: run.repository });
      items.push(entry.item);
    }
    for (const id of [...this.rows.keys()]) if (!drives.some(row => row.sessionId === id)) this.rows.delete(id);
    this.list.replaceChildren(...items);
    const summary = this.status ? backupSummary(this.status) : null;
    this.progress.hidden = !running; if (summary) { this.progress.value = summary.percent / 100; }
    let message = '';
    if (!available) message = 'backupUnavailable';
    else if (this.loading) message = 'backupLoading';
    else if (this.waitingSignIn) message = 'backupNeedsSignIn';
    else if (running) message = 'backupRunning';
    this.statusText.textContent = message ? this.t(message) : this.status?.phase === 'cancelled' ? this.t('backupCancelled')
      : this.status?.phase === 'finished' && summary ? (summary.failed ? this.t('backupFinished', { done: summary.done, failed: summary.failed }) : this.t('backupFinishedAll')) : '';
    if (running && summary) this.statusText.textContent += ` ${this.t('backupProgress', { done: summary.finished, total: summary.total })}`;
    this.errorText.hidden = !this.error; this.errorText.textContent = this.error ? this.t(this.error) : '';
    const count = this.selected.size, failedRun = this.status?.phase === 'finished' && summary?.failed;
    this.buttons.start.textContent = running ? this.t('backupBusy') : failedRun ? this.t('backupRetry') : this.hasRun && !this.error && this.status?.phase === 'finished' ? this.t('backupAgain') : this.t('backupStartCount', { count });
    this.buttons.start.disabled = !available || running || Boolean(this.pending) || this.loading || !count;
    this.buttons.cancel.textContent = this.t('backupCancel'); this.buttons.cancel.hidden = !running; this.buttons.cancel.disabled = this.pending === 'cancel';
    this.buttons.refresh.textContent = this.t('backupRefresh'); this.buttons.refresh.disabled = !available || running || Boolean(this.pending) || this.loading;
  }
  destroy() { this.disposed = true; clearTimeout(this.timer); this.timer = null; this.stopLogin?.(); this.rows.clear(); this.remove(); }
}
register('mfe-backup-all-panel', BackupAllPanel);
