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

The five-adapter baseline is historical. The current packaged producer composes foundation, access, records, tools and personalization adapters, while actual fixture preparation, observation and restoration still require the supported native producers listed below. Its default tuple selection covers only locked drive, password creation and default settings at English/light/scale 1 across two viewports; callers must supply the full declared tuple set for complete coverage. Inventory additions retain their owner source revision and reason, while an independent test freezes the original 74 IDs.

The remaining finite acquisition capabilities are:

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

