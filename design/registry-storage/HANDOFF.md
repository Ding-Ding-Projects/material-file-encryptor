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

## Conflict review addition: independently reviewed design

Design baseline: `5e30ef4dfddcb160c78cfde4e0f7a8ecf20d0871`. This addition specifies a production workflow in the existing Storage maintenance workspace. It is not implemented behavior or live verification. Existing backup, schedule and restore controls remain separate.

### Task and layout

Add a dedicated **Review synchronization conflicts** section after registry backup and restore. Introduce it with: “Concurrent changes are retained for review. Compare the recorded versions before choosing which file to use.” Show the number of loaded unresolved records, explicitly labelled as loaded rather than a total when pagination remains. Provide Refresh conflicts and Load more, then a keyboard-operable list of review records. Do not choose a resolution merely by selecting a record.

The selected record opens an in-flow comparison, not a marketing card or an automatically opened modal. Compare **Current file** and **Preserved change**, each with its full wrapping path, entry identity, exact version identity and file/directory type. A null side says “No file on this side”; it is never displayed as an empty filename or an inferred deletion. Show the conflict kind as a localized known value, retaining an explicit unknown-kind state. Version identities are selectable factual text. No file content, credential or plaintext preview is requested by this workflow.

On narrow layouts, stack the two sides in the same reading order. Keep the selected conflict identity and its kind above both sides, and the choice controls below both sides. Ordinary file choices use a single-choice Material radio group with no initial choice. A separate **Apply selected resolution** action shows the exact selected choice and affected paths before submission; **Cancel review** clears the selection without modifying data. Keep loading, resolving and stale-state notices adjacent to the originating action.

### Choices and consequences

Render only choices explicitly supplied by `supportedChoices`; unknown values never become executable controls. The first implementation supports `keep-current`, `use-preserved` and `keep-both` only for ordinary file records with complete version information.

| Choice | User-facing intent | Required native contract before enabling |
| --- | --- | --- |
| Keep current file | Keep the current version as the selected live file. | Native result must specify the preserved version's retained history/recovery state. Do not claim it was deleted or recoverable without that contract. |
| Use preserved change | Use the preserved version for the selected live file. | Show the current path being changed and explain native retention of the prior version accurately. Exact target and version checks are mandatory. |
| Keep both files | Retain both versions as separate live files. | Native result must expose or allow readback of the actual resulting paths. Never invent a destination name or promise that a collision suffix will be a particular value. |

The final localized consequence copy must match the completed native contract before implementation review. Choosing a radio button never changes storage. Any consequential operation must retain the application's existing action-confirmation and permission boundary; the conflict section cannot create a weaker independent path.

Rename and delete conflicts remain explicitly **Unresolved: this conflict type is not supported yet**, with `unsupportedReason` rendered as bounded plain text. Keep both sides and their evidence visible. Do not mark them resolved, hide them after refresh, auto-select a file choice, or interpret an empty `supportedChoices` array as success. They remain required unfinished cases in the approved scope, not accepted exclusions. Directory, unknown-kind and malformed records are similarly non-actionable until their native semantics are supported and verified.

### Exact-version and pagination boundaries

Use `listConflicts({limit,cursor})` with a bounded page size, initially 25. Store the returned opaque `nextCursor` without interpreting it. Append Load more results only for the same session, source and list generation; reject duplicate conflict identities with inconsistent snapshots. Refresh starts a new list generation, removes obsolete cursor state and invalidates any chosen resolution.

Freeze `conflictId`, `currentVersion` and `preservedVersion` from the selected list record. Send only those exact values and the selected supported `choice` to `resolveConflict`. Never replace expected versions with later observations, omit a missing required version, choose the most recent version heuristically or retry resolution automatically.

