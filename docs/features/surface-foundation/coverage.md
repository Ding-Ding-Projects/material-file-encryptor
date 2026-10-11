# Foundation coverage and remaining work

This is a bounded implementation module, not a universal interface-completeness claim. The following surfaces are registered in `src/shared/surface/registry.js`: workspace tabs, scoped search, command palette, context actions, notification center and build provenance. Material Web supplies genuine buttons, tabs, text fields, switches, sliders and dialogs. Generic DOM elements occur inside those registered compositions for text and layout.

## Implemented and locally checked

- Tab lifecycle, active selection, final-tab/pinned protection, bounded close history, persisted closed destinations, named group create/rename/remove/collapse, tab ordering and guarded bulk closure.
- Durable sanitized notifications, bounded history, read filtering, level filtering, search and JSON/CSV export serialization.
- Worker protocol for Unicode groups, replacement previews, zero-width matches, capture indices, test-case expected results, measured timing, invalid patterns/flags and repeated global row matching.
- Field-scoped snippets, explicit history opt-in, validated import/export, lexical structure/risk diagnostics and current-engine capability probes.
- Palette metadata/current-value search and live switch, checkbox, range, number, text and searchable select controls.
- Local pinned Material Web browser bundle and syntax checks of all new modules.

Run focused data/protocol checks with `node --test test/surface-model.test.js test/surface-worker.test.js test/surface-workbench.test.js`. These checks do not prove rendered accessibility, layout, actual host action integration, local capture provenance, or runtime keyboard behavior.

## Explicitly incomplete

- The expression workbench exposes lexical structure rather than pretending JavaScript provides its private parse tree or backtracking trace. Risk warnings are conservative heuristics, not a proof of complexity. The worker deadline remains mandatory even when no warning appears.
- Notification presentation preferences, audio/narration, richer progress/cancellation and permission-aware recovery actions are not implemented here.
- The host must enumerate every feature, setting, destination and appearance control in the palette. Unregistered host features are not searchable through it.
- Universal element appearance editing, toy locks and support tickets, lockout recovery, two-factor registration, logo conversion, file conversion, local model management, scheduled external settings, School mode, both humor controls, narration, surprise interaction, local version history, changelog, external editor, all-format export and universal bulk actions remain outside this foundation. Other product modules may implement portions but must supply independent evidence.
- The context menu does not yet provide universal element appearance or lock actions. It provides only real tab actions. No inert placeholders claim these functions.
- Guided-token names and capability descriptions have English/Cantonese labels. Raw engine exceptions, lexical kind identifiers and notification severity badges remain technical labels. Full language-contract runtime certification is pending.
- Whole-window draggable/resizable panel geometry and persistent panel reset are incomplete. Palette card/full size is persisted, but free dragging/resizing is not implemented.
- Deterministic reference rendering, full source-bound runtime interaction, all language/theme/viewport/scale tuples, genuine captures, comparison images and negative design-parity regressions are pending integration. There are no fabricated screenshots or asserted passing visual gates.

These missing items must remain open in the product completeness inventory. Source tests do not upgrade any row to shipped visual evidence.
