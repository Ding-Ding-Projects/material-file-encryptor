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

The 11 nested appearance concepts and six font concepts have authored fixtures. Font face/instance examples change actual sample weight; non-weight font axes still require their own precise adapters. Nested motion, keyframe, transition, color, image, drawing/workbench, logo authoring and server-preparation registrations require their own exhaustive descriptor-to-fixture inventories. A kind taxonomy is not full control coverage. Unknown descriptors show an explicit unavailable practice message; no generic success-only exercise is substituted.

## Verification

Focused tests cover original real-operation admission, cancellation and validation, icon anatomy and localization, information focus/return, independent sample state, reset/reopen, disposal, callback/accessor rejection and exact descriptor coverage. Negative cases remove an expected descriptor, omit a tab, introduce an unregistered control, deliberately share a session, inject a forbidden external-effect call and remove a required worked-example field. Source inspection does not prove keyboard/touch behavior, screen-reader semantics or rendered dimensions. Genuine source-bound built captures and production side-effect observation remain required.