On a stale-version response, keep the resolution unconfirmed, show “This conflict changed. Refresh and compare the new versions before choosing again,” and clear the chosen action. Refresh the actual record/list through the service; renewed user selection is required even when the new paths look the same. A generic failure preserves the unresolved state and offers bounded manual refresh. Report durable success only from the native verified result, then refresh unresolved records and resulting path/version information. A lost or malformed result remains unverified, never success by disappearance or by optimistic local removal.

### Independent activity and cancellation

Conflict-list loading and review selection use their own pending state, separate from registry synchronization. Cancel review may invalidate an in-flight list generation and clear the draft; it never claims cancellation of a main-process mutation. Existing registry Cancel remains available during registry work and never becomes the conflict-resolution cancel control.

The specified API has no conflict-resolution cancellation method. Once `resolveConflict` has been submitted, explain that the durable operation is settling, suppress duplicate submission and preserve its outcome. Closing or switching the view does not undo it. Do not offer a button labelled as canceling an operation that cannot be canceled. After settlement, normal refresh and review resume. Session/source switches and component teardown fence late responses without pretending to roll back completed native work.

### Accessibility, language and evidence states

All labels, consequence explanations, unsupported/stale outcomes and empty states require English, Hong Kong Cantonese and bilingual resources. Use genuine shared Material controls and existing typography/color/focus behavior. Give each record a localized accessible name containing its affected path and conflict kind, with supplementary version text referenced separately. The radio group has a legend, all controls remain keyboard operable, and resolution results use a polite live region while actionable validation uses an alert. Return focus to the originating record or list heading after refresh removes a resolved record. Preserve natural scrolling, wrapping identifiers and reduced motion; do not hide long paths or versions to make the layout fit.

| State ID | Required visible behavior |
| --- | --- |
| `conflicts-unavailable` | Explain unavailable services or source without claiming no conflicts. |
| `conflicts-loading` | Loading status; independent Cancel review invalidates pending presentation. |
| `conflicts-empty` | Confirm the successfully read unresolved list is empty, not merely unloaded. |
| `conflicts-list` | Loaded count, page continuity, explicit Load more when a cursor exists. |
| `conflicts-file-review` | Both recorded sides, exact versions, no preselected resolution. |
| `conflicts-choice-review` | Selected consequence and separate apply action, with Cancel review. |
| `conflicts-resolving` | Settling notice, duplicate suppression and no false cancellation promise. |
| `conflicts-stale` | Unconfirmed result, invalidated choice, mandatory re-read and reselection. |
| `conflicts-unsupported` | Rename/delete/directory/unknown case retained and explicitly unfinished. |
| `conflicts-error` | Bounded failure or unverified result; retained data and refresh recovery. |
| `conflicts-resolved` | Actual durable result plus refreshed inventory and resulting path information. |
| `conflicts-session-changed` | Old cursor, choice and responses cannot affect the newly selected source. |

Focused tests must cover exact version forwarding, no action on selection, unsupported choices, stale readback, duplicate submission, independent registry cancellation, missing-side records, pagination generations, session switches, lost-result uncertainty and all language modes. Production acceptance must use actual native conflict records and real controls, exercising each supported choice with resulting file/path/version readback. Rename/delete coverage remains unfinished until native support and its corresponding production evidence exist. Apply the existing normal/minimum viewport, language, theme and scale inventory to this new section; fixture tests and design prose cannot satisfy built visual or durable resolution evidence.

### Conflict implementation handoff

Independent design review accepted this bounded addition before implementation. The separate `registry-conflicts-panel.js` composition is mounted by storage maintenance and forwards its existing refresh, session, language and destroy lifecycle. Pure response/choice validation lives in `registry-conflicts-model.js`; localized text lives in `registry-conflicts-copy.js`.

The parent integration provides `services.listRegistryConflicts({limit:25,cursor?})` and `services.resolveRegistryConflict({conflictId,choice,currentVersion,preservedVersion})` through the existing selected-session native route. No main, preload or application bridge code was changed in this interface contribution. The native mutation must retain the existing consequential-action confirmation boundary. A `{cancelled:true}` confirmation result leaves the record unresolved. Only an exact matching `{conflictId,choice,resolved:true}` followed by a successful actual list refresh displays recorded-resolution copy. It never claims resulting path or history proof from that result alone.

