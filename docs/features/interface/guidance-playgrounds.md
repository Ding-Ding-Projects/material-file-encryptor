# Contextual information and isolated practice

Status: source implementation with focused Node and DOM logic verification. Built visual, assistive-technology and observed production side-effect acceptance remain pending.

## Information entry

Each registered control has one 48-pixel Material icon button with a bundled decorative information SVG, a target-specific accessible name and hover/focus tooltip. Activation opens a non-modal panel directly above that control. Its heading receives focus. Closing or Escape returns focus to the information entry; Return to control focuses the original control.

The panel contains purpose, availability, a worked sample, local practice, the explicit Open guided operation action and expandable full explanation with authoritative documentation. Opening information does not validate or execute the original control. Disabled and read-only controls retain information and sample practice. The real guided sequence preserves the original operation, validation, permissions and asynchronous outcome. Cancelling never claims rollback of completed effects.

For tab strips, the optional `inlineGridColumn` mode keeps entry and panel in the same shadow root. The owning row and its cells must expose a shared CSS grid, with cells using `display:contents`; each entry occupies its assigned first-row column and an expanded panel occupies the full second row. The owner uses `onOpen` to close another open invocation. This structure requires actual built layout verification.

## Authored fixture boundary

`guidance-playground.js` accepts a fixture returned by `definePractice`. Fixtures contain immutable JSON data, an explicit identity, kind, label, initial value and worked input/action/expected result. Accessors, callbacks and non-plain objects are rejected. Practice receives only its local mount, translator and fixture. It receives no real target, callbacks, options, current draft, services or credentials.

The pure evaluator supports bounded text, substring search, numbers, visibility, choices, colors, local removal/reset/append, navigation, synthetic file selection, time previews and fixed public credential demonstration text. Every invocation owns its own draft. Reset restores authored values. Closing destroys state and listeners. Choice descriptors explicitly select local Material select, radio or button primitives. Select menus use invocation-local absolute positioning; radio names are unique per invocation. These controls do not install the production document-wide select helper. Theme, Density and Font family examples change only their own sample palette roles, spacing and font family. Other unsupported concepts remain visible coverage gaps. All output is text or explicitly bounded local preview properties, never arbitrary HTML, CSS, code or remote content.

Samples do not access network, storage, history, IPC, native pickers, clipboard, audio or real timers. No sample invokes a production operation. The DOM marker is a discovery boundary, not a security sandbox. Source tests establish bounded interfaces; production instrumentation must separately verify side-effect counters remain unchanged during real built interaction.

## Current coverage and outstanding work

The 88-row static settings inventory has 88 distinct authored fixtures, including all five tab entries, seven weekday entries and four date fields. Date practice uses three Material numeric fields and rejects invalid calendar dates without rollover. Consequential settings, credential, history, import/export and reminder actions transform only explicit synthetic records; confirmation and validation occur locally and every preview can reset. Credential examples accept only fixed public demonstration text and never create a credential or key. Export examples show redacted JSON without downloading; time examples never schedule timers.

Clear variants have their own synthetic editable field and local clear action. Fourteen scalar/snapshot scheduled value domains select a fixture from explicit setting metadata, not the live value. Narrator and attention retain their separately authored nested controls. Snapshot capture and removal have local record demonstrations, including refusal to remove an in-use synthetic reference.

The 11 nested appearance concepts and six font concepts have authored fixtures. Font face/instance examples change actual sample weight; non-weight font axes still require their own precise adapters. All 19 keyframe concepts and all 16 transition-property concepts now have distinct authored operations, with exact factory coverage checks. They manipulate synthetic frames, local copies, timing coordinates and independently identified endpoint rows. Movement rejects out-of-range offsets, resets retain metadata, and discrete renderer playback stays explicitly unavailable. Nested motion, color, image, drawing/workbench, typography helper variants, logo authoring and server-preparation registrations still require their own complete fixture coverage. A kind taxonomy is not full control coverage. Unknown descriptors show an explicit unavailable practice message; no generic success-only exercise is substituted.

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
| `src/renderer/features/personalization/color-picker.js` | 24 contracts, palette/channel instances | Pending |
| `src/renderer/features/personalization/image-transform-inspector.js` | 14 numeric fields, 14 clears, 3 fits, 7 blends, apply/reset/search/clear-search | Pending |
| `src/renderer/features/personalization/workbench-guidance.js` | 12 concepts | Pending |
| `src/renderer/features/personalization/typography-inspector.js` | 18 fields, per-field clear/reset, preset/step helpers and search | Pending |
| `src/renderer/features/personalization/logo.js` | 5 crop/safe-area fields and preset, plus composed nested/color consumers | Extra authoring fixtures pending |
| `src/renderer/features/server-manager/index.js` | 11 preparation concepts | Pending |

The runtime comparison must additionally enumerate helper controls, actual rendered instances and every target identity. This table does not replace that comparison.
