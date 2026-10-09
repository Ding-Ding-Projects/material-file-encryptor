# Preview delivery

Every push and manual Windows workflow run builds through `build.bat /s`, then packages through `build-installer.bat /s`. These production commands run no tests or lint. The genuine unsigned Squirrel.Windows output contains Setup.exe, RELEASES, one full package, and any generated delta packages.

The same job publishes one non-draft prerelease named `v0.1.0-preview.<run_number>.<run_attempt>`. It checks package names, RELEASES SHA-1 and byte counts, unsigned Setup status, and the tracked dim sum image before publication. Publication uses the GitHub CLI, refuses an existing tag or release, binds the tag to the source commit, and downloads every attached asset to compare SHA-256. An upload or verification failure leaves a failed job and preserves safe evidence; existing releases are never overwritten.

`release-output/build-provenance.json` records source, package version, run identity, UTC start/completion times, asset hashes and sizes. Runtime validation is explicitly pending an independent local receipt. Production success is not a claim about tests, GUI behavior, installer execution, driver mounting, or updater behavior. The retired manual promotion workflow never publishes.

## Independent local verification

After building, run `powershell -NoProfile -File scripts/verify-local.ps1` for native, mounted-filesystem, unit and packaged desktop checks. Driver installation is opt-in with `-InstallDriver` and requires native administrator consent.

Installer verification is separate. On the required hidden desktop, with an exact clean commit and fresh current-user destination, invoke:

```powershell
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Mode Snapshot -Local -ExpectedCommit <40-character-source-commit>
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Local -ExpectedCommit <40-character-source-commit>
```

The verifier does not change LOCALAPPDATA or pretend to run in CI. It requires the matching packaged desktop receipt, compares selected package/installed bytes, refuses preexisting install roots, application processes and registration, and inspects both current-user registry views. It waits up to 30 seconds for Squirrel registration. Safe diagnostics identify the view, key and matching fields without copying unrelated registration data. Only the exact hash-verified updater can uninstall the owned fresh installation after graceful application cleanup. Existing credential data remains independent. The actual install and UI drive must occur through the supported hidden-desktop route.

## Dependency and scope notes

Bootstrap supplies pinned Node, .NET and WinFsp plus complete verified portable MinGit and GitHub CLI distributions. The runtime tool ZIPs are checked against pinned SHA-256, every extracted file is compared with its archive, and executable versions are checked using absolute paths. Existing valid caches are reused; replacement preserves the previous cache. No administrator rights or installed system Git are required. No signing credential or paid certificate is required. `build.bat` stages complete tool trees and included notices under `out/tools/git` and `out/tools/gh` before application packaging. Bootstrap exports absolute `MFE_GIT_EXECUTABLE` and `MFE_GH_EXECUTABLE` paths for local native verification. Packaged resource resolution and transport behavior remain independently verified by their owning implementation. `scripts/bootstrap.ps1 -RuntimeToolsOnly` activates and validates only these two portable tools without building the application.

## Archive-integrity repair

Squirrel 2.0.1's bundled official 7-Zip 16.04 produced incorrect ZIP CRC metadata for a 246,302,720-byte application executable on the observed build host. The original package and two bounded recompression cases had identical decompressed executable bytes but incorrect CRC fields. The tool's direct CRC command returned the correct value. An independent modern 26.03 compression preserved the same bytes and correct CRC.

The supported installer entrypoint now obtains official pinned 7-Zip 26.03 `7zr.exe` and the portable extra archive. It verifies their SHA-256 and the extracted x64 standalone `7za.exe` and license, reuses valid caches, and preserves replaced caches. It copies the lockfile-installed Squirrel vendor directory to an isolated build-tool directory and replaces only `7z-x64.exe` with that verified standalone archiver before Squirrel creates the installer. No generated package is patched afterward, and no machine-wide installation is required.

`scripts/verify-package-crc.ps1` independently parses ZIP directory/local CRC metadata and streams every package entry to check its actual CRC-32 and uncompressed byte length. It rejects unsupported layouts, unsafe or duplicate names, mismatched entry inventory, and CRC errors. `build-installer.bat` propagates this packaging validation failure. Publication repeats the same validation before attaching any package. These are archive-integrity checks, not runtime tests or lint.

Run the focused local regression with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .github/scripts/test-package-crc.ps1
```

It proves pinned modern archive creation, byte-exact round trip, acceptance of valid complete CRC metadata, rejection after deliberate CRC corruption, and restored acceptance. It is not a CI test step.

The older diagnostic Setup with SHA-256 `8b34f53d55d045bd92c29432e6577d5076bdda042e33e65a8380f518d025398d` created the expected current-user uninstall registration in both registry views. That run did not reproduce the older missing-registration failure. All 643 installed payload entries matched their decompressed package bytes, but the package had a genuine executable CRC mismatch and is not accepted. Setup's root process exited before its exit code could be read. Genuine uninstall removed both registrations and left no installed processes, while retaining the dead-install root and two version-directory files. Complete removal and the setup/uninstall exit codes remain unverified; no manual root deletion was used.
