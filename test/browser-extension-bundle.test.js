import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {stageBrowserExtension,changelogEntries,extensionCoverage,boundedReason} from '../scripts/build-browser-extension.mjs';import {pathToFileURL} from 'node:url';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'extension-source-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'browser-extension'),{recursive:true});await fs.mkdir(path.join(root,'src/shared/surface'),{recursive:true});const manifest={manifest_version:3,action:{default_popup:'popup.html'},background:{service_worker:'background.js',type:'module'},permissions:['contextMenus','nativeMessaging','storage']};await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(root,'browser-extension/popup.html'),'<script type="module" src="popup.js"></script>');await fs.writeFile(path.join(root,'browser-extension/popup.js'),"import './vendor/material.js'; import './vendor/search.js';");await fs.writeFile(path.join(root,'browser-extension/background.js'),'const host="fixed";');for(const shared of ['preferences.js','accent.js','local-records.js'])await fs.writeFile(path.join(root,'browser-extension',shared),'export{};');await fs.writeFile(path.join(root,'src/shared/surface/material.js'),'// Vendor source: @material/web 2.5.0; esbuild 0.25.11.\nexport{};');const compile=async({entry,output})=>fs.writeFile(output,entry.endsWith('search-entry.js')?'new URL("./regex-worker.js",import.meta.url);':'self.onmessage=()=>{};');return{root,manifest,compile};}
test('extension stage contains local Material/shared search/worker and truthful unsigned receipt',async t=>{const{root,compile}=await fixture(t),receipt=await stageBrowserExtension({root,compile});assert.equal(receipt.signature,'not-produced');assert.equal(receipt.installation,'not-performed');assert.deepEqual(receipt.files.filter(row=>row.path.startsWith('vendor/')).map(row=>row.path),['vendor/material.js','vendor/search.js','vendor/regex-worker.js']);const manifest=JSON.parse(await fs.readFile(path.join(root,'out/browser-extension/manifest.json'),'utf8'));assert.match(manifest.content_security_policy.extension_pages,/worker-src 'self'/);});
test('extension staging rejects elevated permissions and remote popup scripts',async t=>{const{root,manifest,compile}=await fixture(t);await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify({...manifest,permissions:[...manifest.permissions,'downloads']}));await assert.rejects(stageBrowserExtension({root,compile}),/permissions/);await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(root,'browser-extension/popup.html'),'<script src="https://example.com/code.js"></script>');await assert.rejects(stageBrowserExtension({root,compile}),/external/);});
test('missing shared regex worker route cannot produce a successful bundle receipt',async t=>{const{root}=await fixture(t);await assert.rejects(stageBrowserExtension({root,compile:async({output})=>fs.writeFile(output,'export{};')}),/worker route/);});

