import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFontBuffer,readFontMetadata,collectInstalledFontMetadata,createFontScanAdmission} from '../src/main/font-catalog.js';
import {validateFontAxes,fontVariationCSS,mountFontPicker,validateFontFaceSelection} from '../src/renderer/features/personalization/font-picker.js';
import path from 'node:path';
import {validateFeatureRequest} from '../src/main/validation.js';
import {fontFamilyKey} from '../src/shared/local-ux/font-family-key.js';
import {CASE_FOLDING} from '../src/shared/unicode/case-folding-17.0.0.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('family identity uses pinned official C/F records without normalization or locale tailoring',async()=>{
 const base=new URL('../src/shared/unicode/',import.meta.url),source=await readFile(new URL('CaseFolding-17.0.0.txt',base)),license=await readFile(new URL('UNICODE-LICENSE.txt',base)),provenance=JSON.parse(await readFile(new URL('provenance.json',base),'utf8'));
 assert.equal(createHash('sha256').update(source).digest('hex'),provenance.sourceSha256);assert.equal(createHash('sha256').update(license).digest('hex'),provenance.licenseSha256);
 const expected={};for(const line of source.toString().split(/\r?\n/)){const match=/^([0-9A-F]+); ([CF]); ([0-9A-F ]+);/.exec(line);if(match)expected[parseInt(match[1],16)]=String.fromCodePoint(...match[3].trim().split(/ +/).map(value=>parseInt(value,16)));}assert.deepEqual(CASE_FOLDING,expected);assert.equal(Object.keys(expected).length,provenance.mappingCount);
 for(const [a,b]of [['Fixture Variable','fixture variable'],['ÉCOLE','école'],['Straße','STRASSE'],['Σ','ς'],['\u{10400}','\u{10428}']])assert.equal(fontFamilyKey(a),fontFamilyKey(b));
 assert.notEqual(fontFamilyKey('Å'),fontFamilyKey('A\u030a'));assert.notEqual(fontFamilyKey('I'),fontFamilyKey('ı'));assert.equal(fontFamilyKey('İ'),'i\u0307');
});

test('font metadata actions are reachable only through the desktop allowlist',()=>{
 for(const action of ['fontMetadata','cancelFontMetadata']){assert.equal(validateFeatureRequest('personalization',action,{requestId:'font-fixture'}).action,action);assert.throws(()=>validateFeatureRequest('personalization',action,{}, {browser:true}),/Unsupported/);}
 assert.equal(validateFeatureRequest('personalization','listFonts',{}).action,'listFonts');
 assert.throws(()=>validateFeatureRequest('personalization','readFontFile',{}),/Unsupported/);
});

