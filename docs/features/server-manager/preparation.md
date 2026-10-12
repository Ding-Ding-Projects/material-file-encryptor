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

Desktop IPC validates action-specific bounded identifiers and rejects unknown keys. The host resolves official metadata, owned paths and hashes. No launch provider is passed to the local adapter. Native process supervision, compatible runtime admission, version-bound loopback configuration, resource limits and native lease IPC are not integrated. A lease primitive alone does not establish safe startup. Local Docker, SSH process and SSH Docker management are not implemented. All four targets remain unavailable.

## Verification

Focused tests exercise the real preparation host and local file adapter with synthetic bytes, strict desktop/browser IPC admission, and the mounted component with an injected DOM fixture. They cover byte mismatch, stale metadata, serial admission, capacity refusal, cancellation before publication and during streaming, license refusal, original identifier payloads, guidance ownership, search clearing and stale-instance disposal. No real server download, Java execution, native helper, GUI launch or product build was performed. Rendered layout, keyboard interaction, full language/theme/scale coverage and packaged-runtime acceptance remain pending.

## Bounded metadata admission and retained search

Pending metadata resolutions and retained selections share a synchronous 100-slot admission limit. A slot is reserved before contacting the provider and released in finally, including rejection and shutdown. Search reapplies the retained query after refresh, pagination, language changes and status repaint; disposed search generations cannot apply delayed results. The preparation region is registered as `mfe-server-preparation` with its exact Material Design 3 and shared control inventory. These are source/component checks, not rendered acceptance.
