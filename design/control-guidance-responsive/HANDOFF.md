# Contextual guidance and responsive controls

Design source: `c92621ebd4ec6d8eb99dafb0e677c4686cf32b34`.

Status: design handoff, ready for independent review. This document records source inspection and proposed behavior. It does not establish built, visual, accessibility, installer, or live-site acceptance. The accompanying `inventory.json` is the required state and verification matrix. No reference screenshots have been generated or substituted for runtime evidence.

## Scope and ownership

Replace persistent guidance text with a compact information affordance, provide a worked example and functional isolated practice for every supported wizard, and make the public documentation and browser workspace usable from 320 CSS pixels upward. All rendered controls use the existing Material Design 3 components and role tokens. Implementation, independent review, source commits, publication and runtime verification belong to the coordinating task. This design lane owns only this document and `inventory.json`.

The current request also requires README workflow diagrams in the supplied top-down rectangular-node and arrow style in every repository touched by the wider task. That work belongs to the coordinating task, outside this design lane.

## Information entry and panel anatomy

Render one `md-icon-button` with a bundled information SVG, not persistent Guide and Explain buttons or a literal letter. Use a 20 to 24 pixel decorative icon within a 48 by 48 CSS-pixel touch target. The localized accessible name is `Help for {control label}`. Set `aria-hidden="true"` on the SVG and keep the accessible name on the button. Preserve a visible focus outline.

Show a localized plain tooltip on pointer hover and keyboard focus, using the same specific target label. Dismiss it on pointer exit, focus exit, Escape or panel opening. It contains no interactive content, does not replace the button's accessible name, and must remain within the viewport. Touch activation opens the information panel directly without requiring a hover gesture.

Place the entry immediately above its exact originating control. Opening it reveals a non-modal section in normal flow immediately above that control. Use stable `aria-controls` and `aria-expanded` relationships within the same component root. The direct control remains available. The panel contains, in order:

1. A wrapping target title and an accessible close icon.
2. A concise purpose and the real control's availability explanation.
3. A worked example with explicit sample input, action and expected output.
4. An isolated practice area, visible local result and Reset example action.
5. An explicit action to open the separate guided real-operation sequence.
6. Expandable full explanation and contextual authoritative documentation.

Full explanation preserves purpose, options, actual default, effects, example, validation and recovery. A worked example demonstrates behavior and does not merely repeat a generic explanatory paragraph. Localize every visible and accessible string through the shared translation source.

Use surface-container, on-surface and outline-variant roles, a 16 pixel corner radius, 16 pixel padding and 8 to 12 pixel content gaps. Reuse the existing typography and state layers. Do not introduce independent hard-coded colors. Every interactive element inside the panel uses the same real Material components as production controls.

## Focus, keyboard and lifecycle

Opening information focuses the panel title with `tabindex="-1"`, without activating or validating the real control. Closing by the close icon, repeated information activation or Escape returns focus to the information button if connected and focusable. A separate Return to control action focuses the original target. The non-modal panel does not trap focus. Escape dismisses an open choice popup first; a subsequent Escape closes guidance.

Do not reconstruct the practice subtree after each keystroke. Preserve focus, selection and local sample state while navigating explanation and guided steps. The real-operation wizard focuses each new step's heading, preserves valid draft input on Back, associates validation messages with their fields, and focuses invalid fields when advancement fails. Report completion through one polite live region without repeatedly announcing the entire panel.

Information and practice remain available for a disabled or read-only original target. The real-operation path states its exact unavailable reason and remains disabled. Closing or disposing destroys sample state and listeners. Cancellation never claims rollback of completed real effects.

## Isolated practice contract

Each descriptor supplies an immutable, authored fixture and an explicit practice kind. A practice factory receives only its local mount node, translator and fixture definition and returns a disposer. Its pure evaluator returns structured local output. It never receives the original target, callbacks, services, storage, current draft or selected record identifiers.

Do not clone a live target or read its `value`, `checked`, options, current styles, files, credentials or other user data to seed practice. Explicit fixture values and options may resemble the control's semantics but must come from the authored descriptor. Keep state in memory for one panel invocation. Reset restores that fixture. Closing destroys it.

Practice performs no network, IPC, native operation, storage write, history entry, clipboard action, file-picker invocation, download, speech or real timer scheduling. Language, theme, typography, lock and appearance examples affect only local fixture elements. They never change the surrounding interface.

