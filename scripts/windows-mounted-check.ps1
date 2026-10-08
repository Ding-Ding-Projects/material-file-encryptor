$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($env:OS -ne 'Windows_NT') { throw 'A real Windows runner is required for mounted-drive verification.' }
New-Item -ItemType Directory -Force out/evidence | Out-Null
& .\out\native\MaterialFileEncryptor.Host.exe --self-test | Tee-Object -FilePath out/evidence/mounted-filesystem.json
if ($LASTEXITCODE -ne 0) { throw "Mounted filesystem verification failed: $LASTEXITCODE" }
