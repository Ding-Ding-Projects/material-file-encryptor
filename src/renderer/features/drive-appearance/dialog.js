import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';

// Pairs are [English, Cantonese].
export const APPEARANCE_COPY = {
  title: ['{name}: icon and banner', '{name}：圖示同橫額'], close: ['Close', '關閉'], done: ['Done', '完成'],
  publicTitle: ['These images are public.', '呢啲圖片係公開嘅。'],
  publicBody: ['They are uploaded unencrypted with this drive\'s backups to your public Docker Hub repository, so the drive can show them before it is unlocked. Anyone can see them. Don\'t use photos of people or anything private. Your files stay encrypted.', '佢哋會連同呢個磁碟嘅備份，以未加密方式上載到你公開嘅 Docker Hub 儲存庫，等磁碟未解鎖都可以顯示。任何人都睇到。唔好用人像相或者私人嘢。你嘅檔案仍然係加密嘅。'],
  acknowledge: ['I understand the icon and banner are public', '我明白圖示同橫額係公開嘅'],
  icon: ['Icon', '圖示'], iconHelp: ['Square PNG, JPEG or WebP, up to 512 KB. Shown beside the drive name.', '正方形 PNG、JPEG 或 WebP，最大 512 KB。喺磁碟名旁邊顯示。'],
  banner: ['Banner', '橫額'], bannerHelp: ['Wide image, 3:1 works best, up to 1 MB. Shown behind the drive in lists.', '闊圖，3:1 最好，最大 1 MB。喺清單入面做磁碟背景。'],
  chooseIcon: ['Choose icon…', '揀圖示…'], chooseBanner: ['Choose banner…', '揀橫額…'], remove: ['Remove', '移除'],
  saved: ['Saved. The next backup publishes it.', '已儲存。下次備份會公開佢。'], removed: ['Removed. The next backup stops showing it.', '已移除。下次備份之後唔會再顯示。'],
  failed: ['That image could not be used.', '用唔到呢張圖。']
};
const fill = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