Nine real-component tests with the isolated DOM fixture passed, covering pagination, malformed responses, explicit choice, frozen versions, unsupported/null/directory records, stale version re-read, in-flight cancellation semantics, source/session isolation and three language modes. The combined conflict, registry and maintenance check run passed 21 tests. These do not prove native conflict semantics, actual desktop accessibility or production visual behavior. Actual native, built interface, data readback and full layout acceptance remain pending.

The corrected native DTO may include `historyVersionId` and `isLive:false` on frozen historical sides of `resolution-divergence` records. The interface preserves both fields, labels historical records explicitly and never offers live-file choices for them. The added historical-record case brings the focused conflict component total to 10 passing checks. Divergent offline decisions remain visibly unsupported pending the complete native causal-resolution contract.

### Extended file-conflict workflows: independently reviewed

The next bounded extension adds only native-supported ordinary file cases. All exact-version, session, stale-result, explicit-selection and main-owned confirmation boundaries above remain. Directory records are still non-actionable.

For `rename`, both sides must be live ordinary files and advertise the relevant choices. Keep current retains the displayed current path/content; Use preserved selects the displayed preserved path/content while the native transaction retains the original logical entry identity and both histories; Keep both retains both displayed paths. The consequence copy is specific to rename and must never reuse the ordinary content-replacement explanation. These are intended native effects, not a claim that a particular operation completed; the result and actual list are still read back.

For `delete-versus-edit`, current is the surviving changed live file and preserved is null. Render a separate **Recorded deletion intent** block containing `deletionCommitId`, `path`, `entryId` and `expectedVersion`. Do not invent a live deleted side. Offer only advertised `keep-change` or `apply-deletion`, with no initial choice. Keep change retains the changed current file and records rejection of this deletion intent. Apply deletion removes this exact currently reviewed file through the native recoverable deletion path; it does not delete a directory or subtree. The request freezes `currentVersion`, sends `preservedVersion:null` explicitly, and includes the exact `deletionCommitId`. A changed file version or deletion intent requires a new review. Native evidence must confirm the final recovery/history wording before enabling the actions.

For `resolution-divergence`, display both frozen historical sides and their history identities. Only explicit advertised Keep both may become actionable after the native request contract is confirmed. Explain that the native operation materializes both historical contents at new unique paths without replacing existing live files. Never predict those names. Require actual returned `restoredPaths`, validate and display them as wrapping selectable plain text, then refresh the conflict list. A missing or malformed result remains unverified, not inferred successful recovery. Every required historical identity and request precondition will be forwarded exactly as specified by the native owner; no guessed request field is authorized.

All added labels, consequences, deletion metadata, actual recovery paths and result states require English, Cantonese and bilingual resources and keyboard-accessible controls. Focused tests must prove kind-specific choices, exact request payloads, stale deletion/version rejection, no directory operations, unknown-choice rejection, no invented live deleted side, no predicted restored path, session fencing and actual returned-path validation. Main/preload/application validation remains parent-owned. Native runtime and built visual acceptance remain pending independently of interface tests.

Independent review approved the bounded extension, conditional on confirmed native deletion and divergence contracts. File rename controls now use kind-specific consequence copy and exact reviewed versions; 11 focused component checks pass. Deletion and divergence actions remain disabled until their exact native request/result contracts are confirmed.

Native coordination confirmed file deletion semantics: Keep change retains the reviewed file as a new namespace version; Apply deletion performs recoverable deletion of exactly the reviewed current path. The separate deletion-intent block and exact nullable-version request are implemented, with 12 focused checks passing. The deletion transaction identity accepts the native 32-or-64-hex identifier contract. Divergence actions remain disabled pending native implementation verification.

