# Local Java server preparation

This desktop workflow prepares verified server files. It does not start Java, accept a license, or enable any of the four server-management targets. Browser access is unavailable.

## Refresh official versions

Choose **Refresh official versions** to retrieve the official Mojang version manifest. The host verifies bounded HTTPS metadata and records its source SHA-256 and retrieval time. Refresh is explicit; opening the panel makes no network request. Failed refresh preserves the previous in-memory catalogue with an offline label. No automatic restart recovery or catalogue adoption is implemented.

## Choose and search

The panel retrieves pages of 100 official version identifiers. **Load more versions** extends the searchable set; search and its regular-expression builder cover loaded rows only, not an unrequested full catalogue. Selecting a row resolves its official metadata and verifies the manifest-provided SHA-1. Versions without a server download remain unavailable. The host issues an opaque selection identifier, so the renderer cannot supply URLs, paths, digests, runtime executables, or provider claims.

## Prepare

**Prepare verified server files** admits one operation at a time. The host requires current metadata, an exact size no greater than 1 GiB, and available capacity of that size plus 16 MiB. It creates an exclusive session-owned root below application data. The existing local adapter streams the official download to exclusive staging, enforces its exact size and SHA-1, records SHA-256, syncs the file, writes `eula=false`, and publishes the server directory by rename. Progress bytes remain unverified until this completes. Capacity is an admission observation, not a reservation against other writers.

## Cancel

**Cancel preparation** requests cancellation of the exact owned operation. It does not claim immediate completion. Closing the application aborts and waits for active preparation tasks. Failed or canceled operations retain staging and durable operation records for recovery. This workflow performs no recursive deletion. Automatic recovery, restart adoption, and a user-facing recovery manager remain pending.

## Review license

**Review server license** is available only for a successfully prepared owned server. It shows the official Minecraft EULA link and the current acceptance state. Reading or opening the link cannot accept it. The protected host now supports a separate native confirmation action bound to the exact server version and digest; the existing preparation panel does not yet expose that action. See [protected native supervision](native-supervision.md). Actual startup remains unavailable.

## Guidance and accessibility

Every preparation action has distinct optional guidance above its target. The original action remains directly usable. Guidance invokes and awaits the same consumer rather than duplicating mutations. English, Cantonese, and bilingual metadata include purpose, choices, defaults, effects, examples, validation and recovery. Search clearing respects read-only input. Registered Material Design 3 controls are used; owned listeners, guidance registrations and subscriptions are disposed on destruction. Stale pending UI continuations cannot repaint a replacement panel.

## Security and remaining targets

Desktop IPC validates action-specific bounded identifiers and rejects unknown keys. The host resolves official metadata, owned paths and hashes. No launch provider is passed to the preparation adapter. Protected native lifecycle composition is implemented, but compatible runtime admission, exact-version generated network configuration proof and actual lease IPC acceptance remain unavailable. A lease primitive or composition alone does not establish safe startup. Local Docker, SSH process and SSH Docker management are not implemented. All four targets remain unavailable.

## Verification

Focused tests exercise the real preparation host and local file adapter with synthetic bytes, strict desktop/browser IPC admission, and the mounted component with an injected DOM fixture. They cover byte mismatch, stale metadata, serial admission, capacity refusal, cancellation before publication and during streaming, license refusal, original identifier payloads, guidance ownership, search clearing and stale-instance disposal. No real server download, Java execution, native helper, GUI launch or product build was performed. Rendered layout, keyboard interaction, full language/theme/scale coverage and packaged-runtime acceptance remain pending.

## Bounded metadata admission and retained search

Pending metadata resolutions and retained selections share a synchronous 100-slot admission limit. A slot is reserved before contacting the provider and released in finally, including rejection and shutdown. Search reapplies the retained query after refresh, pagination, language changes and status repaint; disposed search generations cannot apply delayed results. The preparation region is registered as `mfe-server-preparation` with its exact Material Design 3 and shared control inventory. These are source/component checks, not rendered acceptance.

## Reviewed portable Java runtime

After server preparation, **Check reviewed Java runtime** matches the metadata-specified Java major and native architecture. **Prepare reviewed Java runtime** opens a native exact-byte trust/download confirmation, with Cancel selected by default. No URL, executable, checksum, command or path comes from the renderer. Other majors and architectures remain explicitly unavailable; the complete game version catalogue is unchanged.

The initial supported package is Eclipse Temurin Java 21, Windows x64 JRE, release `jdk-21.0.12.1+1`. Its [official ZIP](https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip) is exactly 48,999,141 bytes with SHA-256 `d35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636`. The [official API cookbook](https://github.com/adoptium/api.adoptium.net/blob/main/docs/cookbook.adoc) and [archive installation documentation](https://adoptium.net/installation/archives/) establish the acquisition and checksum route. Official metadata and release asset readback matched before the archive was downloaded and inspected without execution.

The pinned inventory contains 315 files and 62 nested directories, totaling 151,524,241 expanded bytes. It preserves all runtime DLLs and legal files. Main-process transfer checks exact archive bytes and SHA-256, verifies capacity for archive plus expanded tree plus 16 MiB, and publishes the archive only after verification. Native code rechecks the archive under a deny-write/delete handle, rejects unreviewed names, traversal, alternate streams, links, duplicate/case-colliding entries, unexpected counts and expansion, then verifies the exact complete tree against its embedded inventory. Temporary full-tree native leases protect every member and its ancestors during registration/status verification.

Progress separates received bytes, archive verification and complete native tree verification. **Cancel runtime preparation** requests cancellation of the owned transfer or native extraction. Failure or cancellation retains staging and recovery state, without recursive deletion or adoption. Preparation does not execute Java, accept the Minecraft EULA, install globally, change PATH or JAVA_HOME, or start a server. Runtime execution, future full loading-tree protection during launch, exact-version network configuration and real GUI/runtime acceptance remain unverified. Native compilation and actual native extraction have separate verdicts from source and synthetic checks.
