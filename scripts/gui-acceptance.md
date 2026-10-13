# GUI acceptance

`contracts/gui-states.json` is a hand-written state inventory. Every state requires two viewports (1180×850 and 880×650), three languages, two themes and four renderer scales. The current 89 states produce 4,272 tuples. An inventory row is a requirement, not a completion claim.

Run `node scripts/gui-acceptance.mjs inventory` to validate and print the current count. The focused admission regressions are `node --test test/gui-acceptance.test.js test/gui-acceptance-target.test.js`.

## Component fixture

`node scripts/gui-acceptance-components.mjs <absolute-output-directory>` exercises real bundled Material components through the production module graph and CSP. On Windows it uses the existing owned Lowlevel hidden-desktop lifecycle, exact process and CDP ownership proof, and an isolated profile. The exported `runComponentAcceptance` also accepts the existing lifecycle runtime injection for an already installed browser and Playwright module. It does not install browsers or change the visible desktop.

The fixture checks menu search focus, regex-builder retention, pointer selection, exactly-once Enter and Space activation, rejection of stale items and locked targets, dismissal, command-palette choices, one shared menu, focus restoration, auxiliary controls that must not submit a form, and real shadow-root file-picker selection. File chooser interception proves the browser request and selection behavior, not pixels from the operating-system picker.

`components.json` retains separate behavior results, served-resource hashes, source binding when available, genuine diagnostic capture hashes and acquisition timestamps, failures, and closure information. Inspect each retained PNG separately. These captures are source-fixture diagnostics without settled-motion or design-parity admission. They must never be relabeled as packaged, native-drive, physical-DPI, or full-matrix acceptance.

## Packaged matrix admission and resume

The integrated candidate must be built using `build.bat /s`. Acquire each state through its real user actions and synthetic owned data, with independent observable results. Acquisition adapters remain responsible for actual state transitions, fixture setup, native input, current process ownership, layout-probe receipts, reference captures and image inspection. The admission module does not invent those adapters or manufacture evidence.

Create a candidate binding with `bindingFor`, including the exact source commit, executable, packaged resources, verifier, reference and inventory hashes. Each row supplied to `auditRun` must match that binding and its exact tuple. It needs relative evidence paths and hashes for the raw capture, layout receipt, reference capture, comparison and diff, plus separately hashed action evidence. Missing or duplicate tuples, omitted actions, generic controls, unregistered controls, outer-frame scrolling, clipping, uninspected captures, changed bytes and mismatched candidates cannot pass.

Native display-scale evidence is independent. Supply one real receipt for each scale, bound to the same candidate, with existing unchanged bytes. Renderer device-scale emulation cannot satisfy this requirement.

`resumeManifests` emits one manifest per state, each with 48 phases, for the installed `resume-verification-run` ledger. This remains within its 128-phase limit. Each phase fingerprints its tuple, state contract, executable, resources, reference, verifier and evidence directory. Use the shared ledger's `init`, `record`, `status` and `resume` operations. Reacquire live process identities for every fresh execution; saved PIDs, window handles, ports and CDP targets are never resumable evidence.

The audit CLI accepts `node scripts/gui-acceptance.mjs audit <run.json>`, where the JSON contains `binding`, `rows`, `root` and `physicalDpi`. Exit 0 means all declared evidence was admitted; exit 2 means required evidence remains pending. The validator verifies declarations and bytes. It cannot independently prove human inspection or that a producer truthfully reported its route, so retain original acquisition receipts and independent review.
## Packaged acquisition producer

`gui-acceptance-acquire.mjs` builds deterministic production navigation plans for all 89 inventoried states and 4,272 tuples. `acquireMatrix` accepts the existing exact-owned packaged launch, proof-bound `executePlan`, and `createModernProbeEvidence` adapter. It retains raw results before validation, validates native bookends and version-1 layout receipts, hashes the original PNG, and leaves each capture awaiting independent inspection and reference comparison. A captured row is never automatically an accepted row. Renderer emulation does not prove physical display scaling.

`gui-acceptance-baseline.mjs` supplies five initial state adapters: settings, locked-drive create/unlock/cancel, password-dialog edit/clear/cancel, local-model Help, and attention toggles with restoration. These adapters use the actual mounted production UI. Their plans are source-checked only until a pinned packaged candidate executes them. `ownedFixturePreparation` reads native storage/cache/drive identity before mutation and uses real cancel/lock controls. The fixture producer excludes `M:` unconditionally and fails when no other valid drive letter exists.

The caller supplies `createProbeEvidence({outputRoot, tuple, binding})`, returning `createModernProbeEvidence` configured with that exact attempt directory. This prevents same-named probe receipts from colliding across tuples. A minimal integration is:

