# Destructive actions

Every destructive action in the desktop application, the browser extension and the documentation site passes the two-key super confirmation before it acts. A destructive action deletes, empties, overwrites, resets, revokes, disconnects, stops, restarts, installs over existing files, or otherwise changes stored data or a running service in a way that cannot simply be undone.

## What the confirmation does

- It is built in the interface layer of each surface, as a dialog or, where a control can host it, a panel beside that control (`anchor` mode).
- It names the exact action and the data it affects, using the registered English, Cantonese or bilingual wording. Playfulness settings never rewrite these safety facts.
- Two independently operated keys must both be on before the full-range slider enables. Turning a key off disables the slider again and resets it.
- The action runs only after both keys are on and the slider is complete. Progress and completion animate, and `prefers-reduced-motion` removes the motion while the state still changes.
- It always offers `Emergency exit`, and `Escape` or Back also leave without changes. Focus returns to the control that asked.

## Where it lives

- Desktop and site: `src/shared/surface/workflow-confirm.js` (`requestSuperConfirmation` and `confirmDestructiveAction`), with the in-panel variant in `src/renderer/features/access/index.js`.
- Browser extension workspace: the confirmation dialog in `browser-extension/options.html`, driven by `browser-extension/options.js`.
- Browser extension popup: `browser-extension/super-confirm.js`.
- Registry: `src/shared/destructive-actions.js`. The extension copy is `browser-extension/destructive-confirm.js`.

## The guard

Run `node scripts/audit-destructive-actions.mjs`. It fails when a registered action loses its confirmation call or its handler token, when a destructive-looking request, handler or channel name is neither registered nor exempted with a written reason, when a registry entry is malformed, and when the extension copy drifts from the shared registry. `test/destructive-actions-audit.test.js` plants each of those faults and requires a finding. Behaviour is covered by `test/destructive-confirmation-behaviour.test.js` and `test/extension-super-confirm.test.js`.

## Inventory

Registered actions: 62 in total. 38 on the desktop application, 21 in the browser extension and 26 on the documentation site. Shared modules count on every surface that mounts them.

### Desktop application

| Registry id | Action | Source file |
| --- | --- | --- |
| `desktop.force-lock` | Force lock the drive | `src/renderer/app.js` |
| `desktop.empty-recycle-bin` | Empty the Recycle Bin | `src/renderer/app.js` |
| `desktop.release-offline-copy` | Remove the offline copy | `src/renderer/app.js` |
| `desktop.resplit-files` | Re-split every file | `src/renderer/app.js` |
| `desktop.forget-saved-credential` | Turn off automatic unlock | `src/renderer/app.js` |
| `desktop.pack-storage` | Pack encrypted storage | `src/renderer/app.js` |
| `desktop.install-update` | Install the update and restart | `src/renderer/app.js` |
| `desktop.reset-vocabulary` | Reset personal wording | `src/renderer/app.js` |
| `desktop.import-vocabulary` | Import wording over the current wording | `src/renderer/app.js` |
| `desktop.ollama-stop-runtime` | Stop the local model runtime | `src/renderer/features/ollama/index.js` |
| `desktop.server-stop` | Stop the server | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-restart` | Restart the server | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-change-setting` | Change a server setting | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-install-plugin` | Install a server plugin | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.clear-schedule-credential` | Clear a schedule credential | `src/renderer/features/personalization/index.js` |

### Shared modules (desktop application and documentation site workspace)

| Registry id | Action | Source file |
| --- | --- | --- |
| `desktop.restore-version` | Restore an older version | `src/renderer/app.js` |
| `desktop.replace-converter-output` | Replace the output file | `src/renderer/app.js` |
| `desktop.sign-out-account` | Sign out the selected account | `src/shared/surface/publication-panel.js` |
| `desktop.discard-unsaved-text` | Discard unsaved text | `src/shared/surface/workflow-tools.js` |
| `desktop.ollama-delete-model` | Delete the installed model | `src/renderer/features/ollama/index.js` |
| `desktop.ollama-delete-session` | Delete the saved chat session | `src/renderer/features/ollama/index.js` |
| `desktop.access-remove-lock` | Remove the lock | `src/renderer/features/access/index.js` |
| `desktop.access-remove-authenticators` | Remove authenticators | `src/renderer/features/access/index.js` |
| `desktop.access-remove-ticket` | Remove a local ticket | `src/renderer/features/access/index.js` |
| `desktop.access-remove-selected-tickets` | Remove selected local tickets | `src/renderer/features/access/index.js` |
| `desktop.access-history-retention` | Change history retention | `src/renderer/features/access/history-view.js` |
| `desktop.access-history-prune` | Prune expired history | `src/renderer/features/access/history-view.js` |
| `desktop.access-history-restore` | Restore a history record | `src/renderer/features/access/history-view.js` |
| `desktop.reset-settings` | Reset preferences | `src/shared/local-ux/settings-reset.js` |
| `desktop.import-settings` | Import settings over the current ones | `src/renderer/features/personalization/index.js` |
| `desktop.reset-display-name` | Reset the display name | `src/renderer/features/personalization/index.js` |
| `desktop.remove-schedule` | Remove a schedule rule | `src/renderer/features/personalization/index.js` |
| `desktop.remove-local-snapshot` | Remove a local snapshot | `src/renderer/features/personalization/index.js` |
| `desktop.history-prune` | Prune expired local history | `src/renderer/features/personalization/history.js` |
| `desktop.history-restore` | Restore a history entry | `src/renderer/features/personalization/history.js` |
| `desktop.reset-appearance` | Reset all appearance | `src/renderer/features/personalization/appearance.js` |
| `desktop.import-appearance` | Import appearance over the current one | `src/renderer/features/personalization/appearance.js` |
| `desktop.reset-logo` | Reset the logo | `src/renderer/features/personalization/logo.js` |

