import {control,prepareControl} from './controls.js';
import {IMAGE_TRANSFORM_SURFACE} from '../../renderer/features/personalization/image-geometry.js';
import { localized } from './localization.js';

export const surfaceRegistry = Object.freeze([
  { tag: 'mfe-startup-surprise', role: 'region', module: '../../renderer/features/shell/startup-surprise.js', primitives: ['md-text-button'] },
  { tag: 'mfe-navigation-rail', role: 'navigation', module: '../../renderer/features/shell/navigation.js', primitives: ['md-text-button','md-filled-tonal-button'] },
  { tag: 'mfe-top-bar', role: 'banner', module: '../../renderer/features/shell/navigation.js', primitives: ['md-icon-button','md-outlined-button'] },
  { tag: 'mfe-date-field', role: 'group', module: 'controls.js', primitives: ['md-outlined-text-field','md-outlined-button'], nativeInternals: ['input[type=date]','input[type=time]','input[type=datetime-local]'] },
  { tag: 'mfe-file-picker', role: 'group', module: 'controls.js', primitives: ['md-outlined-text-field','md-outlined-button'], nativeInternals: ['input[type=file]'] },
  { tag: 'mfe-dialog', role: 'dialog', module: 'controls.js', primitives: ['md-dialog'] },
  { tag: 'mfe-transition-properties', role: 'region', module: '../../renderer/features/personalization/transition-property-inspector.js', primitives: ['md-outlined-text-field','md-text-button'] },
  IMAGE_TRANSFORM_SURFACE,
  { tag: 'mfe-motion-keyframes', role: 'region', module: '../../renderer/features/personalization/motion-keyframe-inspector.js', primitives: ['md-outlined-text-field','md-text-button','md-checkbox'] },
  { tag: 'mfe-color-picker', role: 'region', module: '../../renderer/features/personalization/color-picker.js', primitives: ['md-outlined-text-field','md-text-button','md-slider'] },
  { tag: 'mfe-server-preparation', role: 'region', module: '../../renderer/features/server-manager/index.js', primitives: ['md-outlined-button','mfe-search','mfe-control-guidance'] },
  { tag: 'mfe-typography-inspector', role: 'region', module: '../../renderer/features/personalization/typography-inspector.js', primitives: ['md-outlined-text-field','md-text-button'] },
  { tag: 'mfe-control-guidance', role: 'region', module: 'control-guidance.js', primitives: ['md-text-button','md-filled-button'] },
  { tag: 'mfe-workspace-shell', role: 'region', module: 'workspace-shell.js', primitives: ['md-tabs','md-primary-tab','md-outlined-button'] },
  { tag: 'mfe-search', role: 'search', module: 'search.js', primitives: ['md-outlined-text-field','md-outlined-button','md-switch'] },
  { tag: 'mfe-command-palette', role: 'dialog', module: 'command-palette.js', primitives: ['md-dialog','md-text-button','md-switch','md-slider','md-outlined-text-field'] },
  { tag: 'mfe-context-menu', role: 'menu', module: 'context-menu.js', primitives: ['md-menu','md-menu-item','mfe-search'] },
  { tag: 'mfe-notification-center', role: 'region', module: 'notification-center.js', primitives: ['md-outlined-button','md-text-button','md-switch'] },
  { tag: 'mfe-build-provenance', role: 'status', module: 'provenance.js', primitives: [] }
  ,{ tag: 'mfe-group-manager', role: 'dialog', module: 'group-manager.js', primitives: ['md-dialog','md-outlined-text-field','md-switch'] }
]);

export function register(tag, constructor) {
  if (globalThis.customElements && !customElements.get(tag)) customElements.define(tag, constructor);
}

export { localized };

export const text = (en, yue) => ({ en, yue });

export function element(tag, props = {}, children = []) {
  if (['button','input','textarea','select','option','dialog'].includes(tag)) return control(tag,props,children);
  const node = prepareControl(document.createElement(tag));
  if (/^md-.*button$/.test(tag) && !Object.hasOwn(props,'type')) node.type='button';
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

export class SurfaceElement extends (globalThis.HTMLElement||class{}) {
  constructor() { super(); this.attachShadow({mode:'open'}); this.language = 'en'; }
  t(en, yue) { return localized(text(en,yue),this.language); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type,{ detail,bubbles:true,composed:true })); }
  style(css = '') {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host{display:block;color:var(--md-sys-color-on-surface,#202124);font:400 14px/1.5 var(--mfe-font,system-ui,sans-serif);min-width:0}
      :host([hidden]){display:none!important}
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
