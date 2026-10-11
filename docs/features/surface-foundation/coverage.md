# Foundation coverage and remaining work

This is a bounded implementation module, not a universal interface-completeness claim. The following surfaces are registered in `src/shared/surface/registry.js`: workspace tabs, scoped search, command palette, context actions, notification center and build provenance. Material Web supplies genuine buttons, tabs, text fields, switches, sliders and dialogs. Generic DOM elements occur inside those registered compositions for text and layout.

## Implemented and locally checked

- Tab lifecycle, active selection, final-tab/pinned protection, bounded close history, grouping and safe metadata persistence.
- In-memory notifications, bounded history, read filtering, level filtering, search and JSON/CSV export serialization.
- Worker protocol for Unicode groups, replacement previews, zero-width matches, invalid patterns/flags and repeated global row matching.
- Local pinned Material Web browser bundle and syntax checks of all new modules.

Run focused data/protocol checks with `node --test test/surface-model.test.js test/surface-worker.test.js`. These checks do not prove rendered accessibility, layout, actual host action integration, local capture provenance, or runtime keyboard behavior.

## Explicitly incomplete

- The full canonical expression workbench still needs a structured parse tree, token annotations, debugging trace capability disclosure, saved snippets/history, import/export, test-case suites with expected outcomes, match navigation and detailed backtracking diagnostics. The implemented worker timeout is a runtime bound, not a complete debugger.
- Tab groups still need rename, arbitrary group creation, ordering, bulk selection/close, group collapse and full group search. Current grouping uses one work group.
- Notification history is session-only. Durable redacted history, presentation preferences, audio/narration, richer progress/cancellation and permission-aware recovery actions are not implemented here.
- The host must enumerate every feature, setting, destination and appearance control in the palette. Unregistered host features are not searchable through it.
- Universal element appearance editing, toy locks and support tickets, lockout recovery, two-factor registration, logo conversion, file conversion, local model management, scheduled external settings, School mode, both humor controls, narration, surprise interaction, local version history, changelog, external editor, all-format export and universal bulk actions remain outside this foundation. Other product modules may implement portions but must supply independent evidence.
- The context menu does not yet provide universal element appearance or lock actions. It provides only real tab actions. No inert placeholders claim these functions.
- Complete Cantonese localization of engine-specific guided-token names and level badges remains incomplete. Most module chrome has English/Cantonese/bilingual labels; this is not full language-contract certification.
- Whole-window draggable/resizable panel geometry and persistent panel reset are incomplete. Palette card/full size is persisted, but free dragging/resizing is not implemented.
- Deterministic reference rendering, full source-bound runtime interaction, all language/theme/viewport/scale tuples, genuine captures, comparison images and negative design-parity regressions are pending integration. There are no fabricated screenshots or asserted passing visual gates.

These missing items must remain open in the product completeness inventory. Source tests do not upgrade any row to shipped visual evidence.
