# Current integration and verification status

The current source baseline is `1faecd9`; the source-bound native receipt identifies `3b9c5b4`. Main `3f3e97c` was pushed and its remote reference verified. All 208 desktop/site delivery rows remain `unverified`. Installed execution, native update and removal are explicitly deferred by the maintainer, not completed or waiting for an environment request.

A real 512 MiB import completed and its full mounted SHA-256 matched. A second 2 GiB file was cancelled during work at 1,419,575,296 bytes through **Cancel unfinished work then quit**. After exit, reopening the encrypted fixture showed only the completed 512 MiB file with its exact hash; the cancelled file was absent, and the fixture was locked again. Owned-process absence and hidden-desktop closure passed. Cancellation acknowledgement latency and the final cryptographic block were not instrumented, so these timings remain unverified.

The PNG GUI decoder remains unavailable while the direct provider loaded from the frozen application archive passes. Diagnostic source `1faecd9` awaits a new build; the direct-provider result does not establish the GUI route. The earlier canonical vocabulary upload used 145 real entries and passed 17 mapped DOM checks plus 17 reload checks. A 1,025-entry synthetic file was accepted. No payload network transfer or export occurred.

The exact root build and installer entrypoints succeeded for `3f3e97c`; unsigned status and archive CRC checks passed. Actual installed execution remains deferred. In the real mounted GUI, all four Updates controls ran without an exception; native installation remained disabled for the portable application with `INSTALLED_WINDOWS_SQUIRREL_REQUIRED`. This does not establish an installed update.

Deployment `38101869288` was independently checked: all 169 live files matched, all 115 article/wiki documents and 4,662 internal references passed, and the exact repository homepage was correct. Release workflow `38101869261` failed in the component-extraction subprocess and did not publish a release. Repair is in progress; successful website delivery is not successful release publication.

The earlier-source broad JavaScript run recorded 586 tests: 564 passed, 2 failed and 20 skipped. Both failures require unavailable Playwright Chromium revision 1248; this is not a green run. The shared-instructions sweep recorded 84 checks: 83 passed, zero failed and one unverified Windows Bash check, with a separate exact Linux pass. These are distinct receipts, not an all-platform green verdict.

The applicability mapping and earlier source reviews below remain historical source records. They do not upgrade current completion states.

## Reviewed source sets

| Revision | Source change | Integration boundary |
| --- | --- | --- |
| `b5b3096` | Minimal media component packaging and versioned update candidate | Integrated source; full application package and installed update acceptance remain separate |
| `a8dc69b`, `92d0827` | Source-built minimal media runtime, component manifest and hardened bootstrap | Six isolated format conversions and source/component checks are recorded in the component article; no whole-application acceptance is inferred |
| `0cdfdbc`, `34447cc`, `49a3adc` | Non-abandonable update preparation, retained recovery marker and readable blocked recovery state | Integrated source and focused regression coverage; no real installer or restart verdict |
| `6964aa2` | Responsive scheduling and desktop update controls | Integrated host wiring, not installed lifecycle evidence |
| `ed06efe`, `6e5d49f` | Streaming Windows CNG legacy authentication and bounded background-thread priority | Native source changes with their own focused checks; earlier benchmark figures are not automatically refreshed |
| `5c4fb99`, `98b327e` | Incremental display wording and desktop document/download handoffs | Integrated source; complete language and external-workflow acceptance remains unverified |
| `37fa47a` | Bundled verified media runtime and refreshed documentation inventory | Source packaging changes only; final runtime acceptance remains unverified |
| `2903fc5` | Windows local-model release provenance and verification helper | Ready provenance source, not proof of installation or model execution |
| `785fdf2` | Parent baseline keeps translated display wording out of persisted notification and tab records | Canonical-storage repair is source evidence, not a completed private-data or language runtime audit |
| `4ca05780` | Persistent panel move/resize/reset, notification progress and recovery actions, selected notification operations, opt-in local audio and transient control restoration | Ready source and deterministic fixtures; production host registration, callback behavior and geometry remain unverified |
| `455153bd` | Disconnected search cancellation and stale palette-result handling | Ready lifecycle repair; full browser/desktop interaction remains unverified |
| `86c5cec` | One-activation lock grants, selected authenticator/ticket operations, authenticated metadata exports and local clock-offset diagnostics | Ready source; no full factor, camera, bulk-cancellation or production accessibility verdict |
| `6ac06935` | Close pending record dialogs when local profile logs out | Ready invalidation repair; final production logout interactions remain unverified |
| `5f02f6c` | Guided local runtime recovery, native profile recipes and attachment handling | Ready source; installer navigation, process startup, executable validation and model operations still need final host/runtime proof |