Native coordination subsequently reported passing divergence materialization checks for opposite decisions, duplicate-submit rejection, concurrent recoveries, convergence and fresh-cache reopen. The interface now enables only advertised `keep-both` on two non-directory historical sides with explicit history identities. It sends the exact frozen `currentVersion` and `preservedVersion`, without extra history arguments. A matching successful response must also contain exactly two distinct bounded nonempty `restoredPaths`; otherwise the outcome remains unverified. Actual returned paths render as plain selectable text and are cleared when vault access becomes unavailable. The focused conflict suite now passes 13 tests. Native independent review and actual built interaction/visual acceptance remain separate pending evidence, not implied by this interface contribution.

### Frozen registry verification extension

`gui-acceptance-registry-states.mjs` declares exactly 33 task-owned states: the original 12 registry states, the original 12 conflict states, four kind/result states, and five separate consequential-choice states. Each has explicit fixture requirements, observable text, actions, a production predicate and an exact open-shadow layout selector. `registryContractRows()` is the registration handoff; `REGISTRY_STATE_ROUTES` maps each to the existing storage workspace. Parent integration must copy these exact task-owned rows into the single authoritative inventory, leaving baseline rows intact. The 48 existing viewport/language/theme/scale tuples per state yield 1,584 pending rows, not 48 completed measurements. This declaration is frozen for the first integrated build; later necessary changes require an explicit review correction.

`gui-acceptance-registry.mjs` exports `createRegistryAdapters` for the existing `acquireMatrix` adapter lifecycle. It uses `withCdpConnectionProof`, the supplied receipt-bound `executePlan`, ordinary Material control input/change events and DOM clicks, and actual production observables. It never launches a second GUI, replaces services, assigns component state, fabricates a native response or reports physical pointer/DPI proof. Existing acquisition owns exact EXE/ASAR/native/build/source binding, Lowlevel launch/window ownership, prospective runtime observation, layout receipts, image inspection and teardown.

The adapter requires an explicit `fixtures.registry` producer with `prepare`, `observeNative` and `restore`, plus the action-specific `settle`, `pickRestore`, `confirmResolution`, `switchSession` and `unlock` capabilities. Each production receipt must name the same source, task-owned synthetic scope, supported-native-service or approved-loopback-provider route, no renderer injection and nonempty actual evidence. Observation must independently verify the real native outcome. Native picker/confirmation producers must call the supplied actual-control activation callback and verify their own completion. Missing providers fail with `CAPABILITY_UNAVAILABLE`; boolean declarations alone never make an unrun state accepted. Transient loading/cancellation/error states need real native/provider conditions. A genuinely unavailable capability cannot be manufactured by removing the bridge.

`gui-acceptance-registry-native-fixture.mjs` provides concrete preparation of the native owner's persisted encrypted fixtures through the existing test assembly command `--registry-fixture prepare-review`. Supported cases are `file-edit`, `file-rename`, `delete-edit` and `resolution-divergence`. It requires exact interpreter/assembly hashes and a genuine hashed build receipt naming source and assembly hash, creates only a fresh reserved root beneath actual OS temporary storage, validates the ownership sentinel and real returned paths/DTO, and retains a private receipt. It never prints key bytes, unlocks a real user vault or deletes a fixture. The application must still use the normal unlock controls with that owned fixture; fixture preparation alone is not application interaction.

The final native divergence contract advertises `recoveryDirectory:""`. Only that explicit vault-root destination enables historical recovery. Copy states that fresh filenames are created at the vault root and historical parent directories are not recreated. Missing or non-root destination metadata remains non-actionable.

Six adapter/fixture-contract tests and the 13 conflict component tests pass. No GUI was launched, no real provider capability was consumed, no native fixture was created by this lane, and no image or layout row was accepted. The next step is a narrow real built workflow run with final parent-supplied source/build/hash/profile evidence and actual fixture/provider producers, before expanding to the full visual matrix.
