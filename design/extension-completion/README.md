# Extension workspace completion reference

Design handoff, not implemented or verified product behavior.

Baseline: `6c880446b9e884efed589f189bbb7bda3111ae6f`. The existing source is
`browser-extension/`, not `src/browser-extension/`. Its Manifest V3 popup uses
local Material Web 2.5.0 primitives and the shared search component. The checked-in
surface registry currently has one extension surface, `extension:popup`, with no
runtime proof. Importing shared settings must not mark extension requirements met.

## Open the reference

Serve the repository root with an isolated local static server and open
`design/extension-completion/reference.html`. The reference loads the existing
local `src/shared/surface/material.js`; it has no CDN or remote asset requirement.
It is a development design reference, not an extension package or product launch.

Address screens with `?screen=popup`, `?screen=transfers`, `?screen=settings`,
`?screen=capabilities`, `?screen=access`, `?screen=history`, `?screen=notifications`,
`?screen=documentation`, `?screen=status`, or `?screen=shared-overlays`.
Every one of the 89 states in `states.json` has an exact reference route backed by
the common screen components and authored `scenarios.js` descriptors. Native-only
actions are explicitly disabled; reference navigation and local control edits
operate only the design fixture. Actual browser rendering has not been inspected.
Add `state=unpaired`, `state=pairing`, `state=paired`,
`state=awaiting-confirmation`, `state=downloading`, `state=completed`,
`state=failed`, `state=cancelled`, `state=unavailable`, or `state=unknown` for the
transfer presentation. Add `language=en|yue|bilingual` and `theme=light|dark`.
The reference does not contact the native host, inspect a browser profile, read a
user file, persist values, or simulate a successful real operation. Its navigation,
language/theme choices and local design-state selector operate only the reference.
Every screen identifies its design-only state; production provenance is unavailable.
Use `connection=checking|unpaired|pairing|paired|unavailable` to control connection
independently from a transfer outcome. A completed transfer never means the
connection itself is completed. Bilingual labels stack primary and secondary
lines. Internal tabs carry exact panel ownership and arrow/Home/End navigation.

See [HANDOFF.md](HANDOFF.md) for behavior, security, component reuse and acceptance,
[families.json](families.json) for every one of the 105 semantic family decisions,
and [states.json](states.json) for explicit screen/state and capture obligations.
The family file classifies delivery ownership, not completion. All production,
interaction, layout, screenshot and independent-review verdicts remain unverified.

## Layout intent

The popup answers one immediate question: is this browser connected, and what is
the latest handoff doing? A compact header shows running version and updated-at
provenance before navigation, then a connection region and one transfer region.
Open workspace is an actual route into this same extension, not a promotional
website or a second product. No transfer begins from opening the popup.

The extension options page is a full tab with a compact top bar, persistent
workspace tabs, task content and contextual help. Transfers, Tools, Personalize,
Access, History, Notifications, Documentation and Status are productive destinations.
Tool pages own their guided controls and records even when a privileged operation
requires a native adapter. Native capability absence produces an exact explanation
and a returnable setup workflow, never a success-shaped placeholder.

Normal popup target is 400 × 560 CSS pixels; minimum is 320 × 480. Workspace normal
is 1280 × 800 and minimum is 320 × 568. These are design targets, not measured
browser guarantees. Browser zoom and host display scaling must be measured
independently at 100%, 125%, 150% and 200%. The content reflows to one column;
primary actions wrap rather than truncating; overlays scroll within the viewport.

## Reference focus verification

Redraw-triggering controls retain stable `data-focus-key` identities. Language,
theme and state selectors survive translated labels and Material button variants;
tab arrows explicitly target the newly selected tab. Redraw restores focus after
the replacement component's `updateComplete`, with a generation check preventing
an older redraw from taking focus. The heading is used only when the initiating
control was removed. An initial render without a focus request does not move focus.

Run `node --test design/extension-completion/focus.test.js` for eight synthetic
focus cases, including nested component focus, translated/replaced controls,
removed-control fallback, asynchronous completion and superseded redraws. These
checks exercise reference helper behavior, not an installed browser or real pixels.

The remaining real-reference check uses an isolated browser and keyboard only:
open a settings state, activate each language choice, toggle light/dark twice,
select another state, then use Arrow/Home/End on the workspace tabs. After each
action await the reference element's `focusRestored` promise and inspect its
composed active element: the stable key must match the initiating control (or the
explicit arrow destination), with a visible ring and no unexpected scroll. Open
workspace from the popup to remove that originating control and require heading
focus instead. Repeat in all language modes, both themes and minimum/high-scale
tuples. This actual rendering check remains pending.

## Asset and reference provenance

All reference layout and copy are authored here. There are no generated images,
stock screenshots, remote fonts or fabricated runtime captures. Existing vendor
Material Web provenance remains in the imported bundle. The reference renders
actual registered primitives; a custom `mfe-extension-reference` registered
component owns its internal semantic layout. Source preview is not a Material
conformance or design-parity verdict.

## Official platform references

The options-page design uses `options_ui` with `open_in_tab: true` and a user
action invoking `chrome.runtime.openOptionsPage()`. See
[Chrome options pages](https://developer.chrome.com/docs/extensions/develop/ui/options-page).
Extension-owned settings require deliberate local persistence and migration;
[Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
describes the extension storage APIs. Storage is not a credential vault, as
[Chrome privacy guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)
explains. No page-content or browsing-history permission is justified by this design.
