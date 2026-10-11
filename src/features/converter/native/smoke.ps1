param([ValidateSet('containment','child','memory','storage','cancel','timeout')][string]$Mode = 'containment')
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'bin/Release/net8.0-windows/ConverterSandbox.exe'
if (-not (Test-Path -LiteralPath $launcher)) { throw 'Build ConverterSandbox before running the smoke test.' }
$root = Join-Path ([IO.Path]::GetTempPath()) ('converter-smoke-' + [Guid]::NewGuid().ToString('N'))
$outside = Join-Path ([IO.Path]::GetTempPath()) ('converter-private-' + [Guid]::NewGuid().ToString('N') + '.txt')
New-Item -ItemType Directory -Path (Join-Path $root 'payload'), (Join-Path $root 'work') | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$connect = [Net.Sockets.TcpClient]::new()
$connect.Connect([Net.IPAddress]::Loopback, $listener.LocalEndpoint.Port)
$connect.Dispose()
$cancelJob = $null
try {
    Copy-Item -LiteralPath (Get-Command node).Source -Destination (Join-Path $root 'payload/node.exe')
    [IO.File]::WriteAllText($outside, 'private')
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($owner, 'FullControl', 'Allow'))
    Set-Acl -LiteralPath $outside -AclObject $acl
    $worker = @'
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
const arg = key => process.argv[process.argv.indexOf(key)+1];
const request = JSON.parse(fs.readFileSync(arg('--request'),'utf8'));
const progress = text => fs.writeFileSync(path.join(path.dirname(arg('--result')),'progress.txt'),text);
progress('started');
if(request.mode === 'timeout' || request.mode === 'cancel') { setInterval(()=>{},1000); await new Promise(()=>{}); }
if(request.mode === 'memory') { const chunks=[]; for(;;) chunks.push(Buffer.alloc(64*1024*1024,0x41)); }
if(request.mode === 'storage') { const fd=fs.openSync(path.join(path.dirname(arg('--result')),'oversized.bin'),'w'); const chunk=Buffer.alloc(1024*1024); for(let i=0;i<300;i++) fs.writeSync(fd,chunk); fs.closeSync(fd); }
let outsideDenied = false, payloadDenied = false;
try { fs.readFileSync(request.outside); } catch(error) { outsideDenied = error.code === 'EACCES' || error.code === 'EPERM'; }
try { fs.writeFileSync(path.join(path.dirname(process.argv[1]),'forbidden.txt'),'no'); } catch(error) { payloadDenied = error.code === 'EACCES' || error.code === 'EPERM'; }
progress('file-denials-complete');
let childDenied = true;
if(request.mode === 'child') childDenied = await new Promise(resolve => {
 const child = spawn(process.execPath,['-e',`require('fs').writeFileSync(${JSON.stringify(path.join(path.dirname(arg('--result')),'child-executed.txt'))},'executed')`]);
 const timer = setTimeout(()=>{child.kill();resolve(false)},2000);
 child.once('error',()=>{clearTimeout(timer);resolve(true)});
 child.once('exit',code=>{clearTimeout(timer);resolve(code !== 0)});
});
progress('child-probe-complete');
let networkStatus;
const networkDenied = await new Promise(resolve => {
 const socket = net.connect({host:'127.0.0.1',port:request.port});
 socket.once('connect',()=>{networkStatus='connected';socket.destroy();resolve(false)});
 socket.once('error',error=>{networkStatus=error.code;resolve(['EACCES','EPERM','ECONNREFUSED','ENETUNREACH','ETIMEDOUT'].includes(error.code))});
 socket.setTimeout(3000,()=>{networkStatus='timeout';socket.destroy();resolve(true)});
});
fs.writeFileSync(arg('--result'),JSON.stringify({nonce:arg('--nonce'),outsideDenied,payloadDenied,childDenied,networkDenied,networkStatus,converted:Buffer.from([65]).toString('hex')}));
progress('finished');
'@
    [IO.File]::WriteAllText((Join-Path $root 'payload/worker.mjs'), $worker)
    [IO.File]::WriteAllText((Join-Path $root 'work/request.json'), (@{outside=$outside;port=$listener.LocalEndpoint.Port;mode=$Mode}|ConvertTo-Json -Compress))
    $nonce = [Guid]::NewGuid().ToString('N')
    $manifest = @{ schema=1;nonce=$nonce;runtime=(Join-Path $root 'payload/node.exe');worker=(Join-Path $root 'payload/worker.mjs');directory=$root;timeoutMs=30000;memoryBytes=268435456 }
    $manifestPath = Join-Path $root 'manifest.json'
    [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Compress))
    if ($Mode -eq 'cancel') { $cancelJob = Start-Job -ArgumentList (Join-Path $root 'work/cancel.signal') -ScriptBlock { param($signal); Start-Sleep -Seconds 2; [IO.File]::WriteAllText($signal,'cancel') } }
    $output = & $launcher --request $manifestPath
    $exit = $LASTEXITCODE
    $output
    $receipt = $output | ConvertFrom-Json
    $connect = [Net.Sockets.TcpClient]::new()
    $connect.Connect([Net.IPAddress]::Loopback, $listener.LocalEndpoint.Port)
    $connect.Dispose()
    if (-not $receipt.profileDeleted -or -not $receipt.appContainerVerified -or $receipt.capabilityCount -ne 0) { throw 'Token or profile cleanup was not verified.' }
    if ($Mode -ne 'containment') {
        $passed = $exit -ne 0
        if ($Mode -eq 'child') { $passed = $passed -and $receipt.timedOut -and $receipt.activeProcessLimit -eq 1 -and (Get-Content -Raw -LiteralPath (Join-Path $root 'work/progress.txt')) -eq 'file-denials-complete' -and -not (Test-Path -LiteralPath (Join-Path $root 'work/child-executed.txt')) }
        if ($Mode -eq 'memory') { $passed = $passed -and (Get-Content -Raw -LiteralPath (Join-Path $root 'work/progress.txt')) -eq 'started' -and $receipt.memoryBytes -eq 268435456 }
        if ($Mode -eq 'timeout') { $passed = $passed -and $receipt.timedOut }
        if ($Mode -eq 'cancel') { $passed = $passed -and $receipt.cancelled }
        if ($Mode -eq 'storage') { $passed = $passed -and $receipt.killedForStorage }
        if (-not $passed) { throw "Expected resource boundary was not observed: $Mode" }
        "PASS: $Mode boundary and profile cleanup."
        return
    }
    if ($exit -ne 0) { if (Test-Path -LiteralPath (Join-Path $root 'work/worker.log')) { Get-Content -LiteralPath (Join-Path $root 'work/worker.log') }; throw "Launcher exited $exit" }
    $result = Get-Content -Raw -LiteralPath (Join-Path $root 'work/result.json') | ConvertFrom-Json
    if (-not $receipt.isolated -or $receipt.nonce -ne $nonce -or $result.nonce -ne $nonce -or -not $result.outsideDenied -or -not $result.payloadDenied -or -not $result.childDenied -or -not $result.networkDenied -or $result.converted -ne '41') { throw ('Containment verification failed: ' + ($result | ConvertTo-Json -Compress)) }
    if ((Get-FileHash -LiteralPath (Join-Path $root 'work/result.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.resultSha256) { throw 'Receipt hash mismatch.' }
    'PASS: conversion, external path denial, read-only payload, network denial, nonce and hash.'
} finally {
    if ($cancelJob) { $cancelJob | Wait-Job | Remove-Job }
    $listener.Stop()
    $resolved = [IO.Path]::GetFullPath($root)
    $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved)).StartsWith('converter-smoke-')) { throw 'Cleanup path validation failed.' }
    Remove-Item -LiteralPath $root -Recurse -Force
    Remove-Item -LiteralPath $outside -Force
}
