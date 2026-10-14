## Unfinished focus correction

Preservation review: eight real keyboard captures at source f77845127b457fb30692346aae591d9a3501237d show the inset outline along the sides and bottom, but the sticky table header still covers its top segment. This is a partial correction, not accepted complete focus visibility. The exact root build passed and all eight version-1 geometry probes passed, with unchanged dimensions. These are English light/dark viewport-emulation results at 1180×850 and 880×650, not physical display-scale proof. Owned process absence and hidden-desktop closure were verified. The final startup-restoration return payload was not persisted, so that receipt remains unavailable.

# Shared workspace compositions

The desktop shell uses five registered components: `mfe-titlebar`, `mfe-main-workspace`, `mfe-content-panel`, `mfe-data-table`, and `mfe-selection-toolbar`. Each extends `SurfaceElement` and owns its shadow structure, stylesheet, connection lifecycle, and supported projected content. The shared top bar is a group inside the main workspace; the title bar is the single banner.

Existing view IDs, file actions, table headers, record bodies, selection callbacks, and localization targets remain in the light DOM. Tables retain native table semantics. Their internal scroll regions receive a text label copied from the table label or caption, avoiding references that cross shadow boundaries. Panels retain their supplied accessible name or use their visible heading. No extra keyboard interception or data persistence is introduced.

Appearance continues to inherit the existing role variables. Workspace flex containment, panel scrolling, table scrolling, responsive spacing, and selection wrapping are owned by their components. The table keyboard focus outline is drawn inside the scroll region so its enclosing clipped surface cannot hide it; its inherited color and thickness are unchanged. Window controls retain their no-drag region. Disconnecting removes slot listeners and the local text observer; reconnecting preserves projected records and action listeners.

## Verification and limitations

`test/surface-compositions.test.js` verifies real constructor registration, owned shadow parts and stylesheet identity, lifecycle state, semantic headers and records, stable action nodes, and negative replacement cases. The acceptance inspector reports missing or substituted compositions through its existing failing control gate. Receipts supplement structure checks; generic-node registration does not establish ownership.

These source and simulated-DOM checks do not prove rendering, native window actions, browser accessibility, packaging, or design parity. Source-bound hidden-desktop interaction and geometry at the normal/minimum viewport, English/Cantonese/bilingual, light/dark, and 100/125/150/200 percent scales remain required before visual acceptance. No credentials, file contents, or personal vocabulary are recorded by these components.
