# Material File Encryptor

**An encrypted Windows Explorer drive with recoverable file history and an encrypted offline cache.** A native .NET engine and WinFsp adapter handle encryption and mounted filesystem operations. The desktop workspace brings storage, transfers, recovery, settings and documentation together.

[Documentation website](https://ding-ding-projects.github.io/material-file-encryptor/) · [Feature library](docs/features/README.md) · [中文文件](docs/features/README.zh-HK.md) · [Roadmap](ROADMAP.md) · [Current handoff](HANDOFF.md) · [Releases](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases)

**Install:** Windows 10 or 11 on x64. Download the unsigned Squirrel.Windows installer from the [releases page](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases); Windows may show an unknown-publisher warning. To build from a checkout, run `build.bat /s` and then `build-installer.bat /s` (see [Build, package and verify](#build-package-and-verify)). Explorer mounting also needs the WinFsp driver.

**Price:** free. There are no purchases, subscriptions or paid features, nothing is unlocked by paying, and nothing here asks for payment details.

**Desktop icon resources:** [installed icon packaging](docs/features/desktop/installed-icons.md) documents the folder-and-lock mark, executable and shortcut resources, installer branding, and the distinction between source checks and installed verification.

![Local packaged 0.2.0 setup guide in English and light theme](docs/images/captures/installed-icons-ca91b020/setup-guide-light-en.png)

Local packaged 0.2.0 at source `ca91b0209c3aa0bf0f378f62a60cefc778ef869a`, captured on 2026-10-17 at 03:45:42.410 UTC. This is the initial setup welcome screen at 1180 × 850, English, light theme, renderer scale 1. Native window icon handles were checked separately; this image does not establish an installed copy, rendered tray or taskbar icons, setup completion, or full workflows. [Capture inventory](docs/evidence/installed-icons-ca91b020-inventory.json). Earlier captures retain their original provenance.

**Ordinary installed 1.823.1 verification:** Version 1.823.1 is verified in the ordinary user installation from release source `14d6e07636a1f1d62e6dd345273a0c6866664562`. All 910 payload files matched; four opened-file handles resolved to ordinary installation paths. Independent queries through the existing Explorer desktop confirmed the installation folder and Desktop/Start menu shortcut targets. The installer operation returned 0. Its original continuous observer failed, so operation exit and recorded-process absence were recovered separately and remain separate verdicts. The detailed original receipts remain preserved privately. The installed English/light initial setup screen and five native window icon handles were observed with an isolated verification profile. Both ordinary-shell shortcut icon images were separately inspected and show the green folder-lock mark with the shortcut arrow; this is extracted shell-icon evidence, not a rendered Explorer/taskbar/tray screenshot. The runtime observer failed its Python-wrapper identity handshake; separate recovery found every recorded identity absent and the hidden desktop unavailable, while replacement processes were left untouched. Console observation covers only the capture interval, not startup history. Rendered taskbar/tray icons, full workflows and a disposable fresh-machine installation remain unverified. Independent recovery is now recorded separately. Canonical capture promotion remains pending because release source 14d6e07636a1f1d62e6dd345273a0c6866664562 differs from verifier checkout edf13cba77968c81a3c7eca392fdc1f740126868. The genuine capture remains private and unpromoted; no tool-context image is presented as ordinary-installed proof.

**Contents:** [Choose a workflow](#choose-a-workflow) · [Architecture](#architecture) · [What happens to a file](#what-happens-to-a-file) · [Current captures](#current-captures) · [Build, package and verify](#build-package-and-verify) · [Security](#security-and-recovery-boundaries) · [Size and human-time estimate](#project-size-and-human-time-estimate) · [Documentation and contributing](#documentation-and-contributing). Long reference sections are collapsed: choose a summary line to open it.

> **Historical verified baseline:** `411ce5d55b96958799d996713374b7b683552234` records verified PDF packaging and documentation catalogue caching, plus the updater controller and future release-index repair. This is a fixed evidence reference, not the latest main revision. The exact root builds and bounded component results are recorded below. Complete required features, current Material Design 3 acceptance, installed startup, automatic updating and restart continuity remain unfinished. A successful build or release does not certify those outcomes.

Promotion retries retain their verified producer identity and check exact downloaded provenance before current-main promotion. [Release delivery](docs/features/release/preview-delivery.md) distinguishes source checks, downloaded bytes and still-unverified installed behavior.

## Current interface implementation

<details>
<summary>Interface implementation status, feature ledger counts and protected mediation</summary>

The shared titlebar, main workspace, content panel, data table and selection toolbar now use registered components with their own structure, styles and connection lifecycle. Original record rows and action nodes remain in place. The combined source inventory and component checks pass 59 tests. The exact root build of composition candidate `4959f2af4a2ced2980b2a68d2ba9fb4056458e35` passed; its package contains 6,066 entries with zero privacy rejections. Bounded real captures found incomplete table focus visibility. A separately preserved inset-outline candidate exposes the sides and bottom, but its top remains covered by the header. Full rendered composition acceptance remains incomplete. Existing images retain their historical source and do not certify this newer candidate.

The feature ledger now contains 327 assessments: 109 feature families on each of the desktop, website and extension surfaces. Desktop has 99 unverified and 10 not applicable, the website 97 unverified and 12 not applicable, and the extension 98 unverified and 11 not applicable. The combined catalogue declares 1,075 concrete surfaces and 257 public routes; these are inventory counts, not completed workflows.

Protected browser mediation has focused source and compiled synthetic pipe verification. Production profile authentication controls remain unavailable until their native callbacks and real extension interactions are implemented and accepted. [Shared compositions](docs/features/interface/shared-compositions.md) · [Extension assessments](docs/features/platform/extension-assessment.md) · [Protected mediation boundaries](docs/features/interface/protected-browser-mediation.md)

</details>

## Choose a workflow

| Workflow | Behavior and guide |
|---|---|
| Create and unlock a drive | Choose separate encrypted storage and cache roots, set a password or key file, and mount for ordinary Explorer access. [Drive integration](docs/features/drive/README.md) · [Multiple vaults](docs/features/drive/multiple-vaults.md) · [Native storage](docs/features/storage/native-vault.md) |
| Work offline | Pin authenticated encrypted content in the local cache. Pending publication remains queued when the backing folder is unavailable. [Transfers and safe lifecycle](docs/features/storage/transfer-lifecycle.md) |
| Recover changes or deletions | Browse retained versions and restore recoverable Recycle Bin entries. Retention does not promise reclaimed storage. [History and Recycle Bin](docs/features/storage/history-and-recycle-bin.md) · [File activity](docs/features/storage/file-history-activity.md) |
| Transfer encrypted objects | Use a backing folder or configured encrypted Git transport. Local durability and provider upload are distinct. [Encrypted transport](docs/features/storage/git-transport.md) |
| Customize the workspace | Language, appearance, typography, motion and attention controls retain their documented limits. Specialized editors and contextual guidance remain incomplete. [Settings](docs/features/interface/settings-completeness.md) · [Appearance](docs/features/interface/appearance-editor.md) · [Guidance](docs/features/interface/settings-guidance.md) · [Destructive actions](docs/features/interface/destructive-actions.md) |
| Propose a browser download | Pair explicitly, propose a public HTTPS link, then choose a native destination and confirm Start in the desktop. Pairing does not start a transfer or authenticate a browser profile. [Browser download handoff](docs/features/workflows/browser-download-handoff.md) · [Extension workspace](docs/features/workflows/browser-extension-workspace.md) |
| Inspect local tools | Conversion, local models and server preparation require their own supported providers. Their documentation does not certify complete running workflows. [Converter](docs/features/converter/README.md) · [Local models](docs/features/ollama/README.md) · [Server preparation](docs/features/server-manager/README.md) |

Browser workspace, profile mediation, native server provisioning and interface redesign source is integrated on main. Their runtime and visual acceptance remain pending and are not presented here as verified behavior.

## Architecture

The desktop sends bounded requests to the native host. Explorer uses the mounted filesystem. The engine persists encrypted objects and metadata; the configured backing-folder provider controls its own remote delivery.

<details>
<summary>Architecture diagram and the browser extension boundary</summary>

```mermaid
flowchart LR
    Desktop["Desktop workspace"] --> Main["Trusted main process"]
    Main -->|"Private pipe"| Host["Native .NET host"]
    Explorer["Windows Explorer"] --> Driver["WinFsp mounted drive"]
    Driver --> Host
    Host --> Core["Encrypted storage engine"]
    Core --> Cache["Encrypted local cache and journal"]
    Core --> Backing["Encrypted backing folder"]
    Backing --> Provider["Configured synchronization provider"]
```

The browser extension is a separate proposal surface. Its native messaging broker checks the reviewed origin, explicit pairing and desktop admission. Read-only protection observations distinguish native profile verification from shared mode; `browserPermission` remains `unavailable`. Neither a pairing session nor a protection label grants browser profile authority. See [native transport](docs/features/workflows/browser-native-host.md) and [protection observations](docs/features/workflows/browser-protection-observations.md).

</details>

## What happens to a file

Writes become durable encrypted objects and journal state before source publication. Closing the final writable handle can trigger background physical-part packing. Reads authenticate ciphertext before returning plaintext through the unlocked drive.

<details>
<summary>File workflow diagram and the physical part cap</summary>

```mermaid
flowchart TD
    Write["Write through the mounted drive"] --> Encrypt["Encrypt and authenticate records"]
    Encrypt --> Durable["Flush encrypted objects and local journal"]
    Durable --> Close["Final writable handle closes"]
    Close --> Pack["Background packing with generation checks"]
    Pack --> Queue["Queue encrypted source publication"]
    Queue --> Backing["Publish objects before commit metadata"]
    Durable --> Read["Read cached or hydrated ciphertext"]
    Read --> Verify["Authenticate before decrypting"]
    Verify --> Plain["Return plaintext while unlocked"]
```

New vaults default to an **80 MiB physical part cap (83,886,080 bytes)**. The maximum remains **90,000,000 bytes**, including authentication framing. Existing data needs explicit packing or resplitting; historical versions and pending work remain protected. See [physical packing](docs/features/storage/physical-packing.md). Existing user-data migration remains deferred.

</details>

## Current continuation

<details>
<summary>Latest recorded continuation and open work</summary>

Main 07a9d286 records the completed e7099d37 strict UTF-8 article repair. All 234 deployed files, the complete deployment archive, article bytes and exact About homepage were accepted at that observation. Later source requires its own live verification.

GUI source 04bf6c25 is preserved remotely with independent merge review and 34 focused checks. Its frozen isolated build started at 2026-10-12T22:58:04.8123288Z; package and runtime remain pending. Separate converter 18f98d53 has accepted build/package production, but actual admission d6e3 failed with BEHAVIORAL_PROBE_FAILED/provider-probe before customer input or hex sanity conversion. Its precise failed subpredicate is unknown; a typed diagnostic variant is planned, not executed.

The 105-family/210-row goal remains open, with 22 routes declared, 67 unavailable providers, zero of 4,272 accepted visual tuples and 74 design gaps. One offline-populated source unit is in progress without acceptance. Installed update and parity remain unfinished; initial installation, removal and real-data migration remain deferred. Deletion awaits the unavailable verified archive destination. See the [handoff](HANDOFF.md) and [roadmap](ROADMAP.md) for source-specific evidence.

</details>

## Source-bound verification

<details>
<summary>Verification table, unfinished delivery and the preview capture history</summary>

Evidence applies to the named source and scope. Later revisions do not inherit earlier installed or visual verdicts.

| Unit | Observed result | Limit |
|---|---|---|
| PDF packaging, `a0239c91d517ca06d9725f36dd76874f5ab33ece` | Exact `build.bat /s` exited 0. All **994 retained PDF files** match source hashes; **560 maps** are excluded. Five extracted-runtime checks cover creation/text, inspection, extraction order, rotation and metadata. Package privacy accepted **5713 entries**, zero rejected. | Existing packager omission of `yarn.lock` is separate. Upstream PDF source mappings are unavailable for runtime debugging. No installer-size or speed claim. |
| Documentation cache, `187364a3094b1f66e5798d10991f2e3d09d40af9` | Exact root build exited 0; package privacy accepted **5714 entries**, zero rejected. Production source bytes match the package. Eight focused checks passed and were independently repeated. | Installed and renderer acceptance remain separate. The cache retains parsed catalogue memory during its service lifetime. |
| Actual cache component timing | On one **7,863,011-byte** packaged catalogue, 31 alternating samples measured **17.3215 ms** fresh versus **0.0182 ms** reused request medians, and **28.5182 ms** versus **0.0065 ms** concurrent medians. First read/parse/freeze took **24.9591 ms**. | Same-host local Node component measurement. Excludes IPC, original ASAR access, renderer work and installed responsiveness. |
| Historical storage baseline | Source `e06df2a14643932f5f23289ae4eea2d8e45b3676` passed its exact build, 43 native core checks and synthetic mounted lifecycle with authenticated reopen. | Existing data migration and complete current desktop interaction remain unverified. |

[Selected public proof](docs/evidence/main-performance-20261012.json) includes package and input hashes, source bindings and limits. The build generator changed only a registered component's line endings; configured normalized source identity was proven. Original build receipts retain that observation. [Package verification](docs/features/desktop/package-integrity.md) and [catalogue caching](docs/features/platform/packaged-documentation-cache.md) describe behavior and trade-offs.

Package inspection also validates each ASAR file's declared SHA-256 and block hashes, including unpacked files. Same-length corruption and missing or malformed integrity metadata are rejected. Embedded hashes establish consistency with the archive header, not publisher authenticity; production, downloaded-byte and installed acceptance remain separate.

### Unfinished delivery and current images

The inventory contains **109 required feature identifiers and 218 desktop/website rows**. It does not count completed features. The [goal](GOAL.md), [roadmap](ROADMAP.md) and [interface design](DESIGN.md) retain the outstanding controls, guidance, accessibility, language/theme/scale states and full visual matrix.

Two inspected source-bound documentation screenshots now appear below. Current native-product replacements and the full visual matrix remain pending.

### Verified preview captures

Earlier captures were replaced by the current ones listed below and remain unchanged in Git history, with their original dates, sources and hashes in the [preview inventory](docs/images/captures/preview/inventory.json), [preview summary](docs/images/captures/preview/verification-summary.json), [Linux provenance](docs/images/captures/provenance.json) and [Windows provenance](docs/images/captures/windows/provenance.json). These diagrams explain workflows; they are not screenshots.

Updater source and future BOM-free release-index production are delivered on main. Local installer production passed at `ab975`; main `411ce5d` retains the same complete source tree after a preserved unpublished message correction. Hosted release [v1.344.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.344.1) passed the older installed-controller metadata check with an available verdict, and its independently downloaded Setup/package bytes passed archive and embedding checks. [Selected update proof](docs/evidence/hosted-update-1344-20261012.json) keeps those results separate from pending installed GUI and actual native apply acceptance. Installed startup, ready/Later interaction, restart continuity and removal are not certified. Local models must follow the documented one-click application-managed Ollama runtime procedure. The shared instructions may be updated only after actual installation and runtime proof; no shared physical directory is implied, existing installations remain untouched, and this documentation change starts no model service. See [local model boundaries](docs/features/ollama/local-models.md).

</details>

## Storage write path and part size

<details>
<summary>Write path, publication queue and the 80 MiB physical part cap</summary>

Writes first become durable encrypted objects and journal state. Closing the final writable handle can trigger background physical-part packing. Source publication is separate and may remain queued. Reads return authenticated plaintext through the unlocked mounted drive, without a plaintext working folder.

The [file workflow diagram](#what-happens-to-a-file) above shows this sequence and its separate read and publication paths.

New vaults now default to an **80 MiB physical part cap (83,886,080 bytes)**. The maximum remains **90,000,000 bytes**, including authentication framing. This is a physical storage cap, not a plaintext allocation size. Existing data requires an explicit packing or resplitting workflow; versions and pending work remain protected. [Physical packing and migration](docs/features/storage/physical-packing.md) is the current source of truth for this behavior.

</details>

## Current evidence and its limits

<details>
<summary>Source-bound evidence table, evidence summaries and feature acceptance</summary>

Each row below applies only to its recorded source and scope. Later integration does not inherit an earlier binary, capture or installed-runtime verdict.

| Area | Source-bound result | What remains unverified |
|---|---|---|
| Latest integrated root build | `53d2b4612b96559c5afaac2c28e2888fa0a3ba91` passed the exact `build.bat /s` entrypoint with unchanged source at completion. | Packaging and installed execution of later source, full interface interaction and visual acceptance. |
| Reviewed downloadable baseline | Normal release [v1.303.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.303.1), source `3aebe66ded78bbfb0e3b8f8d829e64100371f446`: independent asset hashes, archive integrity and Setup embedding passed; all **861** extracted payload files matched. | Setup execution, installed startup, updater behavior, restart continuity and uninstall acceptance. |
| Encrypted storage packing | Source `e06df2a14643932f5f23289ae4eea2d8e45b3676`: exact root build, **43 native core checks**, synthetic mounted lifecycle and authenticated reopen passed. Measured parts fit the selected physical cap. | Existing user-data migration and the complete current desktop workflow. |
| Portable runtime provisioning | Source `33ed0f8b58b1238ff28264aa0ea8b019759a7a55`: **12 actual native pipe checks** passed, with **315 runtime files and 62 directories** read back against the pinned inventory; host exit was normal. | Java execution, a running server, active cancellation, installed lifecycle and current GUI acceptance. |
| Runtime member lifetime | Source `f2f20c077cccdbb46c572b84df8cc8fca11f89ca`: **8 synthetic lifetime checks** passed. The deliberate negative control exited 1 when protection was removed. | Complete loading-tree isolation, writable-mapping limitations, exact-version configuration admission and real server startup. |
| Compiled protection transport | Test source `adb2f92198c9cf848ddd4377cf778ce84d135da1` passed its actual compiled pipe case using the host built at `53d2b4612b96559c5afaac2c28e2888fa0a3ba91`. The provider was synthetic and browser permission stayed unavailable. An earlier timeout remains retained with its cause unknown. | A real renderer grant, installed extension identity, genuine browser/native interaction and runtime revocation. |
| Package and catalogue optimization | Source `7ad539a937f5c2828572884cc7ef7111290ba62c` removed **560 PDF source maps** while all **994 retained PDF files** remained byte-identical; the exact extracted PDF runtime round-trip passed. A separately measured catalogue cache reduces repeated service work. | Startup improvement, installed memory behavior and compressed installer-size attribution. |

Evidence summaries: [native and package boundaries](docs/evidence/resume-native-20261012.json), [component performance measurements](docs/evidence/resume-performance-20261012.json), [storage measurements](docs/evidence/storage-packing-e06df2a.json), and [release verification](docs/features/release/preview-verification.md). The native summary includes the recorded root build and compiled-pipe result with their separate source and execution limits.

### Feature and interface acceptance

The historical inventory retains **105 feature identifiers and 210 desktop/website rows**. At source `53d2b4612b96559c5afaac2c28e2888fa0a3ba91`, the supplementary registry declares **901 concrete surfaces and 94,605 independently unverified assessments**. Empty proof remains unverified. These are acceptance inventories, not a count of completed features.

Material Design 3 applies to the desktop, documentation website, extension and nested controls. Current layout, keyboard interaction, accessible names, language/theme/scale coverage, complete contextual guidance and the remaining specialized editors require real rendered evidence. The [interface design](DESIGN.md), [surface inventory documentation](docs/features/platform/documentation-and-status.md), [goal](GOAL.md) and [checklist roadmap](ROADMAP.md) describe the unfinished work.

</details>

### Current captures

Every image below is a genuine capture of a real build; none is a mock, design preview or edited image. Each group is collapsed: choose its heading to open it. Capture times are unavailable because no validated timestamp was recorded, and earlier captures were withdrawn when these replaced them. They remain unchanged in Git history and are listed with their hashes in [the gallery review](docs/site/gallery-review.json).

#### Release 1.779.1: setup, destructive confirmation, wording, element locks and settings

Fifteen captures of the extracted full release package for version 1.779.1, built from source `b83449e`. This was a release package run, not an installed copy. Each frame was taken by window handle on a task-owned hidden desktop with an isolated profile and a throwaway vault holding neutral test files. The information icons in these frames are the compact 28 pixel controls. Machine-readable details are in [the capture manifest](docs/images/captures/reproof-1.779.1/manifest.json) and [the proof record](docs/evidence/installed-proof-1.779.1.json). Captures these replaced are listed in [the archive](design/superseded-captures.md).

| Setup guide, Look and language | Setup guide, Look and language, bilingual | Setup guide, Requirements |
|---|---|---|
| ![Setup guide, Look and language step with the choice search icon beside each select](docs/images/captures/reproof-1.779.1/desktop/setup-guide-look-light-en.png) | ![Setup guide, Look and language step in English and Cantonese](docs/images/captures/reproof-1.779.1/desktop/setup-guide-look-light-bilingual.png) | ![Setup guide, Requirements step with Back, Skip this step, Next and Skip setup](docs/images/captures/reproof-1.779.1/desktop/setup-guide-requirements-light-en.png) |

| Setup guide, Finish, dark | Drive, two files selected, dark | Delete confirmation with two keys and a slider, dark |
|---|---|---|
| ![Setup guide, Finish step with the saved summary, dark](docs/images/captures/reproof-1.779.1/desktop/setup-guide-finish-dark-en.png) | ![Drive, two files selected for a bulk action, dark](docs/images/captures/reproof-1.779.1/desktop/drive-bulk-selection-dark-en.png) | ![Confirm destructive action for deleting two selected files, dark](docs/images/captures/reproof-1.779.1/desktop/confirm-bulk-delete-dark-en.png) |

| Force Lock confirmation, dark | Personal wording applied, full-window announcement, dark | Invalid wording file, transient notice |
|---|---|---|
| ![Confirm destructive action for Force Lock, dark](docs/images/captures/reproof-1.779.1/desktop/confirm-force-lock-dark-en.png) | ![Personal wording applied from a dropped file, with the full-window announcement and a saved notice, dark](docs/images/captures/reproof-1.779.1/desktop/wording-applied-celebration-dark-en.png) | ![Invalid personal wording file refused with a transient notice and no banner](docs/images/captures/reproof-1.779.1/desktop/invalid-wording-notice-light-en.png) |

| Lock an element dialog with Create lock visible | Settings, Appearance and language, dark |
|---|---|
| ![Lock an element dialog with the Create lock button visible at the default window size](docs/images/captures/reproof-1.779.1/desktop/lock-element-dialog-light-en.png) | ![Settings, Appearance and language, dark, with compact information icons](docs/images/captures/reproof-1.779.1/desktop/settings-appearance-dark-en.png) |

#### Release 1.782.1: drive frames

Six captures of the extracted full release package for version 1.782.1, built from source `4a49919`. This was a release package run, not an installed copy. Each frame was taken by window handle on a task-owned hidden desktop with an isolated profile and a throwaway vault holding neutral test files. They replace the older drive frames, which were taken before the compact information icons existed. Machine-readable details are in [the capture manifest](docs/images/captures/reproof-1.782.1/manifest.json) and [the proof record](docs/evidence/installed-proof-1.782.1.json).

| Drive, locked | Drive, locked, bilingual | Drive, file list |
|---|---|---|
| ![Drive, locked, with an information icon beside Create a drive and Unlock existing drive](docs/images/captures/reproof-1.782.1/desktop/drive-locked-light-en.png) | ![Drive, locked, bilingual](docs/images/captures/reproof-1.782.1/desktop/drive-locked-light-bilingual.png) | ![Drive, file list with a compact information icon beside each file action](docs/images/captures/reproof-1.782.1/desktop/drive-files-light-en.png) |

| Drive, one file selected | Drive, file list, bilingual | Drive, file list, dark, bilingual |
|---|---|---|
| ![Drive, one file selected, with Open, Export copy, Keep offline and Delete enabled](docs/images/captures/reproof-1.782.1/desktop/drive-file-selected-light-en.png) | ![Drive, file list, bilingual, Availability text wrapping beside its icon](docs/images/captures/reproof-1.782.1/desktop/drive-files-light-bilingual.png) | ![Drive, file list, dark, bilingual](docs/images/captures/reproof-1.782.1/desktop/drive-files-dark-bilingual.png) |

#### Desktop application

92 captures of the installed desktop application, version 1.702.1, built from source `9394b35`. Each was taken by window handle on a task-owned hidden desktop at 150 percent display scale (a 1280 by 800 window, saved at 1920 by 1200 pixels) with an isolated profile and a throwaway vault that holds test files only and uses neutral folder names. The capture host reported no frame showing a private path. The run captured 312 frames in all, covering 52 screens in light and dark themes and in English, Cantonese and bilingual modes; these are the ones published. A tabbed screen's own frame shows the tab named in its caption, and a few dark and bilingual frames show the last tab visited. Home is the first group. The drive, Pair a browser and server frames were retaken from a later installed release, listed with its own manifest below. The six drive frames were retaken again from the 1.782.1 release package, shown in the release 1.782.1 section above. The [capture manifest](docs/images/captures/refresh-b4cbf0e/desktop-capture-manifest.json) records every frame's hash.

<details>
<summary>Home and navigation (7)</summary>

| Home | Home, dark | Home, Cantonese |
|---|---|---|
| ![Home](docs/images/captures/refresh-b4cbf0e/desktop/home-light-en.png) | ![Home, dark](docs/images/captures/refresh-b4cbf0e/desktop/home-dark-en.png) | ![Home, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/home-light-yue.png) |

| Home, bilingual | New tab popover | New tab popover, dark |
|---|---|---|
| ![Home, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/home-light-bilingual.png) | ![New tab popover](docs/images/captures/refresh-b4cbf0e/desktop/newtab-popover-light-en.png) | ![New tab popover, dark](docs/images/captures/refresh-b4cbf0e/desktop/newtab-popover-dark-en.png) |

| New tab popover, bilingual |
|---|
| ![New tab popover, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/newtab-popover-light-bilingual.png) |

</details>

<details>
<summary>Drive, offline and dialogs (18)</summary>

| Drive, locked | Drive, locked, bilingual | Drive, unlocked, top of the page |
|---|---|---|
| ![Drive, locked](docs/images/captures/reproof-1.782.1/desktop/drive-locked-light-en.png) | ![Drive, locked, bilingual](docs/images/captures/reproof-1.782.1/desktop/drive-locked-light-bilingual.png) | ![Drive, unlocked, top of the page](docs/images/captures/reproof-1.779.1/desktop/drive-toolbar-light-en.png) |

| Drive, file list | Drive, file list, dark | Drive, one file selected |
|---|---|---|
| ![Drive, file list](docs/images/captures/reproof-1.782.1/desktop/drive-files-light-en.png) | ![Drive, file list, dark](docs/images/captures/reproof-1.779.1/desktop/drive-toolbar-dark-en.png) | ![Drive, one file selected](docs/images/captures/reproof-1.782.1/desktop/drive-file-selected-light-en.png) |

| Drive, file list, bilingual, Availability text wrapping beside its icon | Drive, file list, dark, bilingual | Available offline |
|---|---|---|
| ![Drive, file list, bilingual, Availability text wrapping beside its icon](docs/images/captures/reproof-1.782.1/desktop/drive-files-light-bilingual.png) | ![Drive, file list, dark, bilingual](docs/images/captures/reproof-1.782.1/desktop/drive-files-dark-bilingual.png) | ![Available offline](docs/images/captures/refresh-b4cbf0e/desktop/offline-light-en.png) |

| Available offline, Cantonese | Create a drive dialog | Create a drive dialog, dark |
|---|---|---|
| ![Available offline, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/offline-light-yue.png) | ![Create a drive dialog](docs/images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-light-en.png) | ![Create a drive dialog, dark](docs/images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-dark-en.png) |

| Create a drive dialog, Cantonese | Unlock a drive dialog | Unlock a drive dialog, bilingual |
|---|---|---|
| ![Create a drive dialog, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-light-yue.png) | ![Unlock a drive dialog](docs/images/captures/refresh-b4cbf0e/desktop/unlock-drive-dialog-light-en.png) | ![Unlock a drive dialog, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/unlock-drive-dialog-light-bilingual.png) |

| Lock message when a program still has files open | Force Lock confirmation | Force Lock confirmation, dark |
|---|---|---|
| ![Lock message when a program still has files open](docs/images/captures/refresh-b4cbf0e/desktop/lock-holder-message-light-en.png) | ![Force Lock confirmation](docs/images/captures/refresh-b4cbf0e/desktop/force-lock-confirm-light-en.png) | ![Force Lock confirmation, dark](docs/images/captures/reproof-1.779.1/desktop/confirm-force-lock-dark-en.png) |

</details>

<details>
<summary>History and Recycle Bin (5)</summary>

| History | History, dark | History, Cantonese |
|---|---|---|
| ![History](docs/images/captures/refresh-b4cbf0e/desktop/history-light-en.png) | ![History, dark](docs/images/captures/refresh-b4cbf0e/desktop/history-dark-en.png) | ![History, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/history-light-yue.png) |

| Recycle Bin | Recycle Bin, bilingual |
|---|---|
| ![Recycle Bin](docs/images/captures/refresh-b4cbf0e/desktop/recycle-bin-light-en.png) | ![Recycle Bin, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/recycle-bin-light-bilingual.png) |

</details>

<details>
<summary>Tools: converter, documents and storage (11)</summary>

| Converter, Source files | Converter, Formats | Converter, Options |
|---|---|---|
| ![Converter, Source files](docs/images/captures/refresh-b4cbf0e/desktop/tools-converter-light-en.png) | ![Converter, Formats](docs/images/captures/refresh-b4cbf0e/desktop/tools-converter-tab2-light-en.png) | ![Converter, Options](docs/images/captures/refresh-b4cbf0e/desktop/tools-converter-tab3-light-en.png) |

| Converter, Queue and result history | Converter, Queue and result history, dark | Documents and downloads |
|---|---|---|
| ![Converter, Queue and result history](docs/images/captures/refresh-b4cbf0e/desktop/tools-converter-tab4-light-en.png) | ![Converter, Queue and result history, dark](docs/images/captures/refresh-b4cbf0e/desktop/tools-converter-dark-en.png) | ![Documents and downloads](docs/images/captures/refresh-b4cbf0e/desktop/tools-documents-light-en.png) |

| Storage maintenance | Status | Status, dark |
|---|---|---|
| ![Storage maintenance](docs/images/captures/refresh-b4cbf0e/desktop/tools-storage-maintenance-light-en.png) | ![Status](docs/images/captures/refresh-b4cbf0e/desktop/tools-status-light-en.png) | ![Status, dark](docs/images/captures/refresh-b4cbf0e/desktop/tools-status-dark-en.png) |

| Status, bilingual | File details |
|---|---|
| ![Status, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/tools-status-light-bilingual.png) | ![File details](docs/images/captures/refresh-b4cbf0e/desktop/tools-file-details-light-en.png) |

</details>

<details>
<summary>Tools: local models (7)</summary>

| Local models, Model Store | Local models, Pull cart | Local models, Local chat |
|---|---|---|
| ![Local models, Model Store](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-light-en.png) | ![Local models, Pull cart](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab2-light-en.png) | ![Local models, Local chat](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab3-light-en.png) |

| Local models, Profiles | Local models, Help | Local models, Help, dark |
|---|---|---|
| ![Local models, Profiles](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab4-light-en.png) | ![Local models, Help](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab5-light-en.png) | ![Local models, Help, dark](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-dark-en.png) |

| Local models, Help, bilingual |
|---|
| ![Local models, Help, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/tools-local-models-light-bilingual.png) |

</details>

<details>
<summary>Tools: server targets and server card (7)</summary>

| Server preparation, create a server on any target | Server preparation, scrolled to the server card, dark | Server preparation, Cantonese |
|---|---|---|
| ![Server preparation, create a server on any target](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-targets-panel-light-en.png) | ![Server preparation, scrolled to the server card, dark](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-targets-panel-dark-en.png) | ![Server preparation, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-preparation-light-yue.png) |

| Server card, Overview | Server card, Logs | Server card, Settings |
|---|---|---|
| ![Server card, Overview](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab1-light-en.png) | ![Server card, Logs](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab2-light-en.png) | ![Server card, Settings](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab3-light-en.png) |

| Server card, Plugins and mods |
|---|
| ![Server card, Plugins and mods](docs/images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab4-light-en.png) |

</details>

<details>
<summary>Settings, personalization and local access (16)</summary>

| Settings | Settings, Cantonese | Personalization, Language and voice |
|---|---|---|
| ![Settings](docs/images/captures/reproof-1.779.1/desktop/settings-light-en.png) | ![Settings, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/settings-light-yue.png) | ![Personalization, Language and voice](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-light-en.png) |

| Personalization, Appearance | Personalization, Schedules | Personalization, Attention |
|---|---|---|
| ![Personalization, Appearance](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab2-light-en.png) | ![Personalization, Schedules](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab3-light-en.png) | ![Personalization, Attention](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab4-light-en.png) |

| Personalization, Private local history | Personalization, Private local history, dark | Local access, Local profile |
|---|---|---|
| ![Personalization, Private local history](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab5-light-en.png) | ![Personalization, Private local history, dark](docs/images/captures/refresh-b4cbf0e/desktop/settings-personalization-dark-en.png) | ![Local access, Local profile](docs/images/captures/refresh-b4cbf0e/desktop/settings-local-access-light-en.png) |

| Local access, Element locks | Local access, Authenticator | Local access, Support Tickets |
|---|---|---|
| ![Local access, Element locks](docs/images/captures/reproof-1.779.1/desktop/element-lock-created-light-en.png) | ![Local access, Authenticator](docs/images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab3-light-en.png) | ![Local access, Support Tickets](docs/images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab4-light-en.png) |

| Local access, Access history | Local access, Access history, bilingual | Updates |
|---|---|---|
| ![Local access, Access history](docs/images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab5-light-en.png) | ![Local access, Access history, bilingual](docs/images/captures/refresh-b4cbf0e/desktop/settings-local-access-light-bilingual.png) | ![Updates](docs/images/captures/refresh-b4cbf0e/desktop/update-page-light-en.png) |

| Updates, dark |
|---|
| ![Updates, dark](docs/images/captures/refresh-b4cbf0e/desktop/update-page-dark-en.png) |

</details>

<details>
<summary>Pair a browser (4)</summary>

| Pair a browser | Pair a browser, dark | Pair a browser, Cantonese |
|---|---|---|
| ![Pair a browser](docs/images/captures/refresh-5db936f/desktop/pair-a-browser-light-en.png) | ![Pair a browser, dark](docs/images/captures/refresh-5db936f/desktop/pair-a-browser-dark-en.png) | ![Pair a browser, Cantonese](docs/images/captures/refresh-5db936f/desktop/pair-a-browser-light-yue.png) |

| Pair a browser, bilingual |
|---|
| ![Pair a browser, bilingual](docs/images/captures/refresh-5db936f/desktop/pair-a-browser-light-bilingual.png) |

</details>

<details>
<summary>Quitting the app (2)</summary>

| Help menu with Quit Material File Encryptor | Command palette searching for Quit |
|---|---|
| ![Help menu with Quit Material File Encryptor](docs/images/captures/refresh-5db936f/desktop/quit-help-menu-light-en.png) | ![Command palette searching for Quit](docs/images/captures/refresh-5db936f/desktop/quit-palette-query-light-en.png) |

</details>

<details>
<summary>Server cards and server lifecycle (10)</summary>

| Server card, running | Server card, running, dark | Server card, failed: Ended unexpectedly, exit code -1 |
|---|---|---|
| ![Server card, running](docs/images/captures/refresh-6ef15e8/desktop/server-card-running-light-en.png) | ![Server card, running, dark](docs/images/captures/refresh-6ef15e8/desktop/server-card-running-dark-en.png) | ![Server card, failed: Ended unexpectedly, exit code -1](docs/images/captures/refresh-5db936f/desktop/server-card-failed-light-en.png) |

| Server card, failed: Ended unexpectedly, exit code -1, dark | Server card, failed, scrolled to the last log lines | Server card needing Java 25 after the Java check, dark, bilingual |
|---|---|---|
| ![Server card, failed: Ended unexpectedly, exit code -1, dark](docs/images/captures/refresh-5db936f/desktop/server-card-failed-dark-en.png) | ![Server card, failed, scrolled to the last log lines](docs/images/captures/refresh-5db936f/desktop/server-card-failed-logtail-light-en.png) | ![Server card needing Java 25 after the Java check, dark, bilingual](docs/images/captures/refresh-6ef15e8/desktop/server-java25-needed-dark-bilingual.png) |

| Java-check refusal message, dark, bilingual | Server running, dark, bilingual | Server logs ending with the Done line, dark, bilingual |
|---|---|---|
| ![Java-check refusal message, dark, bilingual](docs/images/captures/refresh-6ef15e8/desktop/server-java-check-refusal-dark-bilingual.png) | ![Server running, dark, bilingual](docs/images/captures/refresh-6ef15e8/desktop/server-running-card-dark-bilingual.png) | ![Server logs ending with the Done line, dark, bilingual](docs/images/captures/refresh-6ef15e8/desktop/server-running-logs-dark-bilingual.png) |

| Close dialog while a server runs: keep in the tray, stop and quit, or cancel |
|---|
| ![Close dialog while a server runs: keep in the tray, stop and quit, or cancel](docs/images/captures/refresh-6ef15e8/desktop/close-dialog-server-running-dark-bilingual.png) |

</details>

<details>
<summary>Help (5)</summary>

| Help, How it works | Help, How it works, dark | Help, How it works, Cantonese |
|---|---|---|
| ![Help, How it works](docs/images/captures/refresh-b4cbf0e/desktop/help-how-it-works-light-en.png) | ![Help, How it works, dark](docs/images/captures/refresh-b4cbf0e/desktop/help-how-it-works-dark-en.png) | ![Help, How it works, Cantonese](docs/images/captures/refresh-b4cbf0e/desktop/help-how-it-works-light-yue.png) |

| Help, Documentation | Help, Changelog |
|---|---|
| ![Help, Documentation](docs/images/captures/refresh-b4cbf0e/desktop/help-documentation-light-en.png) | ![Help, Changelog](docs/images/captures/refresh-b4cbf0e/desktop/help-changelog-light-en.png) |

</details>

#### Browser extension

Headless Microsoft Edge with the staged extension from source `b4cbf0e`, loaded unpacked into a disposable profile. No desktop was paired, so connection states read as unavailable; the Models captures use a fake local model server and the Status captures read the live published releases.

<details>
<summary>Home and popup (7)</summary>

| Workspace Home | Workspace Home, dark | Workspace Home, Cantonese |
|---|---|---|
| ![Workspace Home](docs/images/captures/refresh-b4cbf0e/extension/home-1280x900-light-en.png) | ![Workspace Home, dark](docs/images/captures/refresh-b4cbf0e/extension/home-1280x900-dark-en.png) | ![Workspace Home, Cantonese](docs/images/captures/refresh-b4cbf0e/extension/home-1280x900-light-yue.png) |

| Workspace Home at 360 pixels, dark, bilingual | Popup with the section launcher | Popup, dark, bilingual |
|---|---|---|
| ![Workspace Home at 360 pixels, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/home-360x780-dark-bilingual.png) | ![Popup with the section launcher](docs/images/captures/refresh-b4cbf0e/extension/popup-380-light-en.png) | ![Popup, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/popup-380-dark-bilingual.png) |

| Popup, Cantonese |
|---|
| ![Popup, Cantonese](docs/images/captures/refresh-b4cbf0e/extension/popup-380-light-yue.png) |

</details>

<details>
<summary>Sections (12)</summary>

| Connection | Personalization | Personalization at 360 pixels, dark, bilingual |
|---|---|---|
| ![Connection](docs/images/captures/refresh-b4cbf0e/extension/section-connection-1280x900-light-en.png) | ![Personalization](docs/images/captures/refresh-b4cbf0e/extension/section-personalization-1280x900-light-en.png) | ![Personalization at 360 pixels, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/section-personalization-360x780-dark-bilingual.png) |

| Changelog | Notes | Documentation |
|---|---|---|
| ![Changelog](docs/images/captures/refresh-b4cbf0e/extension/section-changelog-1280x900-light-en.png) | ![Notes](docs/images/captures/refresh-b4cbf0e/extension/section-notes-1280x900-light-en.png) | ![Documentation](docs/images/captures/refresh-b4cbf0e/extension/section-documentation-1280x900-light-en.png) |

| Documentation search while offline | Support | Dim sum |
|---|---|---|
| ![Documentation search while offline](docs/images/captures/refresh-b4cbf0e/extension/offline-documentation-search-light-en.png) | ![Support](docs/images/captures/refresh-b4cbf0e/extension/section-support-1280x900-light-en.png) | ![Dim sum](docs/images/captures/refresh-b4cbf0e/extension/section-dimsum-1280x900-light-en.png) |

| Progress and publication | Servers | Servers, dark, bilingual |
|---|---|---|
| ![Progress and publication](docs/images/captures/refresh-b4cbf0e/extension/section-publishing-1280x900-light-en.png) | ![Servers](docs/images/captures/refresh-b4cbf0e/extension/section-servers-1280x900-light-en.png) | ![Servers, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/section-servers-1280x900-dark-bilingual.png) |

</details>

<details>
<summary>Models (2)</summary>

| Models connected to a local server | Models chat with a streamed reply |
|---|---|
| ![Models connected to a local server](docs/images/captures/refresh-b4cbf0e/extension/models-connected-light-en.png) | ![Models chat with a streamed reply](docs/images/captures/refresh-b4cbf0e/extension/models-chat-light-en.png) |

</details>

<details>
<summary>Status (4)</summary>

| Status with the published release | Status with the installer link | Status coverage list at 360 pixels |
|---|---|---|
| ![Status with the published release](docs/images/captures/refresh-b4cbf0e/extension/status-release-light-en.png) | ![Status with the installer link](docs/images/captures/refresh-b4cbf0e/extension/status-installer-link-light-en.png) | ![Status coverage list at 360 pixels](docs/images/captures/refresh-b4cbf0e/extension/status-coverage-narrow-light-en.png) |

| Status without a paired desktop |
|---|
| ![Status without a paired desktop](docs/images/captures/refresh-b4cbf0e/extension/status-desktop-unpaired-light-en.png) |

</details>

<details>
<summary>Layout tuples (3)</summary>

| Connection at the 360 pixel minimum, Cantonese | Models at the 360 pixel minimum, 2x, dark, bilingual | Popup at 360 by 640, 2x, dark, bilingual |
|---|---|---|
| ![Connection at the 360 pixel minimum, Cantonese](docs/images/captures/refresh-b4cbf0e/extension/matrix-options-connection_minimum_1x_light_yue.png) | ![Models at the 360 pixel minimum, 2x, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/matrix-options-models_minimum_2x_dark_bilingual.png) | ![Popup at 360 by 640, 2x, dark, bilingual](docs/images/captures/refresh-b4cbf0e/extension/matrix-popup_minimum_2x_dark_bilingual.png) |

</details>

#### Documentation site

Captures of the documentation site staged from source `048cfbd` and served from loopback in a disposable headless Microsoft Edge profile, light theme, English. They show public pages only, not native-product or installed acceptance. The workspace page was not captured because its article list renders unstyled.

<details>
<summary>Documentation site (6)</summary>

| Home page | Home page at 320 pixels, DPR 2 | Documentation library |
|---|---|---|
| ![Home page](docs/images/captures/refresh-b4cbf0e/site/home-1280x900-light-en.png) | ![Home page at 320 pixels, DPR 2](docs/images/captures/refresh-b4cbf0e/site/home-320x800-dpr2-light-en.png) | ![Documentation library](docs/images/captures/refresh-b4cbf0e/site/library-1280x900-light-en.png) |

| Wiki | Capture gallery | Browser extension local models article at 360 pixels |
|---|---|---|
| ![Wiki](docs/images/captures/refresh-b4cbf0e/site/wiki-1280x900-light-en.png) | ![Capture gallery](docs/images/captures/refresh-b4cbf0e/site/gallery-1280x900-light-en.png) | ![Browser extension local models article at 360 pixels](docs/images/captures/refresh-b4cbf0e/site/article-local-models-360x800-light-en.png) |

</details>

The refresh folder holds a [manifest](docs/images/captures/refresh-b4cbf0e/manifest.json) with each image's hash, size, viewport and source commit; the later installed round has its own [manifest](docs/images/captures/refresh-6ef15e8/manifest.json). `node scripts/refresh-screenshots.mjs capture` and `node scripts/refresh-screenshots.mjs desktop` regenerate it, and `node scripts/apply-screenshot-refresh.mjs` rewrites every reference. The earlier original captures, including the history-guidance and packaged Windows images, were removed from the current tree and remain in Git history; their records stay in the [preview inventory](docs/images/captures/preview/inventory.json), [preview verification summary](docs/images/captures/preview/verification-summary.json), [Linux capture provenance](docs/images/captures/provenance.json) and [Windows capture provenance](docs/images/captures/windows/provenance.json). The diagrams here explain behavior; they are not screenshots or runtime evidence.

## Build, package and verify

**Windows 10/11 x64 is the delivery target.** Use the real root entrypoints from a checkout:

```bat
build.bat /s
build-installer.bat /s
```

The first builds the product. The second produces the genuine **unsigned Squirrel.Windows** installer. Unknown-publisher warnings are expected. [Bootstrap](scripts/bootstrap.ps1) uses [pinned dependency metadata](dependencies.json), obtains missing supported tools and reuses verified caches. Explorer mounting requires the genuine WinFsp driver and user-supplied elevation where applicable. A required license, unavailable credential or restart remains a separate boundary.

Local checks are separate from production:

```powershell
pwsh -NoProfile -File scripts/verify-local.ps1
```

This script runs broad local checks; consult affected feature documentation for focused checks. Production GitHub Actions runs builds and packaging without tests or lint. Build, package inspection, native execution, GUI interaction and release delivery are separate verdicts.

```mermaid
flowchart LR
    Source["Exact source revision"] --> Build["Root build entrypoint"]
    Build --> Package["Root installer entrypoint"]
    Package --> Bytes["Inspect package and downloaded bytes"]
    Bytes --> Install["Verify installation and updating"]
    Install --> Runtime["Verify native and GUI workflows"]
    Runtime --> Evidence["Review source-bound evidence"]
    Evidence --> Release["Verify normal release and documentation delivery"]
```

The verification diagram is a path, not a claim that every step passed. Releases must have draft and prerelease flags false, an immutable unique tag, intended source and verified assets. Hosted metadata alone does not prove installation or runtime behavior.

## Security and recovery boundaries

<details>
<summary>Security, privacy and recovery boundaries in full</summary>

- Keep credentials and backups outside storage/cache roots. There is no promised password-recovery service.
- Password or key-file credentials protect the vault key. Content, namespace metadata, journals and history use authenticated encryption. [Native storage](docs/features/storage/native-vault.md) specifies the format.
- Storage and cache roots must be separate and non-overlapping. Managed symbolic-link and reparse paths are rejected.
- Applications receive plaintext through the unlocked drive. Copying outside it intentionally creates plaintext; Windows or other applications may also retain temporary data.
- Startup registration and current-user protected automatic unlock are separate controls. Automatic unlock does not protect data from an already unlocked operating-system session.
- Local durability, source publication and synchronization-provider upload are distinct. Ciphertext sizes, object counts and activity timing are not hidden.
- History and recycling preserve recovery without promising secure erasure or reclaimed space. Failed operations retain recovery state.
- Browser pairing is deliberate and temporary. Downloads still require a desktop destination and confirmation. Read-only protection observations cannot authorize browser profile access or personal wording.
- Server preparation verifies reviewed files without accepting the server license, installing Java globally or starting a server. Local process, local Docker, SSH process and SSH Docker operational acceptance remain unavailable until their own requirements are met.
- Existing installations, mounted user data and incomplete branches remain protected while verification continues.

</details>

## Project size and human-time estimate

**Estimate, not a measurement:** writing this project by hand would plausibly take one person about **85.3 to 170.7 person-months** (1,707 to 3,414 working days). Nobody built it that way; this gives a sense of scale and is not a claim about effort, quality or value.

| Hand-written code | Files | Non-blank lines | Multiplier | Weighted lines |
|---|---:|---:|---:|---:|
| Application source (JavaScript) | 359 | 29,631 | 1 | 29,631 |
| Native engine and drive adapter (C#) | 51 | 7,533 | 1.5 | 11,300 |
| Styles and markup (CSS, HTML) | 24 | 1,125 | 1 | 1,125 |
| Tests | 414 | 29,781 | 1 | 29,781 |
| Build, release and tooling scripts | 134 | 13,509 | 1 | 13,509 |
| **Total** | | **81,579** | | **85,346** |

**Arithmetic:** 85,346 weighted lines ÷ 50 lines per day = 1,707 days, and 85,346 ÷ 25 = 3,414 days; at 20 working days per month that is 85.3 to 170.7 person-months.

**Assumptions:** 25 (conservative) to 50 (optimistic) non-blank lines per 8-hour day of finished, reviewed, debugged code, a common industry rule of thumb rather than a measurement of this team. The native engine counts at 1.5 times because encrypted storage and a filesystem adapter are harder than their size suggests. Part of the application source is written as long lines, so line counts understate it. Design, research and review time beyond the test code are not included.

**Left out, exactly as the line count leaves them out:** Markdown prose (counted separately, not estimated) (263 files); images, JSON data and catalogues, and other non-code files (229 files); design reference prototypes (51 files); vendored, bundled or build-output trees (16 files); lockfiles (1 files). Markdown prose (16,896 non-blank lines in 263 files) is not estimated.

Reproduce it with `node scripts/human-time-estimate.mjs` (prints the same table from `git ls-files`) and refresh this block with `node scripts/human-time-estimate.mjs --write`. The block may lag the tree by up to 10 percent before `--check` and the test fail.

## Documentation and contributing

Browse [all categories](docs/features/README.md), [storage](docs/features/storage/README.md), [desktop verification](docs/features/desktop/README.md), [interface](docs/features/interface/README.md), [access](docs/features/access/README.md), [platform](docs/features/platform/README.md), [release procedures](docs/features/release/README.md), [changelog](CHANGELOG.md), [deployed library](https://ding-ding-projects.github.io/material-file-encryptor/library.html) and [wiki snapshot](https://ding-ding-projects.github.io/material-file-encryptor/wiki.html). Live documentation delivery is separate from this source revision.

Read [AGENTS.md](AGENTS.md), the handoff and affected documentation before editing. Preserve unrelated work, reconcile fetched history, use the root entrypoints, run proportionate local checks and retain failed receipts. Integrate completed work into `main`, push it and verify the remote ref. Keep unfinished work explicitly incomplete, never force-push without reviewed authorization, and never delete uncommitted, unmerged or unpushed work.

Keep credentials, private instructions, machine paths and unapproved data out of source and published material. Review text and pixels before publication. Agents must never initiate restart, shutdown, sign-out, sleep or hibernation of the user's current computer. User-approved settings changes are separate from actual power actions; native elevated consent comes from the user. External communications require explicit authorization.

The root [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [LICENSE](LICENSE) files appear as tabs above this README on GitHub, so they are not repeated here.

## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.

## Guidance and responsive interface candidate

<details>
<summary>Guidance playgrounds, responsive documentation controls and the table focus ring</summary>

The current candidate replaces persistent guidance text entries with accessible information icons and isolated worked examples. All 88 static settings descriptors have authored practice fixtures; scheduled scalar values, clear actions and snapshot operations have separate synthetic examples. Other control families and the complete built acceptance inventory remain unfinished. See [guidance playgrounds](docs/features/interface/guidance-playgrounds.md) for exact boundaries and remaining work.

Every capable control in the desktop shell markup, on the website's home page and shared preferences dialog, and in the browser extension popup and workspace now has its own compact information icon immediately before it. The icon opens a control-specific explanation, guided steps and an isolated worked sample that never starts the real operation or reads a live value. A guard test removes the icon, the target binding, the keyboard action and the contextual panel one at a time and requires each removal to fail, and a coverage test reads each page's markup so an unexplained control fails. Controls that feature modules create after start-up are not covered yet, and no built-app capture of these icons is recorded. See [information icons](docs/features/interface/info-icon-guidance.md).

The desktop app also has a first-run [setup guide](docs/features/interface/setup-guide.md): language and appearance, a read-only WinFsp and server runtime check, naming a drive and opening the existing create or unlock dialog, and showing the browser pairing code. It saves progress, can be skipped, works from the keyboard, and reopens from Help or the command palette. Its source checks use fakes for the preference, driver, dialog and pairing services; a built-app run and capture of the first-run flow are not recorded yet.

Public document controls now prepare real Material Web components before listeners and localization snapshots. The navigation menu follows its measured header height, and tab information panels use the actual navigation scrollport width. Focused source checks pass; two representative source-bound documentation captures are inspected and inventoried. The full language/theme/scale matrix and live publication checks remain pending. Existing historical images retain their original provenance.

The table keyboard-focus ring now paints above sticky headers. Independent review verified twelve source-bound captures and unchanged geometry at both desktop sizes. This bounded English, scale-1 result does not complete the full visual acceptance matrix.

</details>

## Browser workflow source update

<details>
<summary>Browser workspace notes and external-editor workflow (English and Cantonese)</summary>

The browser workspace includes full note reading and an external-editor workflow using native file selection, signed-editor selection and explicit desktop confirmation. See [browser workflows](docs/features/browser/README.md) for behavior and verification boundaries. Current installed-extension, native-dialog and visual acceptance remains pending; earlier captures retain their original source identity.

瀏覽器工作區加入完整筆記閱讀，同經原生檔案選擇、已簽署編輯器選擇及桌面確認嘅外部編輯流程。行為同驗證邊界見[瀏覽器工作流程](docs/features/browser/README.zh-HK.md)。目前安裝後擴充功能、原生對話框同畫面驗收仍然待做，舊畫面證據保留原本來源身份。

</details>
