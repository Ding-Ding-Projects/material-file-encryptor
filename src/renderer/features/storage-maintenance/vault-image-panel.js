import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { plainErrorMessage } from '../../../shared/ipc-error.js';
import { VAULT_IMAGE_COPY } from './vault-image-copy.js';
import { canPrepareVaultImage, vaultImageActions, vaultImagePreview, vaultImageSource, vaultImageTarget } from './vault-image-model.js';

const METHODS = ['prepareVaultImage', 'buildVaultImage', 'uploadVaultImage', 'discardVaultImage', 'cancelVaultImage', 'vaultImageStatus'];
const entry = () => ({ target: '', preview: null, previewSource: null, pending: null, generation: 0, message: '', error: '', cancelling: false });

export class VaultImagePanel extends SurfaceElement {
  constructor() {
    super();
    this.services = {}; this.getVaultState = () => null; this.translateText = value => value;
    this.sessions = new Map(); this.sessionId = null; this.vaultState = null; this.disposed = false;
    this.style('section{border-top:1px solid var(--md-sys-color-outline-variant);margin-top:24px;padding-top:16px}h2,h3,p,dt,dd{overflow-wrap:anywhere}.metrics{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 16px}.metrics dt,.metrics dd{margin:0}.actions{display:flex;gap:12px;flex-wrap:wrap}.preview{padding:16px;background:var(--md-sys-color-surface-container-low);border-radius:12px}.error{color:var(--md-sys-color-error)}');
    this.heading = element('h2'); this.introduction = element('p'); this.prerequisites = element('p'); this.storageOnly = element('p');
    this.target = element('input', { type: 'text', value: '', autocomplete: 'off', spellcheck: false });
    this.target.addEventListener('input', () => { const current = this.current(); if (current && !current.pending) current.target = this.target.value; });
    this.status = element('p', { role: 'status', 'aria-live': 'polite' });
    this.error = element('p', { class: 'error', role: 'alert' });
    this.buttons = {};
    for (const action of ['prepare', 'build', 'upload', 'refresh', 'discard', 'cancel']) {
      const button = element(action === 'upload' ? 'md-filled-button' : 'md-outlined-button');
      button.addEventListener('click', () => { if (!button.disabled) void this[action](); });
      this.buttons[action] = button;
    }
    this.preview = element('div', { class: 'preview' }); this.previewHeading = element('h3');
    this.metrics = element('dl', { class: 'metrics' }); this.rows = {};
    for (const key of ['target', 'fileCount', 'totalBytes', 'vaultId', 'imageId', 'digest']) {
      const label = element('dt'), value = element('dd'); this.rows[key] = { label, value }; this.metrics.append(label, value);
    }
    this.buildNote = element('p'); this.uploadRisk = element('p'); this.discardNote = element('p');
    this.preview.append(this.previewHeading, this.metrics, this.buildNote, this.uploadRisk);
    this.shadowRoot.append(element('section', { 'aria-labelledby': 'vault-image-title' }, [
      this.heading, this.introduction, this.prerequisites, this.storageOnly, this.target,
      this.status, this.error, this.preview, element('div', { class: 'actions' }, Object.values(this.buttons)), this.discardNote,
    ]));
    this.heading.id = 'vault-image-title'; this.render();
  }

  t(key) {
    const copy = VAULT_IMAGE_COPY[key] || { en: key, 'zh-HK': key };
    const translated = this.translateText(copy.en);
    return translated !== copy.en ? translated : localized({ en: copy.en, yue: copy['zh-HK'] }, this.language === 'zh-HK' ? 'yue' : this.language);
  }

  configure({ services = {}, getVaultState = () => null, translate = value => value, language = 'en' } = {}) {
    this.services = services; this.getVaultState = getVaultState; this.translateText = translate; this.language = language;
    this.setVaultState(getVaultState());
    return this;
  }

  current() { return this.sessions.get(this.sessionId); }
  available() { return METHODS.every(name => typeof this.services[name] === 'function'); }
  sourceChanged(current = this.current()) { return Boolean(current?.preview && current.previewSource !== vaultImageSource(this.vaultState)); }
  actions() { const current = this.current(); return vaultImageActions({ state: this.vaultState, preview: current?.preview, pending: current?.pending, available: this.available(), sourceChanged: this.sourceChanged(current) }); }

  setVaultState(state) {
    if (this.disposed) return;
    const id = typeof state?.sessionId === 'string' ? state.sessionId : null;
    const changed = this.sessionId !== id;
    this.sessionId = id; this.vaultState = state;
    if (id && !this.sessions.has(id)) this.sessions.set(id, entry());
    if (changed) this.target.value = this.current()?.target || '';
    this.render();
    if (changed && id && this.available()) void this.refresh();
  }

  synchronize() { this.setVaultState(this.getVaultState()); return this.current(); }
  isCurrent(current) { return !this.disposed && this.current() === current; }

