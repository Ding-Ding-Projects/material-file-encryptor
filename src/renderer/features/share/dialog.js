import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { RegistryLoginPanel } from '../storage-maintenance/registry-login-panel.js';
import { registryLoginText } from '../storage-maintenance/registry-login-text.js';
import { createInfoIconController } from '../../../shared/surface/info-icon-controller.js';
import { SHARE_INFO_ICON_INVENTORY } from '../../../shared/local-ux/info-icon-share.js';
import { SHARE_COPY } from './copy.js';
import { fill, formatBytes, formatTime, shareErrorKey, passphraseProblems, shareBlocker, looksLikeShare, SHARE_LIMIT_BYTES } from './model.js';

let infoIconFactory = createInfoIconController;
/** Lets a test replace the information icon mounting, which needs a real document. */
export const setInfoIconFactory = factory => { infoIconFactory = factory; };

const STYLE = `
dialog{--md-dialog-container-shape:20px}
.frame{display:grid;gap:14px;min-width:min(640px,92vw);max-width:96vw;max-height:80vh;overflow:auto;padding:4px 8px 4px 4px}
h2,h3,p{margin:0;overflow-wrap:anywhere}
.head{display:flex;align-items:center;gap:10px}.head h2{flex:1;font-size:18px}
.head md-icon-button{width:48px;height:48px;--md-icon-button-state-layer-width:48px;--md-icon-button-state-layer-height:48px;font-size:28px}
.file{font-weight:700}
.ok{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31)}
.warn{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002);font-weight:600;line-height:1.5}
.note{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-surface-container,#f1f2f8);line-height:1.5}
.error{color:var(--md-sys-color-error,#b3261e)}
.command{font-family:var(--mfe-mono,ui-monospace,monospace);font-size:12px;user-select:all;overflow-wrap:anywhere;padding:10px 12px;border-radius:10px;border:1px solid var(--md-sys-color-outline-variant,#c6c8d8)}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.with-info{display:flex;align-items:flex-start;gap:8px;min-width:0}
.with-info>:not(mfe-control-guidance){flex:1;min-width:0}
.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:6px}
.actions>*,.entry-actions>*{min-height:48px}
.entries{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px 12px;border-radius:12px;background:var(--md-sys-color-surface-container,#f1f2f8)}
.entry[data-state=revoked]{opacity:.75}
.entry-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.badge{padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700;background:var(--md-sys-color-secondary-container,#e6e8ff);color:var(--md-sys-color-on-secondary-container,#26318f)}
label.switch{display:flex;align-items:center;gap:12px;min-height:48px}
@media(max-width:600px){.entry{grid-template-columns:minmax(0,1fr)}.entry-actions{justify-content:flex-start}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;


/**
 * One dialog with three modes: share a selected file through Docker Hub, receive a shared file, and the list of
 * files shared from this computer. Every action goes through the preload api; the share key never passes
 * through this element except as the finished command the user asked to copy.
 */
export class ShareDialog extends SurfaceElement {
  constructor() {
    super();
    this.api = {}; this.mode = 'share'; this.stage = 'options'; this.language = 'en'; this.translateText = value => value; this.getVaultState = () => null; this.clipboard = () => globalThis.navigator?.clipboard;
    this.file = null; this.draft = {}; this.result = null; this.error = null; this.received = null; this.entries = null; this.listInfo = null; this.notice = ''; this.busy = false; this.disposed = false; this.pollTimer = null; this.phase = null;
    this.style(STYLE);
    this.dialog = element('dialog', { 'aria-labelledby': 'share-title' });
    this.dialog.addEventListener('close', () => this.closed());
    this.shadowRoot.append(this.dialog);
    this.loginPanel = new RegistryLoginPanel({ translate: key => registryLoginText(key, this.language), onSignedIn: () => this.render() });
    this.loginPanel.onSignedInChange?.(() => this.render());
    this.infoIcons = infoIconFactory(this.shadowRoot, { inventory: SHARE_INFO_ICON_INVENTORY, getLanguage: () => this.language, observe: true });
  }
  configure({ api = {}, translate = value => value, language = 'en', getVaultState = () => null, clipboard, confirm } = {}) {
    this.api = api; if (confirm) this.confirmFn = confirm; this.translateText = translate; this.language = language; this.getVaultState = getVaultState; if (clipboard) this.clipboard = clipboard;
    return this;
  }
  setLanguage(language) { this.language = language; this.infoIcons.setLanguage?.(language); if (this.dialog.open) this.render(); }
  t(key, values) {
    const [en, yue] = SHARE_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  show() { this.render(); if (!this.dialog.open) { const shown = this.dialog.showModal?.(); Promise.resolve(shown).then(() => this.focusFirst(), () => {}); } }
  focusFirst() { this.shadowRoot.querySelector?.('.frame md-outlined-text-field, .frame md-filled-button, .frame md-outlined-button')?.focus?.({ preventScroll: true }); }
  reset() { this.stage = 'options'; this.result = null; this.error = null; this.received = null; this.notice = ''; this.busy = false; this.phase = null; this.draft = { passphraseOn: false, passphrase: '', confirm: '', command: '', receivePassphrase: '' }; }
  closed() {
    clearTimeout(this.pollTimer); this.pollTimer = null;
    if (this.received?.receiveId) void this.api.shareReceiveDiscard?.(this.received.receiveId)?.catch?.(() => {});
    // Forget the passphrase and the finished command when the dialog closes.
    this.draft = {}; this.result = null; this.received = null;
  }
  close() { if (this.busy && this.mode === 'share') return; this.dialog.close?.(); }

  /** Opens the share flow for one file: { id, path, size }. */
  openShare(file) {
    this.reset(); this.mode = 'share'; this.file = file; this.loginPanel.configure(this.api);
    const blocker = shareBlocker(this.getVaultState(), file);
    if (blocker) this.error = { key: blocker, values: { size: formatBytes(SHARE_LIMIT_BYTES) } };
    this.show();
  }
  /** Opens the receive flow, optionally with a link the main process is holding (incomingId) or pasted text. */
  openReceive({ incomingId = null, command = '' } = {}) {
    this.reset(); this.mode = 'receive'; this.stage = 'paste'; this.draft.command = command; this.incomingId = incomingId;
    if (incomingId) this.notice = 'linkArrived';
    this.show();
  }
  openList() { this.reset(); this.mode = 'list'; this.stage = 'list'; this.entries = null; this.show(); void this.loadList(); }

  button(text, onClick, { filled = false, disabled = false, id } = {}) {
    const node = element(filled ? 'md-filled-button' : 'md-outlined-button', { text, ...(id ? { id } : {}) }); node.disabled = disabled;
    node.addEventListener('click', () => { if (!node.disabled) onClick(); }); return node;
  }
  field(id, label, value, onInput, props = {}) { const node = element('input', { id, label, value, ...props }); node.addEventListener('input', () => onInput(node.value)); return element('div', { class: 'with-info' }, [node]); }
  actions(nodes) { return element('div', { class: 'actions' }, nodes); }
  errorBox() { return this.error ? [element('p', { class: 'error', role: 'alert', text: this.t(this.error.key, this.error.values) })] : []; }
  render() {
    if (this.disposed) return;
    const title = this.t(this.mode === 'receive' ? 'receiveTitle' : this.mode === 'list' ? 'listTitle' : 'shareTitle');
    const close = element('md-icon-button', { 'aria-label': this.t('close'), text: '×' }); close.addEventListener('click', () => this.close());
    const head = element('div', { class: 'head' }, [element('h2', { id: 'share-title', text: title }), close]);
    const body = this[`${this.mode}_${this.stage}`]?.() ?? [];
    this.dialog.replaceChildren(element('div', { class: 'frame' }, [head, ...body]));
  }

  // ---- Share ----
  share_options() {
    const file = this.file, name = String(file?.path || '').split(/[\\/]/).at(-1);
    const account = this.loginPanel.signedIn ? this.loginPanel.value?.account : null;
    const out = [element('p', { class: 'file', text: this.t('fileLine', { name, size: formatBytes(file?.size) }) }),
      element('p', { text: this.t('shareIntro', { repository: account ? `${String(account).toLowerCase()}/material-file-encryptor-shares` : 'material-file-encryptor-shares' }) }),
      element('p', { class: 'note', text: `${this.t('sizeLimit', { size: formatBytes(SHARE_LIMIT_BYTES) })} ${this.t('needsApp')}` })];
    if (account) out.push(element('p', { class: 'ok', text: this.t('signedIn', { account }) }));
    else out.push(element('h3', { text: this.t('signInTitle') }), element('p', { text: this.t('signInNeeded') }), this.loginPanel.root);
    const toggle = element('md-switch', { id: 'share-passphrase-switch', 'aria-label': this.t('usePassphrase') }); toggle.selected = Boolean(this.draft.passphraseOn);
    toggle.addEventListener('change', () => { this.draft.passphraseOn = Boolean(toggle.selected); if (!this.draft.passphraseOn) { this.draft.passphrase = ''; this.draft.confirm = ''; } this.render(); });
    out.push(element('div', { class: 'with-info' }, [element('label', { class: 'switch' }, [toggle, element('span', { text: this.t('usePassphrase') })])]));
    if (this.draft.passphraseOn) out.push(element('p', { class: 'note', text: this.t('passphraseHelp') }),
      this.field('share-passphrase', this.t('passphrase'), this.draft.passphrase, value => { this.draft.passphrase = value; }, { type: 'password', autocomplete: 'new-password' }),
      this.field('share-passphrase-confirm', this.t('confirmPassphrase'), this.draft.confirm, value => { this.draft.confirm = value; }, { type: 'password', autocomplete: 'new-password' }));
    out.push(element('p', { class: 'note', text: this.t('publicNote') }), ...this.errorBox());
    const blocked = Boolean(shareBlocker(this.getVaultState(), file));
    out.push(this.actions([this.button(this.t('cancel'), () => this.close()), this.button(this.t('shareAction'), () => void this.share(), { filled: true, disabled: blocked || !account || typeof this.api.shareCreate !== 'function' })]));
    return out;
  }
  async share() {
    const problems = passphraseProblems({ enabled: this.draft.passphraseOn, passphrase: this.draft.passphrase, confirm: this.draft.confirm });
    if (problems.length) { this.error = { key: problems[0] }; this.render(); return; }
    this.error = null; this.busy = true; this.stage = 'working'; this.phase = 'preparing'; this.render(); this.poll();
    try {
      this.result = await this.api.shareCreate(this.file.id, this.draft.passphraseOn ? this.draft.passphrase : null);
      this.stage = 'done';
    } catch (error) { this.error = { key: shareErrorKey(error) }; this.stage = 'options'; }
    finally { this.busy = false; this.draft.passphrase = ''; this.draft.confirm = ''; clearTimeout(this.pollTimer); this.pollTimer = null; this.render(); }
  }
  poll() {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (!this.busy || this.disposed) return;
      try { const status = await this.api.shareStatus?.(); if (status?.state && status.state !== 'idle' && this.busy) { this.phase = status.state; this.render(); } } catch { /* status is advisory */ }
      if (this.busy) this.poll();
    }, 400);
  }
  share_working() {
    return [element('p', { class: 'file', text: this.t('fileLine', { name: String(this.file?.path || '').split(/[\\/]/).at(-1), size: formatBytes(this.file?.size) }) }),
      element('md-linear-progress', { indeterminate: true }), element('p', { 'aria-live': 'polite', text: this.t(`phase_${this.phase}`) }),
      this.actions([this.button(this.t('cancelShare'), () => void this.api.shareCancel?.())])];
  }
  copyButton(label, value, id) {
    return this.button(label, async () => {
      try { await this.clipboard()?.writeText(value); this.notice = 'copied'; } catch { this.notice = 'copyFailed'; }
      this.render();
    }, { id });
  }
  share_done() {
    const result = this.result || {}, name = result.entry?.name || '';
    const out = [element('div', { class: 'ok' }, [element('b', { text: this.t('sharedTitle', { name }) })]),
      element('p', { class: 'warn', role: 'note', text: this.t('warning') })];
    if (result.entry?.passphrase) out.push(element('p', { class: 'warn', text: this.t('passphraseWarning') }));
    const command = element('div', { class: 'command', id: 'share-command', tabindex: '0', role: 'textbox', 'aria-readonly': 'true', 'aria-label': this.t('commandLabel'), text: result.command || '' });
    out.push(element('div', { class: 'with-info' }, [command]),
      element('div', { class: 'row' }, [this.copyButton(this.t('copyCommand'), result.command || '', 'share-copy-command'), this.copyButton(this.t('copyLink'), result.link || '', 'share-copy-link'), this.copyButton(this.t('copyCommandLine'), result.commandLine || '', 'share-copy-command-line')]),
      element('p', { class: 'note', text: this.t('howToReceive') }));
    if (this.notice) out.push(element('p', { role: 'status', text: this.t(this.notice) }));
    if (result.persistent === false || result.listSaved === false) out.push(element('p', { class: 'note', text: this.t('listNotSaved') }));
    out.push(this.actions([this.button(this.t('openList'), () => this.openList()), this.button(this.t('done'), () => this.close(), { filled: true })]));
    return out;
  }

  // ---- Receive ----
  receive_paste() {
    const out = [element('p', { text: this.t('receiveIntro') })];
    if (this.notice === 'linkArrived') out.push(element('p', { class: 'note', role: 'status', text: this.t('linkArrived') }));
    else {
      const field = element('textarea', { id: 'receive-command', label: this.t('receiveField'), value: this.draft.command, rows: 3, spellcheck: false, autocomplete: 'off' });
      field.addEventListener('input', () => { this.draft.command = field.value; });
      out.push(element('div', { class: 'with-info' }, [field]));
    }
    out.push(...this.errorBox(), this.actions([this.button(this.t('cancel'), () => this.close()), this.button(this.t('download'), () => void this.receive(), { filled: true, disabled: this.busy })]));
    return out;
  }
  receive_passphrase() {
    return [element('p', { text: this.t('passphraseNeeded') }),
      this.field('receive-passphrase', this.t('passphrase'), this.draft.receivePassphrase, value => { this.draft.receivePassphrase = value; }, { type: 'password', autocomplete: 'off' }),
      ...this.errorBox(), this.actions([this.button(this.t('back'), () => { this.stage = 'paste'; this.error = null; this.render(); }), this.button(this.t('open'), () => void this.receive(), { filled: true, disabled: this.busy })])];
  }
  receive_working() { return [element('md-linear-progress', { indeterminate: true }), element('p', { 'aria-live': 'polite', text: this.t(this.saving ? 'saving' : 'downloading') })]; }
  async receive() {
    const passphrase = this.stage === 'passphrase' ? this.draft.receivePassphrase : null;
    if (!this.incomingId && !looksLikeShare(this.draft.command)) { this.error = { key: 'error_COMMAND_INVALID' }; this.render(); return; }
    const request = this.incomingId ? { incomingId: this.incomingId, passphrase } : { command: this.draft.command.trim(), passphrase };
    const previous = this.stage;
    this.busy = true; this.error = null; this.saving = false; this.stage = 'working'; this.render();
    try {
      const result = await this.api.shareReceive(request);
      if (result?.needsPassphrase) { this.stage = 'passphrase'; this.draft.receivePassphrase = ''; }
      else { this.received = result; this.draft.command = ''; this.draft.receivePassphrase = ''; this.incomingId = null; this.notice = ''; this.stage = 'ready'; }
    } catch (error) {
      this.error = { key: shareErrorKey(error) }; this.stage = previous;
      if (this.error.key === 'error_EXPIRED') { this.incomingId = null; this.notice = ''; this.stage = 'paste'; }
    } finally { this.busy = false; this.render(); }
  }
  receive_ready() {
    const item = this.received || {}, state = this.getVaultState(), mounted = state && state.locked === false && state.mounted;
    return [element('h3', { text: this.t('readyTitle') }), element('p', { class: 'file', text: this.t('readyBody', { name: item.name, size: formatBytes(item.size), when: formatTime(item.modified) || '-' }) }),
      element('p', { class: 'note', text: this.t('verified') }), ...this.errorBox(), ...(mounted ? [] : [element('p', { class: 'note', text: this.t('saveToDriveNeeds') })]),
      this.actions([this.button(this.t('cancel'), () => this.close()), this.button(this.t('saveToDrive'), () => void this.save('drive'), { disabled: !mounted || this.busy }), this.button(this.t('saveAs'), () => void this.save('file'), { filled: true, disabled: this.busy })])];
  }
  async save(destination) {
    this.busy = true; this.saving = true; this.error = null; this.stage = 'working'; this.render();
    try {
      const result = await this.api.shareReceiveSave(this.received.receiveId, destination);
      if (result?.saved) { this.savedName = result.name; this.received = null; this.stage = 'saved'; } else this.stage = 'ready';
    } catch (error) { this.error = { key: shareErrorKey(error) }; this.stage = this.error.key === 'error_EXPIRED' ? 'paste' : 'ready'; if (this.stage === 'paste') this.received = null; }
    finally { this.busy = false; this.saving = false; this.render(); }
  }
  receive_saved() {
    return [element('div', { class: 'ok' }, [element('b', { text: this.t('savedTitle', { name: this.savedName || '' }) }), element('p', { text: this.t('savedBody') })]),
      this.actions([this.button(this.t('receiveAnother'), () => this.openReceive()), this.button(this.t('done'), () => this.close(), { filled: true })])];
  }

  // ---- List ----
  async loadList() {
    try { const listed = await this.api.shareList(); this.entries = listed.entries; this.listInfo = listed; }
    catch (error) { this.entries = []; this.error = { key: shareErrorKey(error) }; }
    this.render();
  }
  list_list() {
    const out = [element('p', { text: this.t('listIntro') }), element('p', { class: 'note', text: this.t('revokeLimit') })];
    if (this.listInfo?.persistent === false) out.push(element('p', { class: 'note', text: this.t('listMemoryOnly') }));
    if (this.listInfo?.error) out.push(element('p', { class: 'error', text: this.t('listUnreadable') }));
    out.push(...this.errorBox());
    if (this.notice) out.push(element('p', { role: 'status', text: typeof this.notice === 'string' ? this.t(this.notice) : this.t(this.notice.key, this.notice.values) }));
    if (this.entries === null) out.push(element('md-linear-progress', { indeterminate: true }));
    else if (!this.entries.length) out.push(element('p', { text: this.t('listEmpty') }));
    else out.push(element('ul', { class: 'entries', 'aria-label': this.t('listTitle') }, this.entries.map(entry => this.entryRow(entry))));
    const active = (this.entries || []).filter(entry => entry.state === 'active').length;
    out.push(this.actions([this.button(this.t('refresh'), () => { this.entries = null; this.render(); void this.loadList(); }),
      element('div', { class: 'with-info' }, [this.button(this.t('revokeAll'), () => void this.revokeAll(), { id: 'share-revoke-all', disabled: !active || this.busy })]),
      this.button(this.t('done'), () => this.close(), { filled: true })]));
    return out;
  }
  entryRow(entry) {
    const meta = element('div', {}, [element('b', { text: entry.name }), element('p', { class: 'meta', text: this.t('entryMeta', { size: formatBytes(entry.size), when: formatTime(entry.createdAt) }) }),
      element('div', { class: 'row' }, [element('span', { class: 'badge', text: this.t(entry.state === 'active' ? 'statusActive' : 'statusRevoked') }), ...(entry.passphrase ? [element('span', { class: 'badge', text: this.t('withPassphrase') })] : [])])]);
    const actions = entry.state === 'active'
      ? [this.button(this.t('copyAgain'), () => void this.copyAgain(entry), { disabled: this.busy }), this.button(this.t('revoke'), () => void this.revoke(entry), { disabled: this.busy })]
      : [this.button(this.t('forget'), () => void this.forget(entry), { disabled: this.busy })];
    return element('li', { class: 'entry', 'data-state': entry.state }, [meta, element('div', { class: 'entry-actions' }, actions)]);
  }
  async copyAgain(entry) {
    try { const { command } = await this.api.shareCommand(entry.id); await this.clipboard()?.writeText(command); this.notice = 'copied'; this.error = null; }
    catch (error) { this.error = { key: error?.message && /clipboard/i.test(error.message) ? 'copyFailed' : shareErrorKey(error) }; }
    this.render();
  }
  async confirm(text) { return typeof this.confirmFn === 'function' ? this.confirmFn(text) : Boolean(globalThis.confirm?.(text)); }
  async revoke(entry) {
    if (!await this.confirm(this.t('revokeConfirm', { name: entry.name }))) return;
    this.busy = true; this.error = null; this.render();
    try { await this.api.shareRevoke(entry.id); this.notice = { key: 'revoked', values: { name: entry.name } }; }
    catch (error) { this.error = { key: shareErrorKey(error) }; }
    finally { this.busy = false; }
    await this.loadList();
  }
  async revokeAll() {
    if (!await this.confirm(this.t('revokeAllConfirm'))) return;
    this.busy = true; this.error = null; this.render();
    try {
      const { results } = await this.api.shareRevokeAll();
      const done = results.filter(item => item.revoked).length, failed = results.length - done;
      this.notice = failed ? { key: 'revokeSome', values: { n: done, failed } } : { key: 'revokedAll', values: { n: done } };
    } catch (error) { this.error = { key: shareErrorKey(error) }; }
    finally { this.busy = false; }
    await this.loadList();
  }
  async forget(entry) { try { await this.api.shareForget(entry.id); } catch (error) { this.error = { key: shareErrorKey(error) }; } await this.loadList(); }
  destroy() { this.disposed = true; clearTimeout(this.pollTimer); this.loginPanel.destroy?.(); this.infoIcons.destroy?.(); }
}
register('mfe-share-dialog', ShareDialog);
