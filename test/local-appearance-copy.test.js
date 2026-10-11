import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPEARANCE_COPY,APPEARANCE_COPY_KEYS,appearanceTranslator} from '../src/renderer/features/personalization/appearance-copy.js';
import {PROPERTIES,STATES} from '../src/renderer/features/personalization/appearance.js';

test('appearance static controls and diagnostics all have real Cantonese copy',()=>{
 const required=new Set([...Object.keys(PROPERTIES),...STATES,'Image','x','y','scaleX','scaleY','rotate','skewX','skewY','Crop left','Crop top','Crop width','Crop height','multiply','screen','overlay','darken','lighten','difference']);
 for(const name of ['appearance','color','logo','appearance-workbench','image-source','image-layers','appearance-raster','appearance-raster-worker','appearance-journal']){
  const source=readFileSync(new URL(`../src/renderer/features/personalization/${name}.js`,import.meta.url),'utf8');
  for(const match of source.matchAll(/(?:new (?:TypeError|Error)|\bError|\bt|\bmessage|\bbutton)\('([^']+)'/g))required.add(match[1]);
 }
 assert.deepEqual(APPEARANCE_COPY_KEYS,Object.keys(APPEARANCE_COPY));
 for(const key of required){assert.ok(Object.hasOwn(APPEARANCE_COPY,key),`Missing copy: ${key}`);assert.match(APPEARANCE_COPY[key],/[\u3400-\u9fff]/u,`Untranslated copy: ${key}`);assert.notEqual(APPEARANCE_COPY[key],key);}
});
test('appearance translator preserves identifiers and message options in all host language paths',()=>{
 const calls=[];const translate=appearanceTranslator((source,options)=>{calls.push({source,options});return APPEARANCE_COPY[source]||source;});
 assert.equal(translate('fontSize'),'字體大小');assert.equal(translate('Layer 12'),'圖層 12');
 assert.equal(translate('Unsupported property: unsafeField',{message:true}),'未支援嘅屬性: unsafeField');
 assert.equal(translate('Unknown decoder details',{message:true}),`${APPEARANCE_COPY['The operation could not be completed.']} Unknown decoder details`);
 const detail='DecodeError: frame 3, expected 128 × 128, received 0 × 0';
 assert.ok(translate(detail,{message:true}).endsWith(detail));
 assert.deepEqual(calls.at(-1).options,{message:true});
 const bilingual=appearanceTranslator(source=>`${source} / ${APPEARANCE_COPY[source]}`);assert.equal(bilingual('Close'),'Close / 關閉');
});