Mark the root with `data-guidance-sandbox`. Discovery and command registration recognize this boundary. Never mount another guidance wizard inside a practice area. Its controls still have specific accessible names and supporting descriptions. Any shared helper or popup is scoped to the same sample lifetime and cannot reach production services.

A DOM factory or sandbox attribute is not a security isolation boundary. Enforce narrow helper and admission interfaces: sample controls may use only fixture-owned choice data, local event admission, local popup roots and invocation-owned disposers. They cannot call production admission dispatch, global service lookup, production command registration or document-wide target selection. Reject any unscoped helper interface instead of trusting a marker alone. Instrument and observe the real built interaction to prove that production callbacks, network/IPC, storage/history and native-operation counters remain unchanged during edit, validation, reset and disposal. Combine these observations with source checks; neither alone proves all isolation properties.

Each simultaneous invocation owns a distinct state object, fixture copy, popup root, listener set and cancellation lifetime. Open two instances of the same descriptor and two different descriptors, edit and reset one, and verify that the other sample and every real target remain unchanged. Closing and reopening restores the authored fixture. A negative test that deliberately shares a draft object between instances must fail the isolation check.

Practice completion never advances or executes the real-operation wizard. Only the real wizard's final explicit action invokes the admitted original operation with its existing validation, permissions, confirmations and history. Missing safe practice support is recorded with an explicit reason and remains an acceptance gap.

## Control-specific examples

| Kind | Authored example and interaction | Required result |
| --- | --- | --- |
| Text or multiline | Edit a synthetic display label in an outlined field with descriptor-specific valid and invalid examples | Update a sample label and show local format or length validation |
| Search or regular expression | Search an authored public list through the bounded pure evaluator | Filter only fixture rows and update result count or invalid-expression feedback |
| Number or range | Adjust an explicit authored range, unit and starting value | Update a numeric readout and fixture preview |
| Checkbox or switch | Toggle the visibility of a sample caption | Change the fixture and announce its state |
| Select or radio | Choose from explicitly authored options such as alignment | Change fixture alignment through pointer and keyboard selection |
| Color | Edit an authored color beside a sample swatch | Change only the sample, retain invalid input and explain recovery |
| Typography | Adjust one property of a public sample sentence | Update only the sample sentence's size, weight, spacing or alignment |
| Date, time or schedule | Adjust an authored date and time with an explicit timezone | Update a plain-language occurrence preview without scheduling a real timer |
| File or image | Choose from a bounded bundled or in-memory synthetic fixture list | Update sample type, size or placement without opening a platform file chooser |
| Action button | Apply an action-specific transition to a synthetic record | Display a meaningful local result or bounded sample progress |
| Destructive action | Confirm removal of an explicitly synthetic item | Remove only that item; Reset restores it |
| Navigation or tab | Select among local sample panels | Change only the active fixture panel and its announcement |
| Read-only value | Change controlled example inputs used to derive a value | Update the calculated explanation without making the real value editable |
| Credential-related | Use fixed non-secret demonstration characters | Show local validity feedback without reading or characterizing a real credential |

A generic button that only prints success is not functional practice. Every descriptor explains and demonstrates its own concept.

## Responsive behavior

At 320 CSS pixels use one content column, 12 to 16 pixel outer gutters, `min-width:0` on shrinking children and deliberate text wrapping. Never conceal an oversized child with document-level overflow hiding. The guidance panel occupies its available width. Its title wraps while the close icon retains its touch target. Footer actions wrap or stack. Sample outputs follow inputs vertically. Ordinary panels grow with content rather than creating fixed-height nested scroll areas.

Preserve bounded horizontal scrolling only for intrinsically two-dimensional content such as diagrams, with an accessible named region and text alternative. Material fields, helper icons and messages must fit their owning surface. Dialogs fit within a 12 to 16 pixel viewport inset and keep close and action controls reachable within the visual viewport. Bilingual labels wrap rather than truncate.

Personalization keeps a bounded horizontally scrollable tab strip with active-tab reveal and keyboard movement. Every tab retains its own information icon immediately above that exact tab, including inactive tabs. An active-tab-only entry is insufficient. Only the expanded panel may be shared: it occupies the full available width above the strip, outside individual tab columns, names its originating tab and maintains a stable accessible relationship to that tab's information entry. Switching the panel's owner disposes the previous practice invocation and opens a fresh one for the new owner. Do not nest expanded explanatory content inside a fifth of the existing 720 pixel strip.