```js
const prepareOwnedFixture = ownedFixturePreparation({launch, receipt, fixture});
const adapters = baselineAdapters({launch, receipt, prepareOwnedFixture, inventory});
const acquisition = await acquireMatrix({
  inventory, binding, launch, receipt, outputRoot, executePlan, adapters,
  createProbeEvidence: ({outputRoot}) => createModernProbeEvidence({
    binding: nativeProbeBinding, observe, validate, outputRoot, helperPath
  })
});
```

The five-adapter baseline is historical. The current packaged producer composes foundation, access, records, tools and personalization adapters, while actual fixture preparation, observation and restoration still require the supported native producers listed below. The former implicit three-state tuple selection has been removed. Full acquisition requires the caller to supply the exact current inventory and every explicit tuple. Inventory additions retain their owner source revision and reason, while an independent test freezes the original 74 IDs.

The remaining finite acquisition capabilities are:

The mounted foundation producer now supplies `drive-overflow` preparation,
restoration, right-click opening, renderer viewport resize and target removal.
It selects owned file A and right-clicks owned file B, then records the actual
captured target independently of selection. Its keyboard action callback observes
exactly one target-specific appearance-editor render and checks focus inside the
editor and back on B after Escape. This counts the observable render effect, not
hidden handler invocations. The consumer requires that evidence when the fixture
sets `requireActionProof`; older externally supplied fixtures keep their existing
action contract. Removal checks both owned file hashes before deleting only B,
and subsequent preparation recreates only that deliberate deletion with exclusive
creation. Foreign files or changed bytes prevent mutation. Resize uses actual
browser viewport input and does not establish physical display scaling. These
producers remain source-verified until the pinned packaged candidate runs them.
Menu keyboard input targets the unique `.query` field, excluding the hidden
regular-expression builder fields. After ownership admission, restoration attempts
overlay dismissal, viewport restoration and independently verified native-file
restoration even if an earlier step fails. Any failed step rejects the overall
restoration with aggregated causes; successful file removal alone is not reported
as complete restoration.
Resize and target-removal action evidence retains a validated `providerReceipt`
beside the final observable. It includes the actual route, bounded target IDs and
observations, restored viewport and `physicalDpiVerified: false` for renderer
resize, or the removed/remaining native identities. Only selected fields are
retained, with a 4,096-character bound. Required owned receipts fail closed when
missing or malformed; legacy fixtures without route receipts remain compatible
and do not receive inferred evidence.

| State family | Required supported setup |
| --- | --- |
| Drive populated, selected, offline, history, recycle, busy and error | Import tiny owned synthetic files through the native engine, create actual versions and deleted records, retain the exact fixture identity. Use an observed operation for busy state and an intentionally invalid owned operation for an error. Never inject status objects. |
| Menus, palette, notifications and appearance | Real pointer/keyboard plans and exact target identity, plus action-specific observable assertions. DOM click navigation alone does not prove native pointer or keyboard behavior. |
| Converter four stages | Owned source text and output directory through supported pickers, an installed enabled converter, real queue and cancellation. Record unavailable converter capability instead of inventing a catalogue. |
| Model store, cart, chat, profiles, help | Configure a bounded loopback synthetic provider through the supported endpoint setting, only if the shipped bridge supports it. Label provider fixture observations explicitly; no real-model claim or download. |
| Server preparation and progress | Supported catalogue/cache inputs and owned local server files. A local fixture server must satisfy the normal transport and integrity checks. Never suppress license or download validation. |
| Storage busy, running, paused, unavailable, invalid size | Genuine owned packing queue and writer state through the native service. Completed-row fixtures from source component tests cannot establish these packaged states. |
| Access profile, locks, authenticators, support, waiting and confirmation | Owned synthetic credential profile via the protected production adapter, actual wrong-factor attempts and cancellation. Secret/QR/code pixels must be cleared or hidden before capture. |
| Personalization language, appearance, attention, narration, history | Actual persisted settings, synthetic image and protected history identity; installed voices independently observed, absent voices remain unavailable. |
| Scheduled narrator, attention, appearance and logo | Actual clock-relative schedules through production controls. Record the observed wall clock, timezone, activation and restoration. No replacement Date or timer freezing. |
| File details and preview | Real synthetic version records, safe text preview, label and restore operations against the owned native fixture. |

`acquisitionCapabilities` reports missing setup, observable and every action adapter per state. Missing capabilities stop that state before capture, while the full inventory remains unchanged. Resume revalidates complete admission and rehashes all files; a caller-supplied success flag cannot skip acquisition. Interrupted or failed capture directories are retained and require a new attempt directory rather than overwriting their evidence.