test('production options workspace is hashed and staged under local-only CSP',async t=>{const destination=await fs.mkdtemp(path.join(os.tmpdir(),'extension-workspace-output-'));t.after(()=>fs.rm(destination,{recursive:true,force:true}));const receipt=await stageBrowserExtension({root:process.cwd(),destination:path.join(destination,'stage'),compile:async({entry,output})=>fs.writeFile(output,entry.endsWith('search-entry.js')?'new URL("./regex-worker.js",import.meta.url);':'self.onmessage=()=>{};')});for(const file of ['options.html','options.js','options.css','preferences.js','local-models.js','rich-text.js'])assert.ok(receipt.files.some(row=>row.path===file&&row.sha256.length===64));const manifest=JSON.parse(await fs.readFile(path.join(destination,'stage/manifest.json'),'utf8'));assert.equal(manifest.options_ui.page,'options.html');assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src https://raw.githubusercontent.com https://api.github.com http://127.0.0.1:*;"),'Only the public catalogue hosts and the loopback address may be contacted.');assert.ok(!/connect-src[^;]*(?:\*\s|\*;|https?:\/\/\*)/.test(manifest.content_security_policy.extension_pages.replace('http://127.0.0.1:*','')),'No wildcard host may be contacted.');assert.deepEqual(manifest.permissions,['contextMenus','nativeMessaging','storage']);assert.equal(manifest.host_permissions,undefined);assert.deepEqual(manifest.optional_host_permissions,['http://127.0.0.1/*']);for(const file of ['vendor/changelog.js','vendor/provenance.js'])assert.ok(receipt.files.some(row=>row.path===file&&row.sha256.length===64),file);const changelog=(await import(pathToFileURL(path.join(destination,'stage/vendor/changelog.js')).href)).default;assert.equal(changelog.schemaVersion,1);assert.ok(changelog.entries.length>0&&changelog.entries[0].title&&Array.isArray(changelog.entries[0].items));const provenance=(await import(pathToFileURL(path.join(destination,'stage/vendor/provenance.js')).href)).default;assert.equal(provenance.version,manifest.version);assert.ok(provenance.sourceCommit===null||/^[0-9a-f]{40}$/.test(provenance.sourceCommit));assert.ok([true,false,null].includes(provenance.sourceModified));assert.ok(!Number.isNaN(Date.parse(provenance.stagedAtUtc)));});
test('changelog parsing keeps release entries, items and the Cantonese summary',()=>{const entries=changelogEntries('# First, 2026-10-14\r\n\r\n- One\n- Two\n\n第一個\n## Older - 2026-10-01\n- Three');assert.deepEqual(entries,[{title:'First',date:'2026-10-14',items:['One','Two'],yue:'第一個'},{title:'Older',date:'2026-10-01',items:['Three'],yue:''}]);});
test('manifest icons are staged as small PNG files at the required sizes',async t=>{const destination=await fs.mkdtemp(path.join(os.tmpdir(),'extension-icons-'));t.after(()=>fs.rm(destination,{recursive:true,force:true}));const receipt=await stageBrowserExtension({root:process.cwd(),destination:path.join(destination,'stage'),compile:async({entry,output})=>fs.writeFile(output,entry.endsWith('search-entry.js')?'new URL("./regex-worker.js",import.meta.url);':'self.onmessage=()=>{};')});const manifest=JSON.parse(await fs.readFile(path.join(destination,'stage/manifest.json'),'utf8'));assert.deepEqual(Object.keys(manifest.icons),['16','32','48','128']);for(const [size,icon] of Object.entries(manifest.icons)){const bytes=await fs.readFile(path.join(destination,'stage',icon));assert.equal(bytes.readUInt32BE(0),0x89504e47);assert.equal(bytes.readUInt32BE(16),Number(size));assert.ok(receipt.files.some(row=>row.path===icon));}});
test('extension staging rejects icons outside the icon folder',async t=>{const{root,manifest,compile}=await fixture(t);await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify({...manifest,icons:{16:'../secret.png'}}));await assert.rejects(stageBrowserExtension({root,compile}),/Unsupported extension icon path/);});
test('extension staging allows only the optional loopback host permission and no required host access', async t => {
  const {root, manifest, compile} = await fixture(t);
  const write = extra => fs.writeFile(path.join(root, 'browser-extension/manifest.json'), JSON.stringify({...manifest, ...extra}));
  for (const extra of [{optional_host_permissions: ['<all_urls>']}, {optional_host_permissions: ['http://127.0.0.1/*', 'https://example.com/*']}, {optional_host_permissions: ['http://localhost/*']}, {host_permissions: ['http://127.0.0.1/*']}]) {
    await write(extra);
    await assert.rejects(stageBrowserExtension({root, compile}), /permissions or entrypoints/, JSON.stringify(extra));
  }
  await write({optional_host_permissions: ['http://127.0.0.1/*']});
  const receipt = await stageBrowserExtension({root, compile, destination: path.join(root, 'out/loopback')});
  const staged = JSON.parse(await fs.readFile(path.join(root, 'out/loopback/manifest.json'), 'utf8'));
  assert.deepEqual(staged.optional_host_permissions, ['http://127.0.0.1/*']);
  assert.ok(staged.content_security_policy.extension_pages.includes('http://127.0.0.1:*'));
  assert.equal(receipt.signature, 'not-produced');
});

// Feature coverage record generated from the inventory at build time.
const fakeCompile = async ({entry, output}) => fs.writeFile(output, entry.endsWith('search-entry.js') ? 'new URL("./regex-worker.js",import.meta.url);' : 'self.onmessage=()=>{};');
const inventoryPath = new URL('../contracts/feature-delivery.json', import.meta.url);

test('the staged coverage module lists every extension inventory row with its verdicts and a bounded reason', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-coverage-'));
  t.after(() => fs.rm(destination, {recursive: true, force: true}));
  const receipt = await stageBrowserExtension({root: process.cwd(), destination: path.join(destination, 'stage'), compile: fakeCompile});
  assert.ok(receipt.files.some(row => row.path === 'vendor/coverage.js' && row.sha256.length === 64));
  assert.ok(receipt.files.some(row => row.path === 'release-code-name.js' && row.sha256.length === 64));
  assert.ok(receipt.sourceFiles.some(row => row.path === 'contracts/feature-delivery.json' && row.sha256.length === 64));
  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  const expected = inventory.features.filter(row => row.surface === 'extension');
  const coverage = (await import(pathToFileURL(path.join(destination, 'stage/vendor/coverage.js')).href)).default;
  assert.equal(coverage.schemaVersion, 1);
  assert.equal(coverage.total, expected.length);
  assert.deepEqual(coverage.rows.map(row => row.id).sort(), expected.map(row => row.id).sort());
  assert.equal(Object.values(coverage.counts).reduce((sum, value) => sum + value, 0), expected.length);
  assert.deepEqual(coverage.extensionTargets.map(target => target.id).sort(), inventory.extensionTargets.map(target => target.id).sort());
  for (const row of coverage.rows) {
    const original = expected.find(item => item.id === row.id);
    assert.deepEqual(Object.keys(row).sort(), ['behaviorVerdict', 'evidenceVerdict', 'id', 'reason', 'status']);
    assert.equal(row.status, original.status);
    assert.equal(row.behaviorVerdict, original.behaviorVerdict);
    assert.equal(row.evidenceVerdict, original.evidenceVerdict);
    assert.equal(row.reason, boundedReason(original.reason));
    assert.ok(row.reason.length <= 240);
    if (original.reason.length > 240) assert.ok(row.reason.endsWith('…'), 'a shortened reason shows an ellipsis');
    else assert.equal(row.reason, original.reason);
  }
  assert.ok(coverage.sourceCommit === null || /^[0-9a-f]{40}$/.test(coverage.sourceCommit));
});

