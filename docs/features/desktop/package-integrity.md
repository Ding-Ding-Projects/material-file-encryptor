# Package integrity and local installer verification

`build-installer.bat /s` bootstraps official 7-Zip 26.04 from the upstream release, verifies the archive, extraction helper and x64 standalone executable against `dependencies.json`, and stages the existing Squirrel.Windows vendor distribution. The supported `vendorDirectory` option selects that distribution with its legacy ZIP writer replaced by the verified standalone writer. Squirrel's updater and setup components remain unchanged and unsigned.

After production, `scripts/package-integrity.ps1` runs the pinned reader's archive test over every full and delta `.nupkg`. It verifies decompression and stored CRC for every entry, including entries outside the runtime comparison manifest. Failure prevents successful packaging and preview publication. The receipt records the reader digest, source commit and each package's digest, size, entry count and exit result. Selected runtime hashes and `RELEASES` hashes remain separate checks.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-package-integrity.ps1` for the focused regression. A valid archive passes; corruption in an otherwise unselected entry must fail. The test removes only its exact synthetic files.

Local installer verification requires `MFE_LOWLEVEL_CLI` pointing to the installed cheap hidden-desktop tool and its installed lifecycle helper. `windows-installer-check.ps1 -Local -ExpectedCommit <full-sha>` uses `local-installer-process.py` for Setup and Update. A Python worker launched through Lowlevel inherits the unique hidden desktop, retains the child process handle and records its creation time and exit result. The parent records process identities, waits for their absence, and closes only the empty owned desktop. Timeouts retain evidence and running processes rather than terminating installation.

The installed desktop check uses `local-headless-desktop-check.mjs` and the same independently reviewed capture and mounted-runtime flow as local packaged verification. Interactive pixel review remains required. Installation, startup registration, mounted operation, normal exit and uninstall require their own successful receipt; packaging success proves none of those outcomes. Uninstall records every remaining installation-root entry, including any Squirrel marker or log, instead of claiming the directory disappeared.

Preview notes link the verified public dim-sum catalog release image. The product release does not attach a copied catalog image. Publication rechecks package integrity before writing its release plan. Existing source-owned image files are retained until separately authorized migration.

## Explicit preview publication

Every push to `main` still builds and packages, but it does not publish a release. After independent local verdicts accept the final integrated `main` candidate, the release owner dispatches `windows.yml` exactly once with its full source SHA:

```powershell
gh workflow run windows.yml --repo Ding-Ding-Projects/material-file-encryptor --ref main -f source_commit=<accepted-full-sha>
```

The workflow checks the supplied SHA against its checkout and event SHA before building. A moved baseline fails with `PUBLICATION_SOURCE_CHANGED`; verify the new candidate before another dispatch. The main-only job condition, pinned hosted builder and unsigned Squirrel path remain in force. CI performs build and packaging without tests or lint. The existing publisher creates a unique tag and reads published assets back; it never overwrites a release. Documentation and evidence pushes therefore cannot accidentally publish another preview.
