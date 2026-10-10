# Preview verification

## Synthetic direct-child timing diagnostics

The optional `NativeChildTrace` sink at `VaultProcessRunner.RunAsync()` is disabled by default. No production host or graphical workflow activates it. The native core test executable accepts `--native-child-trace <private-output-file>` for one synthetic operation, writing a new receipt without overwriting an existing file.

The trace retains the runner's already-owned direct-child handle through final observation. It records fixed synthetic categories, sequence and host/child identity, exact native creation and exit FILETIME decimal strings, zero-time wait and exit results, native error codes, UTC observation intervals and monotonic intervals. It never records arguments, executable names or paths, working directories, environment, credentials, output or arbitrary exception messages.

The in-memory operation is bounded to 60 seconds, 128 children and 64 KiB. Missing observations, active children, deadline expiry, count/byte overflow and sink faults explicitly mark the receipt incomplete. Diagnostics do not change ordinary output, cancellation, teardown or return values. They never authorize ownership or replace required CIM identity.

The dedicated mode checks real short-lived and held children, retained-handle exit times, cancellation, exact retained safe-handle closure, active-handle refusal, identity mismatch, sink faults, overflow and exact schema privacy. The receipt reports `HandlesClosed` from the actual bounded retained handle objects after runner disposal, not from reopening a PID. Keep its trace in ignored private evidence with a source binding and SHA-256. Build through `build.bat /s` before running the source-bound mode. Results remain separate in the handoff.

Only direct children are covered. The trace cannot establish grandchildren, reconstruct history, prove a historical graphical failure cause or supply installed-package acceptance. No global tracing, subscription, elevation or automatic production activation is involved. Installer production is separate and unnecessary for exercising this test-only mode.

The first preview combines encrypted format 2 storage, Git snapshot history, folder and private GitHub transport, History, Recycle Bin, and an editable drive-letter picker. Verification uses synthetic vaults and isolated profiles. Existing user vaults and installations are not test fixtures.

## Current continuation, 2026-10-10

Source `55ebe8bb` integrates strict direct-CLI transport provenance, comparison with actual persisted launch bytes before HWND lookup/capture, and independent downloaded-payload/verifier source identities. Both runtime review lenses are dry; installer provenance passed 11 rejection checks. The frozen source55 local build completed both exact entrypoints with unchanged source/index/owning branch; current runtime acceptance remains pending.

Both exact root entrypoints passed at frozen `ae4ce996` with unchanged source. Its normal release `v1.43.1` was independently downloaded and all four hosted hashes, complete archive integrity, 644 safely extracted payload files and actual 84-entry ASAR privacy passed. No installed lifecycle is claimed. Normal `v1.50.1` targets `55ebe8bb` and its successful production workflow attaches all four expected assets; all four assets were independently downloaded, 644 payload files safely extracted, all 739 archive entries checked and 812 privacy entries accepted with zero rejected. Installed lifecycle acceptance remains unfinished.

The documentation deployment at `aac061e1` passed 51 exact live file hashes, 17 complete immutable article hashes, 59 anchors, 738 internal links/assets and eight excluded-path checks. Fourteen reviewed historical originals retain exact source boundaries. Two path-bearing original captures are excluded from current delivery and preserved privately without alteration. Current browser interaction and rendered geometry remain pending.

## Reproduced defects and repairs

- Storage subprocesses now receive closed standard input. Standard output, standard error and process exit share bounded cancellation. This prevents an invisible prompt or inherited pipe from keeping synchronization active indefinitely.
- A restored entry receives a fresh identity while a deleted original still has open handles. The held deleted handle remains attached to its original bytes. Concurrent synchronization persists the same reconciliation as an ordinary encrypted namespace change, preventing identity changes on repeated replay or another device reopening.
- Orphan writes do not schedule impossible quiet-save versions. Closing an orphan does not remove a legitimate live entry's pending version.
- Squirrel production uses pinned official 7-Zip 26.04. Every package entry is decompressed and CRC-checked, including entries outside the selected installed-payload hash manifest.
- Renderer verification closes its fixture server when browser launch fails. Archive selection headings size to their localized text instead of splitting a short word across lines.

## Source-bound results

| Source | Verification | Result |
| --- | --- | --- |
| `24e2fd16ed583f1189f13585dcdb965c9c5f465b` | Core, controller and transport regressions | 31 core checks, eight controller groups and 42 transport checks passed. |
| `216829e1c9ac4ca1f5bfe91fc6c7878a0835109e` | Final storage repair | 34 core checks and eight controller groups passed. |
| `216829e1c9ac4ca1f5bfe91fc6c7878a0835109e` | Actual local WinFsp drive | 39 mounted checks passed in 191.873 seconds, including held-deleted-handle restoration and settled synchronization after closure. Source and executable/DLL hashes were unchanged. |
| `4f0a4b48422d4cb68f71cf50e3771f3238f745ae` | Integrated JavaScript suite | 35 passed, zero failed, one Unix-only protocol fixture skipped on Windows. |
| `4f0a4b48422d4cb68f71cf50e3771f3238f745ae` | Real private synthetic transport | Ten checks passed, including genuinely missing promised payloads, byte-exact ciphertext hydration, concurrent reconciliation and remote-head readback. |
| `4f0a4b48422d4cb68f71cf50e3771f3238f745ae` | Genuine Squirrel package | Production exited zero and all 739 entries passed decompression and CRC verification. |
| `1e16dea8edb66ea5e6cf31009b0dbcc953f18d74` | Current JavaScript, core and controller suites | 39 JavaScript checks passed, zero failed, one Unix-only fixture skipped; 34 core checks and eight controller groups passed. |
| `1e16dea8edb66ea5e6cf31009b0dbcc953f18d74` | Actual packaged Windows GUI | 70 checks passed with all 73 captures inspected. Real create/unlock controls, drive picker, manual lowercase letter normalization, persisted mounted bytes, recovery, offline pinning, startup restoration and language/theme controls passed. Owned processes were absent and the hidden desktop closed. |
| `1e16dea8edb66ea5e6cf31009b0dbcc953f18d74` | Current genuine Squirrel package | All 739 entries passed decompression and CRC verification. Setup exited zero; installed payload comparison covered 573 manifest entries and registration checks passed. Installed execution passed 70 checks with 72 inspected captures; removal acceptance is pending. |
| `d0c5e036b0762e41d6ba523bf0d2424e24e83024` | Test-only transport cancellation fixture repair | A managed child replaced the unavailable external `sleep` command; 42 transport checks passed. The repair is integrated with identical native source. The corresponding suite at `1e16dea8` is not reported green. |

