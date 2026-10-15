# Workspace shell and shared controls

The desktop workspace uses a sage Material Design 3 frame. The title bar, grouped navigation, compact top bar and open-work tabs remain stationary. Each destination owns a bounded scrolling content pane. Tables and editors have their own bounded overflow. Below 840 CSS pixels the navigation becomes a dismissible drawer. Settings and Help remain at the bottom of the navigation.

Only the initial Drive tab opens for a new profile. Saved open tabs, pinned state, groups and closed tabs are preserved. Registering a destination makes it discoverable without opening it. The strip shows only open tabs, a Home button before them and a New tab button after them. Previous and next scroll controls appear only while the tabs overflow. Tab management and keyboard panel layout controls live in contextual actions instead of permanent helper rows.

## Home and New tab

Home is a tab that shows one Material card for every destination: an icon, the name and a one-line description in the active language mode, plus an Open badge for destinations that already have a tab. Choosing a card opens that destination or focuses its existing tab. Arrow keys, `Home` and `End` move between cards, and a card reads as a button with its name, description and open state.

New tab opens a compact searchable menu, the mini home, anchored to the New tab button. It lists Home, every destination with its description, and the tab management actions that used to sit behind All tabs: restore a closed tab, manage groups, close selected tabs and collapse or expand a group. Its search includes the adjacent regular-expression workbench. Press `Ctrl+T` (or `Cmd+T`) to open it from the keyboard; `Ctrl+Shift+T` still restores the last closed tab. `Escape` or a click outside closes the menu and returns focus to the New tab button.

Cards and the menu use the shared motion tokens. Cards fade up on entry and show a state layer on hover, focus and press; under `prefers-reduced-motion` the entry animation and transitions are removed. The logic lives in `src/shared/surface/home.js`, the tab strip in `src/shared/surface/workspace-shell.js`, and the `mfe-home-grid` element is registered in the surface registry.

## Control API

Import `control` from `src/shared/surface/controls.js`. The signature is `control(tag, props = {}, children = [], ownerDocument = document)`. Choose the type at construction: `control('input', {type:'checkbox', checked:true})`. Assigning `type` later cannot change an existing custom element into another primitive. Buttons, text fields, selections, checkboxes, radios and sliders map to genuine locally bundled Material Web 2.5.0 primitives. `option` maps to `md-select-option`; append options before assigning the selection value. Existing IDs, names, data attributes, disabled state and input/change listeners remain on the promoted host. Use `CONTROL_SELECTOR` or semantic attributes instead of native tag-name assumptions.

Date/time and file controls use registered compositions with native platform picker internals. Native chooser inputs are implementation details, not exposed visual controls. File values are never written to diagnostics, history or exports. Text fields preserve validation and selection APIs. Switches expose a checked alias for Material selected state. The application keeps its strict local-only Content Security Policy and does not load a CDN.

## Context actions

`getContextOverlay(document)` owns one `mfe-context-menu` containing a real `md-menu` and `md-menu-item` children. `openContextMenu({anchor,event,target,items,language,onClose})` captures the target at opening. Each item supplies `id`, localized `label`, optional `disabled` and `shortcut`, and `run(target)`. Pointer invocation uses pointer coordinates; keyboard and button invocation use the anchor bounds. `registerContextActions(root, provider)` returns a disposer function. Providers receive `{target,path,event}`, where path comes from `composedPath()`. Providers compose from the deepest registered root through its ancestors, so local actions retain universal appearance and lock actions. Explicit item IDs are deduplicated. The shared host is portalled into the invoking modal ancestry and shown in the top layer; palette choices never create another menu. Admission checks belong to providers and must be rechecked immediately before a sensitive action.

Outside pointer input, Escape (including nonempty search), selection, navigation, removed targets, resize and teardown close the overlay. Arrow keys, Home/End and Enter/Space operate the menu; dismissal restores focus when the anchor survives. Selection restores focus before the action so an action can deliberately move focus elsewhere. Search results are generation-bound to discard old asynchronous work. Refreshing items never reconnects the focused search node. Material menu typeahead is disabled because the editable search owns printable keys.

## Verification status

The checked-in deterministic references and state inventory live under `design/gui-redesign/`. They are design references, not screenshots or runtime evidence. Focused local tests cover tab persistence/discovery, control mapping, contextual keyboard layout, Escape and listener teardown, hidden-host behavior and negative raw-control mutations. Integrated desktop build, actual input, layout matrix and visual parity remain separate required checks and are not claimed by these source tests.

New drive forms default to 80 MiB (83,886,080 bytes). Existing stored drive values remain unchanged.

## Notification narration

Opt-in narration receives canonical notification and operation changes through the existing serialized speech engine. Byte-progress changes do not repeat speech. Quiet attention settings and an unknown or enabled runtime accessibility-support state suppress narration without hiding visual notifications. Missing voices or speech failures produce one visual recovery notice directing the user to Personalization language settings. The runtime accessibility signal is conservative and does not claim to identify a particular screen reader.

## Startup presentation

