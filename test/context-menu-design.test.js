import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const load=relative=>fs.readFile(new URL('../'+relative,import.meta.url),'utf8');
const [menu,app,icons]=await Promise.all(['src/shared/surface/context-menu.js','src/renderer/app.js','src/renderer/icons.js'].map(load));
const start=app.indexOf('registerContextActions(fileList');
const providerBlock=app.slice(start,app.indexOf('}));',app.indexOf("id:'file-delete'"))+4);

test('file row menu keeps its items in the designed order',()=>{
 const ids=[...providerBlock.matchAll(/id:'(file-[a-z]+)'/g)].map(m=>m[1]);
 assert.deepEqual(ids,['file-open','file-share','file-export','file-offline','file-versions','file-details','file-delete']);
 const sections=[...providerBlock.matchAll(/section:(\d)/g)].map(m=>Number(m[1]));
 assert.deepEqual(sections,[...sections].sort((a,b)=>a-b));
 assert.match(providerBlock,/id:'file-delete',section:3,icon:'delete',danger:true/);
 assert.match(providerBlock,/header:\{icon:'file'/);
});

test('every menu item icon exists in the icon set',()=>{
 for(const name of new Set([...providerBlock.matchAll(/icon:'([a-z_]+)'/g)].map(m=>m[1])))assert.match(icons,new RegExp(`\\b${name}:\\s*\\[`),`icon ${name}`);
});

test('only real shortcuts are advertised',()=>{
 assert.deepEqual([...providerBlock.matchAll(/shortcut:'([^']+)'/g)].map(m=>m[1]),['Enter']);
});

test('menu component renders icons, header, dividers, danger style and honours reduced motion',()=>{
 for(const part of ['buildHeader',"class:'divider'",'item.danger',"'slot','start'",'menu-pop','prefers-reduced-motion','--md-menu-item-one-line-container-height:48px','--md-menu-container-shape:16px'])assert.ok(menu.includes(part),part);
 assert.match(menu,/Escape/);
 assert.match(menu,/restoreFocus/);
});