## Existing implemented modules

- Native storage has format 3 authenticated blocks, journal records, managed transfer operations, cancellation, revision paging, file history and encrypted activity. Integrated changes add streaming CNG legacy authentication, bounded transfer-buffer cleanup and scoped background-thread priority. The source-bound ordinary mounted checks and adverse concurrent-detach result retain their separate meanings; later code does not retroactively validate an earlier receipt.
- Shared workspace modules provide tabs/groups, scoped worker-based regular-expression search, palette controls, notifications and registered Material components. The ready source adds panel geometry and actionable notifications.
- Personalization modules provide language/style settings, narration, schedules, attention modes, local encrypted settings history, appearance layers and logo conversion. An external schedule remains unavailable without a paired trusted provider.
- Local access modules provide local profiles, element lock policies, authenticators, recovery waiting and support records. The ready source adds one-activation sessions and selected-record management. These convenience controls do not replace file encryption or protect against control of the renderer.
- The converter provides a persistent bounded queue, a limited adapter set and an operating-system sandbox contract. The source-built minimal media component adds the reviewed PNG/JPEG/WAV/FLAC/MP3/MP4 profile, fixed native commands and hash-pinned source/runtime manifests. Its own isolated acceptance and package hashes are described in the [component article](../converter/minimal-component.md). Unsupported adapters remain unavailable.
- Local model modules provide catalog/cache, model inventory, pull cart, local chat and profile contracts. The ready source adds guided runtime recovery and native recipes.
- Documentation modules provide the local article/wiki catalogue, safe Markdown, local images, internal routes, worker search, changelog filters and export. Their isolated-browser fixture is not proof of final package or site delivery.
- Status uses the official client adapter and a redacted snapshot. Configuration is not authenticated delivery, and no complete live status interaction is claimed here.
- Desktop document and download handoffs are wired through the host lifecycle. Their full workflow and browser-paired acceptance remains unverified.
- The [update controller](../release/native-update-controller.md) and [desktop update workspace](../surface-foundation/updates-panel.md) are integrated. Fixed-source metadata checks, durable staged readiness, explicit confirmation, idle admission and terminal recovery states exist in source. Final preparation preserves the interrupted-session marker until services close, and partial teardown keeps admission blocked. No native rollback, installed update, or completed restart is claimed.

## How to read the delivery inventory

`contracts/feature-delivery.json` has 104 stable IDs for desktop and site independently. Its 180 mapped rows identify product implementation or repository-support source work. Twelve previously empty rows now reference confirmation, editor/download handoffs, publication-handoff preparation, automatic updates and instruction-currency checking at `e824003`. Publication-handoff preparation is partial support, not publication execution. Mapped rows do not imply completeness. Each referenced path is associated with an available reviewed commit in `referenceSources`. Ready revisions are stated in the review metadata rather than silently described as parent code.

`implementation`, `documentation`, `localization`, `tests` and `persistence` are source pointers. A localization path does not certify complete translated copy; a persistence path does not certify every restart flow; a focused-test path does not say the suite was rerun during this inventory pass. Every `evidence` array remains empty, and every `builtInteraction` and `visualEvidence` value remains `unverified`. Nothing in this update marks a requirement complete.

The unmapped rows are retained explicitly. An empty mapping means this review did not establish a complete implementation/proof map, not that all related project files are absent. Repository and release duties must be assessed separately against their real records.

## Explicit remaining implementation and evidence gaps

