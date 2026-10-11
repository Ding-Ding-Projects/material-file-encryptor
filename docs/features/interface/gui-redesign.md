# Workspace shell and shared controls

The desktop workspace uses a sage Material Design 3 frame. The title bar, grouped navigation, compact top bar and open-work tabs remain stationary. Each destination owns a bounded scrolling content pane. Tables and editors have their own bounded overflow. Below 840 CSS pixels the navigation becomes a dismissible drawer. Settings and Help remain at the bottom of the navigation.

Only the initial Drive tab opens for a new profile. Saved open tabs, pinned state, groups and closed tabs are preserved. Registering a destination makes it discoverable without opening it. Previous and next controls scroll the strip; All tabs opens the shared searchable contextual menu. Its search includes the adjacent regular-expression workbench. Tab management and keyboard panel layout controls live in contextual actions instead of permanent helper rows.

## Control API

Import `control` from `src/shared/surface/controls.js`. The signature is `control(tag, props = {}, children = [], ownerDocument = document)`. Choose the type at construction: `control('input', {type:'checkbox', checked:true})`. Assigning `type` later cannot change an existing custom element into another primitive. Buttons, text fields, selections, checkboxes, radios and sliders map to genuine locally bundled Material Web 2.5.0 primitives. `option` maps to `md-select-option`; append options before assigning the selection value. Existing IDs, names, data attributes, disabled state and input/change listeners remain on the promoted host. Use `CONTROL_SELECTOR` or semantic attributes instead of native tag-name assumptions.

Date/time and file controls use registered compositions with native platform picker internals. Native chooser inputs are implementation details, not exposed visual controls. File values are never written to diagnostics, history or exports. Text fields preserve validation and selection APIs. Switches expose a checked alias for Material selected state. The application keeps its strict local-only Content Security Policy and does not load a CDN.

## Context actions

`getContextOverlay(document)` owns one `mfe-context-menu` containing a real `md-menu` and `md-menu-item` children. `openContextMenu({anchor,event,target,items,language,onClose})` captures the target at opening. Each item supplies `id`, localized `label`, optional `disabled` and `shortcut`, and `run(target)`. Pointer invocation uses pointer coordinates; keyboard and button invocation use the anchor bounds. `registerContextActions(root, provider)` returns a disposer function. Providers receive `{target,path,event}`, where path comes from `composedPath()`. The deepest registered root has priority. Admission checks belong to providers and must be rechecked immediately before a sensitive action.

Outside pointer input, Escape (including nonempty search), selection, navigation, removed targets, resize and teardown close the overlay. Arrow keys, Home/End and Enter/Space operate the menu; dismissal restores focus when the anchor survives. Selection restores focus before the action so an action can deliberately move focus elsewhere. Search results are generation-bound to discard old asynchronous work.

## Verification status

The checked-in deterministic references and state inventory live under `design/gui-redesign/`. They are design references, not screenshots or runtime evidence. Focused local tests cover tab persistence/discovery, control mapping, contextual keyboard layout, Escape and listener teardown, hidden-host behavior and negative raw-control mutations. Integrated desktop build, actual input, layout matrix and visual parity remain separate required checks and are not claimed by these source tests.

New drive forms default to 80 MiB (83,886,080 bytes). Existing stored drive values remain unchanged.
