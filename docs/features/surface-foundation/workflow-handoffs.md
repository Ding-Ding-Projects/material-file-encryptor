# Document workflow and native handoffs

The optional `workflow-tools.js` surface is a working document editor, with local presets and native file/editor/download handoffs. It is mounted inside the existing application, rather than replacing the initial file workspace.

```js
import {mount} from './shared/surface/workflow-tools.js';
const view = mount(host, {
  translate,
  services: {
    storage: localStorage,
    getLanguage: () => currentLanguage,
    request: (action, payload) => nativeWorkflowRequest(action, payload),
    subscribe: callback => subscribeWorkflowEvents(callback),
  },
});
```

The host maps `request` to `createWorkflowServices(...).dispatch(action, payload)`. Browser companions must expose this bridge only through their paired, authenticated action allowlist. The module never chooses a shell command, arbitrary executable arguments, or a privileged browser route. `refresh()` reloads host inventories without replacing the editor fields; `refreshLabels()` updates known display labels after a language change. `destroy()` cancels open confirmation surfaces and subscriptions.

## Native service contract

Create the backend with `createWorkflowServices({dataDirectory, dialog, getWindow, openExternal, openPath, emit, forgeAccounts, forgeOwners})`. The optional signature inspector defaults to the existing native Authenticode inspector. The optional transport, DNS lookup and editor spawn adapters exist for deterministic host tests; never expose them to renderer requests.

| Actions | Input and behavior |
| --- | --- |
| `documents`, `pickDocument`, `pickProject` | Enumerate session grants, or use a native file/folder picker to produce an opaque identifier. Renderer paths never grant filesystem access. |
| `readDocument` | `{id}` returns `{id,name,text,revision}` for a regular UTF-8 file bounded to 256 KiB. |
| `saveDocument` | `{id,text,revision}` checks the original revision before replacing a file. Writes use a temporary sibling and atomic rename. |
| `createDocument` | `{name,text}` chooses a native destination and creates a new file without overwriting an existing destination. |
| `templates` | Returns the shipped blank text, Markdown notes and JSON object starting content. |
| `editors`, `pickEditor` | Detect supported editors, or grant a selected signed executable. Supported executables are VS Code, VS Code Insiders and Notepad. Microsoft publisher signatures and current file hashes are verified before launch. Hashing reads at most 64 KiB at a time and rejects file identity or content-size changes observed across verification. |
| `openEditor`, `openInCode` | Open a granted document or project with fixed argument construction and no shell. Notepad does not open project folders. `openInCode` specifically requires VS Code or Insiders. |
| `editorDownload` | Opens the fixed official VS Code download page after an explicit user action. |
| `downloads`, `prepareDownload` | List transfers or choose a native destination for `{url}`. Preparation does not start a transfer. |
| `startDownload`, `cancelDownload` | `{id}` starts or cancels the actual queued transfer. Only one transfer runs at a time. |
| `accounts`, `owners` | Read sanitized account/owner metadata from host-provided authenticated account services. Credentials are never returned. |
| `prepareHandoff` | `{documentId,accountId,ownerId,route}` prepares a local review document. Route is `copy-push`, or `fork` only when the selected owner supports it. |
| `exportHandoff`, `openHandoff` | `{id}` exports to a native-selected new file or opens a private local handoff. Export returns a granted document ID that can be opened through `openInCode`. Neither operation publishes anything. |

`emit('workflow', {type:'download', item})` reports real transfer state, bytes, optional total/rate/ETA and errors. `pending` counts outstanding work. `cancelAll()` aborts active transfers; `close()` blocks new dispatch, cancels active transfers and waits for owned work to settle before clearing grants.

## Boundaries and failure behavior

Text is decoded strictly as UTF-8. Typed and preset text use the same byte limit. Existing files remain unchanged when validation, revision checks, or temporary writes fail. New-file creation uses an exclusive hard-link installation so it cannot replace a file created concurrently; filesystems without that capability return a real error rather than falling back to a partial write.

Downloads are HTTPS only, limited to 256 MiB, 120 seconds and three redirects. Every destination hostname is resolved before its request. Loopback, private, link-local, multicast and reserved/test address ranges are rejected; redirects repeat the check. IPv6 classification uses numeric prefixes, so equivalent padded or compressed addresses receive the same result. Transition and special-purpose IPv6 ranges are conservatively excluded. The checked address is pinned through the request's lookup callback. Downloaded bytes are not executed. A completed transfer is installed only at a new destination; cancellation and failure remove the temporary sibling and preserve any previous file. Pause/resume are explicitly unavailable; cancel and retry are the supported controls.

The document filter is collapsible and its state persists. A collapsed active filter is named in its summary. Editable text fields have dedicated clear controls using the same input path. Presets fill a blank editor only after the user chooses them. Unsaved content replacement uses two independently operated confirmation keys and a full-range slider, followed by Execute. Escape, Emergency exit and owner teardown cancel the confirmation. Completion is shown before dismissal.

## Verification and remaining scope

Focused tests exercise native-grant boundaries, strict byte limits, stale-write preservation, cancellation and single-transfer behavior, redirect DNS rejection, editor identity and fixed arguments, local-only forge preparation, and actual confirmation callback gating. A DOM fixture drives browse, clear and save against the real backend and temporary files. These are not packaged runtime, native-picker interaction or visual evidence.

This module does not implement forge sign-in/account administration or automatic publishing. It consumes an existing authenticated host account inventory and produces a reviewable handoff. A host without that inventory displays an explicit unavailable state. Native editor grants and document grants are session-scoped; detected installed editor IDs are stable, while manually selected portable editors must be selected again after restart.

The browser-extension download capture contract remains separate: this module has no browser extension, no cross-application always-on-top window, and no proof of extension-originated start/progress/completion surfaces. Full native layout, keyboard, screen-reader, reduced-motion and multilingual runtime captures remain required after integration. The prepared handoff text contains the selected route and forbids destructive repository recovery, but it is not evidence that any repository was copied, forked or published.

## Host integration example

Register one optional document view and use the existing feature bridge:

```js
import {mount as mountWorkflow} from '../../shared/surface/workflow-tools.js';
const workflow = mountWorkflow(panel, {
  translate: canonicalTranslate,
  services: {
    storage: localStorage,
    getLanguage: () => language,
    request: (action, payload) => window.drive.featureRequest('workflow', action, payload),
    subscribe: callback => window.drive.onFeatureEvent('workflow', callback),
  },
});
// Call after language changes without recreating editor state.
workflow.refreshLabels();
// Call when the owning view is permanently disposed.
workflow.destroy();
```

The main-process dispatcher must route only the listed `workflow` actions to the service's `dispatch` method after the normal sender validation. Construct one service per application lifecycle, forward its `emit(feature,event)` through the existing feature event transport, include `pending` in active-operation status, invoke `cancelAll()` for an explicit cancel-all operation, and await `close()` during quit. Supply account metadata adapters only when a real authenticated forge integration exists. An empty account inventory is supported and must not be replaced with fabricated signed-in accounts.

The paired browser adapter must explicitly allow the same action names and retain its normal authentication requirement. A browser-only host without a native workflow service stays disconnected. It cannot fabricate native picker grants or expose raw filesystem paths as grants.
