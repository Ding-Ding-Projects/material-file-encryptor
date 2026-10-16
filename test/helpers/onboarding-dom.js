/**
 * Minimal DOM for exercising the real setup guide view in Node. It supports what the view uses: element creation,
 * children, attributes, datasets, listeners and focus. It makes no claim about layout or assistive technology.
 */
export class Node {
  constructor(document, name) {
    this.ownerDocument = document; this.localName = name; this.tagName = name.toUpperCase();
    this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.textContent = ''; this.hidden = false; this.disabled = false; this.className = ''; this.value = ''; this.parentNode = null;
  }
  append(...nodes) { for (const node of nodes) { if (typeof node === 'string') { this.textContent += node; continue; } node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
  async fire(type, event = {}) { let prevented = false; for (const fn of [...(this.listeners[type] || [])]) await fn({type, target: this, preventDefault() { prevented = true; }, ...event}); return !prevented; }
  click() { return this.disabled ? Promise.resolve() : this.fire('click'); }
  focus() { this.ownerDocument.activeElement = this; }
}
export function createDocument() {
  const document = {
    activeElement: null, listeners: {},
    createElement(name) { return new Node(document, name); }, createElementNS(namespace, name) { return new Node(document, name); },
    addEventListener(type, fn) { (document.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { document.listeners[type] = (document.listeners[type] || []).filter(item => item !== fn); },
    async fire(type, event = {}) { for (const fn of [...(document.listeners[type] || [])]) await fn({type, preventDefault() {}, ...event}); }
  };
  return document;
}
export const walk = node => [node, ...node.children.flatMap(walk)];
export const textOf = node => walk(node).map(item => item.textContent).filter(Boolean).join(' | ');
export const findAll = (root, predicate) => walk(root).filter(predicate);
export const byText = (root, text) => walk(root).find(node => node.textContent === text);
export const byKey = (root, key) => walk(root).find(node => node.dataset.focusKey === key);
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {map, getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => { map.set(key, String(value)); }};
}
