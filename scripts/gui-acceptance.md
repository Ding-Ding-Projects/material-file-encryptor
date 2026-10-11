# GUI acceptance

`contracts/gui-states.json` is a hand-written state inventory. Every state requires two viewports (1180×850 and 880×650), three languages, two themes and four renderer scales. The current 74 states produce 3,552 tuples. An inventory row is a requirement, not a completion claim.

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
