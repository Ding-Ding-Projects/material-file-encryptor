import {SurfaceElement, element, register} from './registry.js';

const receipts = new WeakMap();
const classes = node => (node.getAttribute('class') || node.className || '').split(/\s+/);
const direct = (node, tag) => [...node.children].filter(child => child.localName === tag);
const named = node => Boolean(node?.getAttribute('aria-label')?.trim() || node?.getAttribute('aria-labelledby')?.trim());
const tableName = table => table?.getAttribute('aria-label')?.trim() || table?.querySelector('caption')?.textContent?.trim() || '';
function fixedParts(node) {
  if(node.localName==='mfe-titlebar') {
    const brand=[...node.children].find(child=>classes(child).includes('window-brand'));
    const actions=[...node.children].find(child=>classes(child).includes('window-controls'));
    return [brand,actions,...['minimize','maximize','close'].map(action=>[...(actions?.children||[])].find(child=>child.getAttribute('data-window')===action))];
  }
  if(node.localName==='mfe-data-table') {
    const table=direct(node,'table')[0];return [table,table&&direct(table,'thead')[0],table&&direct(table,'tbody')[0]];
  }
  if(node.localName==='mfe-main-workspace')return [direct(node,'mfe-top-bar')[0],direct(node,'mfe-workspace-shell')[0]];
  if(node.localName==='mfe-selection-toolbar')return [direct(node,'span')[0],[...node.children].find(child=>classes(child).includes('file-actions'))];
  return [];
}
const definitions = {
  'mfe-titlebar': {role:'banner', part:'chrome', css:`:host{position:relative;flex:0 0 42px;height:42px;z-index:30;background:var(--frame);user-select:none;-webkit-app-region:drag} .chrome{height:100%;display:flex;align-items:center;justify-content:space-between;min-width:0}slot{display:contents}::slotted(.window-brand){display:flex;align-items:center;gap:9px;padding-left:18px;font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}::slotted(.window-controls){display:flex;height:100%;flex:none;-webkit-app-region:no-drag}@media(max-width:839px){::slotted(.window-brand){padding-left:12px}}`},
  'mfe-main-workspace': {role:'main', part:'frame', css:`:host{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;overflow:hidden;border:1px solid var(--line);border-radius:24px;background:var(--surface)}.frame{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;flex:1;overflow:hidden}slot{display:contents}::slotted(mfe-top-bar),::slotted(mfe-workspace-shell){flex:none}::slotted(mfe-workspace-shell){min-width:0;width:100%;margin:0;padding-inline:10px;border-bottom:1px solid var(--line);min-height:56px}::slotted(mfe-content-panel){flex:1;min-height:0}::slotted(mfe-live-notification){position:absolute;width:1px;height:1px;padding:0;margin:-1px;border:0;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap}@media(max-width:839px){:host{border-radius:20px}}`},
  'mfe-content-panel': {role:'region', part:'content', css:`:host{display:flex;flex-direction:column;min-width:0;min-height:0;max-width:100%;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:24px clamp(16px,2.5vw,36px);animation:none}.content{min-width:0;max-width:100%;flex:none}slot{display:contents}@media(max-width:1100px){:host{padding:20px}}@media(max-width:839px){:host{padding:16px}}`},
  'mfe-data-table': {role:'group', part:'scroll', css:`:host{display:block;min-width:0;max-width:100%;border:1px solid var(--line);border-radius:0 0 16px 16px;overflow:hidden;background:var(--surface)}.scroll{min-width:0;min-height:180px;max-height:clamp(180px,45dvh,620px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}slot{display:contents}::slotted(table){min-width:560px}@media(max-width:839px){.scroll{max-height:45dvh}}`},
  'mfe-selection-toolbar': {role:'toolbar', part:'actions', css:`:host{display:block;min-width:0;padding:8px;background:var(--container);border:1px solid var(--line);border-radius:16px 16px 0 0}.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;min-width:0}slot{display:contents}::slotted(span){white-space:normal;overflow:visible;max-width:100%}::slotted(.file-actions){display:flex;gap:8px;flex-wrap:wrap;min-width:0}`}
};