const STYLE = `
dialog{--md-dialog-container-shape:24px}
.frame{display:grid;gap:16px;width:min(880px,94vw);max-height:84vh;overflow:auto;padding:0 6px 6px 0}
h2,p{margin:0;overflow-wrap:anywhere}
.hero{position:relative;height:160px;border-radius:20px;background:var(--md-sys-color-surface-container-high,#2a2b33) center/cover no-repeat;margin-bottom:36px}
.hero .icon{position:absolute;left:24px;bottom:-36px;width:88px;height:88px;border-radius:22px;border:4px solid var(--md-sys-color-surface,#1e1f26);background:var(--md-sys-color-primary-container,#2d3768) center/cover no-repeat;display:grid;place-items:center;font-size:36px;font-weight:700}
.hero md-icon-button{position:absolute;right:12px;top:12px;width:48px;height:48px;background:rgba(0,0,0,.35);border-radius:24px;color:#fff}
.warn{display:flex;gap:12px;padding:14px 16px;border-radius:14px;background:var(--md-sys-color-error-container,#5c1a15);color:var(--md-sys-color-on-error-container,#ffdad6);line-height:1.5}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.card{padding:16px;border-radius:16px;background:var(--md-sys-color-surface-container,#2a2b33);display:grid;gap:10px;align-content:start}
.row{display:flex;gap:8px;flex-wrap:wrap}
.ok{padding:12px 14px;border-radius:12px;background:var(--md-sys-color-tertiary-container,#0f4a3b);color:var(--md-sys-color-on-tertiary-container,#b6f0dc)}
.error{color:var(--md-sys-color-error,#ffb4ab);font-weight:600}
label.check{display:flex;align-items:center;gap:12px;min-height:48px;font-weight:600}
.actions{display:flex;justify-content:flex-end;gap:8px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

export class DriveAppearanceDialog extends SurfaceElement {
  constructor() {
    super(); this.api = {}; this.translateText = value => value; this.language = 'en'; this.onChanged = () => {};
    this.sessionId = null; this.name = ''; this.images = {}; this.acknowledged = false; this.notice = null; this.error = null; this.busy = false;
    this.style(STYLE);
    this.dialog = element('dialog', { 'aria-labelledby': 'appearance-title' });
    this.shadowRoot.append(this.dialog);
  }
  configure({ api = {}, translate = value => value, language = 'en', onChanged = () => {} } = {}) { this.api = api; this.translateText = translate; this.language = language; this.onChanged = onChanged; return this; }
  setLanguage(language) { this.language = language; if (this.dialog.open) this.render(); }
  t(key, values) { const [en, yue] = APPEARANCE_COPY[key] || [key, key], translated = this.translateText(en); return fill(translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language), values); }
  open({ sessionId, name, images }) { Object.assign(this, { sessionId, name, images: images || {}, acknowledged: false, notice: null, error: null, busy: false }); this.render(); if (!this.dialog.open) this.dialog.showModal?.(); }
  button(text, onClick, { filled = false, disabled = false } = {}) { const node = element(filled ? 'md-filled-button' : 'md-outlined-button', { text }); node.disabled = disabled; node.addEventListener('click', () => { if (!node.disabled) onClick(); }); return node; }
  async change(kind, remove) {
    this.busy = true; this.error = null; this.notice = null; this.render();
    try {
      const result = remove ? await this.api.driveAppearanceRemove(this.sessionId, kind) : await this.api.driveAppearanceChoose(this.sessionId, kind);
      if (!result?.cancelled) { this.images = { icon: result?.icon ?? null, banner: result?.banner ?? null }; this.notice = remove ? 'removed' : 'saved'; this.onChanged(); }
    } catch (error) { this.error = error?.message || this.t('failed'); }
    finally { this.busy = false; this.render(); }
  }
  render() {
    const hero = element('div', { class: 'hero' }), icon = element('div', { class: 'icon', 'aria-hidden': 'true', text: this.images.icon ? '' : (this.name || '?').slice(0, 1).toUpperCase() });
    if (this.images.banner) hero.style.backgroundImage = `url("${this.images.banner}")`;
    if (this.images.icon) icon.style.backgroundImage = `url("${this.images.icon}")`;
    const close = element('md-icon-button', { 'aria-label': this.t('close'), text: '×' }); close.addEventListener('click', () => this.dialog.close?.());
    hero.append(icon, close);
    const warn = element('div', { class: 'warn', role: 'note' }, [element('div', {}, [element('b', { text: this.t('publicTitle') + ' ' }), element('span', { text: this.t('publicBody') })])]);
    const box = element('input', { type: 'checkbox', id: 'appearance-ack', 'aria-label': this.t('acknowledge') }); box.checked = this.acknowledged;
    box.addEventListener('change', () => { this.acknowledged = Boolean(box.checked); this.render(); });
    const locked = !this.acknowledged || this.busy;
    const card = (kind, help, choose) => element('div', { class: 'card' }, [element('b', { text: this.t(kind) }), element('span', { text: this.t(help) }),
      element('div', { class: 'row' }, [this.button(this.t(choose), () => void this.change(kind, false), { disabled: locked }), this.button(this.t('remove'), () => void this.change(kind, true), { disabled: this.busy || !this.images[kind] })])]);
    const out = [hero, element('h2', { id: 'appearance-title', text: this.t('title', { name: this.name }) }), warn,
      element('label', { class: 'check' }, [box, element('span', { text: this.t('acknowledge') })]),
      element('div', { class: 'cards' }, [card('icon', 'iconHelp', 'chooseIcon'), card('banner', 'bannerHelp', 'chooseBanner')])];
    if (this.notice) out.push(element('p', { class: 'ok', role: 'status', text: this.t(this.notice) }));
    if (this.error) out.push(element('p', { class: 'error', role: 'alert', text: this.error }));
    out.push(element('div', { class: 'actions' }, [this.button(this.t('done'), () => this.dialog.close?.(), { filled: true })]));
    this.dialog.replaceChildren(element('div', { class: 'frame' }, out));
  }
  destroy() { this.dialog.close?.(); }
}
register('mfe-drive-appearance-dialog', DriveAppearanceDialog);
