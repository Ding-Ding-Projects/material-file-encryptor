import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { plainErrorMessage } from '../../../shared/ipc-error.js';
import { CONFLICT_COPY } from './registry-conflicts-copy.js';
import { conflictPage, choicesForConflict, conflictRequest, appendConflictPage, restoredConflictPaths } from './registry-conflicts-model.js';

const entry = () => ({ rows: null, cursor: null, cursors: new Set(), selected: null, choice: '', restoredPaths: [], pending: null, generation: 0, message: '', error: '' });
export class RegistryConflictsPanel extends SurfaceElement {
  constructor() {
    super(); this.services = {}; this.getVaultState = () => null; this.translateText = value => value; this.sessions = new Map(); this.disposed = false;
    this.style('section{border-top:1px solid var(--md-sys-color-outline-variant);padding-top:16px;margin-top:24px}h2,h3,p,dt,dd,legend{overflow-wrap:anywhere}.actions,.records{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.records{flex-direction:column;align-items:stretch}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}.side{min-width:0;padding:12px;border:1px solid var(--md-sys-color-outline-variant);border-radius:12px}.metrics{margin:0;display:grid;gap:6px}.metrics dd{margin:0 0 12px;user-select:text;white-space:pre-wrap}.choice{display:flex;align-items:center;gap:8px;min-height:44px}.choice span{overflow-wrap:anywhere}fieldset{border:0;padding:0;min-width:0}.error{color:var(--md-sys-color-error)}');
    this.heading = element('h2', { id: 'conflict-review-title', tabIndex: -1 }); this.introduction = element('p');
    this.status = element('p', { role: 'status', 'aria-live': 'polite' }); this.error = element('p', { role: 'alert', class: 'error' });
    this.buttons = {};
    for (const key of ['refresh', 'more', 'cancel', 'apply']) { const node = element(key === 'apply' ? 'md-filled-button' : 'md-outlined-button'); node.addEventListener('click', () => { if (!node.disabled) void this[key](); }); this.buttons[key] = node; }
    this.records = element('div', { class: 'records' }); this.selectionNote = element('p'); this.identity = element('p'); this.kind = element('p');
    this.sideNodes = {};
    for (const key of ['current', 'preserved']) {
      const heading = element('h3'), missing = element('p'), metrics = element('dl', { class: 'metrics' }), rows = {};
      for (const field of ['path', 'entryId', 'versionId', 'historyVersionId', 'liveState', 'type']) { const label = element('dt'), value = element('dd'); rows[field] = { label, value }; metrics.append(label, value); }
      this.sideNodes[key] = { heading, missing, metrics, rows, root: element('div', { class: 'side' }, [heading, missing, metrics]) };
    }
    this.unsupported = element('p'); this.reason = element('p'); this.choiceLegend = element('legend'); this.choiceRows = element('div');
    this.deletionHeading = element('h3'); this.deletionRows = {}; this.deletionMetrics = element('dl', { class: 'metrics' });
    for (const key of ['deletionCommitId','path','entryId','expectedVersion']) { const label=element('dt'),value=element('dd'); this.deletionRows[key]={label,value};this.deletionMetrics.append(label,value); }
    this.deletionBlock=element('div',{class:'side'},[this.deletionHeading,this.deletionMetrics]);
    this.choiceGroup = element('fieldset', {}, [this.choiceLegend, this.choiceRows]); this.consequence = element('p');
    this.review = element('div', {}, [this.identity, this.kind, element('div', { class: 'comparison' }, Object.values(this.sideNodes).map(side => side.root)), this.deletionBlock, this.unsupported, this.reason, this.choiceGroup, this.consequence, this.buttons.apply]);
    this.recoveryHeading=element('h3');this.recoveryList=element('div',{style:'user-select:text;white-space:pre-wrap;overflow-wrap:anywhere'});this.recoveryNote=element('p');this.recoveryBlock=element('div',{},[this.recoveryHeading,this.recoveryList,this.recoveryNote]);
    this.shadowRoot.append(element('section', { 'aria-labelledby': this.heading.id }, [this.heading, this.introduction, this.status, this.error, element('div', { class: 'actions' }, ['refresh','more','cancel'].map(key => this.buttons[key])), this.records, this.selectionNote, this.review,this.recoveryBlock])); this.render();
  }
  t(key) { const [en, yue] = CONFLICT_COPY[key] || [key,key], translated = this.translateText(en); return translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language); }
  kindLabel(kind) { return this.t(['file-edit','rename','delete-versus-edit','directory','resolution-divergence'].includes(kind) ? kind : 'unknownKind'); }
  configure({ services = {}, getVaultState = () => null, translate = value => value, language = 'en' } = {}) { this.services = services; this.getVaultState = getVaultState; this.translateText = translate; this.language = language; this.setVaultState(getVaultState()); return this; }
  current() { return this.sessions.get(this.key); }
  available() { return Boolean(this.vaultState?.sessionId && this.vaultState?.storageDir && this.vaultState?.locked === false && typeof this.services.listRegistryConflicts === 'function' && typeof this.services.resolveRegistryConflict === 'function'); }
  setVaultState(state) {
    if (this.disposed) return;
    const key = state?.sessionId ? JSON.stringify([state.sessionId, state.storageDir || '']) : null;
    const changed = key !== this.key, wasAvailable = this.available(); this.key = key; this.vaultState = state;
    if (key && !this.sessions.has(key)) this.sessions.set(key, entry());
    if (!this.available() && this.current()) { const row = this.current(); row.generation++; row.rows = null; row.cursor = null; row.selected = null; row.choice = ''; row.restoredPaths=[]; row.pending = null; }
    this.render(); if ((changed || !wasAvailable) && this.available()) void this.refresh();
  }
  synchronize() { this.setVaultState(this.getVaultState()); return this.current(); }
  valid(row, generation) { return !this.disposed && this.current() === row && row.generation === generation && this.available(); }
  async load(append = false) {
    const row = this.current(); if (!this.available() || !row || row.pending || append && !row.cursor) return;
    const generation = ++row.generation, cursor = append ? row.cursor : null; row.pending = 'loading'; row.error = ''; row.message = ''; row.selected = null; row.choice = '';
    if (!append) { row.rows = null; row.cursor = null; row.cursors.clear(); } this.render();
    try {
      const page = conflictPage(await this.services.listRegistryConflicts({ limit: 25, ...(cursor ? { cursor } : {}) }));
      if (!this.valid(row, generation)) return;
      if (page.items.length > 25 || page.nextCursor && (page.nextCursor === cursor || row.cursors.has(page.nextCursor))) throw Error('invalid');
      row.rows = append ? appendConflictPage(row.rows || [], page) : page.items; row.cursor = page.nextCursor; if (cursor) row.cursors.add(cursor);
    } catch (error) { if (this.valid(row, generation)) { row.rows = null; row.cursor = null; row.error = ['invalid','stale','limit'].includes(error.message) ? error.message : 'error'; } }
    finally { if (!this.disposed && row.generation === generation) { row.pending = null; if (this.current() === row) this.render(); } }
  }
  async refresh() { if (!this.disposed) await this.load(false); }
  async more() { this.synchronize(); await this.load(true); }
  select(id) { const row = this.synchronize(); if (!row || row.pending || !this.available()) return; row.selected = row.rows?.find(item => item.conflictId === id) || null; row.choice = ''; row.message = ''; row.error = ''; this.render(); }
  choose(choice) { const row = this.current(); if (!row || row.pending || !choicesForConflict(row.selected).includes(choice)) return; row.choice = choice; this.render(); this.choiceInputs?.get(choice)?.focus(); }
  cancel() { const row = this.synchronize(); if (!row || row.pending === 'settling') return; row.generation++; if (row.pending) { row.rows = null; row.cursor = null; } row.pending = null; row.selected = null; row.choice = ''; row.message = 'cancelled'; row.error = ''; this.render(); this.heading.focus(); }
  async apply() {
    const row = this.synchronize(); if (!row || this.buttons.apply.disabled) return;
    const kind=row.selected.kind, request = conflictRequest(row.selected, row.choice), generation = ++row.generation;
    row.pending = 'settling'; row.error = ''; row.message = '';row.restoredPaths=[]; this.render();
    let message = 'unverified';
    try {
      const result = await this.services.resolveRegistryConflict(request);
      if (!this.valid(row, generation)) return;
      message = result?.cancelled === true ? 'confirmationCancelled' : result?.resolved === true && result.conflictId === request.conflictId && result.choice === request.choice ? 'resolved' : 'unverified';
      if(message==='resolved' && kind==='resolution-divergence')row.restoredPaths=restoredConflictPaths(result.restoredPaths);
    } catch (error) {
      if (!this.valid(row, generation)) return;
      const text = plainErrorMessage(error);
      message = /conflict review is stale|file versions changed|conflict-stale/i.test(text) ? 'stale' : 'unverified';
    } finally {
      if (!this.disposed && row.generation === generation && this.current() !== row) { row.pending = null; row.rows = null; row.cursor = null; row.selected = null; row.choice = ''; row.message = 'unverified'; }
      if (this.valid(row, generation)) {
        row.pending = null; row.choice = ''; row.selected = null; row.rows = null; row.cursor = null;
        const refreshGeneration = row.generation + 1;
        await this.load(false);
        if (this.valid(row, refreshGeneration)) { row.message = message === 'resolved' && row.error ? 'unverified' : message; this.render(); this.heading.focus(); }
      }
    }
  }
  render() {
    const row = this.current(), available = this.available(), selected = row?.selected, pending = Boolean(row?.pending), choices = choicesForConflict(selected);
    this.heading.textContent = this.t('title'); this.introduction.textContent = this.t('introduction'); this.selectionNote.textContent = this.t('selection');
    for (const [key,node] of Object.entries(this.buttons)) node.textContent = this.t(key);
    this.buttons.refresh.disabled = !available || pending; this.buttons.more.disabled = !available || pending || !row?.cursor; this.buttons.more.hidden = !row?.cursor;
    this.buttons.cancel.disabled = !available || row?.pending === 'settling' || !row?.selected && !pending;
    this.buttons.apply.disabled = !available || pending || !choices.includes(row?.choice); this.buttons.apply.hidden = !choices.length;
    this.status.textContent = this.t(!available ? 'unavailable' : row?.pending || row?.message || (row?.rows === null || !row ? 'unloaded' : !row.rows.length ? 'empty' : 'loaded')) + (available && row?.rows?.length ? `: ${row.rows.length}` : '');
    this.error.textContent = row?.error ? this.t(row.error) : ''; this.error.hidden = !row?.error;
    this.records.replaceChildren();
    for (const item of row?.rows || []) {
      const title = `${item.current?.path || item.preserved?.path || item.conflictId} · ${this.kindLabel(item.kind)}`;
      const button = element('md-outlined-button', { text: title, disabled: pending, 'aria-pressed': String(selected?.conflictId === item.conflictId) }); button.addEventListener('click', () => this.select(item.conflictId)); this.records.append(button);
    }
    this.review.hidden = !selected; this.identity.textContent = `${this.t('conflictId')}: ${selected?.conflictId || ''}`; this.kind.textContent = `${this.t('kind')}: ${selected ? this.kindLabel(selected.kind) : ''}`;
    for (const [key, nodes] of Object.entries(this.sideNodes)) {
      const side = selected?.[key]; nodes.heading.textContent = this.t(key); nodes.missing.textContent = this.t('absent'); nodes.missing.hidden = Boolean(side); nodes.metrics.hidden = !side;
      for (const [field, cells] of Object.entries(nodes.rows)) {
        cells.label.textContent = this.t(field); cells.value.textContent = field === 'type' ? side ? this.t(side.isDirectory ? 'directory' : 'file') : '' : field === 'liveState' ? side ? this.t(side.isLive ? 'liveFile' : 'historical') : '' : side?.[field] || '';
        cells.label.hidden = cells.value.hidden = field === 'historyVersionId' && !side?.historyVersionId;
      }
    }
    this.unsupported.textContent = this.t('unsupported'); this.unsupported.hidden = Boolean(choices.length); this.reason.textContent = selected?.unsupportedReason || ''; this.reason.hidden = !selected?.unsupportedReason;
    this.deletionHeading.textContent=this.t('deletion');this.deletionBlock.hidden=!selected?.deletion;
    for(const [key,cells] of Object.entries(this.deletionRows)){cells.label.textContent=this.t(key);cells.value.textContent=selected?.deletion?.[key]||'';}
    this.choiceLegend.textContent = this.t('choices'); this.choiceGroup.hidden = !choices.length; this.choiceRows.replaceChildren(); this.choiceInputs = new Map();
    for (const choice of choices) {
      const radio = element('input', { type: 'radio', name: 'registry-conflict-choice', value: choice, checked: row.choice === choice, disabled: pending, 'aria-label': this.t(choice) });
      this.choiceInputs.set(choice, radio);
      radio.addEventListener('change', () => { if (radio.checked) this.choose(choice); }); this.choiceRows.append(element('label', { class: 'choice' }, [radio, element('span', { text: this.t(choice) })]));
    }
    this.consequence.textContent = row?.choice ? this.t(`effect-${selected?.kind === 'rename' ? 'rename-' : selected?.kind === 'resolution-divergence' ? 'divergence-' : ''}${row.choice}`) : ''; this.consequence.hidden = !row?.choice;
    this.recoveryHeading.textContent=this.t('recoveryPaths');this.recoveryNote.textContent=this.t('recoveryNote');this.recoveryBlock.hidden=!row?.restoredPaths.length;this.recoveryList.replaceChildren(...(row?.restoredPaths||[]).map(value=>element('p',{text:value})));
  }
  setLanguage(language) { this.language = language; this.render(); }
  destroy() { this.disposed = true; for (const row of this.sessions.values()) row.generation++; this.sessions.clear(); this.remove(); }
}
register('mfe-registry-conflicts-panel', RegistryConflictsPanel);
