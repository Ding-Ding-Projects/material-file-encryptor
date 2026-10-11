# Native update controller

`src/main/update-service.js` implements an isolated main-process controller. It is not yet mounted in the application. No installed application, installer, release, or operating-system restart was exercised while developing this module. Native acceptance remains unverified.

## API and host integration

Create the service with `createUpdateService({ app, autoUpdater, dialog, fetch, isActiveWork, acquireInstallLease, getLanguage })`. The first three objects are the native main-process APIs. `fetch` defaults to the built-in implementation and is injectable for tests. No new dependency is required.

The controller exposes:

| Method | Behavior |
| --- | --- |
| `status()` | Returns an independent snapshot with state, reason, unsigned warning, and update metadata. No local path is exposed. |
| `check()` | Reads the fixed project release metadata, provenance, source tag, and package index. Concurrent checks share one operation. |
| `download()` | Downloads the selected full package into an isolated application-data cache and verifies its size, SHA-256, and Squirrel SHA-1. Does not invoke the native updater. |
| `installWhenSafe(parentWindow)` | Requires ready state, idle work, a native confirmation, and an exclusive installation lease before native updating. Verifies the native package cache before requesting application restart. |
| `cancelSchedule()` | Stops future scheduled checks. Does not cancel an existing download or native transaction. |
| `dispose()` | Stops scheduling, aborts owned HTTP work, removes native observers, and releases the installation lease. Does not claim to cancel Squirrel itself. |
| `on('status', listener)` / `off(...)` | Subscribes to state snapshots. The initial snapshot is available through `status()`. |

The host must supply `isActiveWork`, covering unsaved edits, mounted-drive activity, exports, imports, conversions, and other work that must survive. Its conservative default is busy. The host must also supply `acquireInstallLease`, which atomically refuses when busy or returns a release function and prevents new work until released. A simple busy check cannot replace this lease. Missing lease support prevents installation.

The native confirmation supports `en`, `zh-HK`, and `bilingual` through `getLanguage()`. It defaults to the safe Later button. The host must present the persistent ready banner, manual check action, exact version and release link, localized state/reason descriptions, unsigned warning, Later action, and originating-window focus behavior. These renderer integrations are outstanding and are not implemented by this module.

## State and timing

States include unavailable, idle, checking, current, available, downloading, ready, confirming, installing, restart-requested, failed, and disposed. Later preserves ready state. Active work preserves the staged package and reports `ACTIVE_WORK`. A native restart request is not proof of a successful update.

Checks are enabled by default on a packaged Windows installation with the expected executable inside an `app-x.y.z` directory and a sibling real `Update.exe`. Unsupported and unpackaged contexts never request metadata. Startup runs immediately, except first-run Squirrel startup waits ten seconds for its installation lock. Background intervals are clamped between fifteen minutes and twenty-four hours, with a four-hour default. HTTP operations have a thirty-second deadline; native observation has a ten-minute deadline. Metadata is limited to 1 MiB and a package to 1,500 MiB. Successful staging is retained for later consent; failed staging is removed. Cross-session cache retention and age-based cleanup are not implemented.

## Fixed release and integrity boundary

The metadata origin is `https://api.github.com/repos/Ding-Ding-Projects/material-file-encryptor`. Release assets must use the corresponding exact GitHub release-download URL. Only HTTPS GitHub release-asset CDN redirects are accepted, with a maximum of three redirects. Callers cannot supply a feed URL, package name, executable command, or release repository through the public API.

The controller rejects draft/prerelease metadata, invalid versions, duplicate assets, malformed indexes, oversized metadata, mismatching source tags, and mismatching package sizes or hashes. The provenance source commit must match a direct commit tag, consistent with the current publisher. The package index must match its provenance SHA-256 and list one full package at the recorded package version. The selected package must match the provenance SHA-256 and the index SHA-1, both in isolated staging and in the native Squirrel cache. Provenance and tag validation establish consistency within the fixed project; they are not a code-signing or publisher-authenticity guarantee.

The release publisher currently increments release tags independently of `package.json`. A newer tag containing the same package version is correctly reported as current. Production updating requires genuinely increasing package versions in the existing publishing pipeline; this module does not change that pipeline.

## Why native downloading waits for consent

The native updater may apply a downloaded Squirrel update on the next application launch even without calling `quitAndInstall()`. Consequently ordinary background downloads use the isolated cache, and native `checkForUpdates()` starts only after explicit confirmation and an idle lease. Native updating downloads again from the validated fixed release feed. The native cache is checked before this controller calls `quitAndInstall()`.

Once native Squirrel updating has started, its API supplies no cancellation or rollback mechanism. Disposal or a timeout stops this controller's observation and prevents a later callback from requesting restart, but cannot retract native work or guarantee what a future ordinary launch will do. A native cache mismatch or timeout is reported as failed, never as rollback success. The UI must communicate this limitation after a native failure. The module never invokes a shell, arbitrary command, installer executable, host shutdown, or host restart.

## Verification and remaining acceptance

`node --test test/update-service.test.js` exercises mocked native APIs and temporary non-executable package fixtures. It covers fixed-source metadata, unchanged package versions, corrupt packages, offline responses, oversized metadata, deferred and busy states, lease requirements, explicit confirmation, native-cache mismatch, concurrent requests, schedule bounds, disposal, and late native events. These checks prove controller behavior only.

Outstanding acceptance includes a real installed unsigned Squirrel application, real release assets with increasing package versions, end-to-end native cache layout and package naming, application restart into the new version, correct UI and focus behavior in all language modes, busy-work integration, and external failure recovery. There is no tested rollback, native cancellation, or completed update claim.
