import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVocabulary, replaceVocabulary, filterGuides } from '../docs/site/preferences.js';
import {previewRelease,verifiedDownload,renderReleaseDownload} from '../docs/site/release.js';

const valid = replacements => JSON.stringify({ version: 1, replacements });
test('site vocabulary accepts the desktop contract and treats replacement markup as plain text', () => {
  const vocabulary = parseVocabulary(valid([{ from: 'folder', to: '<script>alert(1)</script>' }]));
  assert.equal(replaceVocabulary('Choose a folder.', vocabulary), 'Choose a <script>alert(1)</script>.');
});
test('replacements are literal, longest first, and never cascade', () => {
  const vocabulary = parseVocabulary(valid([{ from: 'file', to: 'folder' }, { from: 'folder', to: 'directory' }, { from: 'a.b', to: 'literal' }, { from: 'file size', to: 'capacity' }]));
  assert.equal(replaceVocabulary('file size / file / folder / a.b / axb', vocabulary), 'capacity / folder / directory / literal / axb');
});
test('invalid vocabulary formats, ambiguous entries, prototype names, and bounds fail closed', () => {
  for (const input of [
    'not json', JSON.stringify({ version: 2, replacements: [] }), JSON.stringify({ version: 1, replacements: [], secret: 'x' }),
    valid([{ from: 'x', to: 'y' }, { from: 'x', to: 'z' }]), valid([{ from: '', to: 'x' }]),
    valid([{ from: 'x', to: 'y', extra: 1 }]), valid([{ from: '__proto__', to: 'x' }]),
    valid([{ from: 'x', to: 'constructor' }]), valid([{ from: 'x\n', to: 'y' }]),
    valid([{ from: 'x'.repeat(121), to: 'y' }]), valid([{ from: 'x', to: 'y'.repeat(501) }]),
    valid(Array.from({ length: 201 }, (_, i) => ({ from: String(i), to: '' }))), ' '.repeat(131073),
  ]) assert.throws(() => parseVocabulary(input), Error);
  assert.deepEqual(parseVocabulary(valid([])), { version: 1, replacements: [] });
});
test('documentation search matches all terms without interpreting regex or markup', () => {
  const guides = [{ id: 'offline', text: 'Encrypted offline cache and pinning' }, { id: 'size', text: 'Maximum part size includes overhead KB MB GB' }];
  assert.deepEqual(filterGuides(guides, 'CACHE encrypted').map(x => x.id), ['offline']);
  assert.deepEqual(filterGuides(guides, 'part overhead').map(x => x.id), ['size']);
  assert.deepEqual(filterGuides(guides, 'cache overhead'), []);
  assert.deepEqual(filterGuides(guides, '<script>'), []);
  assert.deepEqual(filterGuides(guides, '  '), guides);
});
test('all same-page links resolve, asset links fit repository Pages, and release status is honest', async () => {
  const html = await readFile(new URL('../docs/site/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'element IDs must be unique');
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing #${match[1]}`);
  assert.match(html, /src="images\/drive-workflow\.png"/);
  assert.match(html, /src="images\/offline-workflow\.png"/);
  assert.doesNotMatch(html, /(?:src|href)="(?:\.\.\/|https?:\/\/[^"\s]+\.(?:js|css|woff2?))/);
  assert.match(html, /disabled aria-describedby="download-help"/);
  assert.match(html, /Conceptual drive architecture/);
  assert.match(html, /not a native Windows capture/);
  assert.doesNotMatch(html, /href="[^"]+\.(?:exe|msi)"/);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /github\.com\/DingDingProjects\//);
  for (const match of html.matchAll(/href="(https:\/\/github\.com[^"]+)"/g)) assert.ok(match[1].startsWith('https://github.com/Ding-Ding-Projects/material-file-encryptor'), 'GitHub links must use the real repository owner');
});