  async perform(kind, callback) {
    const current = this.current();
    if (!current || current.pending || this.disposed) return;
    const sessionId = this.sessionId, generation = ++current.generation, source = vaultImageSource(this.vaultState);
    current.pending = kind; current.error = ''; current.message = ''; current.cancelling = false; this.render();
    try {
      const result = await callback();
      if (this.disposed || generation !== current.generation) return;
      if (kind === 'discard') { current.preview = null; current.previewSource = null; }
      else if (kind === 'upload' && (result == null || result.cancelled === true)) current.message = 'cancelled';
      else {
        const preview = vaultImagePreview(result, sessionId);
        if (kind !== 'refresh' && !preview) throw new Error('invalidPreview');
        if (kind === 'prepare' || !current.preview || preview?.previewId !== current.preview.previewId) current.previewSource = source;
        current.preview = preview;
        if (preview) current.target = preview.target.slice('docker.io/'.length);
      }
    } catch (error) {
      if (this.disposed || generation !== current.generation) return;
      current.error = Object.hasOwn(VAULT_IMAGE_COPY, error?.message) ? this.t(error.message) : plainErrorMessage(error) || this.t('error');
      if (['build', 'upload'].includes(kind) && current.preview) current.preview = { ...current.preview, phase: `${kind}-unverified` };
      // A failed read never leaves an earlier successful preview actionable.
      if (kind === 'refresh') current.preview = null;
    } finally {
      if (!this.disposed && generation === current.generation) {
        current.pending = null; current.cancelling = false;
        if (this.isCurrent(current)) { this.target.value = current.target; this.render(); }
      }
    }
  }

  async refresh() {
    if (this.disposed) return;
    // The caller updates selection first. Every bridge invocation binds its session synchronously.
    if (!this.available() || !this.sessionId || this.current()?.pending) return;
    await this.perform('refresh', () => this.services.vaultImageStatus());
  }

  async prepare() {
    const current = this.synchronize();
    if (!current || !this.actions().prepare) return;
    let reference;
    try { reference = vaultImageTarget(this.target.value); }
    catch { current.error = this.t('invalidTarget'); this.render(); this.target.focus(); return; }
    current.target = reference; this.target.value = reference;
    await this.perform('prepare', () => this.services.prepareVaultImage(reference));
  }

  async build() {
    const current = this.synchronize();
    if (!current || !this.actions().build) return;
    const previewId = current.preview.previewId;
    await this.perform('build', () => this.services.buildVaultImage(previewId));
  }

  async upload() {
    const current = this.synchronize();
    if (!current || !this.actions().upload) return;
    // Main owns the final confirmation, bound to this immutable preview and destination.
    const previewId = current.preview.previewId;
    await this.perform('upload', () => this.services.uploadVaultImage(previewId));
  }

  async discard() {
    const current = this.synchronize();
    if (!current || !this.actions().discard) return;
    await this.perform('discard', () => this.services.discardVaultImage());
  }

  async cancel() {
    const current = this.synchronize();
    if (!current || !this.actions().cancel || current.cancelling) return;
    const generation = current.generation;
    current.cancelling = true; this.render();
    try { await this.services.cancelVaultImage(); }
    catch (error) {
      if (!this.disposed && generation === current.generation) { current.error = plainErrorMessage(error) || this.t('error'); current.cancelling = false; }
    }
    if (this.isCurrent(current) && generation === current.generation) this.render();
  }

  render() {
    const current = this.current(), preview = current?.preview, actions = this.actions();
    for (const key of ['title', 'introduction', 'prerequisites', 'storageOnly', 'buildNote', 'uploadRisk', 'discardNote']) {
      const node = key === 'title' ? this.heading : this[key]; node.textContent = this.t(key);
    }
    this.target.label = this.t('destination'); this.target.setAttribute('aria-label', this.t('destination'));
    this.target.disabled = !this.available() || !this.sessionId || Boolean(current?.pending) || Boolean(preview);
    for (const [key, button] of Object.entries(this.buttons)) { button.textContent = this.t(key); button.disabled = !actions[key]; }
    this.buttons.cancel.hidden = !actions.cancel; this.buttons.cancel.disabled ||= Boolean(current?.cancelling);
    this.preview.hidden = !preview; this.previewHeading.textContent = this.t('preview');
    const values = preview ? { ...preview, digest: preview.receipt?.digest } : {};
    for (const [key, row] of Object.entries(this.rows)) {
      row.label.textContent = this.t(key); row.value.textContent = String(values[key] ?? '');
      row.label.hidden = row.value.hidden = ['imageId', 'digest'].includes(key) && !values[key];
    }
    const status = !this.available() ? 'unavailable' : current?.cancelling ? 'cancelling' : current?.pending ? `${current.pending}Running` :
      this.sourceChanged(current) ? 'sourceChanged' : current?.message || preview?.phase || (canPrepareVaultImage(this.vaultState) ? 'idle' : 'needsLock');
    this.status.textContent = this.t(status); this.error.textContent = current?.error || ''; this.error.hidden = !current?.error;
  }

  setLanguage(language) { this.language = language; this.render(); }
  destroy() { this.disposed = true; for (const current of this.sessions.values()) current.generation++; this.sessions.clear(); this.remove(); }
}
register('mfe-vault-image-panel', VaultImagePanel);
