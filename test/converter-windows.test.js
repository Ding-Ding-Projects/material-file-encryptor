import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createWindowsSandboxProvider } from '../src/features/converter/windows-sandbox.mjs';
const executable=path.resolve('src/features/converter/native/bin/Release/net8.0-windows/ConverterSandbox.exe');
const available=process.platform==='win32'&&await fs.access(executable).then(()=>true,()=>false);
const companions=async()=>Object.fromEntries(await Promise.all(['.dll','.runtimeconfig.json','.deps.json'].map(async suffix=>{const p=executable.slice(0,-4)+suffix;return[path.basename(p),await hash(p)];})));
const hash=async filename=>createHash('sha256').update(await fs.readFile(filename)).digest('hex');
test('native provider validates a real isolated probe and PDF result',{skip:!available},async()=>{
 const provider=await createWindowsSandboxProvider({launcherPath:executable,launcherCompanionHashes:await companions(),launcherSha256:await hash(executable),runtimePath:process.execPath,runtimeSha256:await hash(process.execPath)});
 assert.equal(provider.verifiedOsIsolation,true);
 const document=await PDFDocument.create();document.addPage([200,400]);const source=await document.save();
 const result=await provider.launch({inputs:[source],adapterId:'pdf-rotate',options:{rotation:90}}).result;
 const output=await PDFDocument.load(result.outputs[0].bytes);assert.equal(output.getPage(0).getRotation().angle,90);assert.equal(output.getPageCount(),1);
});
test('native provider rejects executable hash mismatch',{skip:!available},async()=>{
 await assert.rejects(createWindowsSandboxProvider({launcherPath:executable,launcherCompanionHashes:await companions(),launcherSha256:'0'.repeat(64),runtimePath:process.execPath,runtimeSha256:await hash(process.execPath)}),/verification/);
});

test('native provider rejects omitted companion hashes',{skip:!available},async()=>{
 await assert.rejects(createWindowsSandboxProvider({launcherPath:executable,launcherSha256:await hash(executable),runtimePath:process.execPath,runtimeSha256:await hash(process.execPath)}),/companion verification/);
});