Public navigation opens below the actual header geometry rather than a permanent 72 pixel offset. Its maximum height follows the available viewport and it scrolls when necessary. Escape closes it and returns focus to its trigger. Destination activation closes it and focuses the destination heading. Opening preferences closes navigation and transfers focus through the dialog lifecycle.

## Source integration risks

- `src/shared/surface/control-guidance.js` currently creates two persistent text entries. Replace their composition rather than merely shorten their labels.
- Its `paint` path replaces the guided subtree and focuses the filled action. Practice must have an independent lifetime so edits and focus survive progression.
- Its `open` path validates the real target during advancement. Retain this only for real operations, not information or synthetic practice.
- `src/renderer/features/personalization/personalization.css` currently forces the combined navigation strip to `width:max(100%,720px)`. Expanded guidance must leave the narrow tab columns.
- `src/shared/surface/controls.js` places a choice-search helper after a select and uses a shared overlay. Sample helpers need explicit scoped ownership, disposal and admission behavior.
- `src/renderer/features/personalization/index.js` uses native tag-name recognition for some live detail metadata. Use explicit metadata and `controlKind` for custom elements.
- `docs/site/index.html` contains visible native preferences controls, while `docs/site/site.js` assumes their IDs, values, events and dialog APIs. Preserve these contracts through a Material compatibility adapter, not CSS resemblance alone.
- `docs/site/site.css` and `docs/site/workspace.css` govern distinct public-document and stationary-workspace routes. Verification of one does not prove the other.
- Existing consumers include typography, font and color tools, motion, keyframes, image placement and server preparation. Their practice semantics must be descriptor-owned.

These are source constraints and review risks. They are not claims of reproduced runtime failures.

## Bounded implementation and independent review

1. Shared entry, panel, accessibility, lifecycle and sandbox API in shared surface code.
2. Explicit examples, practice fixtures and localization grouped by existing consumer family.
3. Personalization tab guidance and dense inspector responsive layout.
4. Public-document control migration and responsive navigation and dialogs.
5. Independent review and negative checks for copied live data, side effects, recursive discovery, focus, descriptor completeness and layout bounds.

An independent reviewer must inspect this handoff before implementation acceptance. Record the reviewer's actual selected model, source, verdict and unresolved concerns. The design author's own inspection is not independent review.

## Verification inventory and evidence

Practice kinds are a behavior taxonomy, not a completeness inventory. Before implementation acceptance, bind the matrix to an exhaustive inventory of actual stable descriptor and control IDs across every guidance consumer and every rendered interactive or read-only element that supports explanation. Include each generated helper and every tab's distinct entry. Each row names its consumer, surface/state, originating target identity, explanation concept, authoritative article, practice fixture identity, supported states and any explicit inapplicability reason. Dynamic instances use a stable template ID plus their owner/instance key; do not collapse distinct controls that happen to share a kind or label.

Compare the hand-written expected ID inventory against actual registered/rendered IDs and require exact coverage in both directions. Missing expected rows, unregistered capable controls, duplicate identities, generic duplicate explanations and unmatched runtime controls fail acceptance. Prove the check by adding a capable control without an inventory row, deleting a required descriptor row and omitting one tab's entry, observing failure for each case before restoring the valid source. Record those negative results. `inventory.json` explicitly leaves the exhaustive ID binding unresolved until actual consumer enumeration and independent comparison have completed; its state list alone cannot turn this requirement green.

Expand every state in `inventory.json` across every declared language, theme and display scale at the narrow and normal viewports, then cover intermediate breakpoints for navigation transitions. The desktop product additionally uses its declared supported minimum client area, which must be resolved from its product contract before capture.

Evidence requires the exact source commit, build receipt, built artifact SHA-256 where applicable, state, language, theme, viewport, scale, capture route and privacy verdict. Capture genuine built surfaces. Measure target and ancestor bounds with computed layout values. Repeat a failed tuple only after a relevant repair. Preserve the original evidence and never relabel it for a newer source.

Required states include collapsed information, open explanation, worked example, practice initial/edited/invalid/reset, unavailable real target, real-action progression/validation/completion/cancellation, open narrow navigation and dialogs. Check keyboard and touch operation, focus return, screen-reader names, lifecycle disposal and source-bound safety separately from appearance. Static source checks do not satisfy built acceptance.
