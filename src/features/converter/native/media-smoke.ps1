param([Parameter(Mandatory=$true)][string]$BinaryDirectory)
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'bin/Release/net8.0-windows/ConverterSandbox.exe'
$ffmpeg = Join-Path $BinaryDirectory 'ffmpeg.exe'
$ffprobe = Join-Path $BinaryDirectory 'ffprobe.exe'
if ((Get-FileHash -LiteralPath $ffmpeg -Algorithm SHA256).Hash.ToLowerInvariant() -ne '3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec' -or (Get-FileHash -LiteralPath $ffprobe -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52') { throw 'Pinned media executable verification failed.' }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('converter-media-fixtures-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$script:passed = 0
function Invoke-Media([string]$Operation, [byte[]]$InputBytes, [bool]$Reject=$false) {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('converter-media-smoke-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $root 'payload'), (Join-Path $root 'work') | Out-Null
    try {
        $runtime = if($Operation -eq 'probe') { $ffprobe } else { $ffmpeg }
        $staged = Join-Path $root ('payload/' + (Split-Path $runtime -Leaf))
        Copy-Item -LiteralPath $runtime -Destination $staged
        [IO.File]::WriteAllBytes((Join-Path $root 'work/input-0.bin'),$InputBytes)
        $nonce = [Guid]::NewGuid().ToString('N')
        $manifest = @{schema=1;nonce=$nonce;runtime=$staged;directory=$root;timeoutMs=30000;memoryBytes=268435456;media=@{operation=$Operation}}
        $manifestPath = Join-Path $root 'manifest.json'
        [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Compress))
        $raw = & $launcher --request $manifestPath
        $exit = $LASTEXITCODE
        $receipt = $raw | ConvertFrom-Json
        if($Reject) {
            if($exit -eq 0) { throw "Expected rejection: $Operation" }
            if($receipt.isolated -and -not $receipt.profileDeleted) { throw 'Profile cleanup missing.' }
            $script:passed++
            return $null
        }
        if($exit -ne 0) {
            if(Test-Path -LiteralPath (Join-Path $root 'work/worker.log')) { Get-Content -LiteralPath (Join-Path $root 'work/worker.log') | Write-Host }
            throw "Media $Operation failed: $raw"
        }
        if(-not $receipt.appContainerVerified -or -not $receipt.jobLimitsVerified -or -not $receipt.profileDeleted -or $receipt.nonce -ne $nonce) { throw 'Invalid native receipt.' }
        $resultPath=Join-Path $root 'work/result.json'
        if((Get-FileHash -LiteralPath $resultPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.resultSha256) { throw 'Result hash mismatch.' }
        $result = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
        if($result.schema -ne 1 -or $result.nonce -ne $nonce) { throw 'Invalid result schema or nonce.' }
        $script:passed++
        if($result.outputs.Count -gt 0) {
            $bytes = [IO.File]::ReadAllBytes((Join-Path $root 'work/result-0.bin'))
            if($result.outputs[0].bytes -ne $bytes.Length) { throw 'Output byte count mismatch.' }
            return ,$bytes
        }
        return $result
    } finally {
        $resolved=[IO.Path]::GetFullPath($root)
        if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved)).StartsWith('converter-media-smoke-')) { throw 'Unsafe cleanup path.' }
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
try {
    $png=Join-Path $fixtureRoot 'fixture.png'
    $wav=Join-Path $fixtureRoot 'fixture.wav'
    $mp4=Join-Path $fixtureRoot 'fixture.mp4'
    & $ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i 'color=c=red:s=32x32:d=0.1' -frames:v 1 $png
    if($LASTEXITCODE -ne 0) { throw 'PNG fixture generation failed.' }
    & $ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:duration=0.1' $wav
    if($LASTEXITCODE -ne 0) { throw 'WAV fixture generation failed.' }
    & $ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i 'color=c=blue:s=32x32:d=0.2' -c:v libx264 -pix_fmt yuv420p $mp4
    if($LASTEXITCODE -ne 0) { throw 'MP4 fixture generation failed.' }
    $pngBytes=[IO.File]::ReadAllBytes($png)
    $wavBytes=[IO.File]::ReadAllBytes($wav)
    $probe=Invoke-Media 'probe' $pngBytes
    if($probe.details.streams[0].width -ne 32 -or $probe.details.streams[0].height -ne 32) { throw 'PNG dimensions changed.' }
    foreach($operation in @('image-png','image-jpeg')) {
        $converted=Invoke-Media $operation $pngBytes
        $null=Invoke-Media 'validate' $converted
        $probe=Invoke-Media 'probe' $converted
        if($probe.details.streams[0].width -ne 32 -or $probe.details.streams[0].height -ne 32) { throw 'Image dimensions changed.' }
    }
    foreach($operation in @('audio-wav','audio-flac','audio-mp3')) {
        $converted=Invoke-Media $operation $wavBytes
        $null=Invoke-Media 'validate' $converted
        $probe=Invoke-Media 'probe' $converted
        if($probe.details.streams[0].codec_type -ne 'audio') { throw 'Audio output has no audio stream.' }
    }
    $converted=Invoke-Media 'video-mp4' ([IO.File]::ReadAllBytes($mp4))
    $null=Invoke-Media 'validate' $converted
    $probe=Invoke-Media 'probe' $converted
    if($probe.details.streams[0].width -ne 32 -or $probe.details.streams[0].height -ne 32) { throw 'Video dimensions changed.' }
    $null=Invoke-Media 'unknown-operation' $pngBytes $true
    $playlist=[Text.Encoding]::UTF8.GetBytes("#EXTM3U`n#EXT-X-TARGETDURATION:1`n#EXTINF:1,`nhttp://127.0.0.1:9/forbidden.ts`n#EXT-X-ENDLIST`n")
    $null=Invoke-Media 'probe' $playlist $true
    "PASS: $script:passed native media invocations, image dimensions, decoded outputs, fixed-operation and external-protocol rejection."
} finally {
    $resolved=[IO.Path]::GetFullPath($fixtureRoot)
    if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved)).StartsWith('converter-media-fixtures-')) { throw 'Unsafe fixture cleanup path.' }
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
}
