# Update panel

`src/renderer/features/updates/index.js` exports `mountUpdates(root, options)` and its `mount` alias. It registers `mfe-updates-panel` using the shared surface base and renders Material buttons and progress indicators. Mount it inside the existing application workspace.

```js
const updates = mountUpdates(root, {
  translate: canonicalTranslate,
  language,
  services: {
    request: (action, payload) => window.drive.featureRequest('updates', action, payload),
    subscribe: callback => window.drive.onFeatureEvent('updates', callback),
  },
});
updates.setLanguage(nextLanguage);
```

Requests are limited to `status`, `check`, `download`, and `install`, each with an empty payload. Only `status` is requested during mounting. Installation is requested only after the user activates **Restart to install**. The native controller remains responsible for its final confirmation, active-work lease, package verification, and restart behavior.

`subscribe` supplies a status snapshot directly or as `{snapshot}`. The panel displays the controller's checking, available, downloading, ready, deferred, failed, unavailable, current, confirming, installing, and restart-requested states. Unknown states display unavailable. Snapshots can include `currentVersion`, `update.version`, `update.sourceCommit`, `unsigned`, `update.unsigned`, `reason`, and a fractional `progress`. Without measured progress, the download indicator is indeterminate. No rollback support is asserted.

Installation is disabled during a pending request or busy controller state, outside `ready`, when `desktopAvailable` or `canInstall` is false, or when `busy` or `activeWork` is true. Browser adapters must report their actual inability to install through these flags or an unavailable state; they must never forward an unsupported install request.

**Later** changes only the local presentation to deferred and sends no installation or network request. It preserves the staged package and does not disable a later explicit installation. A different package or non-ready snapshot clears that local display choice. It is not a claim that the host's automatic checking schedule was changed.

The returned controller exposes `refresh()`, `setLanguage(language)`, `refreshLabels()`, and `destroy()`. Supported language values are `en`, `yue`, and `bilingual`; a supplied canonical translator takes precedence. Language refresh preserves state and does not submit requests. Destruction unsubscribes and discards late request responses.

Focused executable DOM-fixture tests cover action dispatch, local defer, browser/busy restrictions, unknown progress, localization, duplicate prevention, and disposal. These checks do not constitute native installer, real browser, keyboard-focus, screen-reader, or rendered layout evidence; those remain integration verification work.
