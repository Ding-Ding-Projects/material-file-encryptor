# Installer extraction and update version repair

## Verified dependency downloads and cloud diagnostics

The build bootstrap retains the pinned .NET SDK 8.0.425 SHA-512 and declares one additional official HTTPS source for those same bytes. Each distinct declared source gets one bounded attempt. Downloads use exclusive temporary files, full-file hash verification and no-overwrite publication. Rejected or partial bytes and bounded digest/length/status receipts are retained outside source. GitHub Actions uploads that diagnostic directory separately with 14-day retention, including unsuccessful builds. Receipts exclude headers, exception text and credentials.

Independent Windows PowerShell consumer checks cover valid and invalid caches, replacement between initial digest and atomic claim, concurrent valid and invalid restoration destinations, and three actual junction negatives. Valid concurrent bytes are accepted without transport; invalid destinations remain untouched and the valid claim is retained. Pathname checks do not prove protection against actively malicious ancestor replacement. Real HTTPS deadline behavior and production download delivery require their own cloud result.

Main 617320a failed cloud run 38122215467 at SDK digest verification before compilation. The pinned expected value matches official metadata and the valid local cache; the rejected cloud bytes were removed by the old downloader, so their exact corruption cause is unknown. No checksum was weakened, and this correction is not an installed-update verdict.


The independently downloaded v1.122.1 Setup returned zero and registered version 0.2.0, but its Squirrel extractor omitted 585 of 663 payload files. The first missing content was the embedded FFmpeg corresponding-source ZIP, created at zero bytes. Later files, including the V8 snapshot, were absent. Installed launch recorded `Error loading V8 startup snapshot file`; no Start-menu shortcut was created. Archive CRC success did not detect this forward-reader compatibility problem.

The exact shipped updater reproduces the problem with an incompressible nested ZIP followed by a required file. The pinned writer can still select Store when Deflate is requested. The shared .NET ZipArchive helper therefore streams every entry using optimal compression, preserving names, order, timestamps and contents. `scripts/repair-squirrel-compression.ps1` updates the package index and invokes Squirrel's supported existing-full-package route to assemble Setup. Original generated outputs are retained. The installer framework remains unchanged.

`scripts/squirrel-payload-check.ps1` uses the updater's actual extraction method and compares every payload file's length and SHA-256 with the package. Production also validates the package's specification, embedded application version and embedded source metadata. The negative regression must reject the broken stored archive and accept the corrected archive. Its extraction directories are retained for diagnostics. A passing extraction check remains separate from installed launch, update and removal acceptance.

The PE-resource reader verifies Setup contains the exact corrected full package, updater and release-feed values without executing Setup. File existence or exit zero alone cannot pass this check. A timed-out reassembly leaves output quarantined until the exact root process and its descendants have settled.

Automatic releases previously changed their tags while every Squirrel package stayed at version 0.2.0. Installed clients correctly considered those packages current. Production now derives package version `1.<workflow run number>.<attempt>` before both root build entrypoints, stamps the manifest and lockfile consistently, and checks the actual uploaded package against that identity. Release selection uses the host's semantic-version selection rather than forcing every completing run to latest. Package downloads have a separate 15-minute deadline; metadata retains its 30-second deadline. Hash, size, redirect and explicit restart protections remain enforced.

Use `build.bat /s` and `build-installer.bat /s`. Packaging uses the existing .NET runtime and genuine Squirrel executables. A compiled adapter was rejected by local Application Control and is no longer required; no security setting is changed. Fresh-machine bootstrap certification, corrective downloaded installation and a real installed update remain pending until recorded separately.

Local checks: `node --test test/release-version.test.js test/update-service.test.js` and `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-squirrel-extraction.ps1`. CI produces packages and performs deterministic package validation; it runs no tests or lint.