/** Shared rendered compositions. Semantic records remain in light DOM. */
export class SurfaceComposition extends SurfaceElement {
  constructor() {
    super();
    const spec = definitions[this.localName];
    this.style(spec.css);
    const part = element('div', {class:spec.part, part:spec.part});
    const slot = element('slot'); part.append(slot); this.shadowRoot.append(part);
    const sheet = this.shadowRoot.adoptedStyleSheets[0];
    receipts.set(this, {part,slot,sheet,css:[...sheet.cssRules].map(rule=>rule.cssText).join('\n'),connected:false});
    this.refreshComposition = () => this.syncSemantics();
  }
  connectedCallback() {
    const receipt = receipts.get(this); receipt.connected = true;
    this.setAttribute('role', definitions[this.localName].role);
    receipt.slot.addEventListener('slotchange', this.refreshComposition);
    // Text changes from localization do not rebuild slots or move focused nodes.
    if (globalThis.MutationObserver) {
      this.compositionObserver = new MutationObserver(this.refreshComposition);
      this.compositionObserver.observe(this, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
    }
    this.syncSemantics();
  }
  disconnectedCallback() {
    const receipt = receipts.get(this); receipt.connected = false;
    receipt.slot.removeEventListener('slotchange', this.refreshComposition);
    this.compositionObserver?.disconnect(); this.compositionObserver = null;
  }
  syncSemantics() {
    const receipt = receipts.get(this);
    const parts=fixedParts(this);
    if(!receipt.fixed && parts.every(Boolean))receipt.fixed=parts;
    if (this.localName === 'mfe-data-table') {
      const name = tableName(direct(this,'table')[0]);
      receipt.part.tabIndex = 0;
      receipt.part.setAttribute('role','region');
      if (receipt.part.getAttribute('aria-label') !== name) receipt.part.setAttribute('aria-label',name);
    }
    if (this.localName === 'mfe-content-panel' && !this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      const heading = this.querySelector('h1');
      if (heading && this.id) {
        if (!heading.id) heading.id = this.id + '-composition-heading';
        this.setAttribute('aria-labelledby',heading.id);
      }
    }
  }
  static inspect(node) {
    const issues = [], spec = definitions[node.localName], receipt = receipts.get(node);
    if (!spec || !receipt || node.constructor !== customElements.get(node.localName) || !(node instanceof this)) return ['unowned-host'];
    if (!node.isConnected || !receipt.connected) issues.push('disconnected');
    if (node.getAttribute('role') !== spec.role) issues.push('role');
    if (receipt.part.parentNode !== node.shadowRoot || receipt.slot.parentNode !== receipt.part || receipt.part.getAttribute('part') !== spec.part || node.shadowRoot.children.length !== 1 || receipt.part.children.length !== 1) issues.push('rendered-anatomy');
    const parts=fixedParts(node);
    if(!receipt.fixed || parts.length!==receipt.fixed.length || parts.some((part,index)=>part!==receipt.fixed[index]))issues.push('replaced-parts');
    const sheets = node.shadowRoot.adoptedStyleSheets;
    if (sheets.length !== 1 || sheets[0] !== receipt.sheet || [...receipt.sheet.cssRules].map(rule=>rule.cssText).join('\n') !== receipt.css) issues.push('owned-style');
    if (node.localName === 'mfe-titlebar') {
      const brand = [...node.children].find(child=>classes(child).includes('window-brand'));
      const actions = [...node.children].find(child=>classes(child).includes('window-controls'));
      if (!brand?.textContent?.trim() || !actions) issues.push('titlebar-parts');
      for (const action of ['minimize','maximize','close']) {
        const controls = [...(actions?.children || [])].filter(child=>child.getAttribute('data-window')===action);
        if (controls.length !== 1 || controls[0].localName !== 'md-icon-button' || !named(controls[0])) issues.push('window-action:'+action);
      }
    }
    if (node.localName === 'mfe-main-workspace' && (!direct(node,'mfe-top-bar').length || !direct(node,'mfe-workspace-shell').length || !direct(node,'mfe-content-panel').length)) issues.push('workspace-parts');
    if (node.localName === 'mfe-content-panel') {
      if (!named(node)) issues.push('panel-name');
      if (!node.children.length) issues.push('panel-content');
    }
    if (node.localName === 'mfe-data-table') {
      const tables = direct(node,'table'), table = tables[0];
      if (tables.length !== 1 || !direct(table || {children:[]},'thead').length || !direct(table || {children:[]},'tbody').length || !tableName(table)) issues.push('table-anatomy');
      const head = table && direct(table,'thead')[0], body = table && direct(table,'tbody')[0];
      if (head && (!direct(head,'tr').length || direct(head,'tr').some(row=>!direct(row,'th').length))) issues.push('table-headers');
      if (body && [...body.children].some(row=>row.localName!=='tr' || ![...row.children].length || [...row.children].some(cell=>!['th','td'].includes(cell.localName)))) issues.push('table-records');
      if (receipt.part.tabIndex !== 0 || receipt.part.getAttribute('aria-label') !== tableName(table)) issues.push('scroll-access');
    }
    if (node.localName === 'mfe-selection-toolbar') {
      const actions = [...node.children].find(child=>classes(child).includes('file-actions'));
      if (!named(node) || !direct(node,'span').length || !actions?.children.length || [...actions.children].some(child=>!/^md-(?:text|filled|filled-tonal|outlined)-button$/.test(child.localName))) issues.push('selection-anatomy');
    }
    return issues;
  }
}
for (const tag of Object.keys(definitions)) register(tag, class extends SurfaceComposition {});
export const compositionDefinitions = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([tag,{role,part}])=>[tag,Object.freeze({role,part})])));