test('a completion claim without evidence makes the build fail and leaves nothing staged', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-coverage-claim-'));
  t.after(() => fs.rm(destination, {recursive: true, force: true}));
  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  const row = inventory.features.find(item => item.surface === 'extension');
  Object.assign(row, {status: 'implemented', evidence: [], builtInteraction: 'unverified', visualEvidence: 'unverified'});
  assert.throws(() => extensionCoverage(inventory, null), /Unsupported completion claim/);
  await assert.rejects(stageBrowserExtension({root: process.cwd(), destination: path.join(destination, 'stage'), compile: fakeCompile, inventory}), /Unsupported completion claim/);
  await assert.rejects(fs.lstat(path.join(destination, 'stage')), {code: 'ENOENT'});
});

test('each missing piece of evidence is reported, and an honest unverified inventory is accepted', async () => {
  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  assert.doesNotThrow(() => extensionCoverage(inventory, null));
  const claim = overrides => ({...inventory, features: inventory.features.map((item, index) => index === inventory.features.findIndex(other => other.surface === 'extension') ? {...item, status: 'implemented', evidence: ['test/a.js'], builtInteraction: 'verified', visualEvidence: 'verified', behaviorVerdict: 'present', evidenceVerdict: 'verified', ...overrides} : item)});
  assert.doesNotThrow(() => extensionCoverage(claim({}), null));
  assert.throws(() => extensionCoverage(claim({evidence: []}), null), /without evidence files/);
  assert.throws(() => extensionCoverage(claim({builtInteraction: 'unverified'}), null), /built and visual/);
  assert.throws(() => extensionCoverage(claim({visualEvidence: 'unverified'}), null), /built and visual/);
  assert.throws(() => extensionCoverage(claim({behaviorVerdict: 'partial'}), null), /behavior verdict is partial/);
  assert.throws(() => extensionCoverage(claim({evidenceVerdict: 'current-runtime-unverified'}), null), /runtime is unverified/);
  assert.throws(() => extensionCoverage({features: [], extensionTargets: []}, null), /no extension rows/);
  assert.throws(() => extensionCoverage(null, null), /unavailable/);
});
test('staged manifest keeps the reviewed key and a mismatched key is rejected',async t=>{
 const identity=JSON.parse(await fs.readFile(new URL('../browser-extension/reviewed-identity.json',import.meta.url),'utf8'));
 const{root,manifest,compile}=await fixture(t);await fs.writeFile(path.join(root,'browser-extension/reviewed-identity.json'),JSON.stringify(identity));
 await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify({...manifest,key:identity.publicKeyDerBase64}));
 const destination=path.join(root,'out/browser-extension');await stageBrowserExtension({root,compile,destination});
 assert.equal(JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8')).key,identity.publicKeyDerBase64);
 await fs.writeFile(path.join(root,'browser-extension/manifest.json'),JSON.stringify({...manifest,key:Buffer.from('other').toString('base64')}));
 await assert.rejects(stageBrowserExtension({root,compile,destination:path.join(root,'out/second')}),/reviewed extension identity/);
});