The initial packaged run at `994ff9b` reproduced a synchronization failure. A later run at `24e2fd1` completed version restoration, recycling and explicit descendant selection, then stopped because the test's offline selector matched multiple rows. Both original failed receipts remain failed. The selector now identifies the named synthetic file explicitly.

The packaged GUI receipt completed at `2026-10-09T18:06:32.373Z`, and final capture review completed at `2026-10-09T18:06:49.322Z`. The executable hash is `080cff7a677fb8fcf5b1f8356c26d555231a0028e6a66af6ca461239c2768aec`; the ASAR hash is `7ad75d394dd6711947dbc63e9320913df37b50e55aac3c284bf6098efbadbfdb`. The [public capture inventory](../../images/captures/preview/inventory.json) and [sanitized verification summary](../../images/captures/preview/verification-summary.json) retain the selected source, timing and hash bindings. Four reviewed original images are included in the [README gallery](../../../README.md#verified-preview-captures). Other captures remain private because they contain synthetic local paths.

Installed execution completed at `2026-10-09T18:16:06.750Z`, with 72 captures reviewed by `2026-10-09T18:16:38.931Z`. Uninstall returned zero but the directory-presence check reported `UNINSTALL_PAYLOAD_REMAINS`. The exact residue is `.dead` plus two copies of the trusted updater, with SHA-256 `76359cd4b0349a83337b941332ad042c90351c2bb0a4628307740324c97984cc`. No product payload or registration remains. Strict residue classification at `995dbcf3` passed 17 focused cases and a read-only diagnostic at `2026-10-09T18:25:40.0270681Z`. The original failed receipt is preserved; this is reclassification, not a second lifecycle run. `75b41ef1` additionally asserts the final process-absence readback. This historical run did not establish publication or downloaded-byte lifecycle acceptance. Normal v1.19.1 publication and downloaded-byte integrity were later verified separately; its complete installed lifecycle remains pending. Transport-setup and copy-upgrade visual states were not exercised by the packaged flow. A passing source fixture is not a packaged-application verdict, and a passing package or setup process is not complete installed-lifecycle evidence. Capture review covers every retained image; continuous console monitoring was not performed.

## Reproduction

Build with `build.bat /s` and produce the unsigned Squirrel installer with `build-installer.bat /s`. Run `npm test` separately. Native suites are executable projects under `native/MaterialFileEncryptor.Core.Tests`, `native/MaterialFileEncryptor.Controller.Tests`, and `native/MaterialFileEncryptor.Transport.Tests`. Real drive checks use `scripts/windows-mounted-check.ps1` with the verified WinFsp driver installed.

Local application verification uses the installed hidden-desktop route through `scripts/local-headless-desktop-check.mjs`. It requires an exact source commit, an isolated verification profile, inspected captures, capture provenance, real mounted I/O, startup-registration restoration and owned-process teardown. Installation verification uses `scripts/windows-installer-check.ps1 -Local -ExpectedCommit <full-commit>`, with strict fresh-destination and package/receipt checks. Do not overwrite an existing installation to make that check run.

Publication is automatic for every branch push and manual dispatch, with exact source and package evidence. Tags cannot retrigger publication. Every delivery is non-draft and non-prerelease. See [package integrity and publication](../desktop/package-integrity.md).

Automatic updates, permanent history purging, fresh-sign-in certification and broad provider/operating-system certification are outside this preview. GitHub Projects is unavailable with the current authorization. The wiki is readable at revision `4b6ba31ba9537d62aaf6e9caddef13d7a39bf4bf`, containing `Home.md`. Its complete checked-in snapshot is deployed with the articles; the task-specific handoff refresh is published at `761258a8dcf0df4fb57d4099ed30741f1728795d` with Home.md and CLOSEOUT_PROMPT.md. Its complete refreshed website deployment remains pending.

## Historical normal delivery and quarantine

Main 57a04e16 produced v1.19.1 through successful workflow 37993136207. Both release classification flags are false. Four independent downloads match hosted hashes and sizes, all 739 package entries pass CRC/decompression, and 648 payload file hashes match. The downloaded application archive contains zero private announcement entries. Current runtime acceptance is pending.

The local build from the same source completed both root entrypoints, but its archive included 11 local announcement entries because .agent is missing from forge.config.cjs exclusions. Those local outputs are quarantined, hash-preserved and not approved for distribution. The exclusion and negative regression were subsequently repaired; current builds retain independent privacy inspection. Preserve the original quarantined outputs and failed receipts. See [current handoff](../../../HANDOFF.md).
