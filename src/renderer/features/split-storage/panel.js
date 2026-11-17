import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { SPLIT_COPY } from './copy.js';
import { SPLIT_METHODS, PHASES, normalizeSplitStatus, draftFromStatus, sharePercents, copiesWarning, draftProblem, buildConfig, formatBytes, formatTime, jobPercent, newId, fill } from './model.js';
import { mountSplitInfoIcons } from './info-icons.js';

const POLL_MS = 1500;
const COLORS = ['var(--md-sys-color-primary,#4b57c9)', 'var(--md-sys-color-tertiary,#8b4a00)', 'var(--md-sys-color-secondary,#00696b)', 'var(--md-sys-color-error,#a23b72)', '#6b7a00', '#7a4fb3'];
const STYLE = `
section{display:grid;gap:12px;min-width:0}
h2,h3,p,li{margin:0;overflow-wrap:anywhere}
h3{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--md-sys-color-on-surface-variant,#4a4c5c)}
.locations,.rules,.phases{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.loc{display:grid;gap:10px;padding:12px 14px;border:1px solid var(--md-sys-color-outline-variant);border-radius:16px;background:var(--md-sys-color-surface-container-low,transparent);animation:rise 320ms cubic-bezier(.05,.7,.1,1) both}
.loc[data-offline=true]{border-color:var(--md-sys-color-error,#b3261e)}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.head .name{font-weight:600;flex:1 1 160px;min-width:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;align-items:center}
.badge{padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;background:var(--md-sys-color-surface-variant,#e4e6f0);color:var(--md-sys-color-on-surface-variant,#3a3c4c);white-space:nowrap}
.badge[data-ok=true]{background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31)}
.badge[data-ok=false]{background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002)}
.meta{color:var(--md-sys-color-on-surface-variant,#555);font-size:12px}
.pct{font-weight:700;font-variant-numeric:tabular-nums;font-size:16px}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--md-sys-color-surface-variant,#e4e6f0)}
.bar span{height:100%;min-width:0;transition:flex-grow 360ms cubic-bezier(.2,0,0,1)}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-inline-end:6px}
.check{display:flex;align-items:center;gap:10px;min-height:48px}
.notice{padding:12px 14px;border-radius:16px;background:var(--md-sys-color-tertiary-container,#ffe0b8);color:var(--md-sys-color-on-tertiary-container,#4a2c00)}
.held{padding:14px;border-radius:16px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002);display:grid;gap:8px}
.error{color:var(--md-sys-color-error);margin:0}
.safety{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:var(--md-sys-color-secondary-container,#e4e6ff);color:var(--md-sys-color-on-secondary-container,#0e1a6e)}
.safety label{flex:1 1 220px;min-width:0;font-weight:600}
.info{min-width:32px;min-height:32px;width:32px;height:32px;padding:0;border:1px solid currentColor;border-radius:16px;background:transparent;color:inherit;font:700 14px/1 var(--mfe-font,system-ui)}
.phases{grid-auto-flow:row}
.phases li{display:flex;gap:8px;align-items:center;color:var(--md-sys-color-on-surface-variant,#555)}
.phases li[aria-current=step]{color:var(--md-sys-color-on-surface);font-weight:700}
.phases li[aria-current=step]::before{content:'\\25B6';font-size:10px}
.rule{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;gap:8px;align-items:center}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.files{max-height:160px;overflow:auto;font-family:var(--mfe-mono,ui-monospace,monospace);font-size:12px}
md-linear-progress{width:100%}
select,input.native{min-height:44px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}
@media(max-width:420px){.rule{grid-template-columns:minmax(0,1fr)}}`;

/** Split storage: spread encrypted parts across several locations. The host does the work; this page edits the plan and shows the job. */
export class SplitStoragePanel extends SurfaceElement {
  constructor() {
    super();
    this.pollMs = POLL_MS; this.services = {}; this.translateText = value => value; this.getVaultState = () => null; this.disposed = false;
    this.status = null; this.draft = null; this.previewPlan = null; this.previewStale = false; this.error = ''; this.message = ''; this.pending = false; this.loading = false; this.failed = false;
    this.timer = null; this.rows = new Map(); this.ruleRows = []; this.infoIcons = null;
    this.style(STYLE);
    this.heading = element('h2', { id: 'split-title' }); this.intro = element('p', { class: 'meta' });
    this.unavailableText = element('p', { role: 'status', 'aria-live': 'polite' });
    this.body = element('div', { class: 'stack' });
    this.shadowRoot.append(element('section', { 'aria-labelledby': 'split-title' }, [this.heading, this.intro, this.unavailableText, this.body]));
    this.build();
    this.render();
  }

