import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { HOSTING_COPY } from './copy.js';
import { confirmDestructiveAction } from '../../../shared/surface/workflow-confirm.js';
import { linkQrSvg, linkQrPng } from './qr.js';
import { fill, formatBytes, formatClock, formatUptime, expiryFrom, linkStateKey, defaultSettings, settingsFromDraft, EXPIRY_CHOICES, LIMIT_CHOICES } from './model.js';

const STYLE = `
dialog{--md-dialog-container-shape:24px}
.frame{display:grid;gap:16px;width:min(1000px,94vw);max-height:84vh;overflow:auto;padding:4px 8px 4px 4px}
h2,h3,p{margin:0;overflow-wrap:anywhere}
.head{display:flex;align-items:center;gap:10px}.head h2{flex:1;font-size:20px}
.head md-icon-button{width:48px;height:48px;font-size:26px}
.steps{display:flex;gap:6px;flex-wrap:wrap;list-style:none;margin:0;padding:0}
.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.choice{border-radius:16px;min-height:96px;border:2px solid var(--md-sys-color-outline-variant,#dcdee8);--md-list-item-supporting-text-line-height:1.5;--md-list-item-label-text-size:16px;--md-list-item-label-text-weight:650;--md-list-item-two-line-container-height:96px;animation:rise 260ms cubic-bezier(.05,.7,.1,1) both}
.choice [slot=supporting-text]{white-space:normal}
.choice.selected{border-color:var(--md-sys-color-primary,#3f51b5);background:var(--md-sys-color-primary-container,#2f4f3a);--md-list-item-container-color:var(--md-sys-color-primary-container,#2f4f3a)}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.note{padding:12px 14px;border-radius:12px;background:var(--md-sys-color-surface-container,#f1f2f8);line-height:1.5}
.ok{padding:14px 16px;border-radius:14px;background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31);display:grid;gap:6px;animation:rise 300ms both}
.warn{padding:12px 14px;border-radius:12px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002);font-weight:600;line-height:1.5}
.mono{font-family:var(--mfe-mono,ui-monospace,monospace);font-size:13px;overflow-wrap:anywhere;user-select:all}
.phases{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.phases li{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--md-sys-color-surface-container,#f7f8fb)}
.dot{width:12px;height:12px;border-radius:6px;background:var(--md-sys-color-outline-variant,#c6c8d8);flex:none}
.dot[data-state=done]{background:#1d6b3a}.dot[data-state=running]{background:var(--md-sys-color-primary,#3f51b5);animation:pulse 1.2s infinite}.dot[data-state=failed]{background:#b3261e}
.phases li span:nth-child(2){flex:1}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.card{padding:16px 18px;border-radius:18px;background:var(--md-sys-color-surface-container,#f7f8fb);display:grid;gap:8px;align-content:start;animation:rise 280ms both}
.card[aria-current=true]{outline:2px solid var(--md-sys-color-primary,#3f51b5)}
.health{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px}
.bar{height:10px;border-radius:5px;background:var(--md-sys-color-surface-variant,#e3e5ee);overflow:hidden}.bar>div{height:100%;background:var(--md-sys-color-primary,#3f51b5)}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:6px}
.actions>*,.row>md-outlined-button,.row>md-filled-button{min-height:44px}
.table{overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:720px}
th{text-align:left;font-size:13px;color:var(--md-sys-color-on-surface-variant,#454652);padding:8px 10px}
td{padding:10px;border-top:1px solid var(--md-sys-color-outline-variant,#ecedf3);vertical-align:middle}
td.actions-cell{text-align:right;white-space:nowrap}
.badge{padding:3px 10px;border-radius:8px;font-size:12px;font-weight:700;background:var(--md-sys-color-surface-variant,#ecedf3)}
.badge[data-state=active]{background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31)}
.link-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px}
.qr-panel{display:grid;gap:12px;justify-items:center;align-content:start;padding:18px;border-radius:18px;background:var(--md-sys-color-surface-container,#f7f8fb)}
.qr-panel svg{background:#fff;border-radius:14px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.15);animation:pop 260ms both}
pre{margin:0;max-height:320px;overflow:auto;padding:12px;border-radius:12px;background:#1a1b24;color:#e4e4ee;font-size:12px;white-space:pre-wrap}
label.check{display:flex;align-items:center;gap:12px;min-height:48px}
@keyframes rise{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
@keyframes pop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@media(max-width:720px){.link-layout{grid-template-columns:1fr}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

/**
 * One dialog for file hosting with three modes: the setup wizard (deploy a download server on this computer or
 * an SSH host), management (health, instance actions, links) and link creation with a QR code. The admin key
 * never reaches this element; a link address does only when the user creates, copies or shows one.
 */
export class FileHostingDialog extends SurfaceElement {
  constructor() {
    super();
    this.api = {}; this.translateText = value => value; this.language = 'en'; this.clipboard = () => globalThis.navigator?.clipboard; this.confirmFn = null;
    this.mode = 'manage'; this.step = 0; this.draft = defaultSettings(); this.tunnelToken = '';
    this.instances = null; this.selected = null; this.health = new Map(); this.links = null; this.logs = null;
    this.deployStatus = null; this.deployResult = null; this.error = null; this.notice = null; this.busy = false; this.pollTimer = null; this.disposed = false;
    this.link = { shareId: null, instanceId: null, expiry: '7d', customExpiry: '', limit: 'none', customLimit: '5', removeFromHub: false, prefetch: true, shares: null, result: null };
    this.style(STYLE);
    this.dialog = element('dialog', { 'aria-labelledby': 'hosting-title' });
    this.dialog.addEventListener('close', () => this.closed());
    this.shadowRoot.append(this.dialog);
  }
  configure({ api = {}, translate = value => value, language = 'en', clipboard, confirm } = {}) { this.api = api; this.translateText = translate; this.language = language; if (clipboard) this.clipboard = clipboard; if (confirm) this.confirmFn = confirm; return this; }
  setLanguage(language) { this.language = language; if (this.dialog.open) this.render(); }
  t(key, values) {
    const [en, yue] = HOSTING_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  show() { this.render(); if (!this.dialog.open) this.dialog.showModal?.(); }
  close() { if (this.busy && this.mode === 'setup' && this.deployStatus) return; this.dialog.close?.(); }
  closed() { clearTimeout(this.pollTimer); this.pollTimer = null; this.tunnelToken = ''; this.link.result = null; this.logs = null; }
  async confirm(text) { return typeof this.confirmFn === 'function' ? this.confirmFn(text) : Boolean(globalThis.confirm?.(text)); }
  errorFrom(error) { const key = 'err_' + (error?.code || 'FAILED'); return HOSTING_COPY[key] ? { key, values: { detail: error?.message || '' } } : { key: 'err_FAILED' }; }

  /* -------------------------------------------------------------- entry points */
  async openManage() { this.mode = 'manage'; this.error = null; this.notice = null; this.logs = null; this.show(); await this.loadInstances(); }
  openSetup(existing = null) {
    this.mode = 'setup'; this.step = 0; this.error = null; this.deployResult = null; this.deployStatus = null; this.tunnelToken = '';
    this.draft = existing ? { ...defaultSettings(), ...existing, ssh: existing.ssh ? { ...existing.ssh } : defaultSettings().ssh } : defaultSettings();
    if (!existing && this.instances?.length) { const used = new Set(this.instances.map(item => item.port)); while (used.has(this.draft.port)) this.draft.port++; this.draft.name = `files-${this.instances.length + 1}`; }
    this.show();
  }
  async openLink({ shareId = null, instanceId = null } = {}) {
    this.mode = 'link'; this.error = null; this.notice = null;
    Object.assign(this.link, { shareId, instanceId: instanceId || this.selected, result: null, shares: null });
    this.show();
    if (!this.instances) await this.loadInstances(false);
    if (!this.link.instanceId) this.link.instanceId = this.instances?.[0]?.id ?? null;
    try { const { entries } = await this.api.shareList(); this.link.shares = entries.filter(entry => entry.state === 'active'); if (!this.link.shareId) this.link.shareId = this.link.shares[0]?.id ?? null; }
    catch (error) { this.error = this.errorFrom(error); this.link.shares = []; }
    this.render();
  }

  /* -------------------------------------------------------------- data */
  async loadInstances(render = true) {
    try { const result = await this.api.hostingInstances(); this.instances = result.instances; this.storeError = result.error; if (!this.instances.some(item => item.id === this.selected)) this.selected = this.instances[0]?.id ?? null; }
    catch (error) { this.error = this.errorFrom(error); this.instances = []; }
    if (render) this.render();
    if (this.mode === 'manage' && this.selected) { void this.checkHealth(this.selected); void this.loadLinks(); }
  }
  async checkHealth(id) {
    this.health.set(id, { checking: true }); this.render();
    try { const result = await this.api.hostingHealth(id); this.health.set(id, result); if (result.instance) this.instances = this.instances.map(item => item.id === id ? result.instance : item); }
    catch (error) { this.health.set(id, { healthy: false, reason: this.errorFrom(error) }); }
    this.render();
  }
  async loadLinks() {
    const id = this.selected; if (!id) return;
    try { const { links } = await this.api.hostingLinks(id); if (id === this.selected) this.links = links; }
    catch (error) { this.links = []; this.error = this.errorFrom(error); }
    this.render();
  }

  /* -------------------------------------------------------------- helpers */
  button(text, onClick, { filled = false, disabled = false, id, danger = false } = {}) {
    const node = element(filled ? 'md-filled-button' : 'md-outlined-button', { text, ...(id ? { id } : {}) }); node.disabled = disabled;
    if (danger) node.style.setProperty('--md-outlined-button-label-text-color', 'var(--md-sys-color-error,#b3261e)');
    node.addEventListener('click', () => { if (!node.disabled) onClick(); }); return node;
  }
  field(id, label, value, onInput, props = {}) { const node = element('input', { id, label, value: String(value ?? ''), ...props }); node.addEventListener('input', () => onInput(node.value)); return node; }
  check(id, label, checked, onChange) { const box = element('input', { id, type: 'checkbox', 'aria-label': label }); box.checked = checked; box.addEventListener('change', () => onChange(Boolean(box.checked))); return element('label', { class: 'check' }, [box, element('span', { text: label })]); }
  chips(label, choices, current, onPick) {
    return element('div', { class: 'chips', role: 'group', 'aria-label': label }, choices.map(choice => { const node = chipNode(this.t(choice.label), current === choice.id); node.addEventListener('click', event => { event.preventDefault(); onPick(choice.id); }); return node; }));
  }
  choice(title, help, checked, onPick) { const node = element('md-list-item', { type: 'button', class: checked ? 'choice selected' : 'choice', role: 'radio', 'aria-checked': String(checked) }, [element('div', { slot: 'headline', text: title }), element('div', { slot: 'supporting-text', text: help })]); node.addEventListener('click', onPick); return node; }
  actions(nodes) { return element('div', { class: 'actions' }, nodes); }
  messages() {
    const out = [];
    if (this.notice) out.push(element('p', { class: 'ok', role: 'status', text: this.t(this.notice.key, this.notice.values) }));
    if (this.error) out.push(element('p', { class: 'warn', role: 'alert', text: this.t(this.error.key, this.error.values) }));
    return out;
  }
  async copy(text) { try { await this.clipboard()?.writeText(text); this.notice = { key: 'copied' }; this.error = null; } catch { this.error = { key: 'copyFailed' }; } this.render(); }

  render() {
    if (this.disposed) return;
    const title = this.t(this.mode === 'setup' ? 'setupTitle' : this.mode === 'link' ? 'linkTitle' : 'title');
    const close = element('md-icon-button', { 'aria-label': this.t('close'), text: '×' }); close.addEventListener('click', () => this.close());
    const head = element('div', { class: 'head' }, [element('h2', { id: 'hosting-title', text: title }), close]);
    const body = this.mode === 'setup' ? this.renderSetup() : this.mode === 'link' ? this.renderLink() : this.renderManage();
    this.dialog.replaceChildren(element('div', { class: 'frame' }, [head, ...body]));
  }

  /* -------------------------------------------------------------- setup wizard */
  renderSetup() {
    const labels = ['stepWhere', 'stepPort', 'stepAddress', 'stepDeploy'];
    const steps = element('ol', { class: 'steps', 'aria-label': this.t('stepOf', { n: this.step + 1 }) }, labels.map((key, index) => {
      const node = chipNode(`${index + 1}. ${this.t(key)}`, index === this.step, index === this.step ? { 'aria-current': 'step' } : {});
      node.disabled = Boolean(this.deployStatus); node.addEventListener('click', event => { event.preventDefault(); this.step = index; this.error = null; this.render(); });
      return element('li', {}, [node]);
    }));
    const out = [element('p', { text: this.t('intro') }), steps];
    const d = this.draft, set = patch => { Object.assign(d, patch); this.render(); };
    if (this.step === 0) {
      out.push(element('h3', { text: this.t('whereTitle') }), element('div', { class: 'choices', role: 'radiogroup', 'aria-label': this.t('whereTitle') }, [
        this.choice(this.t('local'), this.t('localHelp'), d.target === 'local', () => set({ target: 'local' })),
        this.choice(this.t('ssh'), this.t('sshHelp'), d.target === 'ssh', () => set({ target: 'ssh' }))]));
      if (d.target === 'ssh') out.push(element('div', { class: 'fields' }, [
        this.field('hosting-ssh-host', this.t('sshHost'), d.ssh.host, value => { d.ssh.host = value; }),
        this.field('hosting-ssh-user', this.t('sshUser'), d.ssh.user, value => { d.ssh.user = value; }),
        this.field('hosting-ssh-port', this.t('sshPort'), d.ssh.port, value => { d.ssh.port = value; }, { type: 'number' }),
        this.field('hosting-ssh-key', this.t('sshKey'), d.ssh.keyPath, value => { d.ssh.keyPath = value; })]), element('p', { class: 'note', text: this.t('sshTrust') }));
    } else if (this.step === 1) {
      out.push(element('h3', { text: this.t('portTitle') }), element('div', { class: 'fields' }, [
        this.field('hosting-name', this.t('name'), d.name, value => { d.name = value; }),
        this.field('hosting-port', this.t('port'), d.port, value => { d.port = value; }, { type: 'number' }),
        this.field('hosting-cache', this.t('cache'), d.cacheGb, value => { d.cacheGb = value; }, { type: 'number' })]), element('p', { class: 'note', text: this.t('adminNote') }));
    } else if (this.step === 2) {
      out.push(element('h3', { text: this.t('addressTitle') }), element('div', { class: 'choices', role: 'radiogroup', 'aria-label': this.t('addressTitle') }, [
        this.choice(this.t('tunnelNone'), this.t('tunnelNoneHelp'), d.tunnel === 'none', () => set({ tunnel: 'none' })),
        this.choice(this.t('tunnelQuick'), this.t('tunnelQuickHelp'), d.tunnel === 'quick', () => set({ tunnel: 'quick' })),
        this.choice(this.t('tunnelNamed'), this.t('tunnelNamedHelp'), d.tunnel === 'named', () => set({ tunnel: 'named' }))]));
      if (d.tunnel === 'named') out.push(element('div', { class: 'fields' }, [
        this.field('hosting-public-url', this.t('publicUrl'), d.publicUrl, value => { d.publicUrl = value; }, { placeholder: 'https://files.example.com' }),
        this.field('hosting-tunnel-token', this.t('tunnelToken'), this.tunnelToken, value => { this.tunnelToken = value; }, { type: 'password', autocomplete: 'off', ...(d.hasTunnelToken ? { placeholder: this.t('tunnelTokenKept') } : {}) })]),
        element('p', { class: 'note', text: this.t('tunnelHint') }));
    } else out.push(...this.renderDeploy());
    out.push(...this.messages());
    const back = this.button(this.t('back'), () => { this.step = Math.max(0, this.step - 1); this.error = null; this.render(); }, { disabled: this.step === 0 || Boolean(this.deployStatus) });
    if (this.step < 3) out.push(this.actions([this.button(this.t('cancel'), () => this.close()), back, this.button(this.t('next'), () => this.advance(), { filled: true })]));
    else if (this.deployResult) out.push(this.actions([this.button(this.t('openManage'), () => void this.openManage(), { filled: true })]));
    else if (this.deployStatus) out.push(this.actions([this.button(this.t('cancelDeploy'), () => void this.api.hostingCancel?.())]));
    else out.push(this.actions([this.button(this.t('cancel'), () => this.close()), back, this.button(this.t('deploy'), () => void this.deploy(), { filled: true, id: 'hosting-deploy' })]));
    return out;
  }
  advance() {
    const problem = settingsFromDraft(this.draft, this.step);
    if (problem) { this.error = { key: 'err_INVALID_SETTINGS', values: { detail: problem } }; this.render(); return; }
    this.error = null; this.step++; this.render();
  }
  renderDeploy() {
    const status = this.deployStatus, result = this.deployResult;
    const out = [element('h3', { text: this.t(result ? 'deployedTitle' : status ? 'deployingTitle' : 'deployTitle') })];
    const phases = status?.phases ?? result?.phases ?? {};
    out.push(element('ul', { class: 'phases' }, ['check', 'files', 'pull', 'start', 'health', 'address'].map(id => {
      const state = phases[id] || (result ? 'done' : this.lastFailedPhases?.[id] || 'waiting');
      return element('li', {}, [element('span', { class: 'dot', 'data-state': state, 'aria-hidden': 'true' }), element('span', { text: this.t('phase_' + id) }), element('span', { class: 'muted', text: this.t('state_' + state) })]);
    })));
    if (result) {
      const instance = result.instance, publicUrl = instance.publicUrl || instance.quickUrl;
      out.push(element('div', { class: 'ok', role: 'status' }, [
        element('b', { text: this.t('runningAt', { time: formatClock(result.health.checkedAt, this.language) }) }),
        ...(instance.lanUrl ? [element('span', { class: 'mono', text: this.t('lanLink', { url: instance.lanUrl + '/' }) })] : []),
        element('span', { class: 'mono', text: this.t('publicLink', { url: publicUrl ? publicUrl + '/' : this.t('noPublic') }) })]));
      if (publicUrl && result.publicReachable === false) out.push(element('p', { class: 'note', text: this.t('publicUnreached') }));
      if (result.usedLocalImage) out.push(element('p', { class: 'note', text: this.t('usedLocalImage', { image: result.instance.image }) }));
    }
    return out;
  }
  async deploy() {
    const problem = settingsFromDraft(this.draft, 3);
    if (problem) { this.error = { key: 'err_INVALID_SETTINGS', values: { detail: problem } }; this.render(); return; }
    this.error = null; this.busy = true; this.lastFailedPhases = null; this.deployStatus = { phases: {} }; this.render();
    const poll = async () => { try { const status = await this.api.hostingStatus(); if (status.state === 'deploying' && this.deployStatus) { this.deployStatus = status; this.render(); } } catch { /* next tick */ } if (this.deployStatus) this.pollTimer = setTimeout(poll, 700); };
    this.pollTimer = setTimeout(poll, 300);
    try {
      const result = await this.api.hostingDeploy(buildSettings(this.draft), this.tunnelToken || null);
      this.deployResult = { ...result, phases: Object.fromEntries(['check', 'files', 'pull', 'start', 'health', 'address'].map(id => [id, 'done'])) };
      this.tunnelToken = ''; this.instances = null; this.selected = result.instance.id;
    } catch (error) {
      const failedPhases = this.deployStatus?.phases ?? {};
      this.error = this.errorFrom(error); this.deployResult = null;
      this.lastFailedPhases = failedPhases;
    } finally { clearTimeout(this.pollTimer); this.pollTimer = null; this.deployStatus = null; this.busy = false; this.render(); }
  }

  /* -------------------------------------------------------------- manage */
  renderManage() {
    const out = [];
    if (this.instances === null) { out.push(element('p', { class: 'muted', text: this.t('checking') })); return out; }
    if (!this.instances.length) {
      out.push(element('p', { class: 'note', text: this.t('empty') }), ...this.messages(), this.actions([this.button(this.t('done'), () => this.close()), this.button(this.t('setup'), () => this.openSetup(), { filled: true, id: 'hosting-setup' })]));
      return out;
    }
    out.push(element('div', { class: 'row' }, [element('span', { class: 'grow' }), this.button(this.t('addInstance'), () => this.openSetup()), this.button(this.t('createLink'), () => void this.openLink({ instanceId: this.selected }), { filled: true, id: 'hosting-create-link' })]));
    out.push(element('div', { class: 'cards' }, this.instances.map(item => this.instanceCard(item))));
    out.push(...this.messages());
    if (this.logs) out.push(element('h3', { text: this.t('logsTitle', { name: this.logs.name }) }), element('pre', { tabindex: '0', text: this.logs.text || '' }), this.actions([this.button(this.t('hideLogs'), () => { this.logs = null; this.render(); })]));
    const current = this.instances.find(item => item.id === this.selected);
    if (current) out.push(...this.linksSection(current));
    out.push(this.actions([this.button(this.t('refresh'), () => void this.loadInstances()), this.button(this.t('done'), () => this.close(), { filled: true })]));
    return out;
  }
  instanceCard(item) {
    const health = this.health.get(item.id);
    const where = item.target === 'local' ? this.t('thisComputer') : `${item.ssh?.user}@${item.ssh?.host}`;
    const status = !health || health.checking ? this.t('checking') : health.healthy ? this.t('healthy') : this.t('unhealthy');
    const dot = element('span', { class: 'dot', 'data-state': !health || health.checking ? 'running' : health.healthy ? 'done' : 'failed', 'aria-hidden': 'true' });
    const lines = [element('h3', { text: `${item.name} · ${where}` }), element('div', { class: 'health' }, [dot, element('span', { text: status })])];
    if (health?.healthy) lines.push(element('span', { class: 'muted', text: this.t('checkedAt', { time: formatClock(health.checkedAt, this.language), version: health.version, uptime: formatUptime(health.uptimeSeconds) }) }));
    if (health?.healthy && health.cache) {
      lines.push(element('span', { class: 'muted', text: this.t('cacheUse', { used: formatBytes(health.cache.bytes), max: formatBytes(health.cache.maxBytes), files: health.cache.files }) }));
      const bar = element('div', { class: 'bar', 'aria-hidden': 'true' }, [element('div')]); bar.firstChild.style.width = Math.min(100, Math.round(100 * health.cache.bytes / Math.max(1, health.cache.maxBytes))) + '%'; lines.push(bar);
    }
    for (const url of [item.lanUrl, item.publicUrl || item.quickUrl].filter(Boolean)) lines.push(element('span', { class: 'mono', text: url + '/' }));
    const act = (key, name, opts) => this.button(this.t(key), () => void this.instanceAction(item, name), { disabled: this.busy, ...opts });
    lines.push(element('div', { class: 'row' }, [this.button(this.t('actionCheck'), () => void this.checkHealth(item.id), { disabled: health?.checking }), act('actionRestart', 'restart'), act('actionUpdate', 'update'), act('actionLogs', 'logs'),
      health && !health.checking && !health.healthy ? act('actionStart', 'start') : act('actionStop', 'stop'), act('actionRemove', 'remove', { danger: true })]));
    const card = element('section', { class: 'card', 'aria-label': item.name, ...(item.id === this.selected ? { 'aria-current': 'true' } : {}) }, lines);
    card.addEventListener('click', event => { if (event.target === card || event.target.localName === 'h3') { this.selected = item.id; this.links = null; this.render(); void this.loadLinks(); } });
    return card;
  }
  async instanceAction(item, name) {
    if (!await this.confirmInstanceAction(item, name)) return;
    this.busy = true; this.error = null; this.notice = null; this.render();
    try {
      const result = await this.api.hostingAction(item.id, name);
      if (name === 'logs') this.logs = { name: item.name, text: result.logs };
      else if (name === 'remove') { this.health.delete(item.id); this.selected = null; this.links = null; }
      else { const label = this.t('action' + name[0].toUpperCase() + name.slice(1)); this.notice = { key: result.healthy === true ? 'actionHealthyAfter' : result.healthy === false ? 'actionUnhealthyAfter' : 'actionDone', values: { action: label } }; }
    } catch (error) { this.error = this.errorFrom(error); }
    finally { this.busy = false; }
    if (name === 'remove') await this.loadInstances(); else { this.render(); if (name !== 'logs') void this.checkHealth(item.id); }
  }
  /** Remove, stop, restart and update interrupt or delete a running service, so each passes the two-key confirmation. */
  async confirmInstanceAction(item, name) {
    const options = { translate: this.translateText, getLanguage: () => this.language };
    if (name === 'remove') return confirmDestructiveAction(document.body, 'desktop.file-hosting-remove', { ...options, affected: this.t('removeConfirm', { name: item.name }) });
    if (name === 'stop') return confirmDestructiveAction(document.body, 'desktop.file-hosting-stop', { ...options, affected: this.t('stopConfirm', { name: item.name }) });
    if (name === 'restart' || name === 'update') return confirmDestructiveAction(document.body, 'desktop.file-hosting-restart', { ...options, affected: this.t('restartConfirm', { name: item.name }) });
    return true;
  }
  linksSection(instance) {
    const out = [element('h3', { text: this.t('linksTitle') })];
    if (this.links === null) { out.push(element('p', { class: 'muted', text: this.t('checking') })); return out; }
    if (!this.links.length) { out.push(element('p', { class: 'muted', text: this.t('noLinks') })); return out; }
    const head = element('tr', {}, ['colFile', 'colExpires', 'colDownloads', 'colState'].map(key => element('th', { text: this.t(key) })).concat(element('th', { text: '' })));
    const rows = this.links.map(link => {
      const stateKey = linkStateKey(link);
      const downloads = link.downloads === null ? '—' : link.maxDownloads === null ? this.t('downloadsNoLimit', { n: link.downloads }) : this.t('downloadsOf', { n: link.downloads, max: link.maxDownloads });
      const badges = [element('span', { class: 'badge', 'data-state': link.state, text: this.t(stateKey) })];
      if (link.hubRemoved) badges.push(element('span', { class: 'badge', text: this.t('hubRemoved') }));
      if (link.hubError) badges.push(element('span', { class: 'badge', text: this.t('hubError', { message: link.hubError }) }));
      const actions = link.state === 'active'
        ? [this.button(this.t('copy'), () => void this.copyLink(instance, link)), this.button(this.t('qr'), () => void this.showQr(instance, link)), this.button(this.t('endNow'), () => void this.endLink(instance, link), { danger: true })]
        : [this.button(this.t('forget'), () => void this.forgetLink(instance, link))];
      return element('tr', {}, [element('td', {}, [element('b', { text: link.name })]), element('td', { text: formatClock(link.expiresAt, this.language) }), element('td', { text: downloads }),
        element('td', {}, [element('div', { class: 'row' }, badges)]), element('td', { class: 'actions-cell' }, [element('div', { class: 'row' }, actions)])]);
    });
    out.push(element('div', { class: 'table' }, [element('table', {}, [element('thead', {}, [head]), element('tbody', {}, rows)])]));
    return out;
  }
  async copyLink(instance, link) { try { const { url } = await this.api.hostingLinkUrl(instance.id, link.linkId); await this.copy(url); } catch (error) { this.error = this.errorFrom(error); this.render(); } }
  async showQr(instance, link) {
    try { const { url } = await this.api.hostingLinkUrl(instance.id, link.linkId); this.mode = 'link'; this.link.result = { url, expiresAt: link.expiresAt, maxDownloads: link.maxDownloads, fromList: true, name: link.name }; this.render(); }
    catch (error) { this.error = this.errorFrom(error); this.render(); }
  }
  async endLink(instance, link) {
    if (!await confirmDestructiveAction(document.body, 'desktop.file-hosting-end-link', { translate: this.translateText, getLanguage: () => this.language, affected: this.t('endConfirm', { name: link.name }) })) return;
    try { await this.api.hostingEndLink(instance.id, link.linkId); } catch (error) { this.error = this.errorFrom(error); }
    await this.loadLinks();
  }
  async forgetLink(instance, link) { try { await this.api.hostingForgetLink(instance.id, link.linkId); } catch (error) { this.error = this.errorFrom(error); } await this.loadLinks(); }

  /* -------------------------------------------------------------- create link */
  renderLink() {
    const l = this.link, result = l.result;
    const form = [];
    if (result?.fromList) form.push(element('p', { class: 'note', text: result.name }));
    else {
      if (!this.instances?.length) form.push(element('p', { class: 'note', text: this.t('empty') }), this.button(this.t('setup'), () => this.openSetup(), { filled: true }));
      else {
        const instanceSelect = element('select', { id: 'hosting-link-instance', label: this.t('instance') }, this.instances.map(item => element('option', { value: item.id, text: item.name, selected: item.id === l.instanceId })));
        instanceSelect.addEventListener('change', () => { l.instanceId = instanceSelect.value; });
        form.push(instanceSelect);
      }
      if (l.shares === null) form.push(element('p', { class: 'muted', text: this.t('checking') }));
      else if (!l.shares.length) form.push(element('p', { class: 'note', text: this.t('noShares') }));
      else {
        const shareSelect = element('select', { id: 'hosting-link-share', label: this.t('share') }, l.shares.map(entry => element('option', { value: entry.id, text: `${entry.name} · ${formatBytes(entry.size)}`, selected: entry.id === l.shareId })));
        shareSelect.addEventListener('change', () => { l.shareId = shareSelect.value; this.render(); });
        form.push(shareSelect);
        if (l.shares.find(entry => entry.id === l.shareId)?.passphrase) form.push(element('p', { class: 'note', text: this.t('passphraseNote') }));
      }
      form.push(element('h3', { text: this.t('expires') }), this.chips(this.t('expires'), EXPIRY_CHOICES, l.expiry, id => { l.expiry = id; this.render(); }));
      if (l.expiry === 'custom') form.push(this.field('hosting-link-expiry', this.t('expiresAt'), l.customExpiry, value => { l.customExpiry = value; }, { type: 'datetime-local' }));
      form.push(element('h3', { text: this.t('deleteAfter') }), this.chips(this.t('deleteAfter'), LIMIT_CHOICES, l.limit, id => { l.limit = id; this.render(); }));
      if (l.limit === 'custom') form.push(this.field('hosting-link-limit', this.t('limitCount'), l.customLimit, value => { l.customLimit = value; }, { type: 'number', min: '1', max: '100000' }));
      form.push(this.check('hosting-link-hub', this.t('removeFromHub'), l.removeFromHub, value => { l.removeFromHub = value; }),
        this.check('hosting-link-prefetch', this.t('prefetch'), l.prefetch, value => { l.prefetch = value; }),
        element('p', { class: 'note', text: this.t('keyNote') }));
    }
    const panel = element('aside', { class: 'qr-panel', 'aria-label': this.t('qrLabel') });
    if (result) {
      try { panel.append(linkQrSvg(result.url, document, this.t('qrLabel'))); } catch { /* an over-long link has no QR; the link itself still works */ }
      panel.append(element('p', { class: 'muted', text: this.t('qrHint') }), element('p', { class: 'mono', id: 'hosting-link-url', text: result.url }),
        element('div', { class: 'row' }, [this.button(this.t('copyLink'), () => void this.copy(result.url), { filled: true, id: 'hosting-copy-link' }), this.button(this.t('saveQr'), () => this.saveQr(result))]),
        element('p', { class: 'muted', text: this.t('linkSummary', { when: formatClock(result.expiresAt, this.language), limit: result.maxDownloads ? this.t('limitSummary', { n: result.maxDownloads }) : this.t('limitSummaryNone') }) }));
    } else panel.append(element('p', { class: 'muted', text: this.t('qrPlaceholder') }));
    const out = [element('div', { class: 'link-layout' }, [element('div', { class: 'stack' }, form), panel]), ...this.messages()];
    const back = this.button(this.t('back'), () => void this.openManage());
    if (result) out.push(this.actions([back, this.button(this.t('done'), () => this.close(), { filled: true })]));
    else out.push(this.actions([back, this.button(this.t('createLink'), () => void this.createLink(), { filled: true, id: 'hosting-link-create', disabled: this.busy || !l.shareId || !l.instanceId })]));
    return out;
  }
  async createLink() {
    const l = this.link;
    const expiresAt = expiryFrom(l.expiry, l.customExpiry);
    if (!expiresAt) { this.error = { key: 'err_INVALID_SETTINGS', values: { detail: this.t('expiresAt') } }; this.render(); return; }
    const maxDownloads = l.limit === 'none' ? null : l.limit === 'custom' ? Number(l.customLimit) : Number(l.limit);
    if (maxDownloads !== null && (!Number.isSafeInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > 100000)) { this.error = { key: 'err_INVALID_SETTINGS', values: { detail: this.t('limitCount') } }; this.render(); return; }
    this.busy = true; this.error = null; this.notice = null; this.render();
    try { l.result = await this.api.hostingCreateLink({ instanceId: l.instanceId, shareId: l.shareId, expiresAt, maxDownloads, removeFromHub: l.removeFromHub, prefetch: l.prefetch }); this.selected = l.instanceId; this.links = null; }
    catch (error) { this.error = this.errorFrom(error); }
    finally { this.busy = false; this.render(); }
  }
  saveQr(result) {
    try {
      const anchor = document.createElement('a'); anchor.href = linkQrPng(result.url); anchor.download = 'download-link-qr.png';
      this.shadowRoot.append(anchor); anchor.click(); anchor.remove();
    } catch { this.error = { key: 'err_FAILED' }; this.render(); }
  }
  destroy() { this.disposed = true; clearTimeout(this.pollTimer); }
}

/** A Material filter chip used as a toggle. */
function chipNode(label, on, props = {}) {
  const node = element('md-filter-chip', { label, ...props }); node.selected = Boolean(on); return node;
}
function buildSettings(draft) {
  return { name: String(draft.name).trim(), target: draft.target, port: Number(draft.port), cacheGb: Number(draft.cacheGb), tunnel: draft.tunnel,
    ...(draft.tunnel === 'named' ? { publicUrl: String(draft.publicUrl).trim() } : {}),
    ...(draft.target === 'ssh' ? { ssh: { host: String(draft.ssh.host).trim(), user: String(draft.ssh.user).trim(), port: Number(draft.ssh.port) || 22, keyPath: String(draft.ssh.keyPath || '').trim() || null } } : {}) };
}
register('mfe-file-hosting-dialog', FileHostingDialog);
