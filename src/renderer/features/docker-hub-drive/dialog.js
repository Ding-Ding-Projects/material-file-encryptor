import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { RegistryLoginPanel } from '../storage-maintenance/registry-login-panel.js';
import { REGISTRY_LOGIN_COPY } from '../storage-maintenance/registry-login-copy.js';
import { createInfoIconController } from '../../../shared/surface/info-icon-controller.js';
let infoIconFactory = createInfoIconController;
/** Lets a test replace the information icon mounting, which needs a real document. */
export const setInfoIconFactory = factory => { infoIconFactory = factory; };
import { HUB_DRIVE_INFO_ICON_INVENTORY } from '../../../shared/local-ux/info-icon-docker-hub-drive.js';
import { HUB_DRIVE_COPY } from './copy.js';
import './picker.js';
import { runCreateFlow, runOpenFlow, validateNewDrive, validateOpenDrive, suggestedRepository, errorKey, normalizeDriveName, formatBytes, formatTime, fill, CREATE_STEPS, OPEN_STEPS } from './model.js';

const STYLE = `
dialog,mfe-dialog{--md-dialog-container-shape:20px}
.frame{display:grid;grid-template-columns:200px minmax(0,1fr);gap:0;min-width:min(900px,92vw);max-width:96vw;min-height:520px}
.frame.direct{grid-template-columns:minmax(0,1fr);min-width:min(640px,92vw);min-height:0}
.steps{margin:0;padding:12px 8px;list-style:none;display:flex;flex-direction:column;gap:4px;background:var(--md-sys-color-surface-container-low,#f7f8fb);border-radius:14px}
.steps li{padding:10px 12px;border-radius:10px;color:var(--md-sys-color-on-surface-variant,#4a4c5c)}
.steps li[aria-current=step]{background:var(--md-sys-color-secondary-container,#e6e8ff);color:var(--md-sys-color-on-secondary-container,#26318f);font-weight:700}
.steps li[data-done=true]{color:var(--md-sys-color-on-tertiary-container,#063d31)}
.body{padding:4px 12px 4px 18px;display:grid;gap:14px;align-content:start;min-width:0;max-height:70vh;overflow:auto}
h2,h3,p{margin:0;overflow-wrap:anywhere}
.head{display:flex;align-items:center;gap:10px}.head h2{flex:1;font-size:18px}
.pill{padding:4px 10px;border-radius:10px;font-size:12px;font-weight:700;background:var(--md-sys-color-secondary-container,#e6e8ff);color:var(--md-sys-color-on-secondary-container,#26318f)}
.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
md-list-item.choice{border:2px solid var(--md-sys-color-outline-variant,#c6c8d8);border-radius:14px;min-height:64px}
md-list-item.choice[aria-checked=true]{border-color:var(--md-sys-color-primary,#4b57c9)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}
.ok{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31);font-weight:600}
.warn{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-tertiary-container,#fff1de);color:var(--md-sys-color-on-tertiary-container,#4a2c00);line-height:1.5}
.note{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-surface-container,#f1f2f8);line-height:1.5}
.bad{padding:12px 14px;border-radius:12px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002);display:grid;gap:6px}
.path{font-family:var(--mfe-mono,ui-monospace,monospace);font-size:12px;user-select:text;overflow-wrap:anywhere}
.tasks{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.tasks li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--md-sys-color-surface-container,#f1f2f8)}
.tasks li[data-state=done]{background:var(--md-sys-color-tertiary-container,#cdefe3)}
.tasks li[data-state=working]{background:var(--md-sys-color-secondary-container,#dfe0ff)}
.tasks li[data-state=failed]{background:var(--md-sys-color-error-container,#ffdad6)}
.tasks b{flex:1}
.snaps{display:grid;gap:6px;margin:0;padding:0;list-style:none}
md-list-item.snap{border:2px solid var(--md-sys-color-outline-variant,#c6c8d8);border-radius:10px;min-height:48px}
md-list-item.snap[aria-pressed=true]{border-color:var(--md-sys-color-primary,#4b57c9);background:var(--md-sys-color-secondary-container,#f0f1ff)}
.with-info{display:flex;align-items:flex-start;gap:8px;min-width:0}
.with-info>:not(mfe-control-guidance){flex:1;min-width:0}
.with-info>md-outlined-select{flex:0 1 260px}
.with-info>md-icon-button{flex:none}
.head md-icon-button{width:48px;height:48px;--md-icon-button-state-layer-width:48px;--md-icon-button-state-layer-height:48px;font-size:28px}
.body>md-outlined-button,.body>md-filled-button{justify-self:start}
.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:6px}
.error{color:var(--md-sys-color-error,#b3261e)}
details{border:1px solid var(--md-sys-color-outline-variant,#c6c8d8);border-radius:12px;padding:10px 12px}
summary{cursor:pointer;font-weight:600;min-height:32px}
@media(max-width:700px){.frame{grid-template-columns:minmax(0,1fr);min-width:0}.steps{flex-direction:row;overflow:auto}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}`;

