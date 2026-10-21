import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { REGISTRY_COPY } from './registry-copy.js';
import { REGISTRY_METHODS, DIGEST, registryDraft, registryConfiguration, registrySource, registryBusy, registrySnapshots } from './registry-model.js';
import {RegistryLoginPanel} from './registry-login-panel.js';

const entry = () => ({ draft: registryDraft(), edited: false, status: null, snapshots: null, selected: '', restoredDestination: '', pending: null, cancelling: false, generation: 0, message: '', error: '' });
const transfer = kind => ['syncing', 'restoring'].includes(kind);

export class RegistryStoragePanel extends SurfaceElement {
  constructor() {
    super();
    this.services = {}; this.sessions = new Map(); this.getVaultState = () => null; this.translateText = value => value; this.disposed = false; this.pollTimer = null; this.polling = false;
    this.style('section{border-top:1px solid var(--md-sys-color-outline-variant);padding-top:16px;margin-top:24px}h2,h3,p,dt,dd{overflow-wrap:anywhere}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}.field{display:grid;gap:8px;min-width:0}md-outlined-select{width:100%;min-width:0;max-width:100%}.toggle{display:flex;align-items:center;gap:8px;min-height:44px}.toggle span{overflow-wrap:anywhere}.actions,.days{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}fieldset{min-width:0;border:1px solid var(--md-sys-color-outline-variant);border-radius:12px}.metrics{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 16px}.metrics dt,.metrics dd{margin:0}.registry-signin{min-width:0}.registry-login-code{display:grid;gap:8px;min-width:0}.registry-login-code a{overflow-wrap:anywhere;min-height:44px;display:flex;align-items:center}.registry-login-code output{font-size:1.25rem;letter-spacing:.08em;padding:12px;border:1px solid var(--md-sys-color-outline-variant);border-radius:8px}.error{color:var(--md-sys-color-error)}');
    this.copyNodes = {}; this.fields = {}; this.labels = {}; this.options = {}; this.buttons = {};
    this.loginPanel=new RegistryLoginPanel({translate:key=>this.t(key),onSignedIn:()=>{if(!this.disposed)void this.refresh();}});
    this.visibilityNote=element('p');
    const copy = (key, tag = 'p', props = {}) => this.copyNodes[key] = element(tag, props);
    const field = (key, type = 'text', values) => {
      const input = values ? element('select') : element('input', { type });
      if (values) { this.options[key] = values.map(value => ({ value, node: element('option', { value }) })); input.append(...this.options[key].map(option => option.node)); }
      this.fields[key] = input;
      const label = element('span'); this.labels[key] = label;
      input.id = `registry-${key}`;
      input.addEventListener('input', () => this.edit(key)); input.addEventListener('change', () => this.edit(key));
      return element('label', { class: type === 'checkbox' ? 'toggle' : 'field', for: input.id }, type === 'checkbox' ? [input, label] : [label, input]);
    };
    const button = key => {
      const node = element(key === 'sync' ? 'md-filled-button' : 'md-outlined-button');
      node.addEventListener('click', () => { if (!node.disabled) void this[key](); }); this.buttons[key] = node; return node;
    };
    this.daysLegend = element('legend'); this.dayLabels = []; this.days = [];
    for (let day = 0; day < 7; day++) {
      const input = element('input', { type: 'checkbox' }), label = element('span'); this.days.push(input); this.dayLabels.push(label);
      input.addEventListener('change', () => this.edit('days'));
    }
    this.daysField = element('fieldset', {}, [this.daysLegend, element('div', { class: 'days' }, this.days.map((input, day) => element('label', { class: 'toggle' }, [input, this.dayLabels[day]])))]);
    this.calendar = element('div', { class: 'stack' }, [this.daysField, field('times'), field('timeZone')]);
    this.interval = field('intervalMinutes', 'number');
    this.fields.intervalMinutes.min = '5'; this.fields.intervalMinutes.max = '10080'; this.fields.intervalMinutes.step = '1';
    this.statusText = element('p', { role: 'status', 'aria-live': 'polite' }); this.error = element('p', { class: 'error', role: 'alert' });
    this.progress = element('md-linear-progress', { indeterminate: true });
    this.progressText = element('p', { role:'status', 'aria-live':'polite' });
    this.recoveryText = element('p', { style:'user-select:text;white-space:pre-wrap;overflow-wrap:anywhere' });
    this.deferredText = element('p');
    this.ownerText = element('p', {role:'status', 'aria-live':'polite'});
    this.ownerButton = element('md-outlined-button');
    this.ownerButton.addEventListener('click', () => { if(!this.ownerButton.disabled) void this.selectOperationOwner(); });
    this.metrics = {}; const metrics = element('dl', { class: 'metrics' });
    for (const key of ['savedRepository', 'savedVisibility', 'nextDue', 'lastResult']) { const label = element('dt'), value = element('dd'); this.metrics[key] = { label, value }; metrics.append(label, value); }
    this.revision = element('select'); this.revision.addEventListener('change', () => { const current = this.current(); if (current && !current.pending) { current.selected = this.revision.value; this.render(); } });
    this.revisionMessage = element('p'); this.revisionDetails = element('dl', { class: 'metrics' }); this.rows = {};
    this.restoredLocation = element('p', { style: 'user-select:text;white-space:pre-wrap;overflow-wrap:anywhere' });
    this.restoreResult = element('div', {}, [copy('restoredDestination', 'h3'), this.restoredLocation, copy('unlockRestored')]);
    for (const key of ['digest', 'vaultId', 'deviceId', 'parents', 'fileCount']) { const label = element('dt'), value = element('dd'); this.rows[key] = { label, value }; this.revisionDetails.append(label, value); }
    this.shadowRoot.append(element('section', { 'aria-labelledby': 'registry-title' }, [
      copy('title', 'h2', { id: 'registry-title' }),this.loginPanel.root,copy('destination', 'h3'), field('repository'),field('visibility','text',['public','private']),this.visibilityNote,copy('destinationNote'),copy('destinationVerificationNote'),copy('snapshotNote'), copy('sourceRequired'),
      copy('schedule', 'h3'), field('enabled', 'checkbox'), field('mode', 'text', ['interval', 'calendar']), this.interval, this.calendar,
      element('div', { class: 'fields' }, [field('missed', 'text', ['run-once', 'skip']), field('retryMinutes', 'number')]), field('background', 'checkbox'), copy('backgroundNote'),
      element('div', { class: 'actions' }, [button('save')]), copy('operation', 'h3'), this.statusText, this.error, this.ownerText, this.ownerButton, this.progress, this.progressText, this.recoveryText, this.deferredText, metrics,
      element('div', { class: 'actions' }, ['sync', 'refresh', 'cancel'].map(button)), copy('revisions', 'h3'), copy('restoreNote'), this.revisionMessage, this.revision, this.revisionDetails,
      element('div', { class: 'actions' }, ['list', 'restore'].map(button)), this.restoreResult,
    ]));
    this.fields.repository.autocomplete = 'off'; this.fields.repository.spellcheck = false;
    this.fields.retryMinutes.min = '5'; this.fields.retryMinutes.max = '1440'; this.fields.retryMinutes.step = '1';
    this.render();
  }
  t(key) { const [en, yue] = REGISTRY_COPY[key] || [key, key], translated = this.translateText(en); return translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language); }
  configure({ services = {}, getVaultState = () => null, translate = value => value, language = 'en' } = {}) {
    this.services = services; this.getVaultState = getVaultState; this.translateText = translate; this.language = language; this.loginPanel.configure(services);this.setVaultState(getVaultState()); return this;
  }
  current() { return this.sessions.get(this.key); }
  available() { return REGISTRY_METHODS.every(name => typeof this.services[name] === 'function') && Boolean(this.vaultState?.sessionId); }
  canSyncSource() { return Boolean(registrySource(this.vaultState)) && (this.vaultState?.transport?.mode || this.vaultState?.preferences?.transport || 'folder') === 'folder'; }
  setVaultState(state) {
    if (this.disposed) return;
    const key = state?.sessionId ? JSON.stringify([state.sessionId, registrySource(state)]) : null, changed = key !== this.key;
    this.key = key; this.vaultState = state;
    if (key && !this.sessions.has(key)) this.sessions.set(key, entry());
    this.render(); if (changed && this.available()) void this.refresh(); this.schedulePoll();
  }
  schedulePoll() {
    if (this.pollTimer !== null || this.polling || this.disposed || !this.available()) return;
    this.pollTimer = setTimeout(() => { this.pollTimer = null; void this.pollStatus(); }, 1500);
  }
  async pollStatus() {
    if (this.disposed || !this.available()) return;
    const current=this.current(), generation=current?.generation;
    if (!current) return;
    this.polling=true;
    try {
      // Polling is observational and never replaces an unsaved draft or a local
      // operation result. One in-flight read bounds background work.
      const id=this.vaultState.sessionId,source=registrySource(this.vaultState);
      const status=await this.services.registryStorageStatus();
      if(!this.isCurrent(current)||current.generation!==generation)return;
      if(!status||status.sessionId!==id||status.source!==source||typeof status.configured!=='boolean'||typeof status.state!=='string')throw Error('invalidStatus');
      if(status.configured)registryConfiguration(registryDraft(status.configuration));
      const ownerChanged=current.status?.activeOperation?.sessionId!==status.activeOperation?.sessionId;
      current.status=status;
      // Scheduled work has no local perform() completion. A matching idle
      // readback settles its cancellation, but an unresolved native lease does not.
      if(!current.pending&&!registryBusy(status)&&status.activeOperation?.sessionId!==id)current.cancelling=false;
      if(current.error==='statusUnavailable')current.error='';
      if(!current.edited&&!current.pending)current.draft=registryDraft(status.configuration);
      // Do not rerender editable controls and move the caret during typing.
      if(!current.edited||current.pending||registryBusy(status)||ownerChanged)this.render();
    } catch { if(this.isCurrent(current)&&current.generation===generation&&!current.pending){current.error='statusUnavailable';this.render();} }
    finally {this.polling=false;this.schedulePoll();}
  }
  synchronize() { this.setVaultState(this.getVaultState()); return this.current(); }
  isCurrent(current) { return !this.disposed && current === this.current(); }
  edit(key) {
    const current = this.current(); if (!current || current.pending || registryBusy(current.status)) return;
    current.draft[key] = key === 'days' ? this.days.flatMap((node, day) => node.checked ? [day] : []) : ['enabled', 'background'].includes(key) ? Boolean(this.fields[key].checked) : this.fields[key].value;
    current.edited = true;
    if (['mode', 'enabled', 'background','visibility'].includes(key)) this.render();
  }
  async readStatus(current, sessionId, source) {
    const status = await this.services.registryStorageStatus();
    if (!this.isCurrent(current)) return;
    if (!status || status.sessionId !== sessionId || status.source !== source || typeof status.configured !== 'boolean' || typeof status.state !== 'string') throw Error('invalidStatus');
    if (status.configured) registryConfiguration(registryDraft(status.configuration));
    current.status = status;
    if (!current.edited) current.draft = registryDraft(status.configuration);
  }
  async perform(kind, callback) {
    const current = this.current(); if (!this.available() || !current || current.pending || this.disposed) return;
    const generation = ++current.generation, sessionId = this.vaultState.sessionId, source = registrySource(this.vaultState);
    current.pending = kind; current.message = ''; current.error = ''; current.cancelling = false; this.render();
    try { await callback(current, sessionId, source); }
    catch (error) {
      if (generation === current.generation && !this.disposed) {
        current.error = Object.hasOwn(REGISTRY_COPY, error?.message) ? error.message : 'error';
        if (kind === 'loading') { current.status = null; current.snapshots = null; current.selected = ''; }
        if (kind === 'listing') { current.snapshots = null; current.selected = ''; }
      }
    } finally { if (generation === current.generation && !this.disposed) { current.pending = null; current.cancelling = false; if (this.isCurrent(current)) this.render(); } }
  }
  async refresh() {
    if (this.disposed) return;
    await this.perform('loading', (current, id, source) => this.readStatus(current, id, source));
  }
  async save() {
    const current = this.synchronize(); if (!current || this.buttons.save.disabled) return;
    let configuration;
    try { configuration = registryConfiguration(current.draft); if (configuration.schedule.enabled && !this.canSyncSource()) { const error = new Error('sourceRequired'); error.field = 'enabled'; throw error; } }
    catch (error) { current.error = error.message; this.render(); (error.field === 'days' ? this.days[0] : this.fields[error.field])?.focus(); return; }
    await this.perform('saving', async (row, id, source) => {
      await this.services.configureRegistryStorage(configuration);
      if (!this.isCurrent(row)) return;
      row.edited = false; row.snapshots = null; row.selected = '';
      await this.readStatus(row, id, source); row.message = 'saved';
    });
  }
  async sync() {
    const current = this.synchronize(); if (!current || this.buttons.sync.disabled) return;
    await this.perform('syncing', async (row, id, source) => {
      const result = await this.services.syncRegistryStorage();
      if (!this.isCurrent(row)) return;
      row.message = result?.verified === true && DIGEST.test(result.digest) ? 'verified' : 'unverified';
      row.snapshots = null; row.selected = ''; await this.readStatus(row, id, source);
    });
  }
  async list() {
    const current = this.synchronize(); if (!current || this.buttons.list.disabled) return;
    await this.perform('listing', async row => {
      const result = await this.services.listRegistrySnapshots();
      if (!this.isCurrent(row)) return;
      row.snapshots = registrySnapshots(result); if (!row.snapshots.some(item => item.digest === row.selected)) row.selected = '';
      row.message='destinationVerified';
    });
  }
  async restore() {
    const current = this.synchronize(); if (!current || this.buttons.restore.disabled) return;
    const digest = current.selected;
    await this.perform('restoring', async (row, id, source) => {
      row.restoredDestination = ''; this.render();
      const result = await this.services.restoreRegistrySnapshot({ digest });
      if (!this.isCurrent(row)) return;
      const restored = result?.restored === true && result?.requiresUnlock === true && typeof result?.destination === 'string' && result.destination.length > 0 && result.destination.length <= 32768;
      row.restoredDestination = restored ? result.destination : '';
      row.message = result?.cancelled === true ? 'cancelled' : restored ? 'restored' : 'unverified';
      await this.readStatus(row, id, source);
    });
  }
  async cancel() {
    const current = this.synchronize(); if (!current || this.buttons.cancel.disabled) return;
    current.cancelling = true; this.render(); const generation = current.generation;
    try { await this.services.cancelRegistryStorage(); }
    catch { if (!this.disposed && generation === current.generation) { current.error = 'error'; current.cancelling = false; } }
    if (this.isCurrent(current)) this.render();
  }
  async selectOperationOwner() {
    const current=this.synchronize(), owner=current?.status?.activeOperation?.sessionId;
    if(!current||this.ownerButton.disabled||typeof owner!=='string'||!owner||owner===this.vaultState?.sessionId)return;
    this.ownerButton.disabled=true;
    try {
      // Select through the existing session API. Cancellation remains an action
      // of the newly selected session, never a renderer-supplied target ID.
      await this.services.selectSession(owner);
      if(!this.disposed)this.setVaultState(this.getVaultState());
    } catch {if(this.isCurrent(current)){current.error='ownerUnavailable';this.render();}}
  }
  render() {
    const current = this.current(), draft = current?.draft || registryDraft(), status = current?.status;
    const available = this.available(), pending = Boolean(current?.pending), busy = registryBusy(status), active = busy || transfer(current?.pending);
    const otherOwner=typeof status?.activeOperation?.sessionId==='string'&&status.activeOperation.sessionId!==this.vaultState?.sessionId;
    const editable = available && !pending && !busy && !otherOwner;
    this.loginPanel.render();this.visibilityNote.textContent=this.t(draft.visibility==='public'?'publicDestinationNote':'privateDestinationNote');
    this.ownerText.hidden=this.ownerButton.hidden=!otherOwner;
    this.ownerText.textContent=otherOwner?`${this.t('otherOwner')} ${status.activeOperation.sessionId}`:'';
    this.ownerButton.textContent=this.t('selectOwner');this.ownerButton.disabled=!otherOwner||pending||typeof this.services.selectSession!=='function';
    for (const [key, node] of Object.entries(this.copyNodes)) node.textContent = this.t(key);
    for (const [key, node] of Object.entries(this.fields)) {
      this.labels[key].textContent = this.t(key); node.label = this.t(key); node.setAttribute('aria-label', this.t(key)); node.disabled = !editable;
      if (['enabled', 'background'].includes(key)) node.checked = Boolean(draft[key]); else node.value = String(draft[key]);
    }
    for (const values of Object.values(this.options)) for (const option of values) { option.node.replaceChildren(element('span', { slot: 'headline', text: this.t(option.value) })); }
    this.fields.enabled.disabled ||= !this.canSyncSource() && !draft.enabled;
    this.copyNodes.sourceRequired.hidden = this.canSyncSource();
    this.daysLegend.textContent = this.t('days');
    this.days.forEach((node, day) => { node.checked = draft.days.includes(day); node.disabled = !editable; node.setAttribute('aria-label', this.t(`day${day}`)); this.dayLabels[day].textContent = this.t(`day${day}`); });
    this.calendar.hidden = draft.mode !== 'calendar'; this.interval.hidden = draft.mode !== 'interval';
    const actions = { save: editable, sync: editable && status?.configured && this.canSyncSource(), refresh: available && !pending, cancel: available && active && !otherOwner && !current?.cancelling, list: editable && status?.configured, restore: editable && status?.configured && current?.snapshots?.some(row => row.digest === current.selected) };
    for (const [key, node] of Object.entries(this.buttons)) { node.textContent = this.t(key); node.disabled = !actions[key]; }
    this.buttons.cancel.hidden = !active; this.progress.hidden = !active; this.progress.setAttribute('aria-label', this.t('operation'));
    const progress=status?.progress;
    const hasProgress=progress&&['downloading','preparing-upload','downloading-restore'].includes(progress.phase)&&Number.isSafeInteger(progress.completedFiles)&&progress.completedFiles>=0&&Number.isSafeInteger(progress.completedBytes)&&progress.completedBytes>=0;
    this.progressText.hidden=!hasProgress;
    this.progressText.textContent=hasProgress?`${this.t(progress.phase)}: ${progress.completedFiles}${Number.isSafeInteger(progress.totalFiles)&&progress.totalFiles>=progress.completedFiles?` / ${progress.totalFiles}`:''} ${this.t('progressFiles')} · ${progress.completedBytes} ${this.t('progressBytes')}`:'';
    const recovery=status?.restoreRecovery;
    this.recoveryText.hidden=!(recovery&&typeof recovery.destination==='string'&&recovery.destination.length>0&&recovery.destination.length<=32767);
    this.recoveryText.textContent=this.recoveryText.hidden?'':`${this.t(recovery.complete===true?'recoveryComplete':'recoveryIncomplete')}\n${recovery.destination}`;
    this.deferredText.hidden=status?.lastResult?.replayDeferred!==true;this.deferredText.textContent=this.t('replayDeferred');
    const message = !available ? 'unavailable' : current?.cancelling ? 'cancelling' : current?.pending || current?.message || (!status ? 'unverified' : !status.configured ? 'unconfigured' : status.state === 'incomplete' ? 'unverified' : busy ? 'syncing' : 'idle');
    this.statusText.textContent = this.t(message) + (busy ? ` (${String(status.state).slice(0,80)})` : '');
    this.error.textContent = current?.error ? this.t(current.error) : status?.lastError ? this.t('error') : ''; this.error.hidden = !this.error.textContent;
    this.restoredLocation.textContent = current?.restoredDestination || ''; this.restoreResult.hidden = !current?.restoredDestination;
    const last = status?.lastResult;
    const values = { savedRepository: status?.configuration?.repository, savedVisibility:status?.configured?this.t(status.configuration?.visibility??'private'):null,nextDue: status?.nextDue, lastResult: last?.verified === true && DIGEST.test(last.digest) ? last.digest : last ? this.t('unverified') : null };
    for (const [key, row] of Object.entries(this.metrics)) { row.label.textContent = this.t(key); row.value.textContent = values[key] == null ? this.t('unknown') : String(values[key]).slice(0,512); }
    this.revision.label = this.t('select'); this.revision.setAttribute('aria-label', this.t('select')); this.revision.disabled = !editable || !current?.snapshots?.length;
    const optionRows = [element('option', { value: '', text: this.t('choose') }), ...(current?.snapshots || []).map(row => element('option', { value: row.digest, text: `${row.tag} · ${row.digest}` }))];
    this.revision.replaceChildren(...optionRows); this.revision.value = current?.selected || '';
    this.revisionMessage.textContent = current?.snapshots == null ? this.t('notLoaded') : !current.snapshots.length ? this.t('empty') : `${current.snapshots.length}`;
    const selected = current?.snapshots?.find(row => row.digest === current.selected); this.revisionDetails.hidden = !selected;
    for (const [key, row] of Object.entries(this.rows)) { row.label.textContent = this.t(key); const value = key === 'digest' ? selected?.digest : selected?.snapshot[key]; row.value.textContent = Array.isArray(value) ? value.join('\n') || this.t('none') : String(value ?? ''); }
  }
  setLanguage(language) { this.language = language; this.render(); }
  destroy() { this.disposed = true;this.loginPanel.destroy();if(this.pollTimer!==null)clearTimeout(this.pollTimer);this.pollTimer=null;for (const current of this.sessions.values()) current.generation++; this.sessions.clear(); this.remove(); }
}
register('mfe-registry-storage-panel', RegistryStoragePanel);
