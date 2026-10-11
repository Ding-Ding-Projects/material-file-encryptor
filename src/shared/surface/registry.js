import { localized } from './localization.js';

export const surfaceRegistry = Object.freeze([
  { tag: 'mfe-workspace-shell', role: 'region', module: 'workspace-shell.js', primitives: ['md-tabs','md-primary-tab','md-outlined-button'] },
  { tag: 'mfe-search', role: 'search', module: 'search.js', primitives: ['md-outlined-text-field','md-outlined-button','md-switch'] },
  { tag: 'mfe-command-palette', role: 'dialog', module: 'command-palette.js', primitives: ['md-dialog','md-text-button','md-switch','md-slider','md-outlined-text-field'] },
  { tag: 'mfe-context-menu', role: 'menu', module: 'context-menu.js', primitives: ['md-text-button'] },
  { tag: 'mfe-notification-center', role: 'region', module: 'notification-center.js', primitives: ['md-outlined-button','md-text-button','md-switch'] },
  { tag: 'mfe-build-provenance', role: 'status', module: 'provenance.js', primitives: [] }
  ,{ tag: 'mfe-group-manager', role: 'dialog', module: 'group-manager.js', primitives: ['md-dialog','md-outlined-text-field','md-switch'] }
]);

export function register(tag, constructor) {
  if (!customElements.get(tag)) customElements.define(tag, constructor);
}

export { localized };

export const text = (en, yue) => ({ en, yue });

export function element(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

export class SurfaceElement extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); this.language = 'en'; }
  t(en, yue) { return localized(text(en,yue),this.language); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type,{ detail,bubbles:true,composed:true })); }
  style(css = '') {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host{display:block;color:var(--md-sys-color-on-surface,#202124);font:400 14px/1.5 var(--mfe-font,system-ui,sans-serif);min-width:0}
      *{box-sizing:border-box} [hidden]{display:none!important} :focus-visible{outline:3px solid var(--md-sys-color-primary,#5466a8);outline-offset:3px}
      md-outlined-button,md-filled-button,md-text-button{min-height:40px;max-width:100%;--md-sys-typescale-label-large-font:var(--mfe-font,system-ui)}
      md-outlined-text-field{width:100%;min-width:0} .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.grow{flex:1;min-width:120px}
      .muted{color:var(--md-sys-color-on-surface-variant,#555)} .status{min-height:1.5em} .stack{display:grid;gap:12px}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
      ${css}`);
    this.shadowRoot.replaceChildren();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }
}