const LOGIN_TEXT = (key, language) => { const pair = REGISTRY_LOGIN_COPY[key]; return pair ? localized({ en: pair[0], yue: pair[1] }, language) : key; };
const DRIVE_LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * The Docker Hub drive flows in one dialog: create a drive with no folder to choose, or open one found on
 * Docker Hub. Steps are plain functions of the stage; every action goes through the preload api, and the
 * long-running work is the tested runCreateFlow and runOpenFlow.
 */
export class HubDriveDialog extends SurfaceElement {
  constructor() {
    super();
    this.api = {}; this.mode = 'create'; this.stage = 'choose'; this.translateText = value => value; this.getVaultState = () => null; this.disposed = false;
    this.draft = {}; this.where = 'hub'; this.selected = null; this.account = null; this.stepStates = {}; this.outcome = null; this.progress = null; this.running = false; this.infoOpen = false;
    this.style(STYLE);
    this.dialog = element('dialog', { 'aria-labelledby': 'hub-drive-title' });
    this.dialog.addEventListener('close', () => { if (!this.running) this.reset(); });
    this.shadowRoot.append(this.dialog);
    this.loginPanel = new RegistryLoginPanel({ translate: key => LOGIN_TEXT(key, this.language === 'zh-HK' ? 'yue' : this.language), onSignedIn: value => this.signedIn(value) });
    this.picker = element('mfe-hub-repository-picker');
    this.picker.addEventListener('hub-repository-choose', event => this.chosen(event.detail));
    this.picker.addEventListener('hub-sign-in-needed', () => { this.stage = this.mode === 'open' ? 'repository' : 'signin'; this.loginPanel.start?.(); this.render(); });
    this.infoIcons = infoIconFactory(this.shadowRoot, { inventory: HUB_DRIVE_INFO_ICON_INVENTORY, getLanguage: () => this.language, observe: true });
  }
  configure({ api = {}, translate = value => value, language = 'en', getVaultState = () => null } = {}) {
    this.api = api; this.translateText = translate; this.language = language; this.getVaultState = getVaultState; this.picker.configure({ services: api, mode: this.mode, translate, language });
    return this;
  }
  setLanguage(language) { this.language = language; this.picker.setLanguage(language); this.render(); this.infoIcons.setLanguage?.(language); }
  t(key, values) {
    const [en, yue] = HUB_DRIVE_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  get available() { return typeof this.api.hubCatalogStart === 'function' && typeof this.api.hubDriveFolders === 'function'; }
  /** Opens the dialog. mode is 'create' or 'open'. Returns once it is shown. */
  open(mode = 'create', {direct = false} = {}) {
    this.reset(); this.mode = mode; this.direct = mode === 'create' && direct === true; this.stage = mode === 'open' ? 'repository' : 'choose';
    this.picker.configure({ services: this.api, mode, translate: this.translateText, language: this.language });
    this.loginPanel.configure(this.api);
    const letters = this.letters(); this.draft = { driveName: 'Drive', driveLetter: letters[0] ?? 'M', credentialMode: 'password', password: '', confirmPassword: '', keyFilePath: '' };
    this.render(); const shown = this.dialog.showModal?.(); Promise.resolve(shown).then(() => this.focusFirst(), () => {});
    if (mode === 'open') this.enterRepositoryStep();
    else if (this.direct) void this.afterWhere();
  }
  /** The dialog would otherwise focus an information icon and pop its tooltip. Focus the first real control instead. */
  focusFirst() {
    // Never scroll: focusing a control far down the list would open the picker scrolled to the bottom.
    if (this.stage === 'repository') { this.picker.focusSearch?.(); return; }
    const first = this.shadowRoot.querySelector?.('.body md-list-item, .body md-outlined-text-field, .body md-filled-button, .body md-outlined-button, .body input');
    first?.focus?.({ preventScroll: true });
  }
  letters() {
    const state = this.getVaultState() || {};
    const listed = [...new Set([...(state.availableDriveLetters || state.defaults?.availableDriveLetters || [])].map(value => String(value)[0]?.toUpperCase()).filter(letter => DRIVE_LETTERS.includes(letter)))].sort();
    return listed.length ? listed : ['M'];
  }
  reset() { this.stage = this.mode === 'open' ? 'repository' : 'choose'; this.selected = null; this.stepStates = {}; this.outcome = null; this.progress = null; this.running = false; this.infoOpen = false; }
  close() { this.dialog.close?.(); this.picker.destroy?.(); }
  get signedInAccount() { return this.loginPanel.signedIn ? this.loginPanel.value?.account ?? null : null; }
  signedIn() { this.account = this.signedInAccount; if (['signin', 'repository'].includes(this.stage)) this.enterRepositoryStep(); }
  enterRepositoryStep() {
    this.stage = 'repository'; this.account = this.signedInAccount ?? this.account;
    this.picker.configure({ services: this.api, mode: this.mode, account: this.account, translate: this.translateText, language: this.language });
    this.render();
    // The easy path preselects <account>/material-file-encryptor-storage and goes straight to the one details screen;
    // Change repository brings the full chooser back.
    const loaded = this.picker.load(false);
    if (this.direct && this.mode === 'create' && !this.draft.repository && this.account) {
      const suggestion = suggestedRepository(this.account, this.picker.snapshot?.repositories ?? []);
      this.selected = { repository: suggestion.repository, visibility: suggestion.visibility, driveCount: suggestion.driveCount };
      this.draft.repository = suggestion.repository; this.stage = 'details'; this.render();
    }
    void loaded;
  }
  chosen(detail) {
    if (this.mode === 'open') {
      if (!detail.drive) { this.selected = { repository: detail.repository, visibility: detail.visibility, driveCount: detail.driveCount }; const only = this.picker.snapshot?.repositories.find(item => item.id === detail.repository); if (only?.drives.length === 1) { this.selectDrive(only, only.drives[0]); } else this.render(); return; }
      const repository = this.picker.snapshot?.repositories.find(item => item.id === detail.repository); if (repository) this.selectDrive(repository, detail.drive);
      return;
    }
    this.selected = { repository: detail.repository, visibility: detail.visibility, driveCount: detail.driveCount };
    this.draft.repository = detail.repository; this.stage = 'details'; this.render();
  }
  selectDrive(repository, drive) {
    this.selected = { repository: repository.id, visibility: repository.visibility, drive };
    this.draft.repository = repository.id; this.draft.digest = drive.latest?.digest ?? drive.revisions[0]?.digest; this.draft.driveName = drive.name ?? this.draft.driveName; this.draft.location = 'automatic';
    this.stage = 'snapshot'; this.render();
  }
  steps() {
    if (this.mode === 'open') return [['repository', 'stepDrive'], ['snapshot', 'stepSnapshot'], ['restoring', 'stepRestore'], ['unlock', 'stepUnlock']];
    return [['choose', 'stepWhere'], ['signin', 'stepSignIn'], ['repository', 'stepRepository'], ['details', 'stepDetails'], ['creating', 'stepCreate']];
  }
  stageIndex() {
    const order = this.steps().map(item => item[0]); const alias = { done: 'creating', failed: 'creating', mounted: 'unlock' };
    return Math.max(0, order.indexOf(alias[this.stage] ?? this.stage));
  }
  field(id, label, value, onInput, props = {}) { const node = element('input', { id, label, value, ...props }); node.addEventListener('input', () => onInput(node.value)); return element('div', { class: 'with-info' }, [node]); }
  button(text, onClick, { filled = false, disabled = false } = {}) { const node = element(filled ? 'md-filled-button' : 'md-outlined-button', { text }); node.disabled = disabled; node.addEventListener('click', () => { if (!node.disabled) onClick(); }); return node; }
  render() {
    const items = this.steps(), at = this.stageIndex();
    const title = this.t(this.mode === 'open' ? 'openTitle' : 'createTitle');
    const close = element('md-icon-button', { 'aria-label': this.t('close'), text: '×' }); close.addEventListener('click', () => { if (!this.running) this.close(); });
    const head = element('div', { class: 'head' }, [element('h2', { id: 'hub-drive-title', text: title }), element('span', { class: 'pill', text: this.t('stepCount', { n: at + 1, total: items.length }) }), close]);
    const list = element('ol', { class: 'steps', hidden: this.direct === true, 'aria-label': title }, items.map(([key, label], index) => element('li', { 'aria-current': index === at ? 'step' : 'false', 'data-done': String(index < at), text: `${index + 1} ${this.t(label)}` })));
    const body = element('div', { class: 'body' }, this[`stage_${this.stage}`]?.() ?? []);
    this.dialog.replaceChildren(element('div', {}, [head, element('div', { class: this.direct ? 'frame direct' : 'frame' }, [list, body])]));
    // A new step starts at its top, whatever the previous step was scrolled to.
    if (this.lastStage !== this.stage) { this.lastStage = this.stage; const scroller = this.shadowRoot.querySelector?.('.body'); if (scroller) scroller.scrollTop = 0; }
  }
  stage_choose() {
    const card = (key, hint, action, on, pick) => { const node = element('md-list-item', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': String(on) }, [element('div', { slot: 'headline', text: this.t(key) }), element('div', { slot: 'supporting-text', text: this.t(hint) }), element('div', { slot: 'trailing-supporting-text', text: this.t(action) })]); node.addEventListener('click', pick); return node; };
    return [element('p', { text: this.t('where') }),
      element('div', { class: 'choices', role: 'radiogroup', 'aria-label': this.t('whereGroup') }, [
        card('thisComputer', 'thisComputerHint', 'thisComputerAction', this.where === 'pc', () => { this.where = 'pc'; this.close(); this.dispatchEvent(new CustomEvent('hub-use-this-computer', { bubbles: true, composed: true })); }),
        card('dockerHub', 'dockerHubHint', 'dockerHubAction', this.where === 'hub', () => { this.where = 'hub'; void this.afterWhere(); })]),
      element('p', { class: 'note', text: this.t('nothingLeaves') })];
  }
  async afterWhere() {
    await this.loginPanel.recheck?.();
    if (this.loginPanel.signedIn) this.enterRepositoryStep(); else { this.stage = 'signin'; this.render(); }
  }
  stage_signin() { return [element('h3', { text: this.t('signInTitle') }), element('p', { text: this.t('signInNeeded') }), this.loginPanel.root, this.actions([this.button(this.t('back'), () => { this.stage = 'choose'; this.render(); })])]; }
  stage_repository() {
    const out = [];
    if (this.account) out.push(element('p', { class: 'ok', text: this.t('signedIn', { account: this.account }) }));
    else if (this.mode === 'open') out.push(element('h3', { text: this.t('signInTitle') }), this.loginPanel.root);
    // The help that used to hide behind a bare (i) button is a plain caption under the list.
    out.push(this.picker, element('p', { class: 'note', text: this.t('pickerHelp') + ' ' + this.t('nameVisible') }));
    out.push(this.actions([...(this.mode === 'create' ? [this.button(this.t('back'), () => { this.stage = this.direct && this.draft.repository ? 'details' : 'choose'; this.render(); })] : [])]));
    return out;
  }
  actions(nodes) { return element('div', { class: 'actions' }, nodes); }
  problemsFor(validator) { return validator(this.draft).map(key => this.t(key)); }
  credentialFields() {
    const mode = this.draft.credentialMode;
    const nodes = [];
    if (mode === 'keyFile') {
      nodes.push(element('p', { class: 'path', text: this.draft.keyFilePath ? this.t('keyFile', { name: String(this.draft.keyFilePath).split(/[\\/]/).at(-1) }) : '' }),
        this.button(this.t('chooseKeyFile'), async () => { try { const picked = await this.api.chooseKeyFile?.(); if (picked) { this.draft.keyFilePath = picked; this.render(); } } catch { /* the picker reports its own failure */ } }),
        this.button(this.t('usePassword'), () => { this.draft.credentialMode = 'password'; this.draft.keyFilePath = ''; this.render(); }));
    } else {
      nodes.push(element('div', { class: 'grid' }, [this.field('hub-password', this.t('password'), this.draft.password, value => { this.draft.password = value; }, { type: 'password', autocomplete: 'new-password' }),
        ...(this.mode === 'create' ? [this.field('hub-confirm-password', this.t('confirmPassword'), this.draft.confirmPassword, value => { this.draft.confirmPassword = value; }, { type: 'password', autocomplete: 'new-password' })] : [])]),
      this.button(this.t('keyFileInstead'), () => { this.draft.credentialMode = 'keyFile'; this.draft.password = ''; this.draft.confirmPassword = ''; this.render(); }));
    }
    return nodes;
  }
  letterField() {
    const select = element('select', { id: 'hub-drive-letter', label: this.t('driveLetter'), value: `${this.draft.driveLetter}:` }, this.letters().map(letter => element('option', { value: `${letter}:`, text: `${letter}:`, selected: letter === this.draft.driveLetter })));
    select.addEventListener('change', () => { this.draft.driveLetter = String(select.value)[0]; }); return element('div', { class: 'with-info' }, [select]);
  }
  stage_details() {
    const suggestion = suggestedRepository(this.account ?? 'you', this.picker.snapshot?.repositories ?? []);
    const known = (this.picker.snapshot?.repositories ?? []).find(item => item.id === this.draft.repository);
    const out = [element('div', { class: 'note' }, [element('b', { text: this.t('repositoryChosen', { repository: this.draft.repository }) }), element('p', { text: known?.drives.length ? this.t('repositoryHolds', { n: known.drives.length }) : this.t('repositoryNew') })]),
      this.button(this.t('change'), () => { this.stage = 'repository'; this.render(); }),
      element('div', { class: 'grid' }, [this.field('hub-drive-name', this.t('driveName'), this.draft.driveName, value => { this.draft.driveName = value; }, { maxLength: 32 }), this.letterField()]),
      ...this.credentialFields(), element('p', { class: 'warn', role: 'note', text: this.t('publicWarning') }),
      element('div', { class: 'note' }, [element('b', { text: this.t('localCopy') }), element('p', { text: this.t('folderPending') }), element('p', { text: this.t('localCopyNote') })])];
    const problems = this.problemsFor(validateNewDrive);
    if (this.touched && problems.length) out.push(element('p', { class: 'error', role: 'alert', text: problems.join(' ') }));
    void suggestion;
    out.push(this.actions([this.button(this.t('back'), () => { this.stage = 'repository'; this.render(); }), this.button(this.t('create'), () => { this.touched = true; if (validateNewDrive(this.draft).length) this.render(); else void this.create(); }, { filled: true })]));
    return out;
  }
  taskList(items, states) {
    return element('ol', { class: 'tasks', 'aria-live': 'polite' }, items.map(([key, label, detail]) => { const state = states[key] ?? 'waiting'; return element('li', { 'data-state': state }, [element('span', { 'aria-hidden': 'true', text: state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'working' ? '…' : '' }), element('b', { text: label }), element('span', { class: 'meta', text: state === 'failed' ? this.t('stateFailed') : state === 'done' ? this.t('stateDone') : state === 'working' ? this.t('stateWorking') : detail })]); }));
  }
  stage_creating() { return [element('h3', { text: this.t('creating') }), this.taskList(this.createItems(), this.stepStates), element('md-linear-progress', { indeterminate: true })]; }
  createItems() {
    return [['folders', this.t('createFolders'), this.t('createFoldersDetail')], ['vault', this.t('createVault'), this.t('createVaultDetail', { letter: `${this.draft.driveLetter}:` })], ['repository', this.t('createRepository'), this.draft.repository],
      ['destination', this.t('createDestination'), this.t('createDestinationDetail')], ['sync', this.t('createSync'), this.t('createSyncDetail')]];
  }
  async create() {
    this.stage = 'creating'; this.stepStates = {}; this.running = true; this.render();
    const result = await runCreateFlow({ api: this.api, draft: this.draft, resume: this.outcome?.resume ?? null, onStep: (step, status) => { this.stepStates[step] = status; if (!this.disposed) this.render(); } });
    this.running = false; this.outcome = result; this.stage = result.ok ? 'done' : 'failed'; this.render();
  }
  stage_done() {
    const folder = this.outcome?.folders;
    return [element('div', { class: 'ok' }, [element('b', { text: this.t('createdTitle', { name: normalizeDriveName(this.draft.driveName) ?? '', letter: `${this.draft.driveLetter}:` }) }), element('p', { text: this.t('createdBody') })]),
      this.taskList(this.createItems(), this.stepStates),
      element('div', { class: 'note' }, [element('b', { text: this.t('localCopy') }), element('p', { class: 'path', text: folder?.storageDir ?? '' }), element('p', { text: this.t('localCopyNote') })]),
      this.actions([this.button(this.t('showFolder'), () => void this.api.hubShowFolder?.(folder?.driveId)), this.button(this.t('done'), () => this.close(), { filled: true })])];
  }
  stage_failed() {
    const out = this.outcome, created = Boolean(out?.created), reason = this.t(errorKey(out?.error));
    return [element('div', { class: 'bad', role: 'alert' }, [element('b', { text: this.t('createFailedTitle') }), element('p', { text: created ? this.t('createFailedKept', { letter: `${this.draft.driveLetter}:` }) : this.t('createFailedEarly', { reason }) }), ...(created ? [element('p', { text: reason })] : [])]),
      this.taskList(this.createItems(), this.stepStates),
      this.actions([this.button(this.t('back'), () => { this.stage = 'details'; this.outcome = created ? this.outcome : null; this.render(); }), this.button(this.t('retry'), () => void this.create(), { filled: true })])];
  }
  // ---- Open flow ----
  stage_snapshot() {
    const drive = this.selected?.drive; if (!drive) return [];
    const revisions = drive.revisions.filter(item => item.digest);
    const buttons = revisions.map((revision, index) => { const node = element('md-list-item', { type: 'button', class: 'snap', 'aria-pressed': String(revision.digest === this.draft.digest) }, [element('div', { slot: 'headline', text: formatTime(revision.updatedAt) }), element('div', { slot: 'supporting-text', text: revision.bytes === null ? '' : formatBytes(revision.bytes) }), element('div', { slot: 'trailing-supporting-text', text: this.t(index === 0 ? 'latest' : 'older') })]); node.addEventListener('click', () => { this.draft.digest = revision.digest; this.render(); }); return node; });
    const letterRow = element('div', { class: 'grid' }, [this.letterField()]);
    const advanced = element('details', {}, [element('summary', { text: this.t('advanced') }), element('p', { class: 'meta', text: this.t('advancedNote') }), this.button(this.t('advancedChoose'), () => { this.draft.location = 'choose'; void this.restore(); })]);
    advanced.id = 'hub-advanced';
    const failure = this.restoreError ? [element('p', { class: 'error', role: 'alert', text: this.t(this.restoreError) })] : [];
    return [...failure,element('h3', { text: this.t('openSnapshotsTitle', { name: drive.name ?? this.t('unnamedDrive'), id: drive.shortId }) }), element('ul', { class: 'snaps' }, buttons.map(node => element('li', {}, [node]))), element('p', { class: 'meta', text: this.t('snapshotHelp') }),
      element('div', { class: 'note' }, [element('b', { text: this.t('restoreInto') }), element('p', { text: this.t('restoreIntoNote') })]), letterRow, element('div', { class: 'with-info' }, [advanced]),
      this.actions([this.button(this.t('back'), () => { this.stage = 'repository'; this.render(); }), this.button(this.t('restore'), () => { this.draft.location = 'automatic'; void this.restore(); }, { filled: true, disabled: !this.draft.digest })])];
  }
  stage_restoring() {
    const progress = this.progress;
    return [element('h3', { text: this.t('restoring') }), element('md-linear-progress', { indeterminate: true }), element('p', { class: 'meta', 'aria-live': 'polite', text: progress ? this.t('restoreProgress', { files: progress.completedFiles ?? 0, size: formatBytes(progress.completedBytes ?? 0) }) : '' }),
      this.button(this.t('cancelRestore'), () => void this.api.hubRestoreCancel?.())];
  }
  async restore() {
    this.stage = 'restoring'; this.running = true; this.progress = null; this.render();
    this.restoreError = '';
    const result = await runOpenFlow({ api: this.api, draft: this.draft, until: 'restore', onProgress: value => { this.progress = value; this.render(); } });
    this.running = false;
    if (result.cancelled) { this.stage = 'snapshot'; this.render(); return; }
    if (!result.ok) { this.stage = 'snapshot'; this.restoreError = errorKey(result.error); this.render(); return; }
    this.openState = result.resume; this.restored = result.restored; this.draft.driveName = this.draft.driveName || result.restored.driveName || ''; this.stage = 'unlock'; this.render();
  }
  stage_unlock() {
    const out = [element('p', { class: 'ok', text: this.t('restoredVerified') }), ...this.credentialFields(), element('div', { class: 'grid' }, [this.letterField()])];
    if (this.unlockError) out.push(element('p', { class: 'error', role: 'alert', text: this.t(this.unlockError) }));
    out.push(this.actions([this.button(this.t('unlockAndMount'), () => void this.unlock(), { filled: true })]));
    return out;
  }
  async unlock() {
    if (validateOpenDrive(this.draft).length) { this.unlockError = 'validationPassword'; this.render(); return; }
    this.running = true; this.unlockError = '';
    const result = await runOpenFlow({ api: this.api, draft: this.draft, resume: this.openState });
    this.running = false;
    if (!result.ok) { this.unlockError = result.failedStep === 'unlock' ? 'unlockFailed' : errorKey(result.error); this.render(); return; }
    this.stage = 'mounted'; this.render();
  }
  stage_mounted() {
    const when = formatTime(this.selected?.drive?.revisions.find(item => item.digest === this.draft.digest)?.updatedAt);
    return [element('div', { class: 'ok' }, [element('b', { text: this.t('mounted', { letter: `${this.draft.driveLetter}:` }) }), element('p', { text: this.t('mountedBody', { when }) })]),
      this.actions([this.button(this.t('showFolder'), () => void this.api.hubShowFolder?.(this.restored?.driveId)), this.button(this.t('done'), () => this.close(), { filled: true })])];
  }
  destroy() { this.disposed = true; this.picker.destroy?.(); this.loginPanel.destroy?.(); this.infoIcons.destroy?.(); }
}
register('mfe-hub-drive-dialog', HubDriveDialog);
export { CREATE_STEPS, OPEN_STEPS };