For the bounded context keyboard sequence, construct `createMountedFoundationFixtures({opened, contextActivationKey: "Enter"})` and separately `createMountedFoundationFixtures({opened, contextActivationKey: "Space"})`. Each provider uses the same owned target, actual key input, single-render and focus assertions and retains `activationKey` in its result. Restore one owned fixture before creating the next. The default is Enter; other key values are rejected before input. This extension does not establish persistence, disabled/stale/locked runtime negatives or full matrix acceptance.

## Explicit acquisition scope and preflight

`acquireMatrix` and `acquirePackagedBaseline` now require the complete caller-supplied `contracts/gui-states.json` inventory and an explicit complete `matrixFor(inventory)` tuple list. Missing, empty, incomplete, duplicate, unknown or altered tuples fail before runtime or evidence-directory creation. The inventory and tuple list are copied before asynchronous work. The historical function name does not select a baseline implicitly.

Use `acquireDiagnosticSubset` or `acquirePackagedDiagnosticSubset` only for a deliberately bounded explicit tuple list. Their run and attempt scope is `diagnostic-subset`, and `accepted` remains false, even when a diagnostic caller supplies all tuples. The producer binding retains scope and expected/requested counts. Neither acquisition route certifies pixel inspection, design parity or physical display scaling.

Every adapter exposes a synchronous source-only `preflight` that checks required callbacks without running fixture setup or controls. The acquisition audit lists all states before the first plan; missing declarations remain unknown and missing providers remain unavailable. A declared provider is only a candidate route. Live ownership and actual workflow observations are still mandatory. Existing resume evidence must pass its separate source, content and inspection admission.

The [complete default-provider inventory](gui-acquisition-providers.md) records 22 declared routes and 67 unavailable producers, with the exact first missing capability for each state. No new provider fabricates application state or protected records. Current accepted matrix remains 0/4,272.

## Context appearance persistence sequence

After preparing the owned mounted `drive-overflow` fixture, explicitly invoke its `verify-persistence` method. This supplemental sequence uses the same A/right-click-B and single-editor-render route, edits the actual opacity input to 0.37, checks saved state and live effect, reloads the page, repeats startup readiness, reopens the exact target and compares saved state and revision chain. It then uses the normal Reset element control, checks a new restoration revision, closes the editor, reloads again and independently compares restored saved state, journal and original live opacity.

A fresh owned appearance profile with no appearance record or journal is required. No local-storage replacement, credential injection, product remount or completion hook is used. The default saved record and append-only revisions remain intentionally retained. This is semantic target restoration, not byte-for-byte removal of the original absent storage keys. Receipts disclose this distinction and never retain raw records.

`restore-persistence` can retry a failed restoration separately. Changed source or unexpected appearance/journal content prevents further mutation. If Reset element completed but the final reload failed, retry performs readback without resetting again. The containing fixture attempts appearance restoration before native-file restoration; if appearance restoration is incomplete, it retains the target files needed for recovery. Normal overlay failure alone still does not skip independently admitted native restoration. Source checks cannot certify the real controls, reload lifecycle, focus, layout or persisted effect. No additional full-matrix state is marked available or accepted.

Before input, the final observation must equal the original saved state and journal. The post-write observation remains provisional until it matches exactly the default appearance settings with one Base layer and only the target opacity property, plus exactly one new revision with the unchanged journal prefix, correct predecessor and matching snapshot. A concurrent pre-fill, post-write or coalesced same-target change cannot grant restoration authority. Unproved ownership preserves current records and synthetic files, including on a later restoration attempt. Reset element also requires a final unchanged state/journal observation immediately before activation. These are bounded observations, not a product-wide concurrency transaction.

## Supplemental renderer interpreter identity

The retained-launch recovery helper accepts supported uv/CPython metadata without an `executable` entry only by using the executing runtime's exact base executable. That file must exist, match `home`, and belong to an isolated configuration. The executing launcher must equal the requested launcher. An explicit executable declaration must match exactly; no console/GUI executable substitution or identity normalization is permitted.

The held base process command is compared with the internally derived, quoted base invocation. An intermediate launcher must retain the original invocation. The two command roles are not interchangeable, and a missing base command cannot fall back to the launcher command. Existing held PID, creation time, image, ancestry, repeated observation, source and file hash checks remain required.

Twelve dedicated Python checks pass, including a causal console/GUI substitution regression that failed against the preceding tracked implementation. The separate JavaScript wrapper checks could not load in the isolated checkout because `@electron/asar` was unavailable. No live retained-launch admission, renderer action, capture, build or acceptance tuple is established by these source checks. Actual continuation remains pending independent review and separately authorized runtime verification.

## Offline populated state provider

