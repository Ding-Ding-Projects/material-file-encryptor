import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadMessagePreferences,effectiveMessagePair} from '../docs/site/locales.js';
import {pageShell} from '../docs/site/publication.mjs';
const stored=value=>({getItem:()=>JSON.stringify(value)});
test('language playfulness defaults, boundaries and category migration are explicit',()=>{
 assert.deepEqual(loadMessagePreferences(stored({})),{language:'en',emoji:false,funnyEnglish:5,funnyCantonese:5});
 assert.deepEqual(loadMessagePreferences(stored({language:'bilingual',successTone:1,searchTone:2})),{language:'bilingual',emoji:false,funnyEnglish:5,funnyCantonese:5});
 for(const bad of [0,6,1.5,'3',null])assert.equal(loadMessagePreferences(stored({funnyEnglish:bad,funnyCantonese:2})).funnyEnglish,5);
 const settings={funnyEnglish:1,funnyCantonese:5};
 const first=effectiveMessagePair(settings,'search');
 assert.notEqual(first[0],first[1]);
 assert.equal(first[0],effectiveMessagePair({...settings,funnyCantonese:1},'search')[0]);
 assert.equal(first[1],effectiveMessagePair({...settings,funnyEnglish:5},'search')[1]);
 assert.deepEqual(effectiveMessagePair({...settings,school:{enabled:true}},'search'),effectiveMessagePair({funnyEnglish:1,funnyCantonese:1},'search'));
});
test('all generated route depths load their own public shell and preferences',async()=>{
 const home=await readFile(new URL('../docs/site/index.html',import.meta.url),'utf8');
 for(const depth of [0,1]){
  const page=pageShell(home,'A complete article','<article id="article">Content</article>',{depth});
  assert.ok(page.includes(`src="${depth?'../':'./'}site.js"`));
  for(const id of ['preferences-dialog','success-tone','search-tone','english-tone-reset','cantonese-tone-reset','vocabulary-file'])assert.ok(page.includes(`id="${id}"`));
 }
});
test('public foundation composition requires direct chrome, isolated state and its workers',async()=>{
 const source=await readFile(new URL('../docs/site/site-foundation.js',import.meta.url),'utf8');
 const script=await readFile(new URL('../docs/site/site.js',import.meta.url),'utf8');
 const builder=await readFile(new URL('../scripts/build-site-workspace.mjs',import.meta.url),'utf8');
 const required=["mountSurfaceFoundation({host", "scopedStorage(storage,location.pathname)", "'data-site-search':'content'", "'data-site-search':'settings'", "foundation.registerCommands(commands)", "site-provenance.json", "foundation.notify(", "foundation.destroy()"];
 const check=text=>required.every(part=>text.includes(part));
 assert.ok(check(source));for(const part of required)assert.equal(check(source.replace(part,'')),false,part);
 assert.match(script,/import \{ mountSiteFoundation \} from '\.\/site-foundation.js'/);
 assert.ok(builder.includes("build('docs/site/site-foundation.js','site-foundation.js')"));
 assert.ok(source.includes('search.filter('));assert.ok(source.includes('settingsSearch.filter('));
 assert.doesNotMatch(source,/window\.drive|mountLocalAdapter|featureRequest|vault\.unlock/);
});
test('surface storage isolates page state without persisting content',async()=>{
 const source=await readFile(new URL('../docs/site/site-foundation.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('export function scopedStorage'),source.indexOf('export function mountSiteFoundation'));
 const {scopedStorage}=await import('data:text/javascript;base64,'+Buffer.from(fn).toString('base64'));
 const records=new Map(),storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 const home=scopedStorage(storage,'/index.html'),article=scopedStorage(storage,'/articles/a.html');
 home.setItem('tabs','home-state');article.setItem('tabs','article-state');assert.equal(home.getItem('tabs'),'home-state');assert.equal(article.getItem('tabs'),'article-state');home.removeItem('tabs');assert.equal(home.getItem('tabs'),null);assert.equal(article.getItem('tabs'),'article-state');
});