// Complete proof below is a unit fixture, never a claim about the real release.
function completeReleaseFixture() {
  const record=structuredClone(previewRelease);
  for(const kind of ['download','packaged','installed','uninstall'])record.verification[kind]={status:'verified',sourceCommit:record.sourceCommit,installerSha256:record.installer.sha256,receiptSha256:'d'.repeat(64),verifiedAt:'2026-10-09T20:00:00Z'};
  record.verification.download.bytes=record.installer.bytes;return record;
}
function downloadDocumentFixture() {
  const nodes=new Map();const createElement=tag=>({tagName:tag.toUpperCase(),attributes:{},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];if(name==='href')delete this.href;},replaceWith(next){nodes.set('#preview-download',next);}});
  const button=createElement('button');button.disabled=true;button.id='preview-download';nodes.set('#preview-download',button);nodes.set('#download-help',{});nodes.set('#download-state',{});
  return {querySelector:selector=>nodes.get(selector),createElement};
}
test('download remains inert for missing, draft, mismatched or incomplete release proof',()=>{
  const complete=completeReleaseFixture();assert.equal(verifiedDownload(complete).url,complete.installer.url);
  const pending=structuredClone(complete);pending.verification.installed.status='pending';
  const invalid=[null,{},pending];
  for(const kind of ['download','packaged','installed','uninstall']) {
    const record=structuredClone(complete);record.verification[kind].status='pending';invalid.push(record);
    const wrongSource=structuredClone(complete);wrongSource.verification[kind].sourceCommit='a'.repeat(40);invalid.push(wrongSource);
    const wrongHash=structuredClone(complete);wrongHash.verification[kind].installerSha256='b'.repeat(64);invalid.push(wrongHash);
    const noReceipt=structuredClone(complete);delete noReceipt.verification[kind].receiptSha256;invalid.push(noReceipt);
  }
  for(const patch of [{draft:true},{targetCommit:'c'.repeat(40)},{publishedAt:'invalid'},{releaseUrl:'https://example.com/release'}])invalid.push({...complete,...patch});
  invalid.push({...complete,installer:{...complete.installer,url:'https://example.com/installer.exe'}});
  invalid.push({...complete,installer:{...complete.installer,sha256:'bad'}});
  const wrongBytes=structuredClone(complete);wrongBytes.verification.download.bytes++;invalid.push(wrongBytes);
  const stale=structuredClone(complete);stale.verification.installed.verifiedAt='2026-10-08T00:00:00Z';invalid.push(stale);
  for(const record of invalid) {
    assert.equal(verifiedDownload(record),null);
    const document=downloadDocumentFixture();assert.equal(renderReleaseDownload(document,record),false);
    assert.equal(document.querySelector('#preview-download').tagName,'BUTTON');assert.equal(document.querySelector('#preview-download').disabled,true);assert.equal(document.querySelector('#preview-download').href,undefined);
  }
  const document=downloadDocumentFixture();assert.equal(renderReleaseDownload(document,complete),true);assert.equal(document.querySelector('#preview-download').href,complete.installer.url);
  assert.equal(renderReleaseDownload(document,pending),false);assert.equal(document.querySelector('#preview-download').disabled,true);assert.equal(document.querySelector('#preview-download').href,undefined);
});
test('preview download copy and current capture labels have complete language mappings',async()=>{
  const {cantonese,localized}=await import('../docs/site/locales.js');
  for(const text of ['Published preview · verification pending','Verified Windows preview','Download verified preview for Windows','Direct download stays disabled until the downloaded installer, installed application and uninstall checks pass.','The downloaded installer, packaged application, installation and removal passed source-bound local checks.','View published preview','Read source-bound verification','Current Windows evidence','History','Recycle Bin','Explicit descendant selection','Dark appearance','Packaged Windows interface · source']) {
    assert.ok(cantonese[text],text);assert.equal(localized(text,'en'),text);assert.equal(localized(text,'yue'),cantonese[text]);assert.equal(localized(text,'bilingual'),`${text} / ${cantonese[text]}`);
  }
  const html=await readFile(new URL('../docs/site/index.html',import.meta.url),'utf8');
  for(const name of ['history','recycle','descendant','dark-settings'])assert.ok(html.includes(`images/captures/preview/${name}-preview.png`));
  assert.ok(html.includes(previewRelease.releaseUrl));assert.ok(html.includes(previewRelease.sourceCommit));
});

test('message preferences accept only supported locales, booleans, and 1–5 integer levels', async () => {
  const { loadMessagePreferences, messagePair, localized } = await import('../docs/site/locales.js');
  const storage = value => ({ getItem: () => JSON.stringify(value) });
  assert.deepEqual(loadMessagePreferences(storage({ language: 'yue', emoji: true, successTone: 5, searchTone: 2 })), { language: 'yue', emoji: true, successTone: 5, searchTone: 2 });
  assert.deepEqual(loadMessagePreferences(storage({ language: 'unknown', emoji: 'yes', successTone: 6, searchTone: 1.5 })), { language: 'en', emoji: false, successTone: 1, searchTone: 1 });
  assert.equal(loadMessagePreferences({ getItem: () => '{invalid' }).language, 'en');
  for (const kind of ['success', 'search']) {
    const levels = [1, 2, 3, 4, 5].map(level => messagePair(kind, level, 3));
    assert.equal(new Set(levels.map(pair => pair[0])).size, 5);
    assert.equal(new Set(levels.map(pair => pair[1])).size, 5);
    assert.ok(levels.every(pair => /[\u3400-\u9fff]/u.test(pair[1])));
  }
  assert.equal(localized('Security', 'yue'), '保安');
  assert.equal(localized('Linux Electron interface · source', 'yue'), 'Linux Electron 介面 · 原始碼');
  assert.equal(localized('Security', 'bilingual'), 'Security / 保安');
  assert.equal(localized('build.bat /s', 'yue'), 'build.bat /s');
});

