import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('real vendor auxiliary icon resources survive branding while embedded setup payload stays exact',{skip:process.platform!=='win32'},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-setup-resources-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const quote=value=>`'${value.replaceAll("'","''")}'`;
 const vendor=path.resolve(process.env.MFE_SQUIRREL_TEST_VENDOR||'node_modules/electron-winstaller/vendor');
 const script=path.join(root,'test.ps1');
 await fs.writeFile(script,`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
. ${quote(path.resolve('scripts/squirrel-file-hash.ps1'))}
$root=${quote(root)};$vendor=${quote(vendor)};$icon=${quote(path.resolve('assets/branding/app.ico'))}
$setup=Join-Path $root 'Setup.exe';$pristine=Join-Path $vendor 'Setup.exe'
$pristineHash=(Get-SquirrelFileHash -LiteralPath $pristine).Hash
Copy-Item -LiteralPath $pristine -Destination $setup
& (Join-Path $vendor 'rcedit.exe') $setup --set-icon $icon
if($LASTEXITCODE -ne 0){throw 'FIXTURE_BRANDING_FAILED'}
$package=Join-Path $root 'MaterialFileEncryptor-1.2.3-full.nupkg';[IO.File]::WriteAllText($package,'synthetic package')
$releases=Join-Path $root 'RELEASES';$line=(Get-SquirrelFileHash -LiteralPath $package -Algorithm SHA1).Hash.ToLowerInvariant()+' '+[IO.Path]::GetFileName($package)+' '+(Get-Item $package).Length
[IO.File]::WriteAllText($releases,$line,[Text.UTF8Encoding]::new($false))
$zipPath=Join-Path $root 'embedded.zip';$zip=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
try{foreach($row in @(@{source=$package;name=[IO.Path]::GetFileName($package)},@{source=$releases;name='RELEASES'},@{source=(Join-Path $vendor 'Squirrel.exe');name='Update.exe'},@{source=$icon;name='setupIcon.ico'})){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$row.source,$row.name)}}finally{$zip.Dispose()}
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;using System.IO;
public static class FixturePayload {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr BeginUpdateResource(string p,bool d);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool UpdateResource(IntPtr h,string t,IntPtr n,ushort l,byte[] b,uint s);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool EndUpdateResource(IntPtr h,bool d);
 public static void Write(string p,byte[] b){var h=BeginUpdateResource(p,false);if(h==IntPtr.Zero)throw new Exception("FIXTURE_OPEN_FAILED");if(!UpdateResource(h,"DATA",new IntPtr(131),1033,b,(uint)b.Length)){EndUpdateResource(h,true);throw new Exception("FIXTURE_WRITE_FAILED");}if(!EndUpdateResource(h,false))throw new Exception("FIXTURE_COMMIT_FAILED");}
}
"@
[FixturePayload]::Write($setup,[IO.File]::ReadAllBytes($zipPath))
$repair=${quote(path.resolve('scripts/repair-squirrel-setup-icons.ps1'))}
$check=${quote(path.resolve('scripts/squirrel-setup-check.ps1'))}
$rejected=$false
try{& $repair -Setup $setup -VendorSetup $pristine -Icon $icon -CheckOnly}catch{if($_.Exception.Message -notmatch 'SETUP_ICON_RESOURCE_MISMATCH|SETUP_AUXILIARY_LENGTH_MISMATCH'){throw};$rejected=$true}
if(!$rejected){throw 'ORIGINAL_COLLISION_NOT_REJECTED'}
$before=Join-Path $root 'before.json';$after=Join-Path $root 'after.json'
& $check -Setup $setup -Package $package -Updater (Join-Path $vendor 'Squirrel.exe') -SetupIcon $icon -ReleaseIndex $releases -ReceiptPath $before
& $repair -Setup $setup -VendorSetup $pristine -Icon $icon | Out-Null
& $repair -Setup $setup -VendorSetup $pristine -Icon $icon -CheckOnly | Out-Null
& $check -Setup $setup -Package $package -Updater (Join-Path $vendor 'Squirrel.exe') -SetupIcon $icon -ReleaseIndex $releases -ReceiptPath $after
if((Get-Content $before -Raw|ConvertFrom-Json).embeddedZipSha256 -cne (Get-Content $after -Raw|ConvertFrom-Json).embeddedZipSha256){throw 'PAYLOAD_CHANGED'}
if((Get-SquirrelFileHash -LiteralPath $pristine).Hash -cne $pristineHash){throw 'PRISTINE_VENDOR_CHANGED'}
if((Get-AuthenticodeSignature -LiteralPath $setup).Status -ne 'NotSigned'){throw 'RESULT_NOT_UNSIGNED'}
`);
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{stdio:'pipe'});
 const caller=await fs.readFile('scripts/repair-squirrel-compression.ps1','utf8');
 assert.ok(caller.indexOf('repair-squirrel-setup-icons.ps1')<caller.indexOf('squirrel-setup-check.ps1'));
});
