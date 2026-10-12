# Acquisition provider inventory

This is a source-level audit of the default packaged producer, not runtime acceptance. All 89 states have navigation and adapter declarations. The callback preflight distinguishes a declared route from an unavailable producer before any state preparation or UI plan. A declared route still requires live ownership, supported services, successful interaction, restoration, pixel inspection and source-bound evidence. Accepted matrix remains 0/4,272.

| State | Navigation destination | Default provider declaration | Exact remaining admission |
| --- | --- | --- | --- |
| `drive-locked` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `drive-empty` | `drive` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.drive-empty.prepare` |
| `drive-populated` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `drive-selected` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `drive-busy` | `drive` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.drive-busy.prepare` |
| `drive-error` | `drive` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.drive-error.prepare` |
| `drive-overflow` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `drive-search` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `drive-notifications` | `drive` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.drive-notifications.prepare` |
| `offline-populated` | `offline` | declared | Live identity, native pin readback, controls, restoration and evidence unverified |
| `history-populated` | `history` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.history-populated.prepare` |
| `recycle-selected` | `recycle` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.recycle-selected.prepare` |
| `tools-default` | `converter` | declared | Live identity, workflow, restoration and evidence unverified |
| `settings-default` | `settings` | declared | Live identity, workflow, restoration and evidence unverified |
| `help-default` | `help` | declared | Live identity, workflow, restoration and evidence unverified |
| `create-password` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `create-key-file` | `drive` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.create-key-file.prepare` |
| `create-private-repository` | `drive` | declared | Live identity, workflow, restoration and evidence unverified |
| `converter-source` | `converter` | unavailable | `CAPABILITY_UNAVAILABLE: converter.prepare` |
| `converter-formats` | `converter` | unavailable | `CAPABILITY_UNAVAILABLE: converter.prepare` |
| `converter-options` | `converter` | unavailable | `CAPABILITY_UNAVAILABLE: converter.prepare` |
| `converter-queue` | `converter` | unavailable | `CAPABILITY_UNAVAILABLE: converter.prepare` |
| `ollama-model-store` | `ollama` | unavailable | `CAPABILITY_UNAVAILABLE: ollama.prepare` |
| `ollama-pull-cart` | `ollama` | unavailable | `CAPABILITY_UNAVAILABLE: ollama.prepare` |
| `ollama-chat` | `ollama` | unavailable | `CAPABILITY_UNAVAILABLE: ollama.prepare` |
| `ollama-profiles` | `ollama` | unavailable | `CAPABILITY_UNAVAILABLE: ollama.prepare` |
| `ollama-help` | `ollama` | declared | Live identity, workflow, restoration and evidence unverified |
| `server-prepare` | `server-manager` | unavailable | `CAPABILITY_UNAVAILABLE: server.prepare` |
| `server-progress` | `server-manager` | unavailable | `CAPABILITY_UNAVAILABLE: server.prepare` |
| `p-language` | `personalization` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-school-enabled` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: school.prepare` |
| `p-narrator` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: voices.prepare` |
| `p-appearance` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-schedules-draft` | `personalization` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-attention` | `personalization` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-history-locked` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-unlocked` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `appearance-context-pointer` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-context-keyboard` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-edit-normal` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-edit-layer-locked` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-edit-image` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-motion-track` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-motion-transition` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `appearance-history-rollback` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `storage-busy` | `storage` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.storage-busy` |
| `storage-running` | `storage` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.storage-running` |
| `storage-unavailable` | `storage` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.storage-unavailable` |
| `storage-invalid-size` | `storage` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.storage-invalid-size` |
| `file-details-versions` | `details` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.file-details-versions` |
| `file-details-preview` | `details` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.file-details-preview` |
| `access-profile` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-profile` |
| `access-locks` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-locks` |
| `access-once` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-once` |
| `access-authenticators` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-authenticators` |
| `access-support` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-support` |
| `access-removal` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `access-waiting` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-waiting` |
| `access-profile-locked` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `access-profile-unlocked` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `access-locks-empty` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-locks-empty` |
| `access-lock-wizard` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-lock-wizard` |
| `access-unlock` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-unlock` |
| `access-authenticator-list` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-authenticator-list` |
| `access-authenticator-registration` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `access-qr-hidden` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `access-confirmation` | `access` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-schedule-narrator` | `personalization` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-schedule-attention` | `personalization` | declared | Live identity, workflow, restoration and evidence unverified |
| `p-schedule-appearance-ref` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `p-schedule-logo-ref` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-schedule-active-override` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `p-schedule-restored-base` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: appearance.prepare` |
| `storage-paused` | `storage` | unavailable | `CAPABILITY_UNAVAILABLE: records.native-state.storage-paused` |
| `p-history-bulk-all` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-bulk-invert` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-bulk-range` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-export-selected` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-export-filtered` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-history-export-format` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: history.prepare` |
| `p-logo-preset` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-logo-crop` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-logo-safe-area` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-logo-background` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `access-history-locked` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-history-locked` |
| `access-history-unlocked` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-history-unlocked` |
| `access-history-waiting` | `access` | unavailable | `CAPABILITY_UNAVAILABLE: access fixture access-history-waiting` |
| `p-logo-reopened-recipe` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |
| `p-logo-title-preview` | `personalization` | unavailable | `CAPABILITY_UNAVAILABLE: logo.prepare` |

Missing callbacks must be implemented through supported native or actionable UI workflows. Placeholder functions, injected credential records, replacement bridges and fabricated operation results do not discharge this inventory. Caller-supplied providers receive the same runtime ownership and observation checks. Source callback presence cannot prove the runtime can produce a state.

## Source verification

The acquisition-family source suite passed 79 focused checks. Removing the complete-matrix assertion made the causal regression fail with a missing expected rejection; restoration passed the 18 acquisition/producer checks. These are synthetic source checks. No build, launch, capture, installed workflow or full matrix acceptance occurred.

## Independent inventory authority correction

The original acquisition validator shared Node's mutable JSON module object. Mutation before or after importing the validator could reduce its apparent authority to 88 states and 4,224 tuples while the canonical file stayed unchanged. Two isolated-process regressions failed against source 202c24c before repair. The validator now separately parses its fixed module-relative canonical file, deeply freezes every nested object and array, and derives the tuple plan from that private authority. Caller data is compared with the independent authority. Mutating the shared JSON module, caller copies or assertion diagnostic references cannot reduce the required inventory.

The two corrected import-order regressions and existing acquisition/producer checks pass 20/20. The default provider audit still identifies 22 declared routes and 67 unavailable producers. This repair supplies no runtime or visual acceptance; accepted tuples remain 0/4,272.

## Owned offline-file acquisition

The current source declaration inventory is 23 routes and 66 unavailable providers. The earlier 22/67 results above remain historical evidence. Only `offline-populated` changed declaration; accepted tuples remain 0/4,272.

The mounted provider exclusively creates Acceptance A/B in the existing fresh owned non-reserved drive fixture, verifies original bytes and exact native identities, then calls the actual `keepOffline` API for each ID. It reads back the full two-row native inventory after every call and accepts only the requested offline-flag delta. The existing foundation actions select and release through normal controls. Re-preparation can restore a released owned pin before capture.

Restoration releases only still-pinned owned IDs through `releaseOffline`, verifies both original bytes and native flags, then invokes the existing owned file restoration. Pre-existing pins, unknown flags, duplicate or changed IDs, foreign files, pagination, changed bytes, locked/busy/foreign ownership and uncertain pin or release completion preserve the files instead of claiming restoration. Shared populated/context restoration cannot remove files while offline ownership remains active. Synthetic version history and encrypted cache retention remain governed by the product; no cache purge or byte-for-byte vault rollback is claimed. These bounded observations do not provide an atomic concurrency transaction.

Focused fixtures execute the actual provider callbacks over task-owned synthetic service data and retain separate positive and negative verdicts. They do not prove native runtime, mounted behavior, displayed rows, layout or pixel parity. Real frozen-package acquisition, UI release, restored mounted readback and hidden capture remain required.
