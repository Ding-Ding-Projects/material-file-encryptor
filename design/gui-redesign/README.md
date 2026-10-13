# Productive desktop shell design reference

Base source: `6c59f10652fa00f71bcb40eae6073e73e82c0689`.

This folder records the current user-selected delegated design route. It is a deterministic static illustration and implementation handoff, not a Material Designer export, application screenshot, interactive prototype, or proof of production behavior. All illustrated records, counts and operation states are fictional design fixtures. They must never be seeded into the product.

## Addressing a reference

Load `reference.html?screen=drive&state=populated&theme=light&lang=en&width=1180&height=850&scale=1` in the existing reference viewer. The document draws the checked-in design directly using `reference.js`; it contains no product bridge, network connection, credentials, clock or randomness. Query values are bounded and enumerated. The root `data-reference-ready` and `data-reference-tuple` fields identify the rendered tuple. This is a reference document, not a newly verified packaged reference application.

Supported fields are `screen` (`drive`, `offline`, `history`, `recycle`, `tools`, `settings`, `help`), `state` from the inventory below, `theme` (`light`, `dark`), `lang` (`en`, `yue`, `bilingual`), `width`, `height`, and `scale`. Normal viewport is 1180 × 850 logical pixels; minimum viewport is 880 × 650. Use scales 1, 1.25, 1.5 and 2. The scale field changes output raster density, not physical Windows monitor DPI. The production verifier must report those as separate facts.

## Structure and scrolling

- A fixed 42 px custom title bar contains product identity and real minimize, maximize/restore and close controls in production.
- A 220 px navigation column (176 px at widths below 1000 px) holds Drive, Available offline, History, Recycle Bin and Tools. Settings and Help are anchored at the bottom.
- A fixed 64 px top bar carries compact global search, notifications and contextual overflow.
- A fixed 56 px open-work tab bar carries previous and next navigation and an always reachable All tabs action. Open work, selected view and search results are distinct concepts. The rail never doubles as a hidden tab-overflow workaround.
- Only the content region scrolls. Body, title bar, navigation, top bar and tab bar remain fixed. Nested overlays have their own bounded scrolling and opaque surfaces. At minimum height the illustrated content continues below the visible region; production must expose a real scrollbar rather than dropping content.
- Drive starts with real file work, storage state and contextual actions. Locked state offers create and unlock paths in a compact workspace panel. No marketing hero, download card or command catalogue replaces the workspace.

## Palette and anatomy

Light roles preserve the existing sage source: primary `#455c46`, primary container `#c6e8c3`, surface `#fafaf5`, frame `#f0f1e9`, container `#e9ece2`, text `#1a1d18`, muted `#535b50`. Dark roles preserve primary `#acd0a9`, primary container `#304d33`, surface `#141813`, frame `#10140f`, container `#20261e`, text `#e1e5da`, muted `#bcc5b5`. Color is never the only indicator of selection or failure.

Workspace radius is 24 px, compact content panels 16 to 20 px, action shape 20 px. Controls retain real Material component state layers, focus rings and keyboard behavior. Navigation uses an icon plus text and selected state. Body copy is 14 px, secondary copy 12 px, headings 26 px, with bilingual secondary labels placed on a separate line. Labels must grow or wrap rather than silently truncate.

The SVG is a visual specification, so its shapes do not claim component registration. Production must use the registered compositions below. Semantic document and table structure may remain inside the declared composition. A generic styled element outside such composition is not evidence of Material component compliance.

| Production composition | Required registered primitives | Provenance and implementation destination |
| --- | --- | --- |
| `mfe-workspace-shell` | `md-tabs`, `md-primary-tab` | Existing locally bundled `@material/web` 2.5.0; `src/shared/surface/workspace-shell.js` |
| `mfe-navigation-rail` | `md-filled-tonal-button`, `md-text-button` | Shared shell redesign registration; `src/shared/surface/` |
| `mfe-top-bar` | `md-icon-button`, `md-outlined-button` | Shared shell redesign registration; `src/shared/surface/` |
| `mfe-context-menu` | `md-menu`, `md-menu-item` | Shared menu composition; `src/shared/surface/context-menu.js` |
| `mfe-search` | `md-outlined-text-field`, `md-outlined-button`, `md-switch` | Shared search composition; `src/shared/surface/search.js` |
| `mfe-date-field` | `md-outlined-text-field`, `md-outlined-button`, internal platform input | Registered field composition; actual registration and value lifecycle require audit |
| `mfe-file-picker` | `md-outlined-text-field`, `md-outlined-button`, internal platform input | Registered picker composition; actual registration and native invocation require audit |
| `mfe-dialog` | `md-dialog` with supported slots and lifecycle | Registered dialog composition; focus return and cancellation require audit |
| Title bar and data table | `md-icon-button`, registered table composition with semantic table internals | Original title-bar document plumbing and table semantics are retained inside their registered compositions |

The baseline `src/shared/surface/material-entry.js` imports existing components. New imports and registration claimed by the redesign require inspection of the integrated candidate; this handoff records planned anatomy, not a completed primitive audit. Existing `src/renderer/fonts/fonts.css` supplies local font provenance; no remote font, bitmap or third-party network asset was introduced here. SVG geometry is authored in this folder.

## Hand-written state and parity inventory

### Shared helper anatomy repair

Three additional exact reference routes cover the retained source-bound diagnostic
states: `screen=drive&state=create-dialog`, `screen=history&state=filtered-empty`
and `screen=recycle&state=filtered-empty`. Add `width=1180&height=752&scale=1.5`
to compare the historical diagnostic tuple, plus the existing theme and language
parameters. The create route shows the real form hierarchy, transport selector,
adjacent choice-search icon, local-folder fields and pinned footer. Filtered routes
show their own toolbars and no matching rows; no fictional populated drive is reused.

