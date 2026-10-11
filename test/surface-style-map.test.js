import test from 'node:test';
import assert from 'node:assert/strict';
import {noChange} from 'lit-html';
import {PartType} from 'lit-html/directive.js';
import {CssomStyleMapDirective} from '../src/shared/surface/style-map.js';

function fixture(){
 const calls=[];
 const style={setProperty:(...args)=>calls.push(['set',...args]),removeProperty:name=>calls.push(['remove',name])};
 const directive=new CssomStyleMapDirective({type:PartType.ATTRIBUTE,name:'style',strings:['','']});
 const part={element:{style,setAttribute(){throw new Error('Inline attribute commit is forbidden.');}}};
 return{directive,part,style,calls};
}
test('initial style map uses CSSOM and returns no attribute value',()=>{
 const {directive,part,style,calls}=fixture();
 assert.equal(directive.update(part,[{width:'25px','--progress':'0.25',opacity:0}]),noChange);
 assert.equal(style.width,'25px');assert.equal(style.opacity,0);
 assert.deepEqual(calls,[['set','--progress','0.25','']]);
 assert.equal(directive.render({width:'50px'}),noChange);
});
test('updates remove old properties and preserve important declarations',()=>{
 const {directive,part,style,calls}=fixture();
 directive.update(part,[{width:'25px','--progress':'0.25'}]);calls.length=0;
 assert.equal(directive.update(part,[{backgroundColor:'red !important',height:'10px',width:null}]),noChange);
 assert.equal(style.width,null);assert.equal(style.height,'10px');
 assert.deepEqual(calls,[['remove','--progress'],['set','background-color','red','important']]);
 directive.update(part,[{}]);assert.equal(style.height,null);
});
test('style map rejects unsupported binding positions',()=>{
 for(const part of [{type:PartType.CHILD},{type:PartType.ATTRIBUTE,name:'class'},{type:PartType.ATTRIBUTE,name:'style',strings:['a','b','c']}])assert.throws(()=>new CssomStyleMapDirective(part));
});
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('vendored bundle records the exact local adapter and upstream style-map inputs',()=>{
 const hash=path=>createHash('sha256').update(readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
 const bundle=readFileSync(new URL('../src/shared/surface/material.js',import.meta.url),'utf8');
 assert.ok(bundle.startsWith('// Vendor source: @material/web 2.5.0; esbuild 0.25.11.'));
 assert.ok(bundle.includes(`Upstream lit-html style-map normalized-LF SHA-256: ${hash('../node_modules/lit-html/directives/style-map.js')}.`));
 assert.ok(bundle.includes(`Strict-CSP CSSOM adapter normalized-LF SHA-256: ${hash('../src/shared/surface/style-map.js')}.`));
});
