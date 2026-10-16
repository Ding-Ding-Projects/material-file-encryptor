/**
 * Minimal DOM fixture for the information icon tests. It supports exactly what
 * mountControlGuidance needs: custom elements, shadow roots, sibling
 * insertion and event dispatch. Targets are found by a data-sel marker so a
 * test can place any selector from an inventory onto a fixture node.
 */
export function infoIconDom() {
  const definitions = new Map();
  let doc;
  class Node extends EventTarget {
    constructor(tag = '') {
      super();
      this.tagName = tag; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.readOnly = false;
      this.textContent = ''; this.attributes = {}; this.ownerDocument = doc;
    }
    get isConnected() { return !!this.parentNode?.isConnected || this.root === true; }
    get previousElementSibling() { const siblings = this.parentNode?.children || []; return siblings[siblings.indexOf(this) - 1] || null; }
    append(...nodes) { for (const node of nodes) { if (typeof node === 'string') { this.textContent += node; continue; } node.remove(); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this.append(...nodes); }
    attachShadow() { this.shadowRoot = new Node('shadow'); this.shadowRoot.root = true; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    after(node) { const parent = this.parentNode; if (!parent) return; node.remove(); node.parentNode = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, node); }
    before(node) { const parent = this.parentNode; node.remove(); node.parentNode = parent; parent.children.splice(parent.children.indexOf(this), 0, node); }
    remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
    focus() { doc.activeElement = this; }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
    querySelector(selector) {
      const bySel = node => node.dataset?.sel === selector || node.tagName === selector;
      for (const child of this.children) { if (bySel(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
      return null;
    }
    checkValidity() { return this.valid !== false; }
  }
  Object.defineProperty(Node.prototype, 'style', {configurable: true, get() { return this._style ||= {}; }});
  doc = {
    createElement(tag) { const C = definitions.get(tag), node = C ? new C() : new Node(tag); node.tagName = tag; return node; },
    defaultView: {
      CSSStyleSheet: class { replaceSync(css) { this.css = css; } },
      HTMLElement: Node,
      customElements: {get: tag => definitions.get(tag), define: (tag, C) => definitions.set(tag, C)}
    }
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  const root = new Node('root'); root.root = true;
  const target = (selector, tag = 'md-filled-button') => { const node = doc.createElement(tag); node.dataset.sel = selector; root.append(node); return node; };
  return {doc, root, target, Node};
}
