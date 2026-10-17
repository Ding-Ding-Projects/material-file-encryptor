import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(entries){
  const local=[],central=[];let offset=0;
  for(const [name,bytes]of entries){const n=Buffer.from(name),h=Buffer.alloc(30),c=Buffer.alloc(46),crc=crc32(bytes);
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(h,n,bytes);central.push(c,n);offset+=h.length+n.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
// Minimal non-executable PE resource fixture containing DATA/131/1033.
function setup(entries){const payload=zip(entries),head=Buffer.alloc(512),resource=Buffer.alloc(128);
  head.writeUInt16LE(0x5a4d);head.writeUInt32LE(0x80,0x3c);head.writeUInt32LE(0x4550,0x80);head.writeUInt16LE(1,0x86);head.writeUInt16LE(224,0x94);head.writeUInt16LE(0x10b,0x98);
  head.writeUInt32LE(0x1000,0x108);head.writeUInt32LE(resource.length+payload.length,0x10c);head.writeUInt32LE(0x1000,0x184);head.writeUInt32LE(resource.length+payload.length,0x188);head.writeUInt32LE(512,0x18c);
  resource.writeUInt16LE(1,12);resource.writeUInt32LE(0x80000060,16);resource.writeUInt32LE(0x80000018,20);
  resource.writeUInt16LE(1,38);resource.writeUInt32LE(131,40);resource.writeUInt32LE(0x80000030,44);
  resource.writeUInt16LE(1,62);resource.writeUInt32LE(1033,64);resource.writeUInt32LE(72,68);
  resource.writeUInt32LE(0x1080,72);resource.writeUInt32LE(payload.length,76);resource.writeUInt16LE(4,96);resource.write('DATA',98,'utf16le');return Buffer.concat([head,resource,payload]);
}

test('setup icon payload is optional only by explicit caller contract and exact bytes',{skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-setup-icon-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const name='MaterialFileEncryptor-1.2.3-full.nupkg',packageBytes=Buffer.from('fixture package'),updater=Buffer.from('fixture updater'),icon=Buffer.from('approved fixture icon');
  const release=Buffer.from(`${createHash('sha1').update(packageBytes).digest('hex')} ${name} ${packageBytes.length}\n`);
  for(const [n,b]of [[name,packageBytes],['updater.exe',updater],['icon.ico',icon],['RELEASES',release]])await fs.writeFile(path.join(root,n),b);
  const base=[[name,packageBytes],['RELEASES',release],['Update.exe',updater]],correct=[...base,['setupIcon.ico',icon]];
  const run=async(entries,withIcon=true)=>{await fs.writeFile(path.join(root,'Setup.exe'),setup(entries));return execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/squirrel-setup-check.ps1'),'-Setup',path.join(root,'Setup.exe'),'-Package',path.join(root,name),'-Updater',path.join(root,'updater.exe'),'-ReleaseIndex',path.join(root,'RELEASES'),...(withIcon?['-SetupIcon',path.join(root,'icon.ico')]:[])],{stdio:'pipe'});};
  await run(correct);await run(base,false);
  await assert.rejects(run(base),/SETUP_PAYLOAD_INCOMPLETE/);
  await assert.rejects(run(correct,false),/SETUP_UNEXPECTED_OR_DUPLICATE_ENTRY/);
  await assert.rejects(run([...base,['setupIcon.ico',Buffer.from('wrong___ fixture icon')]]),/SETUP_EMBEDDED_ICON_MISMATCH/);
  await assert.rejects(run([...correct,['setupIcon.ico',icon]]),/SETUP_UNEXPECTED_OR_DUPLICATE_ENTRY/);
  await assert.rejects(run([...correct,['unrelated.ico',icon]]),/SETUP_UNEXPECTED_OR_DUPLICATE_ENTRY/);
});

test('release publisher derives its exact updater and icon independently from the package',async()=>{
  const source=await fs.readFile('.github/scripts/publish-preview.ps1','utf8');
  assert.match(source,/Copy-SquirrelBrandedVendor -Package \$fullPackage.FullName -Icon \$setupIcon/);
  assert.match(source,/squirrel-setup-check.ps1 -Setup \$setup -Package \$fullPackage.FullName -Updater \$brandedUpdater -SetupIcon \$setupIcon -ReleaseIndex \$releases/);
  assert.match(source,/desktop-icons.mjs check/);
  assert.match(source,/squirrel-payload-check.ps1/);
});
