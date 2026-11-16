// Drives the real builder modules against a tiny fake DOM. This proves the tabs build, react to
// pattern changes and call the engine; it does not replace running the builder in the built app.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(name) { this.nodeName = name; this.localName = name; this.children = []; this.listeners = new Map(); this.attrs = new Map(); this.dataset = {}; this.value = ''; this.hidden = false; this.parent = null; this._text = ''; this.classSet = new Set(); this.selectionStart = 0; this.selectionEnd = 0; this.checked = false; this.selected = false; this.disabled = false; this.style = {}; }
  get className() { return [...this.classSet].join(' '); }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const s = this.classSet; return { toggle: (n, on) => (on ? s.add(n) : s.delete(n)), add: n => s.add(n), contains: n => s.has(n) }; }
  get textContent() { return this.localName === '#text' ? this._text : (this.children.length ? this.children.map(c => c.textContent).join('') : this._text); }
  set textContent(v) { this.children = []; this._text = String(v); }
  append(...nodes) { for (const n of nodes) { const node = typeof n === 'string' ? textNode(n) : n; node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
  dispatch(type, extra = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this, key: extra.key, preventDefault() {} }); }
  click() { this.dispatch('click'); }
  focus() { this.focused = true; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  querySelector(sel) { return this.all(n => (sel.startsWith('.') ? n.classSet.has(sel.slice(1)) : n.localName === sel))[0] || null; }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
const textNode = text => { const node = new FakeNode('#text'); node._text = text; return node; };
globalThis.document = { createElement: tag => new FakeNode(tag), createTextNode: textNode };
globalThis.queueMicrotask ??= fn => Promise.resolve().then(fn);
globalThis.URL.createObjectURL ??= () => 'blob:fake';

const { mountRegexBuilder, tabs } = await import('../src/shared/surface/regex/ui/index.js');
const { runOperation, validateFlags } = await import('../src/shared/surface/regex/engine.js');

function makeOwner(scope, query = '') {
  const owner = new FakeNode('mfe-search');
  Object.assign(owner, { query, flags: '', regex: false, language: 'en', scope });
  owner.t = en => en;
  owner.getAttribute = k => (k === 'scope' ? scope : null);
  owner.input = new FakeNode('md-outlined-text-field'); owner.input.value = query;
  owner.flagsControl = new FakeNode('md-outlined-text-field');
  owner.status = new FakeNode('div');
  owner.builder = new FakeNode('section');
  owner.emitChange = () => owner.dispatch('search-change');
  owner.evaluate = async extra => {
    if (owner.query.length > 512 || validateFlags(owner.flags)) return { error: 'Invalid pattern or flags.' };
    try { return runOperation({ pattern: owner.query, flags: owner.flags, ...extra }); } catch (e) { return { error: e.message }; }
  };
  return owner;
}
const enabled = () => Object.assign(new FakeNode('md-switch'), { selected: false });
const wait = ms => new Promise(r => setTimeout(r, ms));
const buttons = (root, text) => root.all(n => /button/.test(n.localName) && n.textContent.includes(text));
const panelOf = (owner, id) => owner.builder.all(n => n.getAttribute('id') === `panel-${id}`)[0];
const tabControlOf = owner => owner.builder.all(n => n.localName === 'md-tabs')[0];
async function activate(owner, id) {
  const control = tabControlOf(owner);
  control.activeTabIndex = tabs.findIndex(t => t.id === id);
  control.dispatch('change');
  await wait(60);
}

test('the builder mounts one panel per mode and every mode has English and Cantonese labels', () => {
  const owner = makeOwner('a');
  mountRegexBuilder(owner, { enabled: enabled() });
  assert.deepEqual(tabs.map(t => t.id), ['create', 'analyze', 'test', 'replace', 'split', 'grep', 'debug', 'library', 'use', 'flavors']);
  for (const t of tabs) { assert.ok(t.label[0] && t.label[1]); assert.ok(panelOf(owner, t.id), t.id); }
  assert.equal(panelOf(owner, 'create').hidden, false);
  assert.equal(panelOf(owner, 'test').hidden, true);
});

test('Create inserts a token at the selection, explains it and adds a needed flag', () => {
  const owner = makeOwner('create'); const sw = enabled();
  const { ctx } = mountRegexBuilder(owner, { enabled: sw });
  ctx.setPattern('abc', { selection: [1, 2] });
  buttons(panelOf(owner, 'create'), 'Non-capturing group')[0].click();
  assert.equal(owner.query, 'a(?:b)c'); assert.equal(owner.regex, true); assert.equal(sw.selected, true);
  assert.match(panelOf(owner, 'create').textContent, /Groups without remembering the text/);
  buttons(panelOf(owner, 'create'), 'Unicode letters')[0].click();
  assert.equal(owner.flags, 'u');
  assert.match(panelOf(owner, 'create').textContent, /u flag was added/);
});

test('each builder keeps its own state, history and library', () => {
  const a = makeOwner('field-a'), b = makeOwner('field-b');
  const ma = mountRegexBuilder(a, { enabled: enabled() }), mb = mountRegexBuilder(b, { enabled: enabled() });
  ma.ctx.setPattern('aaa'); mb.ctx.setPattern('bbb', { flags: 'i' });
  assert.equal(a.query, 'aaa'); assert.equal(b.query, 'bbb'); assert.equal(a.flags, ''); assert.equal(b.flags, 'i');
  ma.ctx.state.sample = 'only a';
  assert.equal(mb.ctx.state.sample, '');
  assert.notEqual(ma.ctx.history, mb.ctx.history);
  assert.equal(ma.ctx.history.canUndo(), true);
  ma.ctx.history.undo();
  assert.equal(mb.ctx.history.canUndo(), true); assert.equal(mb.ctx.history.current().pattern, 'bbb');
});

test('Analyze renders a tree for the pattern and selects source text when a node is activated', async () => {
  const owner = makeOwner('analyze');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  await activate(owner, 'analyze');
  ctx.setPattern('^(a|b)+$');
  await wait(260);
  const nodes = panelOf(owner, 'analyze').all(n => n.classSet.has('tree-node'));
  assert.ok(nodes.length >= 4);
  const group = nodes.find(n => String(n.dataset.start) === '1' && String(n.dataset.end) === '6');
  assert.ok(group); group.click();
  assert.deepEqual([ctx.editor.selectionStart, ctx.editor.selectionEnd], [1, 6]);
  ctx.setPattern('(a');
  await wait(260);
  assert.match(panelOf(owner, 'analyze').textContent, /Missing closing parenthesis/);
});

test('Test shows matches, group data and highlighting from the engine', async () => {
  const owner = makeOwner('test');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.state.sample = 'foo 12 bar 345';
  ctx.setPattern('(?<n>\\d+)');
  await wait(300);
  const text = panelOf(owner, 'test');
  assert.equal(text.hidden, true, 'inactive panels stay hidden');
  await activate(owner, 'test');
  assert.equal(text.hidden, false);
  assert.match(text.textContent, /2 matches/);
  assert.match(text.textContent, /Match 1 of 2/);
  assert.match(text.textContent, /1 \(n\): "12"/);
  assert.equal(text.all(n => n.localName === 'mark').length, 2);
});

test('Replace, Split and Debug each produce their result for the same expression', async () => {
  const owner = makeOwner('modes');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.state.sample = 'a1,b2';
  ctx.state.replacement = '<$&>';
  ctx.setPattern('\\d');
  await activate(owner, 'replace'); assert.match(panelOf(owner, 'replace').textContent, /a<1>,b<2>/);
  ctx.setPattern(',');
  await activate(owner, 'split'); assert.match(panelOf(owner, 'split').textContent, /2 pieces/);
  ctx.setPattern('b');
  await activate(owner, 'debug');
  assert.match(panelOf(owner, 'debug').textContent, /Attempt 1 of/);
  assert.match(panelOf(owner, 'debug').textContent, /Attempt-level trace/);
});

test('Grep filters a supplied list', async () => {
  const owner = makeOwner('grep');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.setPattern('^a');
  await activate(owner, 'grep');
  const panel = panelOf(owner, 'grep');
  const field = panel.all(n => n.localName === 'md-outlined-text-field')[0];
  field.value = 'apple\nbanana\navocado';
  field.dispatch('input');
  await wait(60);
  assert.match(panel.textContent, /2 of 3 lines match/);
});

test('flavors other than JavaScript are never executed and say so', async () => {
  const owner = makeOwner('flavor');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.state.sample = 'abc';
  ctx.setPattern('b');
  ctx.setFlavor('python');
  await activate(owner, 'test');
  const test = panelOf(owner, 'test');
  const notice = test.all(n => n.classSet.has('notice'))[0];
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /Not supported here/);
  assert.equal(test.all(n => n.localName === 'mark').length, 0);
  ctx.setFlavor('javascript');
  await wait(60);
  assert.equal(notice.hidden, true);
  assert.equal(test.all(n => n.localName === 'mark').length, 1);
});

