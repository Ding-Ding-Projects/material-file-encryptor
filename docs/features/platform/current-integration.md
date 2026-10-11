# Current integration and verification status

This applicability review uses parent baseline `37fa47a` and ready runtime-provenance source `2903fc5`. Earlier source reviews are retained in the table below. A ready revision is not evidence that the parent has integrated it, that packaging includes it, or that its runtime behavior passed. All 208 desktop/site delivery rows remain `unverified`.

## Reviewed source sets

| Revision | Source change | Integration boundary |
| --- | --- | --- |
| `37fa47a` | Bundled verified media runtime and refreshed documentation inventory | Source packaging changes only; final runtime acceptance remains unverified |
| `2903fc5` | Windows local-model release provenance and verification helper | Ready provenance source, not proof of installation or model execution |
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

`contracts/feature-delivery.json` has 104 stable IDs for desktop and site independently. Its 168 mapped rows identify product implementation or repository-support source work. Mapped rows do not imply completeness. Each referenced path is associated with an available reviewed commit in `referenceSources`. Ready revisions are stated in the review metadata rather than silently described as parent code.

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

## Applicability review

The 208 rows now state both applicability and verification status. There are 142 product rows, 48 repository-duty rows, 12 explicitly nonapplicable rows and six canonical-only rows. All 208 verification states remain unverified; nonapplicability is a scope finding, not a passing runtime result. Each row includes its reason.

Product requirements remain applicable when incomplete. Where the canonical entry names only an installed application or only the companion website, the other surface records a supporting role instead of inventing a duplicate UI. Repository duties such as build entrypoints, dependency acquisition, packaging, releases, source documentation and task records support both surfaces; they do not require a corresponding UI button.

The six canonical-only rows cover the instruction repository's prompt banner, single-file editions and project-memory profile. They do not belong in this product. The twelve nonapplicable rows cover the two Roblox/game requirements, three requirements explicitly scoped to the Status Hub server itself, and the encrypted public builder reserved for private repositories. This repository was verified public during the review. Its applicable client status integration remains separate and unverified.

Existing root build/installer entrypoints, pinned bootstrap, release workflow/publisher, article/wiki inventory, homepage wiring, roadmap and handoff now have concrete file references. A fixed runner label does not satisfy dynamic runner-selection proof. The unsigned Squirrel output does not require a newly invented signing step. No public HTTP API is introduced by this product; category indexes record why Postman collections are not applicable, while use of external service APIs remains documented.

Remaining unmapped applicable requirements have specific reasons: the two-key/full-slider confirmation, complete free-workflow audit, external-editor handoff, extension-download handoff, forge-publishing workflow, automatic-update lifecycle, private-source currency lock, current discussion records, linked project state and operational-skill verification are not established here. Repository tracking duties remain obligations even when their remote records were not queried.

The new applicability and persistence metadata is currently supplementary. The existing validator does not yet require those fields or reject a missing scope reason. The parent should extend its schema/negative regressions to require one recognized applicability kind, a boolean applies/directSurface pair, a nonempty reason, and resolvable referenceSources for every listed path. No validator or test source was modified by this documentation-only pass.
