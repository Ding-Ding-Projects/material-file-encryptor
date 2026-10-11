# Current integration and verification status

This source review uses parent baseline `785fdf2` and the ready source revisions listed below. A ready revision is not evidence that the parent has integrated it, that packaging includes it, or that its runtime behavior passed. All 208 desktop/site delivery rows remain `unverified`.

## Reviewed source sets

| Revision | Source change | Integration boundary |
| --- | --- | --- |
| `785fdf2` | Parent baseline keeps translated display wording out of persisted notification and tab records | Canonical-storage repair is source evidence, not a completed private-data or language runtime audit |
| `4ca05780` | Persistent panel move/resize/reset, notification progress and recovery actions, selected notification operations, opt-in local audio and transient control restoration | Ready source and deterministic fixtures; production host registration, callback behavior and geometry remain unverified |
| `455153bd` | Disconnected search cancellation and stale palette-result handling | Ready lifecycle repair; full browser/desktop interaction remains unverified |
| `86c5cec` | One-activation lock grants, selected authenticator/ticket operations, authenticated metadata exports and local clock-offset diagnostics | Ready source; no full factor, camera, bulk-cancellation or production accessibility verdict |
| `6ac06935` | Close pending record dialogs when local profile logs out | Ready invalidation repair; final production logout interactions remain unverified |
| `5f02f6c` | Guided local runtime recovery, native profile recipes and attachment handling | Ready source; installer navigation, process startup, executable validation and model operations still need final host/runtime proof |

## Existing implemented modules

- Native storage has format 3 authenticated blocks, journal records, managed transfer operations, cancellation, revision paging, file history and encrypted activity. The source-bound ordinary mounted checks and adverse concurrent-detach result retain their separate meanings.
- Shared workspace modules provide tabs/groups, scoped worker-based regular-expression search, palette controls, notifications and registered Material components. The ready source adds panel geometry and actionable notifications.
- Personalization modules provide language/style settings, narration, schedules, attention modes, local encrypted settings history, appearance layers and logo conversion. An external schedule remains unavailable without a paired trusted provider.
- Local access modules provide local profiles, element lock policies, authenticators, recovery waiting and support records. The ready source adds one-activation sessions and selected-record management. These convenience controls do not replace file encryption or protect against control of the renderer.
- The converter provides a persistent bounded queue, a limited adapter set and an operating-system sandbox contract. Unsupported adapters remain unavailable.
- Local model modules provide catalog/cache, model inventory, pull cart, local chat and profile contracts. The ready source adds guided runtime recovery and native recipes.
- Documentation modules provide the local article/wiki catalogue, safe Markdown, local images, internal routes, worker search, changelog filters and export. Their isolated-browser fixture is not proof of final package or site delivery.
- Status uses the official client adapter and a redacted snapshot. Configuration is not authenticated delivery, and no complete live status interaction is claimed here.

## How to read the delivery inventory

`contracts/feature-delivery.json` has 104 stable IDs for desktop and site independently. Its 88 mapped rows identify partial source work for 44 requirements on each surface. Each referenced path is associated with an available reviewed commit in `referenceSources`. Ready revisions are stated in the review metadata rather than silently described as parent code.

`implementation`, `documentation`, `localization`, `tests` and `persistence` are source pointers. A localization path does not certify complete translated copy; a persistence path does not certify every restart flow; a focused-test path does not say the suite was rerun during this inventory pass. Every `evidence` array remains empty, and every `builtInteraction` and `visualEvidence` value remains `unverified`. Nothing in this update marks a requirement complete.

The unmapped rows are retained explicitly. An empty mapping means this review did not establish a complete implementation/proof map, not that all related project files are absent. Repository and release duties must be assessed separately against their real records.

## Explicit remaining implementation and evidence gaps

- Pure registered Material controls on every surface, full reference parity, complete language/style extremes, all scale/viewport combinations and current screenshots are not established.
- Universal per-element context menus, protected-action wiring, guided forms, preset coverage, settings explanations and all-format export are not established for every element and workflow.
- Advanced appearance capabilities still lack complete freehand drawing, independent raster groups, embedded smart objects, mesh warp, guides and verified isolated image decoding.
- Cross-application shared settings, authenticated external schedule providers and complete native settings-history integration remain incomplete or unverified.
- Waiting challenges remain local convenience behavior. Authoritative service-side challenge enforcement, all recovery flows and the complete production access matrix are not established.
- Conversion support is limited to available adapters; general image, media, archive and spreadsheet conversion remains unavailable without bundled implementations and proof.
- Local runtime recovery/profile recipes need final host wiring and verification. Real installation, model download, chat, hardware-fit and persisted profile behavior are not inferred from source fixtures.
- Universal external-editor handoff, browser download handoff and forge-publishing workflows have no complete mapped delivery proof in this review.
- Full live Status Hub registration, questions/replies, terminal delivery, notification bridge, panic destinations and display endpoints remain unverified or unavailable.
- New release, downloaded installation, automatic updates, complete documentation deployment and exact homepage readback require separate current evidence. Historical records remain historical.
- Concurrent forced detach with a mapped writer remains unresolved. Ten passing ordinary mounted checks do not prove full force-lock safety.

## Measurements and next verification

The [native lifecycle/performance article](../performance/native-lifecycle-performance.md) preserves exact receipt hashes, helper/source bindings, measured CPU/status/cancellation values, ten ordinary checks and the unresolved adverse probe. The earlier [helper status measurement](../performance/native-helper.md) retains its unknown packaged-source binding.

Integrate the selected ready revisions, freeze the final candidate, then run the smallest relevant checks and source-bound production interactions. Add actual evidence only to the corresponding surface and requirement. Preserve unsupported features and failed or incomplete results instead of marking the entire inventory complete from a passing subset.
