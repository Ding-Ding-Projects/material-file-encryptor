# Material File Encryptor

**An encrypted Windows Explorer drive with recoverable file history and an encrypted offline cache.** A native .NET engine and WinFsp adapter handle encryption and mounted filesystem operations. The desktop workspace brings storage, transfers, recovery, settings and documentation together.

[Documentation website](https://ding-ding-projects.github.io/material-file-encryptor/) · [Feature library](docs/features/README.md) · [中文文件](docs/features/README.zh-HK.md) · [Roadmap](ROADMAP.md) · [Current handoff](HANDOFF.md) · [Releases](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases)

> **Historical verified baseline:** `411ce5d55b96958799d996713374b7b683552234` records verified PDF packaging and documentation catalogue caching, plus the updater controller and future release-index repair. This is a fixed evidence reference, not the latest main revision. The exact root builds and bounded component results are recorded below. Complete required features, current Material Design 3 acceptance, installed startup, automatic updating and restart continuity remain unfinished. A successful build or release does not certify those outcomes.

Promotion retries retain their verified producer identity and check exact downloaded provenance before current-main promotion. [Release delivery](docs/features/release/preview-delivery.md) distinguishes source checks, downloaded bytes and still-unverified installed behavior.

## Current interface implementation

The shared titlebar, main workspace, content panel, data table and selection toolbar now use registered components with their own structure, styles and connection lifecycle. Original record rows and action nodes remain in place. The combined source inventory and component checks pass 59 tests. The exact root build of composition candidate `4959f2af4a2ced2980b2a68d2ba9fb4056458e35` passed; its package contains 6,066 entries with zero privacy rejections. Bounded real captures found incomplete table focus visibility. A separately preserved inset-outline candidate exposes the sides and bottom, but its top remains covered by the header. Full rendered composition acceptance remains incomplete. Existing images retain their historical source and do not certify this newer candidate.

The feature ledger now contains 315 assessments, preserving the original 210 desktop and documentation records and adding 105 independently scoped extension assessments. The extension records distinguish 35 unverified, 61 missing and nine inapplicable items. The combined catalogue declares 959 concrete surfaces and 230 public routes; these are inventory counts, not completed workflows.

Protected browser mediation has focused source and compiled synthetic pipe verification. Production profile authentication controls remain unavailable until their native callbacks and real extension interactions are implemented and accepted. [Shared compositions](docs/features/interface/shared-compositions.md) · [Extension assessments](docs/features/platform/extension-assessment.md) · [Protected mediation boundaries](docs/features/interface/protected-browser-mediation.md)

## Choose a workflow

| Workflow | Behavior and guide |
|---|---|
| Create and unlock a drive | Choose separate encrypted storage and cache roots, set a password or key file, and mount for ordinary Explorer access. [Drive integration](docs/features/drive/README.md) · [Native storage](docs/features/storage/native-vault.md) |
| Work offline | Pin authenticated encrypted content in the local cache. Pending publication remains queued when the backing folder is unavailable. [Transfers and safe lifecycle](docs/features/storage/transfer-lifecycle.md) |
| Recover changes or deletions | Browse retained versions and restore recoverable Recycle Bin entries. Retention does not promise reclaimed storage. [History and Recycle Bin](docs/features/storage/history-and-recycle-bin.md) · [File activity](docs/features/storage/file-history-activity.md) |
| Transfer encrypted objects | Use a backing folder or configured encrypted Git transport. Local durability and provider upload are distinct. [Encrypted transport](docs/features/storage/git-transport.md) |
| Customize the workspace | Language, appearance, typography, motion and attention controls retain their documented limits. Specialized editors and contextual guidance remain incomplete. [Settings](docs/features/interface/settings-completeness.md) · [Appearance](docs/features/interface/appearance-editor.md) · [Guidance](docs/features/interface/settings-guidance.md) |
| Propose a browser download | Pair explicitly, propose a public HTTPS link, then choose a native destination and confirm Start in the desktop. Pairing does not start a transfer or authenticate a browser profile. [Browser download handoff](docs/features/workflows/browser-download-handoff.md) · [Extension workspace](docs/features/workflows/browser-extension-workspace.md) |
| Inspect local tools | Conversion, local models and server preparation require their own supported providers. Their documentation does not certify complete running workflows. [Converter](docs/features/converter/README.md) · [Local models](docs/features/ollama/README.md) · [Server preparation](docs/features/server-manager/README.md) |

Browser workspace, profile mediation, native server provisioning and interface redesign source is integrated on main. Their runtime and visual acceptance remain pending and are not presented here as verified behavior.

## Architecture

The desktop sends bounded requests to the native host. Explorer uses the mounted filesystem. The engine persists encrypted objects and metadata; the configured backing-folder provider controls its own remote delivery.

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

## What happens to a file

Writes become durable encrypted objects and journal state before source publication. Closing the final writable handle can trigger background physical-part packing. Reads authenticate ciphertext before returning plaintext through the unlocked drive.

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

## Current continuation

Main 07a9d286 records the completed e7099d37 strict UTF-8 article repair. All 234 deployed files, the complete deployment archive, article bytes and exact About homepage were accepted at that observation. Later source requires its own live verification.

GUI source 04bf6c25 is preserved remotely with independent merge review and 34 focused checks. Its frozen isolated build started at 2026-10-12T22:58:04.8123288Z; package and runtime remain pending. Separate converter 18f98d53 has accepted build/package production, but actual admission d6e3 failed with BEHAVIORAL_PROBE_FAILED/provider-probe before customer input or hex sanity conversion. Its precise failed subpredicate is unknown; a typed diagnostic variant is planned, not executed.

The 105-family/210-row goal remains open, with 22 routes declared, 67 unavailable providers, zero of 4,272 accepted visual tuples and 74 design gaps. One offline-populated source unit is in progress without acceptance. Installed update and parity remain unfinished; initial installation, removal and real-data migration remain deferred. Deletion awaits the unavailable verified archive destination. See the [handoff](HANDOFF.md) and [roadmap](ROADMAP.md) for source-specific evidence.

## Source-bound verification

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

The historical inventory contains **105 required feature identifiers and 210 desktop/website rows**. It does not count completed features. The [goal](GOAL.md), [roadmap](ROADMAP.md) and [interface design](DESIGN.md) retain the outstanding controls, guidance, accessibility, language/theme/scale states and full visual matrix.

Two inspected source-bound documentation screenshots now appear below. Current native-product replacements and the full visual matrix remain pending.

### Verified preview captures

Historical originals retain their dates, sources, hashes and exclusions in the [preview inventory](docs/images/captures/preview/inventory.json), [preview summary](docs/images/captures/preview/verification-summary.json), [Linux provenance](docs/images/captures/provenance.json), [Windows provenance](docs/images/captures/windows/provenance.json) and [historical gallery](https://ding-ding-projects.github.io/material-file-encryptor/gallery.html). These diagrams explain workflows; they are not screenshots.

Updater source and future BOM-free release-index production are delivered on main. Local installer production passed at `ab975`; main `411ce5d` retains the same complete source tree after a preserved unpublished message correction. Hosted release [v1.344.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.344.1) passed the older installed-controller metadata check with an available verdict, and its independently downloaded Setup/package bytes passed archive and embedding checks. [Selected update proof](docs/evidence/hosted-update-1344-20261012.json) keeps those results separate from pending installed GUI and actual native apply acceptance. Installed startup, ready/Later interaction, restart continuity and removal are not certified. Local models must follow the documented one-click application-managed Ollama runtime procedure. The shared instructions may be updated only after actual installation and runtime proof; no shared physical directory is implied, existing installations remain untouched, and this documentation change starts no model service. See [local model boundaries](docs/features/ollama/local-models.md).

## Build, package and verify

Writes first become durable encrypted objects and journal state. Closing the final writable handle can trigger background physical-part packing. Source publication is separate and may remain queued. Reads return authenticated plaintext through the unlocked mounted drive, without a plaintext working folder.

The [file workflow diagram](#what-happens-to-a-file) above shows this sequence and its separate read and publication paths.

New vaults now default to an **80 MiB physical part cap (83,886,080 bytes)**. The maximum remains **90,000,000 bytes**, including authentication framing. This is a physical storage cap, not a plaintext allocation size. Existing data requires an explicit packing or resplitting workflow; versions and pending work remain protected. [Physical packing and migration](docs/features/storage/physical-packing.md) is the current source of truth for this behavior.

## Current evidence and its limits

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

### Current captures

#### Desktop application

These captures come from the built desktop application at source `2a9cb388718c3910f25ade90670758e81ddd2ce2` (executable SHA-256 `252a3fa6cf4c47dfa9d8d8f7ea1127c6f50cb1386ec01c1de6f006f37c1a4493`). Each run launched the application on a task-owned hidden desktop at 150 percent display scale, with a fresh synthetic profile, and captured the window by handle. Hashes, dimensions and capture times are in [the provenance record](docs/images/captures/material-2a9cb388/provenance.json). Drive mounting shows as unavailable because the capture host has no WinFsp driver installed.

![Drive workspace in the light theme, English](docs/images/captures/material-2a9cb388/drive-light-en.png)

![Converter with Material tabs in the dark theme, English](docs/images/captures/material-2a9cb388/converter-dark-en.png)

![Document workflow with labelled selects and in-field clear buttons, Cantonese](docs/images/captures/material-2a9cb388/workflow-light-yue.png)

![Converter in bilingual mode](docs/images/captures/material-2a9cb388/converter-light-bilingual.png)

![Material consent dialog in the light theme](docs/images/captures/material-2a9cb388/dialog-consent-light-en.png)

![Material consent dialog in the dark theme](docs/images/captures/material-2a9cb388/dialog-consent-dark-en.png)

#### Browser extension Home page and popup launcher

Headless Microsoft Edge with the staged extension from source `e96a0f0` (staged October 15, 2026 UTC), loaded unpacked into a disposable profile. The workspace opens on a grid of section cards instead of a tab bar, and the popup keeps the pairing controls above a launcher with one button per section. No desktop was paired, so the connection states read as unavailable.

![Extension workspace Home page with one card per section, light theme, English](docs/images/captures/refresh-e96a0f0/extension/home-1280x900-light-en.png)

![Extension popup with pairing controls above the section launcher, light theme, English](docs/images/captures/refresh-e96a0f0/extension/popup-380-light-en.png)

#### Browser extension Models tab

The same staged extension against a fake local model server; the permission prompt was stubbed for the connected states, and no real Ollama server or installed build was used. The chat capture shows a `javascript:` address left as plain text and the one https link opening with `noopener noreferrer`.

![Models tab connected to a local server, listing installed and running models, light theme, English](docs/images/captures/refresh-e96a0f0/extension/models-connected-light-en.png)

![Models tab chat with a streamed reply rendered as safe rich text with copy actions, light theme, English](docs/images/captures/refresh-e96a0f0/extension/models-chat-light-en.png)

#### Browser extension Status tab

The same staged extension. Check releases read the live published releases at capture time and found the release for this build, v1.657.1, with the code name Classic Har Gow. The narrow capture shows the inventory coverage list at 360 pixels with no horizontal overflow.

![Status tab showing the published release, its food code name and dish photo, light theme, English](docs/images/captures/refresh-e96a0f0/extension/status-release-light-en.png)

![Status tab feature coverage list filtered by a search at 360 pixels wide, light theme, English](docs/images/captures/refresh-e96a0f0/extension/status-coverage-narrow-light-en.png)

#### Browser extension Progress and publication, and Servers

Both sections before pairing: the progress note form keeps its send action disabled until the preview is reviewed and nothing was sent, and the Servers section shows its disabled reads and the four target types without any server data.

![Progress and publication section with the send action disabled, light theme, English](docs/images/captures/refresh-e96a0f0/extension/section-publishing-1280x900-light-en.png)

![Servers section before pairing, light theme, English](docs/images/captures/refresh-e96a0f0/extension/section-servers-1280x900-light-en.png)

#### Documentation site

Genuine captures of the staged documentation site built from source `e96a0f0`, served from loopback and captured in a disposable headless Microsoft Edge profile, light theme, English. The narrow captures use a 320 pixel and a 360 pixel CSS viewport. They show public pages only, not native-product or installed acceptance. The earlier history-guidance captures needed a paired local profile and are no longer shown; they remain in Git history.

![Documentation site home page at 1280 by 900](docs/images/captures/refresh-e96a0f0/site/home-1280x900-light-en.png)

![Documentation library at 1280 by 900](docs/images/captures/refresh-e96a0f0/site/library-1280x900-light-en.png)

![Documentation site home page at a 320 pixel CSS viewport with DPR 2](docs/images/captures/refresh-e96a0f0/site/home-320x800-dpr2-light-en.png)

![Browser extension local models article at a 360 pixel CSS viewport](docs/images/captures/refresh-e96a0f0/site/article-local-models-360x800-light-en.png)

The refresh folder holds a [manifest](docs/images/captures/refresh-e96a0f0/manifest.json) with each image's hash, size, viewport and source commit; `node scripts/refresh-screenshots.mjs capture` regenerates it.

Historical originals remain available in the [reviewed historical gallery](https://ding-ding-projects.github.io/material-file-encryptor/gallery.html), [original preview inventory](docs/images/captures/preview/inventory.json), [preview verification summary](docs/images/captures/preview/verification-summary.json), [Linux capture provenance](docs/images/captures/provenance.json), and [Windows capture provenance](docs/images/captures/windows/provenance.json). Their original dates, sources, hashes, exclusions and incomplete verdicts remain unchanged. The diagrams here explain behavior; they are not screenshots or runtime evidence.

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

## Documentation and contributing

Browse [all categories](docs/features/README.md), [storage](docs/features/storage/README.md), [desktop verification](docs/features/desktop/README.md), [interface](docs/features/interface/README.md), [access](docs/features/access/README.md), [platform](docs/features/platform/README.md), [release procedures](docs/features/release/README.md), [changelog](CHANGELOG.md), [deployed library](https://ding-ding-projects.github.io/material-file-encryptor/library.html) and [wiki snapshot](https://ding-ding-projects.github.io/material-file-encryptor/wiki.html). Live documentation delivery is separate from this source revision.

Read [AGENTS.md](AGENTS.md), the handoff and affected documentation before editing. Preserve unrelated work, reconcile fetched history, use the root entrypoints, run proportionate local checks and retain failed receipts. Integrate completed work into `main`, push it and verify the remote ref. Keep unfinished work explicitly incomplete, never force-push without reviewed authorization, and never delete uncommitted, unmerged or unpushed work.

Keep credentials, private instructions, machine paths and unapproved data out of source and published material. Review text and pixels before publication. Agents must never initiate restart, shutdown, sign-out, sleep or hibernation of the user's current computer. User-approved settings changes are separate from actual power actions; native elevated consent comes from the user. External communications require explicit authorization.

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

The current candidate replaces persistent guidance text entries with accessible information icons and isolated worked examples. All 88 static settings descriptors have authored practice fixtures; scheduled scalar values, clear actions and snapshot operations have separate synthetic examples. Other control families and the complete built acceptance inventory remain unfinished. See [guidance playgrounds](docs/features/interface/guidance-playgrounds.md) for exact boundaries and remaining work.

Public document controls now prepare real Material Web components before listeners and localization snapshots. The navigation menu follows its measured header height, and tab information panels use the actual navigation scrollport width. Focused source checks pass; two representative source-bound documentation captures are inspected and inventoried. The full language/theme/scale matrix and live publication checks remain pending. Existing historical images retain their original provenance.

The table keyboard-focus ring now paints above sticky headers. Independent review verified twelve source-bound captures and unchanged geometry at both desktop sizes. This bounded English, scale-1 result does not complete the full visual acceptance matrix.

## Browser workflow source update

The browser workspace includes full note reading and an external-editor workflow using native file selection, signed-editor selection and explicit desktop confirmation. See [browser workflows](docs/features/browser/README.md) for behavior and verification boundaries. Current installed-extension, native-dialog and visual acceptance remains pending; earlier captures retain their original source identity.

瀏覽器工作區加入完整筆記閱讀，同經原生檔案選擇、已簽署編輯器選擇及桌面確認嘅外部編輯流程。行為同驗證邊界見[瀏覽器工作流程](docs/features/browser/README.zh-HK.md)。目前安裝後擴充功能、原生對話框同畫面驗收仍然待做，舊畫面證據保留原本來源身份。
