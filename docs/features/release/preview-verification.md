# Preview verification

The first preview combines encrypted format 2 storage, Git snapshot history, folder and private GitHub transport, History, Recycle Bin, and an editable drive-letter picker. Verification uses synthetic vaults and isolated profiles. Existing user vaults and installations are not test fixtures.

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

The initial packaged run at `994ff9b` reproduced a synchronization failure. A later run at `24e2fd1` completed version restoration, recycling and explicit descendant selection, then stopped because the test's offline selector matched multiple rows. Both original failed receipts remain failed. The selector now identifies the named synthetic file explicitly.

Final combined GUI, installed-application and independently downloaded-installer receipts are still pending. A passing source fixture is not a packaged-application verdict. A passing package is not installation or uninstall evidence.

## Reproduction

Build with `build.bat /s` and produce the unsigned Squirrel installer with `build-installer.bat /s`. Run `npm test` separately. Native suites are executable projects under `native/MaterialFileEncryptor.Core.Tests`, `native/MaterialFileEncryptor.Controller.Tests`, and `native/MaterialFileEncryptor.Transport.Tests`. Real drive checks use `scripts/windows-mounted-check.ps1` with the verified WinFsp driver installed.

Local application verification uses the installed hidden-desktop route through `scripts/local-headless-desktop-check.mjs`. It requires an exact source commit, an isolated verification profile, inspected captures, capture provenance, real mounted I/O, startup-registration restoration and owned-process teardown. Installation verification uses `scripts/windows-installer-check.ps1 -Local -ExpectedCommit <full-commit>`, with strict fresh-destination and package/receipt checks. Do not overwrite an existing installation to make that check run.

Publication is explicit and source-pinned. Ordinary pushes build packages but do not publish another release. See [package integrity and publication](../desktop/package-integrity.md).

Automatic updates, permanent history purging, fresh-sign-in certification and broad provider/operating-system certification are outside this preview. GitHub Projects is unavailable with the current authorization. The wiki is enabled in repository metadata but its Git endpoint returns `Repository not found`; checked-in categorized documentation remains available.
