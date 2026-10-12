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
| `offline-populated` | `offline` | unavailable | `CAPABILITY_UNAVAILABLE: foundation.offline-populated.prepare` |
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
