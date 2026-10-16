import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {checkNote,readDraft,saveDraft} from '../browser-extension/notes.js';
const source=await fs.readFile(new URL('../browser-extension/options.js',import.meta.url),'utf8');
const line=start=>{const found=source.split(/\r?\n/).find(row=>row.startsWith(start));assert.ok(found,start);return found;};
const nodes=()=>{const values=new Map();return id=>{if(!values.has(id))values.set(id,{value:'',textContent:'',replaceChildren(){this.textContent='';},focus(){},addEventListener(_event,fn){this.click=fn;}});return values.get(id);};};
test('production delete confirmation removes an open note from the reader immediately',()=>{
 const $=nodes();let records=[{id:'note',title:'Saved',body:'Private body'}];const context={$: $,selectedNotes:new Set(['note']),openedNoteId:'note',storage:{},readNotes:()=>records,deleteNotes:()=>{records=[];return [{id:'note',outcome:'deleted'}];},confirmDestructive:(_id,run)=>run(),renderNotes(){},label(){}};
 $('note-reader-body').textContent='Private body';vm.createContext(context);vm.runInContext(line('function renderNoteReader()')+'\n'+line("$('notes-delete').addEventListener"),context);$('notes-delete').click();assert.equal($('note-reader').hidden,true);assert.equal($('note-reader-body').textContent,'');assert.equal(context.openedNoteId,null);
});
test('production restored review draft over the limit returns to editing without losing text',()=>{
 const $=nodes(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};saveDraft(storage,{title:'Draft',body:'x'.repeat(4001),step:3});
 const context={$: $,storage,readDraft,checkNote,noteErrors:{},copy:{noteNext:['Next','下一步']},label(){},t:p=>p[0],renderNoteText(){throw Error('Oversized draft reached renderer');},sheet:null};
 vm.createContext(context);vm.runInContext(['function sheetDraft()','function renderSheet()','function openSheet('].map(line).join('\n'),context);context.openSheet(null);assert.equal(context.sheet.step,2);assert.equal($('note-body').value.length,4001);assert.match(context.sheet.error[0],/4,000/);
});
test('restored review step focuses its visible save control',()=>{
 const $=nodes(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};saveDraft(storage,{title:'Draft',body:'Ready',step:3});
 let focused;for(const id of ['note-title','note-body','note-next'])$(id).focus=()=>{focused=id;};
 const context={$: $,storage,readDraft,checkNote,noteErrors:{},copy:{noteNext:['Next','下一步']},label(){},t:p=>p[0],renderNoteText(){},renderMarkdown(){},noteReaderTranslation(){},sheet:null};
 vm.createContext(context);vm.runInContext(['function sheetDraft()','function renderSheet()','function openSheet('].map(line).join('\n'),context);context.openSheet(null);assert.equal(context.sheet.step,3);assert.equal(focused,'note-next');
});
