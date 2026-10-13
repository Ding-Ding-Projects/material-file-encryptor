# Contextual information and isolated practice

Status: source implementation with focused Node and DOM logic verification. Built visual, assistive-technology and observed production side-effect acceptance remain pending.

## Information entry

Each registered control has one 48-pixel Material icon button with a bundled decorative information SVG, a target-specific accessible name and hover/focus tooltip. Activation opens a non-modal panel directly above that control. Its heading receives focus. Closing or Escape returns focus to the information entry; Return to control focuses the original control.

The panel contains purpose, availability, a worked sample, local practice, the explicit Open guided operation action and expandable full explanation with authoritative documentation. Opening information does not validate or execute the original control. Disabled and read-only controls retain information and sample practice. The real guided sequence preserves the original operation, validation, permissions and asynchronous outcome. Cancelling never claims rollback of completed effects.

For tab strips, the optional `inlineGridColumn` mode keeps entry and panel in the same shadow root. The owning row and its cells must expose a shared CSS grid, with cells using `display:contents`; each entry occupies its assigned first-row column and an expanded panel occupies the full second row. The owner uses `onOpen` to close another open invocation. This structure requires actual built layout verification.

## Authored fixture boundary

`guidance-playground.js` accepts a fixture returned by `definePractice`. Fixtures contain immutable JSON data, an explicit identity, kind, label, initial value and worked input/action/expected result. Accessors, callbacks and non-plain objects are rejected. Practice receives only its local mount, translator and fixture. It receives no real target, callbacks, options, current draft, services or credentials.

The pure evaluator supports bounded text, substring search, numbers, visibility, choices, colors, local removal/reset/append, navigation, synthetic file selection, time previews and fixed public credential demonstration text. Every invocation owns its own draft. Reset restores authored values. Closing destroys state and listeners. Choices use local Material buttons rather than the production document-wide select helper. All output is text or explicitly bounded local preview properties, never arbitrary HTML, CSS, code or remote content.

Samples do not access network, storage, history, IPC, native pickers, clipboard, audio or real timers. No sample invokes a production operation. The DOM marker is a discovery boundary, not a security sandbox. Source tests establish bounded interfaces; production instrumentation must separately verify side-effect counters remain unchanged during real built interaction.

## Current coverage and outstanding work

The 88-row settings inventory currently has 60 authored fixtures. All five tab entries and all seven weekday entries are included. The 11 nested appearance concepts and six font concepts also have authored fixtures. The following settings descriptor IDs remain explicit missing practice support:

- `settings.start-date`, `settings.end-date`, `settings.from-date`, `settings.to-date`
- `settings.action.set-local-credential`, `settings.action.enable-mode`, `settings.action.turn-off-mode`, `settings.action.test-narration`, `settings.action.edit-this-surface`
- `settings.action.enable`, `settings.action.disable`, `settings.action.configure-credential`, `settings.action.clear-credential`, `settings.action.store-credential`, `settings.action.cancel`
- `settings.action.export-settings`, `settings.action.reset`, `settings.action.set-up-history-password`, `settings.action.unlock-history`, `settings.action.lock-history`
- `settings.action.compare-selected-entries`, `settings.action.export-redacted-history`, `settings.action.set-retention`, `settings.action.prune-expired-entries`, `settings.action.restore`, `settings.action.save-label`, `settings.action.import-settings`, `settings.action.not-now-one-hour-`

Generated reset/clear variants, schedule snapshot descriptors and nested motion, keyframe, transition, color, image, drawing/workbench, logo authoring and server-preparation registrations still require exact descriptor-to-fixture inventories. A kind taxonomy is not full control coverage. Unknown descriptors show an explicit unavailable practice message; no generic success-only exercise is substituted.

## Verification

Focused tests cover original real-operation admission, cancellation and validation, icon anatomy and localization, information focus/return, independent sample state, reset/reopen, disposal, callback/accessor rejection and exact descriptor coverage. Negative cases remove an expected descriptor, omit a tab, introduce an unregistered control, deliberately share a session, inject a forbidden external-effect call and remove a required worked-example field. Source inspection does not prove keyboard/touch behavior, screen-reader semantics or rendered dimensions. Genuine source-bound built captures and production side-effect observation remain required.