### Browser extension

| Registry id | Action | Source file |
| --- | --- | --- |
| `extension.reset-settings` | Reset browser settings | `browser-extension/options.js` |
| `extension.clear-history` | Clear history | `browser-extension/options.js` |
| `extension.delete-notes` | Delete notes | `browser-extension/options.js` |
| `extension.delete-ticket` | Delete a ticket | `browser-extension/options.js` |
| `extension.delete-model` | Delete a local model | `browser-extension/options.js` |
| `extension.clear-chat` | Clear the conversation | `browser-extension/options.js` |
| `extension.clear-wording` | Clear wording | `browser-extension/options.js` |
| `extension.import-wording` | Import wording over the saved wording | `browser-extension/options.js` |
| `extension.remove-logo` | Remove the logo | `browser-extension/options.js` |
| `extension.discard-recording` | Discard the recording | `browser-extension/options.js` |
| `extension.disconnect` | Disconnect from the desktop | `browser-extension/options.js` |
| `extension.popup-disconnect` | Disconnect from the desktop | `browser-extension/popup.js` |
| `extension.cancel-editor-request` | Cancel the request and disconnect | `browser-extension/options.js` |
| `extension.converter-disconnect` | Stop waiting and disconnect | `browser-extension/converter.js` |
| `extension.server-stop` | Stop the server | `browser-extension/servers.js` |
| `extension.server-restart` | Restart the server | `browser-extension/servers.js` |
| `extension.server-change-setting` | Change a server setting | `browser-extension/servers.js` |
| `extension.server-install-plugin` | Install a server plugin | `browser-extension/servers.js` |
| `extension.cancel-schedule` | Cancel a scheduled change | `browser-extension/options.js` |
| `extension.discard-operation` | Discard a saved operation | `browser-extension/operations-panel.js` |
| `extension.discard-all-operations` | Discard all saved operations | `browser-extension/operations-panel.js` |

### Documentation site

| Registry id | Action | Source file |
| --- | --- | --- |
| `site.clear-vocabulary` | Clear personal wording | `docs/site/site.js` |
| `site.clear-workspace-vocabulary` | Clear private wording | `docs/site/workspace.js` |
| `site.reset-visitor-records` | Reset visitor records | `docs/site/visitor-access.js` |

## Native prompts and exemptions

Native consent prompts stay native because they are the owner agreeing to a request from outside the interface:

- `native.browser-pairing` in `src/main/browser-native-host.js`: the pairing and Confirm prompts in the desktop main process.
- `native.quit-dialog` in `src/main/main.js`: stopping servers while the application quits is part of the quit dialog the owner already chose.
- `native.driver-install` in `src/main/main.js`: installing the file system driver launches the native installer, which shows its own elevation consent; it adds a component and removes nothing.
- `native.tray-menu` in `src/main/main.js`: the tray menu is an operating-system menu that cannot host the confirmation; its lock item is the ordinary lock, its quit item opens the quit dialog and its cancel item only cancels in-flight work.

Names that look destructive but are not are listed with a reason in `EXEMPT_ACTIONS` and `EXEMPT_IN_FILES`. They cover cancelling in-flight work, hiding a pairing code, restoring deleted entries, draft-only edits and the low-level calls that sit beneath a registered action. Reviewing those reasons is part of reviewing this feature.

## Verification

The checks are deterministic source and component checks with a DOM double. They are not installed runtime, built interface or assistive-technology acceptance, and no layout capture was taken for the new panels in this change.
