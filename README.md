# Material File Encryptor

**An encrypted drive for Windows Explorer, with local recovery and an encrypted offline cache.** A native .NET engine and WinFsp adapter handle the mounted drive. The desktop workspace brings encrypted storage, transfers, recovery, settings and documentation together.

[Download Windows x64 installer · v1.259.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/download/v1.259.1/MaterialFileEncryptor-Setup.exe) · [Documentation](https://ding-ding-projects.github.io/material-file-encryptor/) · [Release and provenance](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.259.1) · [中文文件](docs/features/README.zh-HK.md)

> **Development status:** independently downloaded historical package bytes pass verification. Installed startup, automatic updating, restart continuity and the current rebuilt interface remain unfinished. The historical inventory retains **105 feature IDs and 210 desktop/website rows**. The supplementary concrete-surface registry now declares **893 surfaces and 93,765 independently unverified assessments**, including nested panels and the browser extension. These counts do not establish complete-surface acceptance.

## Resumed verification, 2026-10-12

Source `3aebe66ded78bbfb0e3b8f8d829e64100371f446` passed both exact root entrypoints, `build.bat /s` and `build-installer.bat /s`. Squirrel extraction matched all 860 payload files. The local package identifies version `0.2.0`; this local output is not an accepted installed-update candidate. The separately published normal release [v1.303.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.303.1) binds to the same source, but downloaded-release and installed-runtime acceptance remain separate.

Combined JavaScript verification recorded 1,364 passes, three failures and 25 skips. One failure concerns stale reviewed-translation bindings; two renderer checks stopped at interpreter ownership admission before product launch. An independently reviewed history-setup repair prevents a waiting deadline from installing a verifier and preserves a concurrent later writer. Its 43 focused checks and three independently repeated waiting cases passed. The older four password-verification failures were not reproduced and are not claimed fixed.

## Verified storage packing update, 2026-10-11

The native engine now defaults to an 80 MiB physical part cap (83,886,080 bytes) and packs durable mounted writes after the final writable handle closes. Immutable snapshot packing, generation-aware cancellation and bounded history publication preserve concurrent writes and recovery.

The exact production source `e06df2a14643932f5f23289ae4eea2d8e45b3676` passed `build.bat /s`, 43 native core checks and the complete synthetic mounted lifecycle, including authenticated reopen. A separate measured probe produced 83,866,588-, 83,866,588- and 254,672-byte parts. See [physical packing and measured evidence](docs/features/storage/physical-packing.md).

Real existing-data migration, the complete GUI redesign, the full visual matrix and actual installed lifecycle remain pending. This storage result does not certify those separate outcomes.

## Pure Material Design 3 throughout

The requirement applies to the desktop workspace, documentation website, settings and every nested editor. Registered buttons, text fields, selectors, sliders, checkboxes and tabs are being integrated with the original validation, locks, persistence and cancellation behavior. Source conversions alone do not establish keyboard, accessibility or visual conformance.

Reviewed source includes shared settings controls, private-history controls, appearance actions, logo actions, appearance number/name/preset fields and CSS property fields with their original Clear/Reset routes. Property rollback now renews only the still-owned field cohort; unrelated replacements remain stale. Unique contextual guidance and Clear actions remain incomplete in parts of the editors. Specialized property, mesh, path, file, date/time and other remaining controls need complete workflows and actual rendered verification. Full Photoshop-grade editing, motion authoring and the complete feature inventory remain unfinished.

## Core workflows

| Workflow | Documentation and boundaries |
|---|---|
| Create and unlock an encrypted Explorer drive | [Drive integration](docs/features/drive/README.md) · [Native storage](docs/features/storage/native-vault.md) |
| Keep encrypted data available offline | [Cache, transfers and safe lifecycle](docs/features/storage/transfer-lifecycle.md) |
| Recover versions and deleted files | [History and Recycle Bin](docs/features/storage/history-and-recycle-bin.md) |
| Customize the workspace | [Settings](docs/features/interface/settings-completeness.md) · [Contextual guidance](docs/features/interface/settings-guidance.md) · [Appearance editor](docs/features/interface/appearance-editor.md) |
| Edit colors, typography and motion | [Colors](docs/features/interface/color-picker.md) · [Fonts](docs/features/interface/font-metadata.md) · [Animation and transitions](docs/features/interface/animation-transition.md) |
| Inspect additional capability foundations | [Local conversion](docs/features/converter/README.md) · [Local models](docs/features/ollama/README.md) · [Server management](docs/features/server-manager/README.md) |

Provider availability and host integration vary by capability. A documented component does not establish that its complete workflow runs. Read the [current handoff](HANDOFF.md), [checklist roadmap](ROADMAP.md) and [feature library](docs/features/README.md) for unfinished work.

## What is actually verified

| Area | Source-bound result | Acceptance limit |
|---|---|---|
| Corrective release | Normal **v1.259.1**, exact source **68ca7f15**, five expected assets; [production 38150790817](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/38150790817) completed both root entrypoints and promotion | A published release is not installed execution |
| Independent downloaded bytes | All five asset hashes/sizes match; every archive entry passed CRC/decompression; all **664** extracted Squirrel payload files match; Setup embeds the exact package, feed and updater | Setup was inspected, not executed in this verification |
| Source, privacy and signatures | **202** tracked source files bind to 68ca; **6,272** privacy entries have zero rejected; Setup, desktop executable and native host are unsigned | Unknown-publisher warnings remain expected |
| Complete documentation inventory | Exact **5e63d670** delivery passed **227 files**, **163 articles**, complete wiki content and **8,698** internal references, with the stored homepage verified | Later source changes need separate delivery checks |
| Genuine narrow interface capture | Exact **68ca7f15**, English **320 × 844**, DPR **1**, [capture 38151495786](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/38151495786): seven scenes reached, three unsuccessful; raw integrity and recorded owned closure passed | History action count was not one; exact count was unrecorded. Appearance Close/action were not reached. Full accessibility, occlusion and the wider matrix remain pending |
| Installed startup and updating | Repaired observer preparation passes; the last fresh resource admission remained below its unchanged floor | No repaired-source launch, ready/Later, actual update or restart acceptance |

The [release list](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases) can contain newer candidates. The table and download above describe the independently checked **v1.259.1** bytes. Newer source integration does not inherit its package or interface verdict.

## Security and storage

- Keep unlock credentials and backups outside encrypted storage and the cache. Losing every unlock credential loses access.
- Offline pins retain ciphertext; files decrypt when accessed through the mounted drive.
- Copying a file outside the mounted drive intentionally creates plaintext. Other applications and Windows may create temporary files, thumbnails or paging data.
- Windows startup and automatic unlock are separate controls. Optional automatic unlock uses current-user DPAPI protection; an already unlocked Windows session remains outside that protection.
- Encrypted chunks default to **10 MiB**, with a **90,000,000-byte** maximum including framing. New or edited files use the selected limit; changing existing parts requires explicit resplitting.

See [storage configuration, recovery and failure modes](docs/features/storage/README.md).

## Build and package

Windows 10/11 x64 is the delivery target. Use the actual root entrypoints:

```bat
build.bat /s
build-installer.bat /s
```

The first builds the application; the second produces the genuine unsigned Squirrel.Windows installer. Production uses these same entrypoints in GitHub Actions without tests or lint. Run explicit local verification separately through [verify-local.ps1](scripts/verify-local.ps1).

[Bootstrap](scripts/bootstrap.ps1) prepares verified user-scoped tools from [pinned dependencies](dependencies.json), reuses valid caches and preserves download diagnostics. Explorer mounting requires the genuine WinFsp driver and its normal elevation flow. Fresh-machine certification remains unfinished. See [desktop build and verification](docs/features/desktop/README.md) and [release documentation](docs/features/release/README.md).

## Documentation and historical evidence

The deployed [article library](https://ding-ding-projects.github.io/material-file-encryptor/library.html) and [complete wiki snapshot](https://ding-ding-projects.github.io/material-file-encryptor/wiki.html) include their content directly in the documentation website. Start with [all feature categories](docs/features/README.md), [project goal](GOAL.md), [roadmap](ROADMAP.md), [handoff](HANDOFF.md) and [changelog](CHANGELOG.md).

![Historical packaged History interface from source 1e16dea8, showing a retained synthetic version and restore action.](docs/images/captures/preview/history-preview.png)

This genuine capture belongs to historical source **1e16dea8**. Its [original provenance](docs/images/captures/preview/inventory.json) and [reviewed gallery inventory](docs/site/gallery-review.json) retain the source, image hash and original scope. It does not show the current rebuilt interface. Current replacement images await source-bound acceptance and promotion; the [historical gallery](https://ding-ding-projects.github.io/material-file-encryptor/gallery.html) remains labelled accordingly.

Earlier source-bound records follow unchanged. Their versions, images and incomplete verdicts remain historical.

<details>
<summary>Open retained historical project record</summary>

# Preservation handoff, 2026-10-10 UTC

Recorded at 2026-10-10T17:21:07.853617+00:00. Verified account allowance is 10% remaining, the inclusive preservation threshold. The wider goal remains unfinished. No new implementation, build or runtime launch is authorized by this preservation record.

Current main source `4f214ac32f96048e0cc2ee08a11b055235ebb9eb` (I) is pushed and exactly verified, including its task-branch preservation. The minimum source-ID repair adds `-prepare-settings` in production. Focused regression evidence first reported 14 passed/1 failed with 31 unique IDs out of 33, then 15/15 passed after correction. Two independent source reviews are dry. This is source-level repair evidence only; new I local root production and actual runtime execution remain unperformed. Hosted automatic release runs `38071084426` and `38071217163` have terminal success; the observed normal release list shows v1.72.1 and v1.73.1 with draft/prerelease flags false. Full tag/source/assets metadata remains pending readback.

The preceding G runtime lh9oaF at `8b74984bb0e44c00e5a1008009122b497ee85956` passed its first five clear-control measurements, then stopped in first matrix sequence 5 with INVALID_PLAN for duplicate IDs. Zero matrix tuples were accepted. Normal owned closure, credential retirement and fresh final 51-input binding passed. All 91 originals remain preserved, and the exact operational hold was independently closed. These partial G results are not I runtime acceptance.

Normal H release v1.71.1 metadata is verified at source `761e542`, with four assets. Actual H documentation delivery is deployment `6984035573`: 52 files, 18 articles including two wiki pages, 73 anchors, 27 HTML routes and 873 links. Release classification and content delivery do not establish downloaded installation or browser/layout acceptance. The complete current wiki snapshot is copied from exact published revision `43f17a1f7cd24f4079409d1127bc1d145b1c97da`; a later documentation deployment must be verified separately.

Browser E v16 retains 14 completed Home tuples, with all 14 pixels and raw observations independently reviewed. Original normal closure remains unproved and profiles remain retained. Supplemental current absence cannot supply missing original closure evidence. Category/article acceptance remains incomplete. Older source28f's single native observation and OpMyor's two baselines plus three intermediate images retain their original source-specific limits.

Full runtime, all 48 configurations, 13 clear controls, downloaded and installed lifecycle, mounted-copy upgrade and transport workflows, complete browser acceptance and physical display-scale verification remain unfinished. One publication lane is assigned to a public gallery of reviewed genuine captures; publication remains pending. Five working trees and ignored announcement variants remain retained. No cleanup or deletion is claimed. Status Hub session delivery remains unavailable.

Next: preserve and publish this factual handoff and wiki snapshot, verify the exact main remote result and associated instruction preservation, retain all unfinished evidence, and stop discretionary work at this allowance boundary. Future local root production/runtime must bind to its actual source and receipts. Do not convert partial evidence into completion.

# Historical source-bound records

# Current continuation snapshot, 2026-10-10 UTC

Recorded at 2026-10-10T16:59:35.360045+00:00. Continuation remains incomplete. Latest supplied verified account allowance is 14% remaining; preservation starts at 10% remaining, inclusive. No fixed goal token cap is introduced.

Local main contains repair source `8b74984bb0e44c00e5a1008009122b497ee85956` (G), preserved and pushed on `task/native-child-trace-20261010`. Exact fetched remote main remains `f7b206fe77262580313a7f925a0da6771ff74298` (F); main publication of G remains pending. Two independent source reviews of the repair are dry. The first exact G build exited 1 with an allocation failure and remains preserved as unsuccessful history. An isolated parser probe exited zero. Exact `build.bat /s` attempt 2 exited zero at unchanged G source/tree `56915ac5edab1f63cceae0ec07103cdc584e2e42`, followed by exact `build-installer.bat /s` exit zero at the same source/tree. Build receipt SHA-256 is `38ee91a3fecd55c804a6bb8d1546494420e9cfcdf8a3115ccde561cb74bba6c8`; installer receipt SHA-256 is `dbe28f09b7144b0b2190f7584e3f8988e9cd51468df7282c787f538caae9bd4d`. Package verification passed all 739 CRC/decompression entries and 812 privacy entries. Final produced payload inventory contains 644 files. No safe-extraction, downloaded-installation or runtime acceptance is claimed.

The G runtime candidate is prepared with 51 operational inputs, but no actual G GUI run has occurred at this snapshot. The earlier F qCXfCN run completed two baselines and five first clear-control actions, then stopped at layout assertion `752 !== 850`. Two independent reviews confirmed sequence 4 lacked its own emulation setup; the exact detach/reset mechanism remained unproved. That F run accepted zero tuples. Its seven private PNGs, successful owned recovery and original receipts remain source-specific. Older source28f's single successful native observation and OpMyor's two genuine baselines plus three intermediate PNGs remain separate historical evidence, not G acceptance.

Live documentation remains source `b1564bac7cdb6677ff5d9529e65228577d406259` (E), run `38056096898`, deployment `6981581764`: 52 live matching files, 18 articles including two wiki pages, 71 article anchors, 27 HTML routes and 871 links; eight excluded paths returned 404 and stored About homepage matched exactly. Browser v16 at E retained 14 completed Home tuples before interruption. Original terminal result and normal-closure receipts are missing. Category and article pages were not launched; no full browser acceptance is established. The post-interruption audit at 2026-10-10T16:41:12.082662Z found the recorded process, desktop and listener absent, retained the profile, and preserved 2,975 files without preservation faults. This supplemental current absence does not prove original normal closure. The original hold remains unreleased in that audit. Retained raw observations and pixels require their source-specific review verdicts and do not replace missing terminal evidence.

Normal F releases v1.68.1 and v1.69.1 remain historical release metadata, separate from G production and unperformed downloaded/installed acceptance. Full runtime, 48 configurations, 13 clear controls, installed lifecycle, mounted-copy upgrade and transport workflows, full browser acceptance and physical display-scale verification remain unfinished. Preserve original unsuccessful evidence and profiles. Next: review and publish completed G source and this factual documentation to main with exact remote proof, then run only a separately authorized, source-bound candidate. Do not relabel older captures or current absence as acceptance. Own Status Hub session tooling remains unavailable.

# Historical source-bound records

# Material File Encryptor

> Snapshot 2026-10-10T13:17:32.963261+00:00: source `28f37a0d` worker-context repair has two dry source reviews and both exact root entrypoints passed with 739-entry integrity and 812-entry privacy. Retained 8 Python/13 JavaScript tool-return strings lack original timestamps and full streams. Task-branch preservation is verified; main publication remains pending. Normal v1.65.1 and actual 52-file/18-article/70-anchor/870-link documentation delivery belong to source63. Prior ad473 modern execution stopped before measured tuples; modern28 v2 actual OpMyor execution stopped at the first clear-controls tuple with SELECTOR_ACTION_FAILED; two baselines, zero accepted tuples and normal owned recovery are preserved, with all 51 final pins matching. Two independent reviews confirm reversed verifier host/wrapper selector topology; actual failed-query state remains unrecorded and no product clear defect is proven. One exact native observation passed before the stop, with DPI144/effective1.5 and physical-scale matrix false. The owner closed only this run-specific installed hold. Browser v12 has three synthetic stream cases and two dry reviews, while real profile operation and deployment rebinding remain pending. Installation, full workflows, modern matrix and browser acceptance remain incomplete. See [the current handoff](HANDOFF.md).

A Windows Explorer drive with encrypted fixed-size content blobs, recoverable history, and a Recycle Bin. Choose a synchronized folder or a private GitHub repository for transfer. Keep selected files available offline in an encrypted local cache.

**Historical development evidence:** packaged source `1e16dea8` passed 70 actual Windows GUI checks with all 73 captures inspected, including create/unlock dialogs, drive-letter selection, mounted-byte persistence, History and Recycle Bin recovery. The same source passed 39 JavaScript checks (one platform-specific skip), 34 core checks, eight controller groups and full 739-entry Squirrel package integrity verification. Earlier source-bound evidence includes 39 actual mounted-drive checks and ten live private transport checks. The integrated test-only transport fixture repair passed 42 checks at `d0c5e036`; the native source matches the integration tree. Setup, 573-entry installed-payload comparison and registration checks passed; installed application execution passed 70 checks with 72 inspected captures. Uninstall returned zero but its directory-presence check rejected updater-only residue; a separate read-only classification now verifies those exact updater hashes while preserving the original failed receipt. Normal release [v1.19.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.19.1) is published from `57a04e16`, with all four assets independently downloaded and hash-verified. Final downloaded runtime and modern-interface acceptance remain pending. A private local-package exclusion defect is quarantined; the downloaded release archive contains zero private announcement entries. [Exact source revisions and evidence boundaries](docs/features/release/preview-verification.md) · [Sanitized verification summary](docs/images/captures/preview/verification-summary.json). Historical captures below retain their earlier source boundaries.

[Project goal](GOAL.md) · [Interface design](DESIGN.md) · [Source](https://github.com/Ding-Ding-Projects/material-file-encryptor) · [Documentation site](https://ding-ding-projects.github.io/material-file-encryptor/) · [Windows verification](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/workflows/windows.yml)

## History and recovery

Format 2 keeps separate ciphertext-addressed chunks and encrypted snapshot metadata in real Git history. Versions are saved after 30 seconds without writes to a file, or with **Save version now**. Retention defaults to forever; the restore-list period does not erase history. Deleted files remain recoverable from the Recycle Bin, and emptying it preserves historical recovery without promising reclaimed space. Existing vaults require an explicit verified copy upgrade. [Storage and recovery guide](docs/features/storage/history-and-recycle-bin.md) · [Transport details](docs/features/storage/git-transport.md).

## Verified preview captures

These four original captures come from packaged source `1e16dea8edb66ea5e6cf31009b0dbcc953f18d74`, at 1180 × 752 and 150% scale on 2026-10-09 UTC. The actual drive workflow passed 70 recorded checks and all 73 captures were inspected. Create/unlock controls, mounted bytes, history recovery, explicit descendants, offline pinning and startup restoration were exercised. Path-bearing captures remain private. Installation and release download checks are reported separately. [Capture inventory and hashes](docs/images/captures/preview/inventory.json).

![Actual packaged History view with a retained synthetic file version and restore action.](docs/images/captures/preview/history-preview.png)

![Actual packaged Recycle Bin with a recoverable synthetic file and an unbroken selection heading.](docs/images/captures/preview/recycle-preview.png)

![Actual packaged descendant chooser keeps independently deleted children unchecked.](docs/images/captures/preview/descendant-preview.png)

![Actual packaged dark settings after selecting the appearance control.](docs/images/captures/preview/dark-settings-preview.png)

## How it works

![Conceptual architecture: Explorer accesses a mounted WinFsp virtual drive, which encrypts files and metadata in the selected sync folder and maintains an encrypted offline cache. Password or key file unlocks the drive.](docs/images/drive-workflow.png)

The mounted drive returns authenticated, decrypted bytes when applications read files. New and edited files become encrypted records and parts in the selected backing folder. Your existing cloud client transfers those encrypted objects between devices.

The documentation site includes an [interactive workflow explanation](https://ding-ding-projects.github.io/material-file-encryptor/#interactive-workflow) with selectable steps, access modes, and encrypted part sizes. Its illustrations explain the design; they are separate from native verification.

<details>
<summary>Real Linux application captures</summary>

These captures show the actual Electron application at source commit `2a9887009f3bb2b64a3e5be37754d1d6612b6fd1`, driven through its sandboxed renderer on an isolated Linux display at 1180 × 850. They verify interface states; native Windows evidence is recorded separately in the linked workflow. [Capture provenance and image hashes](docs/images/captures/provenance.json).

The historical recording is excluded from current website delivery pending a separate privacy review.

![Real application: locked drive screen with create and unlock actions, navigation, and an honest unavailable Windows driver state on Linux.](docs/images/captures/desktop-locked.png)

![Real application: create-drive dialog with encrypted storage and cache folders, password or key-file credentials, drive letter, and split-size controls.](docs/images/captures/desktop-create.png)

![Real application: key-file credential segment selected, with tailored lock/key icons and a slim themed scrollbar.](docs/images/captures/desktop-keyfile-choice.png)

![Real application: dark settings screen with appearance, language, message preferences, startup, automatic unlock, and part-size controls.](docs/images/captures/desktop-settings-dark.png)

![Real application: help screen explaining encryption, offline access, and copying plaintext outside the drive.](docs/images/captures/desktop-help.png)

</details>

<details>
<summary>Real Windows application captures</summary>

These five reviewed original viewport captures show the actual packaged Electron application at source `c74b3a6828e3d1893015598f2df1c9bd4ce84c32` on a disposable Windows Server 2022 runner. Ordinary mounted file access, encrypted offline pinning, startup registration toggles and graceful locking passed. They do not prove the later installed-app or uninstall checks. Per-image capture timestamps were not recorded. [Provenance and original receipts](docs/images/captures/windows/provenance.json) · [Windows run](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/37863451177).

The Windows recording and two original mounted/offline captures are withheld from current delivery because their pixels contain machine paths. Original bytes are privately preserved and hash-verified without editing; historical publication is not erased.

![Actual Windows application: locked drive and custom navigation.](docs/images/captures/windows/desktop-locked.png)

![Actual Windows application: create-drive dialog, manual folder fields and password credential segment.](docs/images/captures/windows/desktop-create.png)

![Actual Windows application: custom key-file credential segment and themed scrollbar.](docs/images/captures/windows/desktop-keyfile-choice.png)



![Actual Windows application: dark settings with separate startup and optional automatic-unlock controls.](docs/images/captures/windows/desktop-settings-dark.png)

![Actual Windows application: help explaining the drive, encrypted cache and plaintext export.](docs/images/captures/windows/desktop-help.png)

</details>

<details>
<summary>Access, offline use, startup, and split sizes</summary>

![Conceptual lifecycle: writes use an encrypted journal; reads decrypt on access; offline pins retain ciphertext; Windows startup supports manual or protected automatic unlock; new split sizes affect future writes with a separate re-split action.](docs/images/offline-workflow.png)

- Unlock with a password or key file. Optional automatic unlock protects the remembered vault key for the current Windows user.
- Start the app with Windows; choose whether to unlock automatically.
- Keep offline downloads and pins encrypted data. Files still decrypt through the mounted drive when accessed.
- The default physical encrypted chunk size is 10 MiB. The hard maximum is 90,000,000 bytes including cryptographic framing; the final chunk can be shorter. New and edited files use the selected limit; **Re-split existing files** is a separate operation.
- Keep credentials and their backups outside encrypted storage and the cache. Losing all unlock credentials loses access.
- Copying a file outside the mounted drive intentionally creates a plaintext copy. Applications and Windows may create their own temporary files, thumbnails, or paging data.

</details>

<details>
<summary>Build and verification status</summary>

Windows 10/11 x64 is the delivery target. Explorer integration requires the genuine WinFsp filesystem driver. From a fresh Windows checkout, build and start the app with:

```powershell
cmd /c "build.bat /s && out\material-file-encryptor-win32-x64\MaterialFileEncryptor.exe"
```

The build obtains verified user-scoped Node and .NET tools, portable Git and GitHub CLI distributions, and the signed WinFsp installer. Explicit local verification installs its own browser tools when required; production builds do not run tests or lint. If the driver is missing, **Install WinFsp** opens the bundled installer with its normal Windows elevation flow. Reopen the app after driver installation. `build-installer.bat /s` produces a genuine unsigned Squirrel.Windows installer; Windows publisher warnings are expected for the app installer.

Local verification covers the encrypted engine, range I/O, recovery, conflicts, offline pins, part limits, desktop bridge and renderer interactions. Real Electron captures on Linux verify interface behavior and isolation; they do not prove Windows Explorer mounting. Every authorized branch push and manual dispatch builds, packages and publishes a unique normal non-draft Windows release without tests or lint. Release notes state that runtime verification is pending and include the exact source, workflow run and timing. Mounted-drive and installed-lifecycle verification run explicitly on a local Windows account with isolated fixtures.

</details>

## Gallery pipeline candidate

The gallery pipeline now groups the unchanged 14 historical originals by workflow, projects only approved public metadata and preserves every occurrence of identical image bytes. Two exclusions remain explicit. Twenty-seven focused checks pass, including a synthetic 445-occurrence case and privacy/search rejection regressions. Independent source review is complete with no remaining findings. Rendered acceptance and main integration remain pending. No current runtime original or new publication is claimed. See [the evidence contract](docs/features/desktop/runtime-evidence.md#reviewed-gallery-publication-pipeline).

</details>
