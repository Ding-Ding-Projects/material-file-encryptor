# Shared composition ownership design, revision 2

This unit uses real registered SurfaceElement hosts with component-owned shadow anatomy and styles. It preserves the current sage design and Material Web primitives. No generic-node registration is used as proof of component provenance.

| Host | Semantics and supported light DOM | Owned rendering and styles |
| --- | --- | --- |
| mfe-titlebar | banner; existing .window-brand and .window-controls with three md-icon-button actions | shadow header with brand/controls slots, drag region, 42px sizing, flex geometry, frame color |
| mfe-main-workspace | main landmark; existing top bar, tabs, views and live region | shadow frame and default slot, flex containment, surface, outline, 24px shape, overflow |
| mfe-content-panel | region; existing view children and stable view ID | shadow content slot, scrolling region, responsive padding, minimum sizing |
| mfe-data-table | group; exactly one semantic table with intact thead/tr/th and tbody/tr/td, optional empty state | shadow scroll container and slot, surface outline, shape, bounded scroll height, table minimum width |
| mfe-selection-toolbar | toolbar with existing accessible name; summary and Material action group | shadow flex toolbar and slot, wrapping, container color, outline, top shape, spacing |

Each class extends SurfaceElement and constructs its own shadow stylesheet and rendered part once. connectedCallback establishes lifecycle state and slot listeners; disconnectedCallback releases listeners and invalidates live state; reconnection restores listeners without rebuilding or losing projected content. configure/update changes language/accessibility text in place. No arbitrary tab stops or keyboard interception is added. The table scroll container is keyboard focusable and labelled from the table caption/label; table header/body identities remain stable while rows may change.

The inspector requires the expected registered constructor, connected lifecycle, actual required shadow parts, owned adopted stylesheet identity, supported light-DOM anatomy and correct primitive types. Same-name empty hosts, raw clones, replaced shadow parts, detached/disconnected hosts, missing styles and incorrect titlebar controls fail. Membership receipts supplement these checks and never prove arbitrary generic DOM.

## Selector and API compatibility

- index.html changes only titlebar/main/view/table-scroll/selection-toolbar boundary tags. Existing IDs, classes, inner semantic tables, form controls, callbacks and record nodes stay unchanged.
- app.js narrow plumbing changes main queries to mfe-main-workspace, main > .view to mfe-main-workspace > .view, and dynamic section creation in addFeatureRoot to mfe-content-panel. The existing .table-scroll locator remains valid.
- mountSurfaceFoundation remains the public API and receives the actual workspace host. Its generated navigation/tabs are slotted children. registerViews and registerPanel retain the supplied root identity.
- style.css and modern.css lose migrated shell/chrome rules instead of accumulating an override layer. Remaining table cell, typography, document tokens and feature-specific styles continue to style semantic light DOM.
- Existing language, personalization, appearance targeting, selection and native command listeners continue to see light-DOM elements by the same IDs and classes. No user state is copied or reparented during updates.

## Initialization and disposal

The shell module imports the composition module before mountSurfaceFoundation executes. Existing HTML hosts upgrade before listeners are bound; dynamic hosts upgrade at creation. The constructor creates shadow structure only, avoiding light-DOM inspection until connection/slotchange. Local listeners are removed on disconnection. No global observer, timer or native capability is acquired. Component inspection is read-only and does not repair replaced anatomy.

## Bounded verification

Focused source tests cover registration, actual owned anatomy/style/lifecycle, token inheritance and red/green replacement cases. Existing shell/history-selection tests must remain green. A real source-bound build plus hidden desktop geometry, English/Cantonese/bilingual, light/dark, 100/125/150/200 percent display scales and packaged native command checks remain separate acceptance requirements. No source or simulated DOM test claims those outcomes. If scope or selector compatibility prevents a coherent full unit, titlebar/data-table/selection-toolbar is the first split and workspace/content-panel remains explicitly pending.

Independent review of this revision is required before implementation. This file is a design handoff, not runtime evidence.