- Pure registered Material controls on every surface, full reference parity, complete language/style extremes, all scale/viewport combinations and current screenshots are not established.
- Universal per-element context menus, protected-action wiring, guided forms, preset coverage, settings explanations and all-format export are not established for every element and workflow.
- Advanced appearance capabilities still lack independent raster groups, embedded smart objects, mesh warp and verified isolated image decoding. Pointer drawing and guides exist in source; complete integrated acceptance remains unverified.
- Cross-application shared settings, authenticated external schedule providers and complete native settings-history integration remain incomplete or unverified.
- Waiting challenges remain local convenience behavior. Authoritative service-side challenge enforcement, all recovery flows and the complete production access matrix are not established.
- Conversion support is limited to available adapters and the reviewed minimal media profile. Broader formats, arbitrary codecs and full installed-package conversion acceptance remain unavailable or unverified.
- Local runtime recovery/profile recipes need final host wiring and verification. Real installation, model download, chat, hardware-fit and persisted profile behavior are not inferred from source fixtures.
- External-editor and browser-download handoffs have integrated source wiring, but universal workflow coverage and installed acceptance remain unverified. Forge-publishing workflows have no complete mapped delivery proof in this review.
- Full live Status Hub registration, questions/replies, terminal delivery, notification bridge, panic destinations and display endpoints remain unverified or unavailable.
- New release, downloaded installation, automatic updates, complete documentation deployment and exact homepage readback require separate current evidence. Historical records remain historical.
- Concurrent forced detach with a mapped writer remains unresolved. Ten passing ordinary mounted checks do not prove full force-lock safety.

## Measurements and next verification

The [native lifecycle/performance article](../performance/native-lifecycle-performance.md) preserves exact receipt hashes, helper/source bindings, measured CPU/status/cancellation values, ten ordinary checks and the unresolved adverse probe. The earlier [helper status measurement](../performance/native-helper.md) retains its unknown packaged-source binding.

Freeze the integrated candidate, then run the smallest relevant checks and source-bound production interactions. The current documentation repair adds the two minimal-media articles to the explicit publication inventory and includes the schedule category. Local staging is separate from a live deployment and homepage readback. Add actual evidence only to the corresponding surface and requirement. Preserve unsupported features and failed or incomplete results instead of marking the entire inventory complete from a passing subset.

## Applicability review

The 208 rows now state both applicability and verification status. There are 142 product rows, 48 repository-duty rows, 12 explicitly nonapplicable rows and six canonical-only rows. All 208 verification states remain unverified; nonapplicability is a scope finding, not a passing runtime result. Each row includes its reason.

Product requirements remain applicable when incomplete. Where the canonical entry names only an installed application or only the companion website, the other surface records a supporting role instead of inventing a duplicate UI. Repository duties such as build entrypoints, dependency acquisition, packaging, releases, source documentation and task records support both surfaces; they do not require a corresponding UI button.

The six canonical-only rows cover the instruction repository's prompt banner, single-file editions and project-memory profile. They do not belong in this product. The twelve nonapplicable rows cover the two Roblox/game requirements, three requirements explicitly scoped to the Status Hub server itself, and the encrypted public builder reserved for private repositories. This repository was verified public during the review. Its applicable client status integration remains separate and unverified.

Existing root build/installer entrypoints, pinned bootstrap, release workflow/publisher, article/wiki inventory, homepage wiring, roadmap and handoff now have concrete file references. A fixed runner label does not satisfy dynamic runner-selection proof. The unsigned Squirrel output does not require a newly invented signing step. No public HTTP API is introduced by this product; category indexes record why Postman collections are not applicable, while use of external service APIs remains documented.

Remaining unmapped applicable requirements have specific reasons: the two-key/full-slider confirmation, complete free-workflow audit, universal external-editor and extension-download acceptance, forge-publishing workflow, installed automatic-update lifecycle, private-source currency lock, current discussion records, linked project state and operational-skill verification are not established here. Integrated handoff/update code does not fill these evidence gaps by itself. Repository tracking duties remain obligations even when their remote records were not queried.

The inventory validator now requires the explicit applicability kind, exact applies/directSurface semantics, nonempty bounded reasons and declared scope, bounded persistence arrays and per-path commit references. A separate repository-aware verifier resolves each recorded path to a Git blob with per-command and total deadlines. Without repository access it returns unverified, not a successful source-existence claim. Negative tests cover omitted scope, blank reasons, wrong scope, invented exemptions, unsafe paths, missing references and actual absent Git objects. The current 208 rows remain unverified regardless of structural or reference-check success.
