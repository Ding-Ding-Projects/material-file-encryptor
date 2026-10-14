import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createAccessDocument} from './helpers/local-access-dom.js';

// Logic fixture only: stylesheet text and connection callbacks are observable,
// but layout, native input and browser accessibility are deliberately not mocked.
const doc=createAccessDocument(), Node=doc.body.constructor, types=new Map();
globalThis.document=doc;
globalThis.HTMLElement=class extends Node {
  constructor(){super(doc,new.target.elementTag);}
  attachShadow(){this.shadowRoot=new Node(doc,'shadow-root');this.shadowRoot.parentNode=this;this.shadowRoot.adoptedStyleSheets=[];return this.shadowRoot;}
};
globalThis.CSSStyleSheet=class {replaceSync(css){this.cssRules=[{cssText:css}];}};
globalThis.customElements={get:tag=>types.get(tag),define(tag,Type){Type.elementTag=tag;types.set(tag,Type);}};
const create=doc.createElement.bind(doc);
doc.createElement=tag=>types.has(tag)?new (types.get(tag))():create(tag);
const {compositionDefinitions}=await import('../src/shared/surface/compositions.js');
const {surfaceRegistry}=await import('../src/shared/surface/registry.js');
function node(tag,attrs={},text=''){const n=doc.createElement(tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);n.textContent=text;return n;}
function fixture(tag){
  const host=node(tag);
  if(tag==='mfe-titlebar'){
    const brand=node('span',{class:'window-brand'},'Material File Encryptor'),actions=node('div',{class:'window-controls'});
    for(const action of ['minimize','maximize','close'])actions.append(node('md-icon-button',{'data-window':action,'aria-label':action}));host.append(brand,actions);
  }
  if(tag==='mfe-main-workspace')host.append(node('mfe-top-bar'),node('mfe-workspace-shell'),fixture('mfe-content-panel'));
  if(tag==='mfe-content-panel'){host.id='view-example';host.append(node('h1',{},'Example'));}
  if(tag==='mfe-data-table'){
    const table=node('table',{'aria-label':'Drive files'}),head=node('thead'),row=node('tr'),body=node('tbody');row.append(node('th',{},'Name'));head.append(row);table.append(head,body);host.append(table);
  }
  if(tag==='mfe-selection-toolbar'){host.setAttribute('aria-label','Selected file actions');const actions=node('div',{class:'file-actions'});actions.append(node('md-text-button',{},'Open'));host.append(node('span',{},'Select a file'),actions);}
  doc.body.append(host);host.connectedCallback();return host;
}
const inspect=host=>types.get(host.localName).inspect(host);

