# Contextual information and isolated practice

Status: source implementation with focused Node and DOM logic verification. Built visual, assistive-technology and observed production side-effect acceptance remain pending.

## Information entry

Each registered control has one 48-pixel Material icon button with a bundled decorative information SVG, a target-specific accessible name and hover/focus tooltip. Activation opens a non-modal panel directly above that control. Its heading receives focus. Closing or Escape returns focus to the information entry; Return to control focuses the original control.

The panel contains purpose, availability, a worked sample, local practice, the explicit Open guided operation action and expandable full explanation with authoritative documentation. Opening information does not validate or execute the original control. Disabled and read-only controls retain information and sample practice. The real guided sequence preserves the original operation, validation, permissions and asynchronous outcome. Cancelling never claims rollback of completed effects.

For tab strips, the optional `inlineGridColumn` mode keeps entry and panel in the same shadow root. The owning row and its cells must expose a shared CSS grid, with cells using `display:contents`; each entry occupies its assigned first-row column and an expanded panel occupies the full second row. The owner uses `onOpen` to close another open invocation. This structure requires actual built layout verification.

The five section tabs use `settingsTabGuidance(key)` from the settings guidance module. Their stable IDs are `settings.navigation.language`, `settings.navigation.appearance`, `settings.navigation.schedules`, `settings.navigation.attention` and `settings.navigation.history`, distinct from setting fields and action descriptors. Each practice contains a real local `md-tabs` strip with five `md-primary-tab` elements, independently identified panels, localized sample content, selected state and focus. Material tab keyboard handling uses automatic activation. The parent tab consumer must bind these explicit navigation descriptors; the helper alone does not establish that integration or built keyboard acceptance.

## Authored fixture boundary

`guidance-playground.js` accepts a fixture returned by `definePractice`. Fixtures contain immutable JSON data, an explicit identity, kind, label, initial value and worked input/action/expected result. Accessors, callbacks and non-plain objects are rejected. Practice receives only its local mount, translator and fixture. It receives no real target, callbacks, options, current draft, services or credentials.

The pure evaluator supports bounded text, substring search, numbers, visibility, choices, colors, local removal/reset/append, navigation, synthetic file selection, time previews and fixed public credential demonstration text. Every invocation owns its own draft. Reset restores authored values. Closing destroys state and listeners. Choice descriptors explicitly select local Material select, radio or button primitives. Select menus use invocation-local absolute positioning; radio names are unique per invocation. These controls do not install the production document-wide select helper. Theme, Density and Font family examples change only their own sample palette roles, spacing and font family. Other unsupported concepts remain visible coverage gaps. All output is text or explicitly bounded local preview properties, never arbitrary HTML, CSS, code or remote content.

Samples do not access network, storage, history, IPC, native pickers, clipboard, audio or real timers. No sample invokes a production operation. The DOM marker is a discovery boundary, not a security sandbox. Source tests establish bounded interfaces; production instrumentation must separately verify side-effect counters remain unchanged during real built interaction.

## Current coverage and outstanding work

The 88-row static settings inventory has 88 distinct authored fixtures, including all five tab entries, seven weekday entries and four date fields. Date practice uses three Material numeric fields and rejects invalid calendar dates without rollover. Consequential settings, credential, history, import/export and reminder actions transform only explicit synthetic records; confirmation and validation occur locally and every preview can reset. Credential examples accept only fixed public demonstration text and never create a credential or key. Export examples show redacted JSON without downloading; time examples never schedule timers.

Clear variants have their own synthetic editable field and local clear action. Fourteen scalar/snapshot scheduled value domains select a fixture from explicit setting metadata, not the live value. Narrator and attention retain their separately authored nested controls. Snapshot capture and removal have local record demonstrations, including refusal to remove an in-use synthetic reference.

The 11 nested appearance concepts and six font concepts have authored fixtures. Font face/instance examples change actual sample weight; non-weight font axes still require their own precise adapters. All 19 keyframe concepts and all 16 transition-property concepts now have distinct authored operations, with exact factory coverage checks. They manipulate synthetic frames, local copies, timing coordinates and independently identified endpoint rows. Movement rejects out-of-range offsets, resets retain metadata, and discrete renderer playback stays explicitly unavailable. Nested motion and typography helper variants still require their own complete fixture coverage. A kind taxonomy is not full control coverage. Unknown descriptors show an explicit unavailable practice message; no generic success-only exercise is substituted.

## Verification

