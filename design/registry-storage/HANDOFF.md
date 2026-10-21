# Registry storage interface handoff

Source baseline: `a12899e5aa0b5472aab0494fb6cb951b624db722`. Target: the existing storage-maintenance SurfaceElement composition, using its registered Material controls and shared typography, color, shape, focus and reduced-motion behavior. This document is a design specification, not runtime evidence.

## Workflow and layout

Append an `mfe-registry-storage-panel` after the existing encrypted-image panel. Keep the existing pack/image workflows intact. The new panel contains four sequential task sections:

1. **Backup destination.** Private Docker Hub repository input (`namespace/repository`, without tag), explanation that existing authenticated credentials are used outside the renderer, and the last saved destination. No endpoint tester, password field or shell command input.
2. **Automatic synchronization.** Explicit enabled toggle, interval/calendar mode, interval minutes (5 to 10080), seven weekday checkboxes, comma-separated local `HH:mm` times, IANA time zone, missed-run choice, retry minutes (5 to 1440), and background option. Save persists configuration only. A disabled schedule still permits an explicit Run now. Calendar fields appear only for calendar mode; disabled-mode values are preserved. Invalid inputs focus their first invalid control without calling the bridge.
3. **Current operation.** Run now, Refresh, and Cancel controls; polite live status; native-supplied current phase, next due, last result and bounded error. Indeterminate progress for active work unless a measured value is supplied. Pending/cancelled/unknown states never become a success claim. Cancel remains operable while a long transfer promise is pending. Configuration mutation and duplicate starts are disabled during an active operation.
4. **Restore a snapshot.** Refresh list, immutable digest-based revision selector and selected snapshot metadata (vault, originating device, parent digests and encrypted file count). Restore selected opens the main-process native folder choice and restores into a fresh destination. Selection never invokes restore. Clear copy explains independent histories and that restoration preserves existing local data instead of silently overwriting or merging it.

## State inventory

| State ID | Expected controls and presentation |
| --- | --- |
| `registry-unavailable` | Missing bridge or selected vault; explanatory status, all actions disabled. |
| `registry-unconfigured` | Editable destination and schedule; Save enabled, Run/list/restore disabled. |
| `registry-ready` | Saved configuration, actual state and next due; Run and list enabled. |
| `registry-draft` | Changed inputs preserved across status refresh and language changes; saved configuration remains separate. |
| `registry-invalid` | Localized field-specific validation and focused field; no service calls. |
| `registry-running` | Indeterminate progress, actual phase; duplicate starts and edits disabled, Cancel enabled. |
| `registry-cancelling` | Cancellation requested; Cancel disabled; no rollback or completion claim. |
| `registry-error` | Safe bounded error and Refresh recovery; stale snapshots not actionable after failed list refresh. |
| `registry-empty` | Verified empty snapshot list distinguished from not yet loaded. |
| `registry-revisions` | Explicit digest choice with device/parent metadata; restore disabled until selected. |
| `registry-restoring` | Native folder decision/transfer pending; no destructive in-place option. |
| `registry-session-changed` | Drafts and responses isolated by session/source; old asynchronous response cannot affect newly selected vault. |

## Behavior and data boundaries

Use only `registryStorageStatus`, `configureRegistryStorage`, `syncRegistryStorage`, `listRegistrySnapshots`, `restoreRegistrySnapshot`, and `cancelRegistryStorage`. Request arguments follow the owning service contract exactly. Render service strings as text, never HTML. Do not infer private visibility, successful upload or supported mounted snapshots from configuration alone. Native snapshot lease acquisition owns unlocked/mounted admission. Before broadening the older image preparation predicate, require confirmation that its native preparation path now acquires the lease.

The schedule editor drafts are session-specific. Status refresh updates persisted status but does not overwrite an edited draft. Session/source changes invalidate old response generations and restore selections. Component teardown invalidates late promises. Cancellation bypasses the mutation serialization solely for the currently active selected session. No polling timer is added; the existing storage refresh path and explicit Refresh provide status updates.

## Accessibility and localization

English, Hong Kong Cantonese and bilingual copy use the existing localization function and external personal-text translator. Every control has a persistent visible label and accessible name. Weekdays use a fieldset and legend. Tab order follows the workflow above. Validation uses a visible alert, progress a polite status region. Selection does not move focus unexpectedly. Long digests wrap, flex rows wrap and controls have `min-width:0`; the panel scrolls with its existing parent rather than introducing a fixed-height page.

Use actual Material outlined fields, selects, checkboxes and buttons through `element`/shared controls; no new visual framework, fonts or image assets. The handoff changes no application identity, navigation contract or global settings.

## Verification inventory

Focused component tests must exercise complete schedule payload, invalid-input offline rejection, draft preservation, manual run while schedule disabled, duplicate suppression, cancellation during pending transfer, immutable digest restore, stale-session isolation, failed-list invalidation, teardown and three language modes. Existing image admission tests must be revised only by their assigned owner if the native lease contract changes.

Real built acceptance remains pending. Required reference tuple: storage-maintenance panel, normal 1180x850 and minimum 880x650 window bounds from `src/main/main.js`, English/Cantonese/bilingual, light/dark, display scale 100/125/150/200 percent. Record the resulting client area separately. Include every state above, keyboard traversal, long repository/digest labels and calendar inputs. Record exact source and built artifact hash, raw captures, layout probe and approved differences. No source fixture proves this matrix.

## Review

Independent design review accepted by the owning coordinator before implementation. The reviewer required actual 1180x850 default and 880x650 minimum bounds, concise file-count summaries rather than full file manifests in IPC, and truthful background scheduled-task semantics. These corrections are included.

## Implementation and evidence

`registry-panel.js` implements the real `SurfaceElement` composition. `registry-model.js` owns bounded configuration and snapshot validation; `registry-copy.js` owns English/Cantonese resources. The existing maintenance mount forwards session, refresh, localization and destruction to the new panel.

`node --test test/registry-storage-panel.test.js` passed 9 component tests covering complete calendar configuration, offline validation, draft persistence, manual sync with scheduling disabled, transfer cancellation, digest-only restore, session/source response isolation, unavailable services and localized accessible text. These tests use the real component with an isolated DOM fixture; they are not desktop runtime or visual evidence.

The main renderer must forward all six service methods. Main-process status must include exact `sessionId`, string `source` matching `storageDir`, boolean `configured` and string `state`; a configured status must include a valid configuration. Snapshot summaries carry `snapshot.fileCount` without copying file manifests into the renderer. Only `{verified:true,digest}` with a valid SHA-256 digest reports verified synchronization; only `{restored:true,requiresUnlock:true}` reports a restored encrypted copy.

Shared shell, service, preload and native changes remain outside this interface lane. The existing static-shell guidance inventory explicitly excludes dynamically loaded feature controls. Per-control guidance/playgrounds, shared surface inventory registration and actual built layout evidence remain separate acceptance work, not implied by these component tests. No runtime capture, installed build or transfer was performed in this lane.
