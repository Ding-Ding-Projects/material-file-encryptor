# Modern desktop interface handoff

Base: `56020da6982fa03d2bbc78d15b7d1aae1ee8f846`.

Material Designer could not be used for this change: the available tool inventory contains no Material Designer creation/export capability, and its expected primary project directory is absent on the current host. No current build or creation/export flow could therefore be verified. The fallback is the existing renderer framework with target-owned CSS, semantic controls and this deterministic design specification. This document is a design reference, not proof of running behavior.

## Reference primitives

The existing sage light/dark color roles remain the source of truth in `src/renderer/style.css`. `src/renderer/modern.css` supplies shared surface and layout refinements: a 232 px navigation column, 28 px workspace radius, 24 px welcome surface, 21 px settings cards, 14 px action shapes, 48 px fields and 44 px clear controls. At 1100 and 780 CSS px the navigation and content adapt; at 480 px field groups stack. System appearance follows the existing media listener. Reduced motion suppresses animation and transitions.

The native semantic HTML controls and custom CSS are retained. This bounded redesign does not claim replacement with registered external Material components or universal feature-contract completion.

## Hand-written state inventory

| Screen | State | Production navigation | Reference treatment |
| --- | --- | --- | --- |
| Drive | Locked | Initial screen, no configured drive | Sage emblem, welcome surface, two primary choices |
| Drive | Mounted, empty | Unlock test-owned drive | Storage summary, search, empty state |
| Drive | Mounted, selected file | Import and select test-owned file | Tonal selection toolbar, selected row indicator |
| Offline | Empty and selected | Available offline navigation | Same drive table and action anatomy |
| History | Populated and filtered | History navigation | Bounded retention card, shared clearable search |
| History | Custom retention | Select Custom days | Number field with clear control; empty value remains invalid |
| Recycle Bin | Populated and selected | Recycle Bin navigation | Shared search, table and selected actions |
| Settings | Light, dark and system | Settings navigation | Individually grouped setting cards, visible focus states |
| Help | Default | How it works navigation | Bounded reading card and separated steps |
| Vault dialog | Create, folder/password | Create a drive | Stronger header/footer, scrollable body, clearable fields |
| Vault dialog | Create, private repository/key file | Select transport and credential mode | Same field controls, no secret display changes |
| Vault dialog | Unlock | Unlock existing drive | Clearable folder, drive letter and credential fields |
| Vault dialog | Upgrade copy | Upgrade by creating a copy | Existing preserved-source behavior and clear controls |
| Confirmation | Pending and canceled | Existing destructive action | Wrapped actions and bounded dialog surface |
| Descendant selection | Default and selected | Restore a deleted parent | Existing dynamic dialog and shared surface styling |

## Exact validation matrix

Use normal 1180 × 850 and minimum 880 × 650 windows, English/Cantonese/bilingual, light/dark, scales 1/1.25/1.5/2. Capture every inventory state at its normal baseline, then exercise the matrix and retain version-1 layout-probe receipts with source commit, executable hash, viewport/client area, scale, theme and language. Check the welcome actions, navigation labels, table headings, search clear controls, retention fields, dialog footer and longest bilingual text. Layout evidence must measure actual client geometry rather than assume the outer window size equals the content area.

No built screenshots, parity comparisons, installer execution or matrix receipts are claimed by this source handoff. The release coordinator runs the exact build entrypoints against the frozen integrated candidate, then collects genuine evidence. Reference values above are deterministic and addressable by screen/state and CSS selector; a dedicated reference renderer and complete visual-diff proof remain unimplemented.

## Asset provenance

No generated bitmap, remote font or external asset was introduced. The welcome emblem reuses the repository's existing encrypted icon. Clear controls use a text glyph marked decorative; their localized accessible names carry meaning.