  t(key, values) {
    const [en, yue] = SPLIT_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  available() { return SPLIT_METHODS.every(name => typeof this.services[name] === 'function'); }
  configure({ services = {}, translate = value => value, language = 'en', getVaultState = () => null } = {}) {
    this.services = services; this.translateText = translate; this.language = language; this.getVaultState = getVaultState;
    void this.load(); return this;
  }
  setLanguage(language) { this.language = language; this.render(); }
  setVaultState() { if (this.available() && !this.pending && !this.loading) void this.load(); }
  focusStart() { this.safetySwitch.focus?.(); }

  /** Builds the fixed controls once. Rows for locations and rules are rebuilt when they are added or removed. */
  build() {
    const button = (key, tag = 'md-outlined-button') => { const node = element(tag, { type: 'button' }); node.addEventListener('click', () => { if (!node.disabled) void this[key](); }); return node; };
    this.locationHeading = element('h3'); this.locationList = element('ul', { class: 'locations' });
    this.addFolderButton = button('addFolder'); this.addRegistryButton = button('addRegistry');
    this.bar = element('div', { class: 'bar', role: 'img' }); this.legend = element('div', { class: 'legend' });
    this.copiesInput = element('input', { type: 'number', min: '1', step: '1' }); this.copiesInput.addEventListener('input', () => { this.draft.copies = Number(this.copiesInput.value); this.touch(); });
    this.copiesHelp = element('p', { class: 'meta' }); this.copiesWarningNode = element('p', { class: 'notice', role: 'note' }); this.granularity = element('p', { class: 'meta' });
    this.rulesHeading = element('h3'); this.rulesHelp = element('p', { class: 'meta' }); this.ruleList = element('ul', { class: 'rules' }); this.addRuleButton = button('addRule');
    this.mirrorHeading = element('h3'); this.mirrorIntro = element('p', { class: 'meta' }); this.mirrorList = element('ul', { class: 'locations' }); this.mirrorEmpty = element('p', { class: 'meta' }); this.mirrorRestore = element('p', { class: 'meta' });
    this.addMirrorFolderButton = button('addMirrorFolder'); this.addMirrorRegistryButton = button('addMirrorRegistry'); this.updateMirrorsButton = button('updateMirrors', 'md-filled-button'); this.openMirrorButton = button('openMirrorDrive', 'md-text-button');
    this.safetySwitch = element('md-switch', { id: 'split-safety' }); this.safetySwitch.selected = true;
    this.safetySwitch.addEventListener('change', () => void this.setSafety(this.safetySwitch.selected === true));
    this.safetyLabel = element('label', { for: 'split-safety' });
    this.copiesInput.id = 'split-copies';
    this.safetyHelp = element('p', { class: 'meta' });
    this.planHeading = element('h3'); this.planText = element('p', { role: 'status', 'aria-live': 'polite' }); this.planUnavailable = element('p'); this.planFiles = element('ul', { class: 'files' }); this.planStale = element('p', { class: 'meta' });
    this.heldBox = element('div', { class: 'held', role: 'alert' }); this.heldTitle = element('p'); this.heldReason = element('p'); this.retryButton = button('retry', 'md-filled-button'); this.heldBox.append(this.heldTitle, this.heldReason, this.retryButton);
    this.jobHeading = element('h3'); this.phaseList = element('ol', { class: 'phases' }); this.progress = element('md-linear-progress', { value: 0 }); this.jobText = element('p', { role: 'status', 'aria-live': 'polite' });
    this.messageNode = element('p', { role: 'status', 'aria-live': 'polite' }); this.errorNode = element('p', { class: 'error', role: 'alert' }); this.busyNode = element('p', { class: 'meta' });
    this.securityNode = element('p', { class: 'meta' }); this.labelHint = element('p', { class: 'meta' });
    this.buttons = {};
    for (const [key, tag] of [['preview', 'md-outlined-button'], ['save', 'md-outlined-button'], ['apply', 'md-filled-button'], ['cancel', 'md-outlined-button'], ['verify', 'md-outlined-button'], ['bringBack', 'md-outlined-button'], ['refresh', 'md-text-button']]) {
      this.buttons[key] = button(key === 'cancel' ? 'cancelJob' : key === 'refresh' ? 'load' : key === 'bringBack' ? 'bringBack' : key, tag);
    }
    const safetyRow = element('div', { class: 'safety' }, [this.safetyLabel, this.safetySwitch]);
    this.body.append(this.locationHeading, this.locationList, element('div', { class: 'actions' }, [this.addFolderButton, this.addRegistryButton]), this.labelHint,
      this.bar, this.legend, element('div', { class: 'check' }, [this.copiesInput]), this.copiesHelp, this.copiesWarningNode, this.granularity,
      this.rulesHeading, this.rulesHelp, this.ruleList, this.addRuleButton,
      this.mirrorHeading, this.mirrorIntro, this.mirrorList, this.mirrorEmpty, element('div', { class: 'actions' }, [this.addMirrorFolderButton, this.addMirrorRegistryButton, this.updateMirrorsButton]), this.mirrorRestore, this.openMirrorButton, safetyRow, this.safetyHelp,
      this.planHeading, this.planText, this.planUnavailable, this.planFiles, this.planStale,
      this.heldBox, this.jobHeading, this.phaseList, this.progress, this.jobText,
      element('div', { class: 'actions' }, Object.values(this.buttons)), this.busyNode, this.messageNode, this.errorNode, this.securityNode);
  }

  async load() {
    if (this.disposed) return;
    if (!this.available()) { this.status = null; this.render(); return; }
    if (this.getVaultState()?.locked) { this.status = null; this.render(); return; }
    this.loading = true; this.failed = false; this.render();
    try {
      const status = normalizeSplitStatus(await this.services.splitStorageStatus());
      if (this.disposed) return;
      const editing = this.draft && this.dirty && !status.job;
      this.status = status;
      if (!editing) { this.draft = draftFromStatus(status); this.dirty = false; this.previewPlan = null; this.previewStale = false; this.rebuildRows(); }
      this.schedulePoll();
    } catch { if (!this.disposed) this.failed = true; }
    finally { if (!this.disposed) { this.loading = false; this.render(); } }
  }
  schedulePoll() {
    clearTimeout(this.timer);
    if (this.disposed || !this.status?.job || this.status.job.phase === 'idle') return;
    this.timer = setTimeout(() => { if (!this.loading && !this.pending) void this.load(); else this.schedulePoll(); }, this.pollMs);
  }
  get busy() { return this.pending || this.loading || Boolean(this.status?.job && !this.status.safetyHeld && this.status.job.phase); }

  touch() { this.dirty = true; this.previewStale = Boolean(this.previewPlan); this.error = ''; this.renderDerived(); }

  /** Rebuilds the location and rule rows from the draft. Called only when rows are added, removed or reloaded. */
  rebuildRows() {
    this.rows.clear(); this.locationList.replaceChildren();
    this.mirrorList.replaceChildren();
    for (const loc of this.draft?.locations || []) (loc.role === 'mirror' ? this.mirrorList : this.locationList).append(this.locationRow(loc));
    this.ruleList.replaceChildren(); this.ruleRows = [];
    (this.draft?.rules || []).forEach((rule, index) => this.ruleList.append(this.ruleRow(rule, index)));
  }
  locationRow(loc) {
    const isMain = loc.id === 'main', mirror = loc.role === 'mirror';
    const refs = {};
    refs.name = element('span', { class: 'name' }); refs.kind = element('span', { class: 'badge' }); refs.state = element('span', { class: 'badge' }); refs.removable = element('span', { class: 'badge' });
    refs.label = element('input', { type: 'text', value: loc.label, maxLength: 80 }); refs.label.addEventListener('input', () => { loc.label = refs.label.value; this.touch(); });
    refs.target = isMain ? null : element('input', { type: 'text', value: loc.kind === 'registry' ? loc.repository : loc.path });
    refs.target?.addEventListener('input', () => { if (loc.kind === 'registry') loc.repository = refs.target.value; else loc.path = refs.target.value; this.touch(); });
    refs.choose = !isMain && loc.kind === 'folder' ? element('md-outlined-button', { type: 'button' }) : null;
    refs.choose?.addEventListener('click', () => void this.chooseFolder(loc));
    refs.weight = mirror ? null : element('input', { type: 'number', min: '1', step: 'any', value: String(loc.weight) }); refs.weight?.addEventListener('input', () => { loc.weight = Number(refs.weight.value); this.touch(); });
    refs.capacity = mirror ? null : element('input', { type: 'number', min: '0', step: 'any', value: String(loc.capacityBytes ? Math.round(loc.capacityBytes / 1073741824 * 100) / 100 : 0) });
    refs.capacity?.addEventListener('input', () => { loc.capacityBytes = Math.round(Number(refs.capacity.value) * 1073741824); this.touch(); });
    refs.enabled = isMain || mirror ? null : element('input', { type: 'checkbox', checked: loc.enabled }); refs.enabled?.addEventListener('change', () => { loc.enabled = refs.enabled.checked === true; this.touch(); });
    refs.remove = isMain ? null : element('md-text-button', { type: 'button' }); refs.remove?.addEventListener('click', () => this.removeLocation(loc.id));
    refs.percent = mirror ? null : element('span', { class: 'pct' }); refs.mirrorState = mirror ? element('p', { class: 'mirror-state', role: 'status' }) : null; refs.sameDisk = mirror ? element('p', { class: 'notice', role: 'note' }) : null;
    refs.verify = mirror ? element('md-outlined-button', { type: 'button' }) : null; refs.verify?.addEventListener('click', () => void this.verifyMirror(loc.id)); refs.meta = element('p', { class: 'meta' }); refs.errorText = element('p', { class: 'error' });
    refs.path = isMain ? element('p', { class: 'meta' }) : null;
    const item = element('li', { class: 'loc', 'data-id': loc.id }, [
      element('div', { class: 'head' }, [refs.name, refs.kind, refs.state, refs.removable, ...(refs.percent ? [refs.percent] : [])]),
      element('div', { class: 'grid' }, [refs.label, ...(refs.target ? [refs.target] : []), ...(refs.choose ? [refs.choose] : []), ...(refs.weight ? [refs.weight, refs.capacity] : []), ...(refs.enabled ? [refs.enabled] : [])]),
      ...(refs.path ? [refs.path] : []), refs.meta, ...(refs.mirrorState ? [refs.mirrorState, refs.sameDisk] : []), refs.errorText, ...(refs.verify ? [element('div', { class: 'actions' }, [refs.verify, ...(refs.remove ? [refs.remove] : [])])] : refs.remove ? [refs.remove] : [])]);
    refs.item = item; this.rows.set(loc.id, refs);
    return item;
  }
  ruleRow(rule, index) {
    const match = element('input', { type: 'text', value: rule.match }); match.addEventListener('input', () => { rule.match = match.value; this.touch(); });
    const where = element('select', {}); where.addEventListener('change', () => { rule.location = where.value; this.touch(); });
    const up = element('md-text-button', { type: 'button' }), down = element('md-text-button', { type: 'button' }), remove = element('md-text-button', { type: 'button' });
    up.addEventListener('click', () => this.moveRule(index, -1)); down.addEventListener('click', () => this.moveRule(index, 1)); remove.addEventListener('click', () => this.removeRule(index));
    const item = element('li', { class: 'rule' }, [match, where, element('div', { class: 'actions' }, [up, down, remove])]);
    this.ruleRows.push({ match, where, up, down, remove, rule });
    return item;
  }

  render() {
    const unavailable = !this.available(), locked = this.getVaultState()?.locked === true;
    this.heading.textContent = this.t('title'); this.intro.textContent = this.t('intro');
    this.unavailableText.textContent = unavailable ? this.t('unavailable') : locked ? this.t('unlockFirst') : this.loading && !this.status ? this.t('loading') : this.failed ? this.t('statusFailed') : '';
    const ready = !unavailable && !locked && this.status && this.draft;
    this.body.hidden = !ready;
    if (!ready) { if (this.available() && !locked && this.failed) this.buttons.refresh.hidden = false; return; }
    this.locationHeading.textContent = this.t('locations'); this.addFolderButton.textContent = this.t('addFolder'); this.addRegistryButton.textContent = this.t('addRegistry');
    this.labelHint.textContent = this.t('labelHint');
    this.copiesInput.label = this.t('copies'); this.copiesInput.setAttribute('aria-label', this.t('copies')); this.copiesHelp.textContent = this.t('copiesHelp'); this.granularity.textContent = this.t('granularity');
    this.mirrorHeading.textContent = this.t('mirrors'); this.mirrorIntro.textContent = this.t('mirrorsIntro'); this.mirrorRestore.textContent = this.t('mirrorRestore'); this.mirrorEmpty.textContent = this.t('mirrorsNone');
    this.addMirrorFolderButton.textContent = this.t('addMirrorFolder'); this.addMirrorRegistryButton.textContent = this.t('addMirrorRegistry'); this.updateMirrorsButton.textContent = this.t('updateMirrors'); this.openMirrorButton.textContent = this.t('openMirrorDrive');
    this.rulesHeading.textContent = this.t('rules'); this.rulesHelp.textContent = this.t('rulesHelp'); this.addRuleButton.textContent = this.t('addRule');
    this.safetyLabel.textContent = this.t('safety'); this.safetySwitch.setAttribute('aria-label', this.t('safety')); this.safetySwitch.selected = this.draft.safetyBackup !== false;
    this.safetyHelp.textContent = this.t('safetyHelp');
    this.planHeading.textContent = this.t('plan'); this.jobHeading.textContent = this.t('job'); this.securityNode.textContent = this.t('securityNote'); this.busyNode.textContent = this.busy ? this.t('busyNote') : '';
    this.retryButton.textContent = this.t('retry');
    for (const [key, node] of Object.entries(this.buttons)) node.textContent = this.t(key);
    this.refreshRowText(); this.renderDerived();
    this.infoIcons ??= this.mountInfo();
    this.infoIcons?.refresh?.();
  }
  mountInfo() { try { return mountSplitInfoIcons(this.shadowRoot, { getLanguage: () => this.language }); } catch { return null; } }

  /** Text that depends on language or status but not on the draft numbers. */
  refreshRowText() {
    const byId = new Map((this.status?.locations || []).map(row => [row.id, row]));
    for (const loc of this.draft.locations) {
      const refs = this.rows.get(loc.id); if (!refs) continue;
      const live = byId.get(loc.id) || loc, isMain = loc.id === 'main';
      refs.name.textContent = isMain ? this.t('main') : loc.label || (loc.kind === 'registry' ? this.t('registryKind') : this.t('folderKind'));
      refs.kind.textContent = loc.kind === 'registry' ? this.t('registryKind') : this.t('folderKind');
      refs.state.textContent = live.connected === false ? this.t('disconnected') : this.t('connected'); refs.state.dataset.ok = String(live.connected !== false);
      refs.removable.textContent = this.t('removable'); refs.removable.hidden = !live.removable;
      refs.label.label = this.t('label'); refs.label.setAttribute('aria-label', this.t('label'));
      if (refs.target) { const text = this.t(loc.kind === 'registry' ? 'repository' : 'path'); refs.target.label = text; refs.target.setAttribute('aria-label', text); }
      if (refs.choose) refs.choose.textContent = this.t('choose');
      if (refs.weight) { refs.weight.label = this.t('weight'); refs.weight.setAttribute('aria-label', this.t('weight')); refs.capacity.label = this.t('capacity'); refs.capacity.setAttribute('aria-label', this.t('capacity')); }
      if (refs.enabled) { refs.enabled.setAttribute('aria-label', this.t('enabled') + ': ' + (loc.label || loc.id)); }
      if (refs.remove) { refs.remove.textContent = this.t('remove'); refs.remove.setAttribute('aria-label', this.t('remove') + ': ' + (loc.label || loc.id)); }
      if (refs.path) refs.path.textContent = this.t('mainHint') + (live.path ? ' · ' + live.path : '');
      const free = live.freeBytes === null || live.freeBytes === undefined ? this.t('freeUnknown') : this.t('free', { size: formatBytes(live.freeBytes) });
      refs.meta.textContent = free + ' · ' + this.t('stored', { parts: live.storedParts ?? 0, size: formatBytes(live.storedBytes ?? 0) });
      refs.errorText.textContent = live.lastError || ''; refs.errorText.hidden = !live.lastError;
      refs.item.dataset.offline = String(live.connected === false);
      if (refs.mirrorState) {
        refs.mirrorState.textContent = live.lastUpdated || live.upToDate !== false ? (live.upToDate !== false ? this.t('mirrorUpToDate') : this.t('mirrorBehindSince', { time: formatTime(live.lastUpdated) }) + ' · ' + this.t('mirrorBehind', { parts: live.behindParts, size: formatBytes(live.behindBytes) })) : this.t('mirrorNever');
        refs.mirrorState.dataset.upToDate = String(live.upToDate !== false);
        refs.mirrorState.textContent += live.lastUpdated ? ' · ' + this.t('mirrorLastUpdated', { time: formatTime(live.lastUpdated) }) : '';
        refs.sameDisk.textContent = this.t('sameDisk'); refs.sameDisk.hidden = live.sameDisk !== true;
        refs.verify.textContent = this.t('verify'); refs.verify.disabled = this.pending || typeof this.services.verifyMirror !== 'function';
      }
    }
    this.ruleRows.forEach(row => {
      row.match.label = this.t('ruleMatch'); row.match.setAttribute('aria-label', this.t('ruleMatch'));
      row.where.setAttribute('aria-label', this.t('ruleLocation')); row.where.replaceChildren();
      for (const [value, text] of [['spread', this.t('spread')], ...this.draft.locations.filter(loc => loc.role !== 'mirror').map(loc => [loc.id, loc.id === 'main' ? this.t('main') : loc.label || loc.id])]) row.where.append(element('option', { value, text, selected: row.rule.location === value }));
      row.where.value = row.rule.location;
      row.up.textContent = '↑'; row.up.setAttribute('aria-label', this.t('moveUp')); row.down.textContent = '↓'; row.down.setAttribute('aria-label', this.t('moveDown'));
      row.remove.textContent = this.t('removeRule'); row.remove.setAttribute('aria-label', this.t('removeRule'));
    });
  }

  /** Everything that follows from the draft numbers or the status: shares, the bar, warnings, the plan and the job. */
  renderDerived() {
    if (!this.draft || !this.status) return;
    const percents = sharePercents(this.draft.locations);
    const legend = [], segments = [];
    this.draft.locations.forEach((loc, index) => {
      const percent = percents.get(loc.id) ?? 0, refs = this.rows.get(loc.id);
      if (refs?.percent) refs.percent.textContent = this.t('percent') + ' ' + percent + '%';
      if (percent > 0) {
        const color = COLORS[index % COLORS.length];
        segments.push(element('span', { style: `flex-grow:${percent};background:${color}` }));
        legend.push(element('span', {}, [element('i', { style: `background:${color}` }), element('span', { text: (loc.id === 'main' ? this.t('main') : loc.label || loc.id) + ' ' + percent + '%' })]));
      }
    });
    this.bar.replaceChildren(...segments); this.legend.replaceChildren(...legend);
    this.bar.setAttribute('aria-label', this.t('splitBar') + ': ' + this.draft.locations.filter(loc => (percents.get(loc.id) ?? 0) > 0).map(loc => (loc.id === 'main' ? this.t('main') : loc.label || loc.id) + ' ' + percents.get(loc.id) + '%').join(', '));
    this.copiesInput.value = String(this.draft.copies);
    this.copiesWarningNode.textContent = this.t('copiesWarning'); this.copiesWarningNode.hidden = !copiesWarning(this.draft.copies, this.draft.locations);
    this.safetySwitch.selected = this.draft.safetyBackup !== false;
    const plan = this.previewPlan || this.status.plan;
    this.planText.textContent = plan.movesPending > 0 ? this.t('planMoves', { parts: plan.movesPending, size: formatBytes(plan.bytesToMove) }) : this.t('planNone');
    this.planUnavailable.textContent = plan.unavailableCount > 0 ? this.t('planUnavailable', { count: plan.unavailableCount }) : this.t('planUnavailableNone');
    const more = plan.unavailableCount - plan.unavailableFiles.length;
    this.planFiles.replaceChildren(...plan.unavailableFiles.map(path => element('li', { text: path })), ...(more > 0 ? [element('li', { text: this.t('planMore', { count: more }) })] : []));
    this.planFiles.hidden = !plan.unavailableFiles.length; this.planStale.textContent = this.t('planStale'); this.planStale.hidden = !this.previewStale;
    const job = this.status.job, held = this.status.safetyHeld;
    this.heldBox.hidden = !held; this.heldTitle.textContent = this.t('held');
    this.heldReason.textContent = this.status.heldReason ? this.t('heldReason', { reason: this.status.heldReason }) : this.t('heldNoReason');
    const running = Boolean(job && job.phase && !held);
    this.jobHeading.hidden = !job; this.phaseList.hidden = !job; this.progress.hidden = !job; this.jobText.textContent = job ? this.jobSummary(job) : this.t('jobIdle');
    this.phaseList.replaceChildren(...PHASES.map(phase => { const item = element('li', { text: this.t('phase' + phase[0].toUpperCase() + phase.slice(1)) }); if (job?.phase === phase) item.setAttribute('aria-current', 'step'); return item; }));
    this.progress.value = jobPercent(job) / 100; this.progress.setAttribute('aria-label', this.t('job'));
    const unavailable = !this.available(), idle = !running && !this.pending, disabled = this.pending || this.loading;
    this.buttons.cancel.hidden = !running; this.buttons.cancel.disabled = this.pending;
    for (const key of ['preview', 'save', 'apply', 'verify', 'bringBack', 'addFolder', 'addRegistry', 'addRule']) { const node = this.buttons[key] || this[key + 'Button']; if (node) node.disabled = unavailable || disabled || !idle; }
    this.buttons.bringBack.disabled ||= !(this.status.enabled || this.status.locations.some(row => row.id !== 'main' && row.storedParts > 0));
    this.retryButton.disabled = disabled || running;
    const mirrors = this.draft.locations.filter(loc => loc.role === 'mirror');
    this.mirrorEmpty.hidden = mirrors.length > 0;
    this.addMirrorFolderButton.disabled = this.addMirrorRegistryButton.disabled = unavailable || disabled || !idle;
    this.updateMirrorsButton.disabled = unavailable || disabled || !idle || !mirrors.length || typeof this.services.updateMirrors !== 'function';
    this.openMirrorButton.hidden = typeof this.services.openExistingDrive !== 'function';
    this.busyNode.textContent = running ? this.t('busyNote') : '';
    this.messageNode.textContent = this.message; this.errorNode.textContent = this.error ? (SPLIT_COPY[this.error] ? this.t(this.error) : this.error) : ''; this.errorNode.hidden = !this.error;
  }
  jobSummary(job) { return [this.t('jobParts', { done: job.completedParts, total: job.totalParts }), formatBytes(job.completedBytes) + ' / ' + formatBytes(job.totalBytes), job.currentLocation ? this.t('jobAt', { location: job.currentLocation }) : ''].filter(Boolean).join(' · '); }

  addFolder() { this.draft.locations.push({ id: newId(), role: 'share', kind: 'folder', label: '', path: '', repository: '', weight: 1, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: null, storedBytes: 0, storedParts: 0, lastError: '' }); this.afterStructure(); }
  addRegistry() { this.draft.locations.push({ id: newId(), role: 'share', kind: 'registry', label: '', path: '', repository: '', weight: 1, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: null, storedBytes: 0, storedParts: 0, lastError: '' }); this.afterStructure(); }
  removeLocation(id) { this.draft.locations = this.draft.locations.filter(loc => loc.id !== id); for (const rule of this.draft.rules) if (rule.location === id) rule.location = 'spread'; this.afterStructure(); }
  addMirror(kind) { this.draft.locations.push({ id: newId(), role: 'mirror', kind, label: '', path: '', repository: '', weight: 1, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: null, storedBytes: 0, storedParts: 0, lastError: '' }); this.afterStructure(); }
  addMirrorFolder() { this.addMirror('folder'); }
  addMirrorRegistry() { this.addMirror('registry'); }
  openMirrorDrive() { this.services.openExistingDrive?.(); }
  async updateMirrors() {
    if (this.dirty && !await this.save()) return;
    const ok = await this.run(() => this.services.updateMirrors(), 'mirrorsUpdated'); if (ok) await this.load();
  }
  async verifyMirror(id) { const ok = await this.run(() => this.services.verifyMirror(id), 'mirrorVerified'); if (ok) await this.load(); }
  addRule() { this.draft.rules.push({ match: '', location: 'spread' }); this.afterStructure(); }
  removeRule(index) { this.draft.rules.splice(index, 1); this.afterStructure(); }
  moveRule(index, step) { const to = index + step; if (to < 0 || to >= this.draft.rules.length) return; const [rule] = this.draft.rules.splice(index, 1); this.draft.rules.splice(to, 0, rule); this.afterStructure(); }
  afterStructure() { this.dirty = true; this.previewStale = Boolean(this.previewPlan); this.rebuildRows(); this.render(); }

  async chooseFolder(loc) {
    try {
      const picked = await this.services.chooseSplitFolder(); if (!picked || this.disposed) return;
      loc.path = picked.path; loc.removable = picked.removable === true; if (!loc.label) loc.label = String(picked.label || ''); if (picked.freeBytes !== undefined) loc.freeBytes = picked.freeBytes;
      const refs = this.rows.get(loc.id); if (refs?.target) refs.target.value = loc.path; if (refs?.label) refs.label.value = loc.label;
      this.touch(); this.refreshRowText();
    } catch (error) { this.error = String(error?.message || this.t('failed')); this.renderDerived(); }
  }

  /** Turning Safety backup off needs an explicit confirmation. Without a confirmation route it stays on. */
  async setSafety(on) {
    if (!this.draft) return;
    if (on) { this.draft.safetyBackup = true; this.touch(); return; }
    let confirmed = false;
    try { confirmed = typeof this.services.confirmDestructive === 'function' && await this.services.confirmDestructive('desktop.split-storage-safety-off', this.t('safetyOffAffected')) === true; } catch { confirmed = false; }
    if (this.disposed) return;
    if (!confirmed) { this.draft.safetyBackup = true; this.safetySwitch.selected = true; this.message = this.t('safetyOffCancelled'); this.renderDerived(); return; }
    this.draft.safetyBackup = false; this.message = ''; this.touch();
  }

  problem() { const key = draftProblem(this.draft); if (key) { this.error = key; this.renderDerived(); } return key; }
  async run(action, success) {
    if (this.pending || this.disposed) return false;
    this.pending = true; this.error = ''; this.message = ''; this.renderDerived();
    try { const result = await action(); if (this.disposed) return false; if (success) this.message = this.t(success); return result ?? true; }
    catch (error) { if (!this.disposed) this.error = String(error?.message || this.t('failed')); return false; }
    finally { if (!this.disposed) { this.pending = false; this.renderDerived(); } }
  }
  async preview() {
    if (this.problem()) return;
    const result = await this.run(() => this.services.previewSplitStorage(buildConfig(this.draft)));
    if (result && typeof result === 'object') { const status = normalizeSplitStatus(result); this.previewPlan = status.plan; this.previewStale = false; this.renderDerived(); }
  }
  async save() {
    if (this.problem()) return false;
    const result = await this.run(() => this.services.saveSplitStorage(buildConfig(this.draft)), 'saved');
    if (result && typeof result === 'object') { this.status = normalizeSplitStatus(result); this.draft = draftFromStatus(this.status); this.dirty = false; this.previewPlan = null; this.previewStale = false; this.rebuildRows(); this.render(); return true; }
    return false;
  }
  async apply() {
    if (this.dirty && !await this.save()) return;
    if (!this.dirty && this.problem()) return;
    const ok = await this.run(() => this.services.applySplitStorage(), 'started');
    if (ok) await this.load();
  }
  async retry() { const ok = await this.run(() => this.services.applySplitStorage(), 'started'); if (ok) await this.load(); }
  async cancelJob() { const ok = await this.run(() => this.services.cancelSplitStorage(), 'cancelled'); if (ok) await this.load(); }
  async bringBack() { const ok = await this.run(() => this.services.disableSplitStorage(), 'bringStarted'); if (ok) await this.load(); }
  async verify() {
    const result = await this.run(() => this.services.verifySplitStorage(), 'verifyResult');
    if (result && typeof result === 'object') { try { const status = normalizeSplitStatus(result); if (status.locations.length) { this.status = status; this.renderDerived(); this.refreshRowText(); } } catch { /* the verify result may be a report, not a status */ } }
    await this.load();
  }

  destroy() { this.disposed = true; clearTimeout(this.timer); this.infoIcons?.destroy?.(); this.remove(); }
}
register('mfe-split-storage-panel', SplitStoragePanel);