The default source producer now declares `offline-populated` through the exclusive mounted synthetic file provider. Its workflow is real native pin, bounded full-inventory and byte readback, existing select/release controls, optional re-preparation for capture, and independent pin/file restoration. See the provider inventory for ownership exclusions and retained-data limitations. Current declarations are 23 declared routes and 66 unavailable producers, superseding the historical 22/67 source audit only. Source declaration does not establish runtime availability or acceptance; the accepted matrix remains 0/4,272.


## Bounded packaged guidance diagnostic

Use `node scripts/gui-guidance-diagnostic.mjs validate <reviewed-config.json>` for read-only package, file and provenance admission. Use `run` only after assigning exclusive ownership of the intended package and its new hidden lifecycle. Validation does not start the native fixture, launch a process, create an evidence directory or prove live transport capability. Execution performs the supported direct-CLI capability preflight, revalidates inputs, then joins `openGuiAcceptancePackage`, `openPackagedRendererTarget` with graceful-only closure, and `acquirePackagedDiagnosticSubset`.

The configuration is a local, reviewed JSON document. It contains no credentials. Every field below is mandatory, unknown fields are rejected, and paths must be absolute canonical local paths. Supply actual hashes, not placeholders. The review interval may span at most 24 hours and must include the current time.

| Field | Required content |
| --- | --- |
| `schemaVersion`, `scope` | `1`, `diagnostic-subset` |
| `reviewedAt`, `expiresAt` | Explicit ISO timestamps for the reviewed configuration |
| `expected` | `sourceCommit` (40 hex characters), `version`, `executable`, and `hashes` containing exactly `executable`, `asar`, `nativeHost` |
| `buildReceipt`, `reference`, `inventory` | Each has exactly `path` and `sha256`; inventory is the complete current `contracts/gui-states.json` |
| `verifier` | `sourceCommit`, `entrypointSha256`, `packagedVerifierSha256`, `cdpDriverSha256`, `lowlevelClientSha256` |
| `transport` | `backend: "native-v1"`, `cli`, `cliSha256`, `python`, `pythonSha256` |
| `outputRoot` | New directory under an existing canonical parent, separate from all inputs |

The package source is read from the archive and must match its root `build.bat /s` receipt, executable, archive and native-host hashes. The verifier source is the current source revision running the diagnostic and may legitimately differ. The entrypoint must be tracked and the scripts directory must have no modified or untracked inputs before admission. For the retained candidate, the archive belongs to source `4840f931f67b16cb4ebde81c471d271908c4b021` with SHA-256 `fdc19a65d32748c10a438bf10b4c752a279e17e7fc6c3766aa558f19a5562433`; adding this diagnostic does not rebuild or relabel those bytes. The configuration still requires actual executable, native-host, version and build-receipt values from their reviewed receipt.

Compute `entrypointSha256` from this script and `packagedVerifierSha256` with the existing exported `packagedVerifierHash()`. Bind the installed lifecycle client and CDP driver from their existing managed skill paths. Set `MFE_LOWLEVEL_CLI`, `MFE_LOWLEVEL_PYTHON` and `MFE_RENDERER_PROCESS_BACKEND=native-v1` to exactly match the reviewed configuration; an HTTP override is rejected. Missing dependencies, installed helpers or native capabilities remain explicit failures. The script never installs a substitute or uses a visible browser. No existing profile or running capture session is reused.

Execution acquires exactly `p-language/1180x850/en/light/1` through its existing production adapter, including its original preference actions and restoration. It then uses proof-bound plans to open all five real settings tab information entries, change and reset their synthetic tabs, verify original navigation and persisted preferences remain unchanged, exercise invalid/valid/reset numeric practice, close information with focus restoration, and perform an original guided tab navigation followed by restoration. No bridge, store, consumer or component is replaced or remounted. Control changes use the mounted production controls; observations are separate reads. Preference observation is limited to the declared nonsecret settings fields.

The new local output retains `diagnostic-binding.json`, the existing package/fixture lifecycle receipts, acquisition receipts, proof-bound interaction plans, six raw diagnostic PNGs and `guidance-diagnostic.json`. Raw PNGs remain uninspected until a separate reviewer inspects them. The report always has `scope: "diagnostic-subset"` and `accepted: false`, including successful behavior, failures and incomplete closure. A failed acquisition stops the extra interactions. Any opened session attempts its own verified graceful closure once; profiles and uncertain process state remain retained by the existing lifecycle. A changed entrypoint, verifier, root receipt or installed helper stops subsequent interaction plans.

Menu keyboard, motion-runtime/unavailable-consumer and delayed-playback scenarios are explicitly unrun in this first entrypoint. This is not the complete 4,272-tuple matrix, physical display-scale proof, design parity, installed/update acceptance or a substitute for the real desktop capture owner's verdict. Seven focused unit admission/lifecycle checks pass in `test/gui-guidance-diagnostic.test.js`; they launch nothing and do not establish packaged behavior.