Focused tests cover original real-operation admission, cancellation and validation, icon anatomy and localization, information focus/return, independent sample state, reset/reopen, disposal, callback/accessor rejection and exact descriptor coverage. Negative cases remove an expected descriptor, omit a tab, introduce an unregistered control, deliberately share a session, inject a forbidden external-effect call and remove a required worked-example field. Source inspection does not prove keyboard/touch behavior, screen-reader semantics or rendered dimensions. Genuine source-bound built captures and production side-effect observation remain required.

## Consumer inventory

The following twelve source families are the actual descriptor consumers. Counts identify source concepts and templates, not rendered-instance or runtime acceptance.

| Consumer source | Stable source inventory | Practice state |
| --- | --- | --- |
| `src/shared/local-ux/settings-guidance.js` | 88 static descriptors, 14 scheduled value domains, clear/snapshot variants | Static descriptors and named variants implemented |
| `src/shared/local-ux/nested-appearance-guidance.js` | 11 concepts | Implemented |
| `src/renderer/features/personalization/font-guidance.js` | 6 concepts, dynamic face/axis/instance identities | Implemented for authored weight-axis example; other axes remain unavailable |
| `src/renderer/features/personalization/motion-guidance.js` | 59 concepts | Pending |
| `src/renderer/features/personalization/motion-keyframe-inspector.js` | 19 concepts, track/frame/registration instances | Implemented |
| `src/renderer/features/personalization/transition-property-inspector.js` | 16 concepts, rule/row/registration instances | Implemented |
| `src/renderer/features/personalization/color-picker.js` | 24 contracts, palette/channel instances | All 24 authored samples plus numeric/slider hue variants |
| `src/renderer/features/personalization/image-transform-inspector.js` | 14 numeric fields, 14 clears, 3 fits, 7 blends, apply/reset/search/clear-search | All 42 templates have authored local geometry samples |
| `src/renderer/features/personalization/workbench-guidance.js` | 12 concepts | Authored polygon, guide, state and scoped search samples |
| `src/renderer/features/personalization/typography-inspector.js` | 18 fields, per-field clear/reset, preset/step helpers and search | Pending |
| `src/renderer/features/personalization/logo.js` | 5 crop/safe-area fields and preset, plus composed nested/color consumers | Six extra authored samples plus composed color samples |
| `src/renderer/features/server-manager/index.js` | 11 preparation concepts | Implemented as explicit synthetic preparation previews |

The runtime comparison must additionally enumerate helper controls, actual rendered instances and every target identity. This table does not replace that comparison.

Server preparation examples cover exact major matching, consent and digest mismatch, completed-operation cancellation refusal, catalogue identity and pagination, selection availability, license review without acceptance, and search. Their states are explicitly synthetic: no file creation, download, Java execution or server start occurs.

The twelve workbench samples use an isolated SVG coordinate plane, bounded numeric fields, synthetic saved selection and independently identified guides. Drawing rejects collinear points, clearing preserves the saved sample mask, guide removal preserves the other axis, and scoped clear restores sample rows. State comparison changes only the local sample opacity. Production mutations and admission remain outside these samples. Source tests do not establish rendered runtime acceptance.

All 42 image-placement templates have isolated practices. Fourteen numeric controls change a locally drawn colored source, with positive crop bounds, distinct focal positioning, affine transforms and opacity. Fit and blend use the same Material button primitive as the original controls. Clear empties only the draft and retains accepted sample placement; Apply and Reset change only synthetic records. Pure sample crop and destination calculations are compared against the production geometry function. No source image, URL, file, history or live layer enters the sample. Runtime visual acceptance remains pending.

The six additional logo authoring controls now have normalized crop, square safe-area and local emblem samples. The preset uses an isolated Material select and fixed SVG paths; no canvas conversion, source bytes or persistence is invoked. Crop overflow is rejected, equal margins are calculated on all four sides, and reset restores the original sample choice.

All 24 color-picker contracts and the continuous hue slider variant now have local samples. A narrowly allowlisted pure adapter reuses the production color mathematics for notation, channels, alpha and contrast. The capability check scans that adapter and its entire two-file import chain and rejects unexpected imports or external calls. Copy produces only a local result, pixel selection uses an authored color rather than screen access, palette actions affect synthetic identities, rainbow remains a static spectrum with a structured marker, and speed uses the real integer duration mapping. Material numeric fields, slider and notation/swatch buttons retain their actual control semantics.