test('Use generates code and Flavors compares every target for the current expression', async () => {
  const owner = makeOwner('use');
  const { ctx } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.setPattern('(?<y>\\d{4})-\\d{2}');
  await activate(owner, 'use');
  assert.match(panelOf(owner, 'use').textContent, /const pattern = \/\(\?<y>\\d\{4\}\)-\\d\{2\}\/;/);
  ctx.setPattern('(?<y>\\d{4})(?<=1)-\\d{2}');
  await activate(owner, 'flavors');
  const flavors = panelOf(owner, 'flavors').textContent;
  for (const name of ['Python re', '.NET', 'Java', 'PCRE2', 'Ruby', 'Go (RE2)', 'Rust regex']) assert.ok(flavors.includes(name), name);
  assert.match(flavors, /Not supported here: cannot be converted safely/);
});

test('Library saves an expression locally and loads it back', async () => {
  const owner = makeOwner('library');
  const { ctx, store } = mountRegexBuilder(owner, { enabled: enabled() });
  ctx.setPattern('a+', { flags: 'i' });
  const panel = panelOf(owner, 'library');
  buttons(panel, 'Save expression')[0].click();
  assert.equal(store.get().snippets.length, 1);
  ctx.setPattern('zzz', { flags: '' });
  await wait(20);
  const load = buttons(panel, 'Expression')[0];
  assert.ok(load); load.click();
  assert.equal(owner.query, 'a+'); assert.equal(owner.flags, 'i');
});
