import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const styles=await Promise.all(['style.css','modern.css'].map(name=>fs.readFile(new URL('../src/renderer/'+name,import.meta.url),'utf8')));
const compositions=await fs.readFile(new URL('../src/shared/surface/compositions.js',import.meta.url),'utf8');
const shell=await fs.readFile(new URL('../src/renderer/features/shell/index.js',import.meta.url),'utf8');

// Source-level cascade guards. Actual geometry is verified in the packaged renderer.
function assertNativeLegacySelectors(css){
 const selectors=[...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(match=>match[1]).filter(selector=>/\.button(?![-\w])/.test(selector));
 assert.ok(selectors.length>0,'The legacy native-button inventory is present');
 for(const selector of selectors)assert.doesNotMatch(selector.replaceAll('button.button',''),/\.button(?![-\w])/,'Legacy button declarations must not target registered custom-element hosts');
}
function announcerDeclarations(css){
 const match=/::slotted\(mfe-live-notification\)\s*\{([^}]+)\}/.exec(css);
 assert.ok(match,'The desktop announcer owns an explicit visual treatment');
 return Object.fromEntries(match[1].split(';').filter(Boolean).map(part=>{const at=part.indexOf(':');return [part.slice(0,at).trim(),part.slice(at+1).trim()];}));
}
function assertAccessibleHidden(css){
 const rules=announcerDeclarations(css);
 assert.equal(rules.position,'absolute');
 assert.equal(rules.width,'1px');assert.equal(rules.height,'1px');
 assert.equal(rules.overflow,'hidden');assert.equal(rules['clip-path'],'inset(50%)');
 assert.equal(rules.clip,'rect(0,0,0,0)');
 assert.notEqual(rules.display,'none');assert.notEqual(rules.visibility,'hidden');
}

test('legacy button selectors stay native and leave registered primitive shape and spacing intact',()=>{
 for(const css of styles)assertNativeLegacySelectors(css);
 assert.throws(()=>assertNativeLegacySelectors(styles[1].replace('button.button{','.button{')),assert.AssertionError);
 assert.throws(()=>assertNativeLegacySelectors(styles[0]+'\n.welcome-actions .button{padding:0}'),assert.AssertionError);
});

test('desktop live announcer remains accessible without consuming a visible workspace row',()=>{
 assertAccessibleHidden(compositions);
 const statement=shell.match(/const live=element\('mfe-live-notification',[^;]+;/)?.[0];
 assert.ok(statement,'Use the actual shell composition statement');
 const live=vm.runInNewContext(statement+'live',{element:(tag,properties)=>({tag,properties})});
 assert.equal(live.tag,'mfe-live-notification');assert.equal(live.properties.role,'status');assert.equal(live.properties['aria-live'],'polite');
 assert.equal(live.properties['aria-hidden'],undefined);assert.equal(live.properties.hidden,undefined);
 assert.match(shell,/live\.textContent=/,'Notifications still update the live text');
 assert.throws(()=>assertAccessibleHidden(compositions.replace('clip-path:inset(50%);','')),assert.AssertionError);
 assert.throws(()=>assertAccessibleHidden(compositions.replace('::slotted(mfe-live-notification){','::slotted(mfe-live-notification){display:none;')),assert.AssertionError);
});