test('interactive part illustration counts overhead and rejects unusable limits', async () => {
  const { exampleParts, EXAMPLE_FILE_BYTES, EXAMPLE_OVERHEAD } = await import('../docs/site/explainer.js');
  assert.equal(exampleParts('4', 'MB').parts, 5);
  assert.equal(exampleParts('8', 'MB').parts, 3);
  assert.equal(exampleParts('1', 'GB'), null);
  assert.equal(exampleParts('87890.625', 'KB').limit, 90000000);
  assert.equal(exampleParts('87890.6259765625', 'KB'), null);
  assert.equal(exampleParts('1', 'KB').limit, 1024);
  assert.deepEqual(exampleParts('0.0009765625', 'MB'), exampleParts('1', 'KB'));
  assert.equal(exampleParts('0.9990234375', 'KB'), null);
  assert.equal(exampleParts('1.0000000009313226', 'GB'), null);
  assert.equal(exampleParts('128', 'KB').parts, 129);
  assert.equal(exampleParts('64', 'KB').parts, 257);
  assert.equal(exampleParts('4', 'MB').total, EXAMPLE_FILE_BYTES + 5 * EXAMPLE_OVERHEAD);
  for (const [value, unit] of [['0', 'MB'], ['-1', 'MB'], ['abc', 'GB'], ['2', 'GB'], ['1', 'TB'], ['0.00001', 'KB'], ['1e3', 'KB']]) assert.equal(exampleParts(value, unit), null);
});

test('capture gallery identifies actual Linux evidence and conceptual animation controls', async () => {
  const html = await readFile(new URL('../docs/site/index.html', import.meta.url), 'utf8');
  for (const capture of ['locked', 'create', 'keyfile-choice', 'settings-dark', 'help']) assert.match(html, new RegExp(`src="images/captures/desktop-${capture}\\.png"`));
  assert.match(html, /Actual Electron application captures from Linux/);
  assert.match(html, /not proof of a Windows filesystem mount/);
  assert.match(html, /Linux Electron interface · source <code>[a-f0-9]+<\/code>/);
  assert.match(html, /historical interface recording is withheld pending individual privacy review/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.doesNotMatch(html, /src="images\/captures\/desktop-linux\.webm"/);
  assert.match(html, /Conceptual demonstration only/);
  assert.match(html, /id="workflow-play"/);
  assert.match(html, /id="workflow-replay"/);
  assert.match(html, /id="success-tone" min="1" max="5"/);
});


test('both editable textboxes expose dedicated non-submitting clear controls with 44 px targets',async()=>{
  const html=await readFile(new URL('../docs/site/index.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../docs/site/site.css',import.meta.url),'utf8');
  const script=await readFile(new URL('../docs/site/explainer.js',import.meta.url),'utf8');
  const fields=[...html.matchAll(/<input[^>]*type="(?:text|search)"[^>]*>/g)];assert.equal(fields.length,2);
  for(const id of ['search-clear','part-limit-clear']) {
    assert.match(html,new RegExp(`<button id="${id}" type="button" aria-label="[^"]+"`));
    const rules=css.slice(css.lastIndexOf('/* Both editable text controls'));
    assert.match(rules,new RegExp(`#${id}\\{[^}]*min-width:44px[^}]*min-height:44px`));
  }
  assert.match(script,/clearLimit[.]addEventListener\('click', \(\) => clearExampleLimit\(limit\)\)/);
  assert.match(script,/'Clear maximum encrypted part size':'清除加密分割檔最大大小'/);
  assert.match(script,/limit[.]setAttribute\('aria-invalid', String\(!parts\)\)/);
});

test('clearing the example limit emits validation events, keeps focus and rejects disabled fields',async()=>{
  const {clearExampleLimit,exampleParts}=await import('../docs/site/explainer.js');
  const events=[];let focused=false,validity='previous';
  const input={value:'10',disabled:false,readOnly:false,setCustomValidity:value=>{validity=value;},dispatchEvent:event=>events.push(event.type),focus:()=>{focused=true;}};
  assert.equal(clearExampleLimit(input),true);assert.equal(input.value,'');assert.equal(validity,'');assert.deepEqual(events,['input','change']);assert.equal(focused,true);
  for(const unit of ['KB','MB','GB'])assert.equal(exampleParts(input.value,unit),null);
  for(const state of ['disabled','readOnly']){input.value='10';input[state]=true;events.length=0;assert.equal(clearExampleLimit(input),false);assert.equal(input.value,'10');assert.deepEqual(events,[]);input[state]=false;}
});