function repeatedNames(count,length){const source=fixture(),start=6+count*12,name=Buffer.alloc(start+length);name.writeUInt16BE(count,2);name.writeUInt16BE(start,4);for(let i=0;i<count;i++){const at=6+i*12;name.writeUInt16BE(3,at);name.writeUInt16BE(1,at+2);name.writeUInt16BE(0x409,at+4);name.writeUInt16BE(1,at+6);name.writeUInt16BE(length,at+8);}for(let i=start;i<name.length;i+=2)name.writeUInt16BE(65,i);const oldEnd=source.readUInt32BE(36),variation=source.subarray(oldEnd),result=Buffer.concat([source.subarray(0,44),name,variation]);result.writeUInt32BE(name.length,24);result.writeUInt32BE(44+name.length,36);return result;}
test('raw tags and amplified naming work are rejected before unsafe decoding',async()=>{
 const bad=fixture();bad[bad.readUInt32BE(36)+16]=0xf7;await assert.rejects(parseFontBuffer(bad),/raw font tag/);
 await assert.rejects(parseFontBuffer(repeatedNames(1,2050)),/name length/);
 await assert.rejects(parseFontBuffer(repeatedNames(2049,2048)),/cumulative/);
 const controller=new AbortController();const operation=parseFontBuffer(repeatedNames(2048,2048),{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(operation,/abort/i);
});
test('scan admission bounds distinct identifiers and releases cancelled scans',async()=>{
 const admission=createFontScanAdmission();let entered=0;const first=admission.run('first',signal=>new Promise((resolve,reject)=>{entered++;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));
 await assert.rejects(admission.run('second',()=>{entered++;}),/already active/);assert.equal(entered,1);assert.equal(admission.cancel('wrong'),false);assert.equal(admission.cancel('first'),true);await assert.rejects(first,/abort/i);assert.equal(await admission.run('second',async()=>42),42);
});
test('ambiguous variable families and unmapped style faces cannot mutate appearance',async()=>{
 const [regular]=await parseFontBuffer(fixture());regular.id='regular';const italic={...regular,id:'italic',style:'Italic'};
 assert.throws(()=>validateFontFaceSelection(italic,{faces:[regular,italic]}),/exact face mapping/);
 assert.throws(()=>validateFontFaceSelection(regular,{faces:[regular,italic]}),/ambiguous/);
 assert.deepEqual(validateFontFaceSelection(regular,{faces:[regular]}),{fontStyle:'normal',fontWeight:'400'});
 const doc={createElement:tag=>new Node(tag,doc)},host=new Node('host',doc);let writes=0;const picker=mountFontPicker(host,{catalog:{faces:[regular,italic]},mutate:()=>writes++});await assert.rejects(picker.applyFace('italic',{wght:700}),/exact face mapping/);await assert.rejects(picker.applyFace('regular',{wght:700}),/ambiguous/);assert.equal(writes,0);picker.destroy();
 const caseVariant={...italic,family:regular.family.toLowerCase()},originalFamily=regular.family;
 const casePicker=mountFontPicker(host,{catalog:{faces:[regular,caseVariant]},mutate:()=>writes++});await assert.rejects(casePicker.applyFace('regular',{wght:700}),/ambiguous/);assert.equal(writes,0);assert.equal(regular.family,originalFamily);assert.equal(caseVariant.family,'fixture variable');casePicker.destroy();
 for(const [family,variant]of [['École','ÉCOLE'],['Straße','STRASSE']]){const first={...regular,family},second={...italic,family:variant};const mounted=mountFontPicker(host,{catalog:{faces:[first,second]},mutate:()=>writes++});await assert.rejects(mounted.applyFace('regular',{wght:700}),/ambiguous/);assert.equal(writes,0);assert.equal(first.family,family);assert.equal(second.family,variant);mounted.destroy();}
});

function fixture(){
 const text=Buffer.from('Fixture Variable','utf16le');for(let i=0;i<text.length;i+=2)[text[i],text[i+1]]=[text[i+1],text[i]];
 const name=Buffer.alloc(18+text.length);name.writeUInt16BE(1,2);name.writeUInt16BE(18,4);name.writeUInt16BE(3,6);name.writeUInt16BE(1,8);name.writeUInt16BE(0x409,10);name.writeUInt16BE(1,12);name.writeUInt16BE(text.length,14);text.copy(name,18);
 const fvar=Buffer.alloc(44);fvar.writeUInt32BE(0x10000);fvar.writeUInt16BE(16,4);fvar.writeUInt16BE(1,8);fvar.writeUInt16BE(20,10);fvar.writeUInt16BE(1,12);fvar.writeUInt16BE(8,14);fvar.write('wght',16);fvar.writeInt32BE(100*65536,20);fvar.writeInt32BE(400*65536,24);fvar.writeInt32BE(900*65536,28);fvar.writeUInt16BE(1,34);fvar.writeUInt16BE(1,36);fvar.writeInt32BE(700*65536,40);
 const result=Buffer.alloc(44+name.length+fvar.length);result.writeUInt32BE(0x10000);result.writeUInt16BE(2,4);result.write('name',12);result.writeUInt32BE(44,20);result.writeUInt32BE(name.length,24);result.write('fvar',28);result.writeUInt32BE(44+name.length,36);result.writeUInt32BE(fvar.length,40);name.copy(result,44);fvar.copy(result,44+name.length);return result;
}
test('SFNT and collection parser reports named axes and refuses malformed bounds',async()=>{
 const buffer=fixture(),[face]=await parseFontBuffer(buffer);assert.equal(face.family,'Fixture Variable');assert.deepEqual(face.axes[0],{tag:'wght',name:'Fixture Variable',min:100,default:400,max:900,hidden:false});assert.equal(face.instances[0].values.wght,700);
 const collection=Buffer.alloc(16+buffer.length);collection.write('ttcf');collection.writeUInt32BE(0x10000,4);collection.writeUInt32BE(1,8);collection.writeUInt32BE(16,12);buffer.copy(collection,16);collection.writeUInt32BE(60,36);collection.writeUInt32BE(16+buffer.readUInt32BE(36),52);assert.equal((await parseFontBuffer(collection))[0].family,face.family);
 const bad=Buffer.from(buffer);bad.writeUInt32BE(0xffffffff,20);await assert.rejects(parseFontBuffer(bad),/bounds/);
 const axis=Buffer.from(buffer);axis.writeInt32BE(950*65536,44+buffer.readUInt32BE(24)+24);await assert.rejects(parseFontBuffer(axis),/axis/);
 await assert.rejects(readFontMetadata(async()=>Buffer.alloc(0),12),/ended/);
 const controller=new AbortController();controller.abort();await assert.rejects(parseFontBuffer(buffer,{signal:controller.signal}),/abort/i);
 assert.equal((await collectInstalledFontMetadata({platform:'linux'})).status,'unavailable');
});

test('provider reports every file outcome, blocks linked paths, and supports progress cancellation',async()=>{
 const buffer=fixture(),root=path.resolve('font-test-root','Fonts');let closed=0;const progress=[];
 const info={dev:1,ino:1,size:buffer.length,mtimeMs:1,isSymbolicLink:()=>false,isDirectory:()=>false,isFile:()=>true};
 const io={lstat:async file=>file===root?{...info,isDirectory:()=>true,isFile:()=>false}:file.endsWith('linked.ttf')?{...info,isSymbolicLink:()=>true}:info,realpath:async file=>file.endsWith('escape.ttf')?path.resolve('outside.ttf'):file,readdir:async()=>['fixture.ttf','legacy.fon','linked.ttf','escape.ttf'].map(name=>({name})),open:async()=>({stat:async()=>info,read:async(target,start,length,offset)=>{buffer.copy(target,start,offset,offset+length);return{bytesRead:length};},close:async()=>closed++})};
 const environment={WINDIR:path.dirname(root)};
 const result=await collectInstalledFontMetadata({platform:'win32',environment,io,onProgress:value=>progress.push(value)});assert.equal(result.faces.length,1);assert.equal(result.scanned,2);assert.equal(result.unavailable.length,3);assert.equal(closed,1);assert.ok(progress.length);assert.equal(result.status,'partial');
 const controller=new AbortController();await assert.rejects(collectInstalledFontMetadata({platform:'win32',environment,io,signal:controller.signal,onProgress:value=>{if(value.faces===1)controller.abort();}}),/abort/i);assert.equal(closed,2);
});

class Node extends EventTarget{constructor(tag,doc){super();this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.style={};this.value='';}append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this.attributes[key]=value;}getAttribute(key){return this.attributes[key];}replaceChildren(){this.children=[];}querySelectorAll(tag){return this.children.flatMap(node=>[...(node.tagName===tag?[node]:[]),...node.querySelectorAll(tag)]);}setCustomValidity(value){this.invalid=value;}reportValidity(){}remove(){this.removed=true;}click(){this.dispatchEvent(new Event('click'));}}
test('typed picker validates actual drafts and delegates exactly once to the original mutation',async()=>{
 const [face]=await parseFontBuffer(fixture());face.id='fixture';const doc={createElement:tag=>new Node(tag,doc)},host=new Node('host',doc);let writes=0,locked=false;const changes=[];
 const picker=mountFontPicker(host,{catalog:{faces:[face]},disabled:()=>locked,mutate:async value=>{writes++;changes.push(value);}});
 await picker.applyFace('fixture',{wght:700});assert.equal(writes,1);assert.equal(changes[0].fontVariationSettings,'"wght" 700');
 await assert.rejects(picker.applyFace('fixture',{wght:901}),/between/);assert.equal(writes,1);
 const input=host.querySelectorAll('input').find(node=>node.type==='number');input.value='950';const apply=host.querySelectorAll('button').find(node=>node.textContent==='Apply axis values');apply.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(writes,1);
 const reset=host.querySelectorAll('button').find(node=>node.textContent==='Reset axes to defaults');reset.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(writes,2);assert.equal(changes[1].fontVariationSettings,'"wght" 400');
 locked=true;await assert.rejects(picker.applyFace('fixture',{}),/unavailable/);picker.destroy();await assert.rejects(picker.applyFace('fixture',{}),/unavailable/);assert.equal(writes,2);
 assert.throws(()=>validateFontAxes(face,{xxxx:1}),/Unknown/);assert.throws(()=>fontVariationCSS({'bad"':3}),/Invalid/);
});