After initial status and update state are known, an eligible returning launch makes one ten-percent draw through the shared startup helper. School mode, first launch, active work, failures, update activity and quiet attention settings suppress it. The host resolves the approved public catalogue and returns verified bounded image bytes; the renderer performs no image network request. State is checked again after resolution. A dismissible card shows the bilingual dish name for at most five seconds without moving focus, and is removed when the application becomes busy or quiet. Missing metadata or images leave the normal workspace unchanged.

## Account and publication workspace

The document workspace supports account discovery, browser sign-in, activation, sign-out and explicit refresh. Unsupported account refresh explains the host limitation and offers Add account for browser renewal. Authentication challenges appear only in a temporary surface and clear after completion or cancellation; they are not sent to history, narration, logs or exports.

Select a native project-folder grant and an active account, then choose an available owner, repository name, visibility and supported copy/push or fork route. The host prepares a captured review containing identity, owner, name, visibility, route and source revision. Copy/push includes complete committed history and the review says so explicitly. Fork requires the exact upstream owner/repository. Type the exact destination owner/name, then complete the shared two-key and slider confirmation. Changed inputs invalidate the review. No publication runs before final approval.

Cancellation uses the host operation controller. Published, cancelled and failed results preserve completed and attempted actions and identify any external state requiring review. There is no automatic retry after a partial result.

The browser extension popup uses local bundled Material controls and the shared regular-expression search. It can read pairing status, request pairing and disconnect. Only a proposed public HTTPS URL and suggested filename reach the desktop. Native destination review and Start download remain explicit desktop steps. Source packaging does not establish extension installation, native-host registration, authentication or live publication acceptance.

### Publication account identity

Accounts with the same login remain distinct when one comes from the GitHub CLI keyring and the other from the protected product account store. Every selected-account action carries the host-provided source kind and credential revision. CLI accounts explicitly have no revision receipt; protected accounts require a UUID receipt. Missing metadata disables activation, sign-out, access refresh and review preparation, with an instruction to refresh accounts or update the host. The interface never infers a provider.

The captured publication review displays its provider and credential revision. Preparation rejects a returned identity that differs from the selected account, and publication sends the exact captured fields. A refreshed account identity invalidates the old review. Sign-in availability remains host-controlled and requires reviewed project authorization metadata; opening this surface never starts authentication.

### Protected display-name integration

The desktop passes access requests to the existing privileged access service. Personalization receives an awaited display-name recording callback. A trusted display-name read runs before personalization mounts: a null value preserves the existing local name, and an unavailable adapter leaves that name intact with an actionable notice. A host history restoration applies the validated name without creating another settings-history entry; ordinary and nested settings writes still record normally.

A combined full reset that would change both a protected display name and local preferences is currently unavailable because the host exposes no conditional rollback transaction across those stores. Reset the name through its authorized control first, then reset the remaining preferences. Full reset with the default display name remains available subject to the existing authentication and protected-mode checks. This limitation is unresolved and must not be described as universal reset completion.

## Owned context startup readiness

The context acceptance provider first checks the admitted native fixture identity, dismisses earlier owned overlays, and performs a bounded read-only startup observation before creating its two synthetic files. It requires the connected access workspace, exactly one registered policy select with the actual initial PIN value, the mounted closed appearance editor, valid language/theme selections and no visible main error. It never substitutes a requested value for an unresolved Material getter. Identity is checked again after readiness. No password, PIN, authenticator code or other private field contents are read.

Fourteen focused source checks pass, including a regression that fails against the earlier provider because it prepared files without this readiness check. These checks do not establish packaged behavior, persisted appearance restoration or the remaining disabled/stale/locked runtime negatives. The default acquisition inventory remains 22 declared routes and 67 unavailable producers, with zero accepted visual tuples.

## Context persistence and restoration provider

The supplemental context provider edits the actual opacity field on the independently captured second synthetic file, observes the live effect and saved revision, reloads through the page lifecycle and checks the same target again. Restoration uses the normal Reset element control, creates its own revision and verifies the restored live appearance and saved state after a second reload. It requires a fresh owned appearance profile, preserves unexpected content and never replaces storage directly. A completed reset with interrupted final readback can resume without another reset.

The default appearance record and append-only revision journal remain retained intentionally; restoration does not pretend those originally absent keys were removed. Failed appearance restoration retains the synthetic target files for recovery. The source-only provider does not increase the 22 declared routes or reduce the 67 unavailable producers. Packaged persistence, reload and restoration remain unverified; accepted tuples remain zero.

Restoration authority now requires an unchanged final pre-input saved state and journal, followed by an exact opacity-only saved delta and a single matching revision. Observed content is provisional until its target, layer, settings, journal prefix, count, predecessor and snapshot pass validation. Concurrent pre-fill changes prevent input; post-write or coalesced changes prevent Reset element and retain records and synthetic files. A final pre-reset readback rejects intervening changes. Focused causal source regressions cover these ownership boundaries and interrupted reset readback; they do not establish runtime acceptance or atomic concurrency control.