test('all five concrete compositions own registered anatomy, stylesheet and semantics',()=>{
  assert.equal(Object.keys(compositionDefinitions).length,5);
  for(const [tag,spec] of Object.entries(compositionDefinitions)){
    const host=fixture(tag);assert.ok(surfaceRegistry.some(row=>row.tag===tag&&row.parts.includes(spec.part)));assert.deepEqual(inspect(host),[]);assert.equal(host.getAttribute('role'),spec.role);
    assert.match(host.shadowRoot.adoptedStyleSheets[0].cssRules[0].cssText,/var\(--/);
    const part=host.shadowRoot.children[0];part.remove();assert.ok(inspect(host).includes('rendered-anatomy'));host.shadowRoot.append(part);assert.deepEqual(inspect(host),[]);
    const sheet=host.shadowRoot.adoptedStyleSheets[0];host.shadowRoot.adoptedStyleSheets=[];assert.ok(inspect(host).includes('owned-style'));host.shadowRoot.adoptedStyleSheets=[sheet];assert.deepEqual(inspect(host),[]);
    const original=sheet.cssRules[0].cssText;sheet.replaceSync(':host{display:contents}');assert.ok(inspect(host).includes('owned-style'));sheet.replaceSync(original);assert.deepEqual(inspect(host),[]);
    host.disconnectedCallback();assert.ok(inspect(host).includes('disconnected'));host.connectedCallback();assert.deepEqual(inspect(host),[]);
    const raw=node('div');assert.deepEqual(types.get(tag).inspect(raw),['unowned-host']);
  }
});
test('registered empty hosts cannot substitute for rendered structure',()=>{
  for(const tag of ['mfe-titlebar','mfe-main-workspace','mfe-data-table','mfe-selection-toolbar']){const host=node(tag);doc.body.append(host);host.connectedCallback();assert.notDeepEqual(inspect(host),[]);}
  const panel=node('mfe-content-panel',{'aria-label':'Named but empty'});doc.body.append(panel);panel.connectedCallback();assert.ok(inspect(panel).includes('panel-content'));panel.append(node('h1',{},'Restored content'));assert.deepEqual(inspect(panel),[]);
});
test('semantic table headers, rows and exact shadow anatomy are required',()=>{
  const host=fixture('mfe-data-table'),table=host.children[0],head=table.children[0],header=head.children[0].children[0];
  header.remove();assert.ok(inspect(host).includes('table-headers'));head.children[0].append(header);assert.deepEqual(inspect(host),[]);
  const invalid=node('div',{},'Not a record');table.children[1].append(invalid);assert.ok(inspect(host).includes('table-records'));invalid.remove();assert.deepEqual(inspect(host),[]);
  const extra=node('div');host.shadowRoot.append(extra);assert.ok(inspect(host).includes('rendered-anatomy'));extra.remove();assert.deepEqual(inspect(host),[]);
  host.remove();assert.ok(inspect(host).includes('disconnected'));doc.body.append(host);assert.deepEqual(inspect(host),[]);
});
test('same-looking table and action replacements fail, dynamic record rows remain supported',()=>{
  const host=fixture('mfe-data-table'),table=host.children[0],body=table.children[1];
  const replacement=node('tbody');body.remove();table.append(replacement);host.syncSemantics();assert.ok(inspect(host).includes('replaced-parts'));replacement.remove();table.append(body);assert.deepEqual(inspect(host),[]);
  const row=node('tr');row.append(node('td',{},'Synthetic file'));body.append(row);host.syncSemantics();assert.deepEqual(inspect(host),[]);
  table.setAttribute('aria-label','磁碟檔案');host.syncSemantics();assert.equal(host.shadowRoot.children[0].getAttribute('aria-label'),'磁碟檔案');assert.deepEqual(inspect(host),[]);
  table.setAttribute('aria-label','');host.syncSemantics();assert.ok(inspect(host).includes('table-anatomy'));
  const bar=fixture('mfe-titlebar'),actions=bar.children[1],original=actions.children[0],raw=node('button',{'data-window':'minimize','aria-label':'Minimize'});original.remove();actions.append(raw);bar.syncSemantics();assert.ok(inspect(bar).includes('window-action:minimize'));assert.ok(inspect(bar).includes('replaced-parts'));raw.remove();actions.append(original);assert.deepEqual(inspect(bar),[]);
});
test('connection and language updates preserve slotted nodes, focus and handlers',()=>{
  const host=fixture('mfe-selection-toolbar'),button=host.children[1].children[0];button.focus();let calls=0;button.addEventListener('click',()=>calls++);host.syncSemantics();host.disconnectedCallback();host.connectedCallback();host.setAttribute('aria-label','所選檔案操作');host.syncSemantics();assert.equal(doc.activeElement,button);button.click();assert.equal(calls,1);assert.equal(host.children[1].children[0],button);assert.deepEqual(inspect(host),[]);
});
test('production shell imports compositions and narrowly migrates every main/view selector',async()=>{
  const html=await fs.readFile(new URL('../src/renderer/index.html',import.meta.url),'utf8'),app=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8'),shell=await fs.readFile(new URL('../src/renderer/features/shell/index.js',import.meta.url),'utf8'),audit=await fs.readFile(new URL('../scripts/gui-acceptance-components.mjs',import.meta.url),'utf8');
  for(const tag of Object.keys(compositionDefinitions))assert.ok(html.includes('<'+tag));
  assert.ok(!html.includes('<main>'));assert.ok(!html.includes('<section id="view-'));assert.ok(!app.includes("document.querySelector('main')"));assert.ok(!app.includes("querySelectorAll('main > .view')"));assert.ok(app.includes("createElement('mfe-content-panel')"));assert.match(shell,/import .*compositions[.]js/);assert.match(audit,/generic\.push\(\.\.\.compositionIssues/);
});

test('table focus overlay stays above sticky headers without changing layout or hit testing',async()=>{
  const host=fixture('mfe-data-table');
  const css=host.shadowRoot.adoptedStyleSheets[0].cssRules[0].cssText;
  const rule=selector=>{
    const start=css.lastIndexOf(selector+'{');
    assert.notEqual(start,-1,'Missing rule: '+selector);
    return Object.fromEntries(css.slice(start+selector.length+1,css.indexOf('}',start)).split(';').filter(Boolean).map(pair=>{const colon=pair.indexOf(':');return[pair.slice(0,colon).trim(),pair.slice(colon+1).trim()];}));
  };
  const frame=rule(':host'),focus=rule('.scroll:focus-visible'),overlay=rule('.scroll:focus-visible::after');
  assert.equal(frame.position,'relative');
  assert.equal(frame.isolation,'isolate');
  assert.equal(overlay.position,'absolute');
  assert.equal(overlay.inset,'0');
  assert.equal(overlay['pointer-events'],'none');
  assert.equal(overlay.outline,'inherit');
  assert.equal(overlay['outline-offset'],'inherit');
  assert.equal(focus['outline-offset'],'-3px');
  const style=await fs.readFile(new URL('../src/renderer/style.css',import.meta.url),'utf8');
  const headerZ=Number(/th\{[^}]*z-index:(\d+)/.exec(style)?.[1]);
  assert.ok(Number(overlay['z-index'])>headerZ,'Overlay must paint above sticky headers');
  assert.equal(rule('.scroll').position,undefined,'Scroller must not become overlay containing block');
  assert.deepEqual(inspect(host),[]);
});
