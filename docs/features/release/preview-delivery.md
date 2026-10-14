# Preview delivery

Every push and manual Windows workflow run builds through `build.bat /s`, then packages through `build-installer.bat /s`. These production commands run no tests or lint. The genuine unsigned Squirrel.Windows output contains Setup.exe, RELEASES, one full package, and any generated delta packages.

The same job publishes one normal, non-draft, non-prerelease release named `v1.<run_number>.<run_attempt>`. It checks package names, RELEASES SHA-1 and byte counts, unsigned Setup status, and the tracked dim sum image before publication. Publication uses the GitHub CLI, refuses an existing tag or release, binds the tag to the source commit, and downloads every attached asset to compare SHA-256. An upload or verification failure leaves a failed job and preserves safe evidence; existing releases are never overwritten.

`release-output/build-provenance.json` records source, package version, run identity, UTC start/completion times, asset hashes and sizes. Runtime validation is explicitly pending an independent local receipt. Production success is not a claim about tests, GUI behavior, installer execution, driver mounting, or updater behavior. The retired manual promotion workflow never publishes.

## Independent local verification

### Producer-bound promotion retries

A promotion-only retry retains the original producer tag in `promotion-input.json`; it does not create a tag from the retry attempt. Admission requires the same workflow run number, an original positive attempt no newer than the current execution, and the exact source. After all downloaded asset hashes match, `build-provenance.json` must also match the source, tag, workflow run ID, producer attempt and package version. The current-main check still runs immediately before promotion. A retry never overwrites a release or treats metadata as installed-runtime proof.

After building, run `powershell -NoProfile -File scripts/verify-local.ps1` for native, mounted-filesystem, unit and packaged desktop checks. Driver installation is opt-in with `-InstallDriver` and requires native administrator consent.

Installer verification is separate. On the required hidden desktop, with an exact clean commit and fresh current-user destination, invoke:

```powershell
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Mode Snapshot -Local -ExpectedCommit <40-character-source-commit>
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Local -ExpectedCommit <40-character-source-commit>
```

The verifier does not change LOCALAPPDATA or pretend to run in CI. It requires the matching packaged desktop receipt, compares selected package/installed bytes, refuses preexisting install roots, application processes and registration, and inspects both current-user registry views. It waits up to 30 seconds for Squirrel registration. Safe diagnostics identify the view, key and matching fields without copying unrelated registration data. Only the exact hash-verified updater can uninstall the owned fresh installation after graceful application cleanup. Existing credential data remains independent. The actual install and UI drive must occur through the supported hidden-desktop route.

## Dependency and scope notes

Installer production uses the complete genuine Squirrel vendor layout with two explicitly pinned tools: the archive writer and NuGet 7.9.0. Bootstrap downloads NuGet from its versioned official HTTPS URL, verifies SHA-256 and exact PE file version, reuses a matching cache and rejects mismatches. Packaging copies it into the temporary vendor directory and rechecks its digest before the unchanged maker runs. This replaces the bundled NuGet 2.8.3 process that failed twice in local compression; it does not substitute another installer technology or relax final package integrity checks. Production recovery requires the actual root entrypoint to pass and is separate from the focused selection/version/digest regression.

Bootstrap supplies pinned Node, .NET and WinFsp plus complete verified portable MinGit and GitHub CLI distributions. The runtime tool ZIPs are checked against pinned SHA-256, every extracted file is compared with its archive, and executable versions are checked using absolute paths. Existing valid caches are reused; replacement preserves the previous cache. No administrator rights or installed system Git are required. No signing credential or paid certificate is required. `build.bat` stages complete tool trees and included notices under `out/tools/git` and `out/tools/gh` before application packaging. Bootstrap exports absolute `MFE_GIT_EXECUTABLE` and `MFE_GH_EXECUTABLE` paths for local native verification. Packaged resource resolution and transport behavior remain independently verified by their owning implementation. `scripts/bootstrap.ps1 -RuntimeToolsOnly` activates and validates only these two portable tools without building the application.

## Release photo references

Future preview publication resolves a pinned revision of the authoritative public
dim-sum catalog and verifies a matching uploaded asset on a normal `catalog-v1*`
release. The bilingual code name and illustration URL come from that public source.
Build provenance retains the catalog revision, original photo URL, size and digest
as reference metadata. The consumer release does not require a bundled PNG and
does not attach a copied photo. Historical release bytes and source originals are
retained unchanged.

The focused publisher check rejects draft or prerelease sources, unrelated tags,
wrong URLs, missing digests and unpublished assets. A metadata-only live probe
verified a public source reference without downloading a photo or publishing a
release. This does not establish future publication or installer acceptance.

On Windows PowerShell, decoded release lists are assigned directly so each release is evaluated separately. Wrapping the decoder pipeline in an array can retain the whole list as one nested item and incorrectly reject a valid catalog release when unrelated desktop tags share its page. Regression fixtures cover a mixed list, a full first page followed by the catalog release, and the existing provenance refusals. This correction does not relax source validation or attach photo copies.