The helper specification uses local 24-unit SVG geometry inside the existing
registered `md-icon-button`. It preserves `currentColor`, component state layers,
customization tokens, the existing 40 px button box and 48 px touch region.
Neither source SVG dimensions nor the reference illustration prove the computed
production dimensions. No external font or network icon fetch is introduced.

Select search remains adjacent to the original `md-outlined-select`; the select is
not wrapped, cloned, moved or replaced. The owned
`data-select-search-composition="adjacent"` marker names this pairing. It retains
its original form, labels, slots, values, inline styles and listeners. In a dialog,
the default same-row layout reserves 56 px, comprising a 40 px button and 16 px
horizontal spacing including the touch-region overhang. Existing inline custom
widths and component sizing tokens remain authoritative; their wrapping behavior
requires separate real capture. Disposing the helper restores the prior marker.
Portal anchoring stays on the actual helper button; activation still checks the
select's admission and returns focus to that original select after selection.

The History reference uses an explicit unavailable selection for its unverified
empty/locked setup. The historical blank selector remains a measurement question;
this task does not rewrite the production retention default or selected value.

The retained diagnostic images belong to source
`7ad539a937f5c2828572884cc7ef7111290ba62c`. Their executable path was subsequently
reused, so a current validator cannot establish that old executable's hash there.
They are historical observations, not images of this repair. The parent build and
capture lane must produce a new exact source/build binding, inspect all three
states and refresh current presentation only after acceptance. Measure SVG and
touch geometry, select/helper row bounds, focus/clear/selection behavior, anchored
regex menu, normal/minimum widths, language modes, themes and display scales.
Do not infer the cause of the partially visible title bar from these helper probes.

Each row resolves through the exact `screen` and `state` query fields. Every row requires both reference and production raw captures, labeled side-by-side output and machine-readable visual diff for an identical tuple. All are currently **unverified**. Production navigation below is a human route, not a claimed deterministic fixture endpoint.

| Screen | State | Production navigation / intended behavior |
| --- | --- | --- |
| `drive` | `locked` | My drive, no open drive, Create and Unlock |
| `drive` | `empty` | Unlock a real empty drive |
| `drive` | `populated` | My drive after real mounted file writes |
| `drive` | `selected` | Select one file, show contextual actions |
| `drive` | `busy` | Start a real bounded operation, show progress at origin |
| `drive` | `error` | Safely reproduce an actionable operation failure |
| `drive` | `overflow` | Open twelve work tabs, open All tabs |
| `drive` | `search` | Open compact global search and its results |
| `drive` | `notifications` | Open the notification center |
| `offline` | `populated` | Available offline with real pinned files |
| `history` | `populated` | History with genuine saved versions |
| `recycle` | `selected` | Select a recoverable deleted file |
| `tools` | `default` | Tools index with actual supported destinations |
| `settings` | `default` | Settings groups and real configuration actions |
| `help` | `default` | In-app documentation index |

The full required cross-product is 15 states × 2 viewports × 2 themes × 3 languages × 4 scales, or 720 tuples. This arithmetic is an inventory count, not a passed-test count. Long bilingual labels, keyboard focus, reduced motion, selected/disabled states, and nested overlay bounds need separate observations. The static fixture does not claim complete localized copy for every detailed state, complete workflows, or universal feature delivery.

## Verification and handoff boundaries

No tests, application launches or screenshots were performed in this design-only lane. No reference capture, production capture, comparison or diff has been accepted. No intentional visual deviation is approved by this document. A dedicated packaged reference viewer, exact production fixture routes, complete registered-component audit, accessibility verification and source-bound parity receipts remain the release coordinator's work.

For every accepted tuple record the exact source commit, built executable and packaged-resource hashes, reference hash, screen/state, logical viewport, scale route, language/theme, fixture provenance, raw capture paths, comparison path, diff path, inspector verdict and any explicit deviation approval. Never substitute these illustrations for runtime evidence or describe them as screenshots of the application.

## Account and publication extension

The deterministic publication-reference.html and publication-inventory.json cover captured review, unavailable host, transient authentication, publishing, partial result and cancellation states. They use synthetic identities and are design references only. The extension popup source defines a separate bounded connection workspace: status, pairing, disconnect and source/destination review disclosures. The local bundled Material controls require packaged extension verification; these references do not prove installation, authentication or publication.

### History selection

The History table uses a single registered radio selection per version. Arrow keys, Home and End change selection and keep focus within the visible rows. Enter and Space select without restoring. A read-only summary shows the native version identity, file identity, path, saved time, size and availability. Filtering retains the selected identity and labels a selected record outside the current results. Language refresh retains selection and retention drafts. Locking or removal clears the summary. Restore remains a distinct button followed by confirmation and a second availability check. The state inventory names the exact production selectors. Source interaction checks do not replace built evidence.

## Composed context action ownership

A shared context menu captures the originating composed event once. Each contributed action is bound to the stable target resolved by its own provider, even when a nearer panel-layout provider supplies the menu anchor first. Duplicate action identifiers retain the first contribution and its target. Per-action targets are private runtime metadata, not mutable fields on provider-owned items. Directly opened menus retain their explicit menu target when no provider binding exists.

Activation rechecks that action's captured target is connected and passes the existing control-admission event. Disabled actions, replaced menus, and repeated clicks after closure remain inactive. The original first-provider anchor continues to govern positioning and focus restoration. The focused regression executes the actual provider composition and menu callback path with modeled Shadow DOM ancestry; it does not claim browser layout or physical-input evidence.
