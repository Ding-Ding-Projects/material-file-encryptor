# Browser download handoff

The companion extension provides an explicit link context-menu command. Its Pair browser action requests approval in the unlocked installed desktop. The native receiver requires an exact registered extension origin, native consent and an unpredictable session with a 15-minute expiry. Pairing is revoked when the desktop locks or the receiver closes. It admits at most 64 unique proposals per session and two concurrent requests. The session stays in extension memory and is not persisted or logged.

A proposal contains an HTTPS URL, a path-free suggested filename and a nonnegative browser identifier. Unknown fields, unsafe URL schemes, embedded credentials, unsafe ports, path characters and duplicate proposals are rejected. Native messages use Chrome's four-byte little-endian length prefix, strict UTF-8 JSON and a 64 KiB limit. The extension has no download or host-page permission and does not intercept or cancel existing browser transfers.

Receiving a proposal emits the desktop Start download state, with the source and suggested name. `prepareCapturedDownload` opens the native destination picker and creates a ready queue item. The existing `startDownload` action is a separate explicit confirmation; cancellation leaves the transfer unstarted. Actual transfers retain the existing public-DNS validation, redirect checks, size limits, progress, cancellation and atomic new-file destination behavior.

## Integration boundary

`browser-extension/` is companion source, not an installed or signed extension package. The final extension identity must be derived from the project-owned package key, then registered in a genuine native-host manifest. The installed host must validate the operating-system-supplied caller origin before connecting it to `createBrowserDownloadReceiver`. The service's `receiveBrowserProposal` entrypoint is host-only, never a renderer or ordinary browser request action. Host executable packaging, user-visible installation, signature proof and registration are separate work; no browser profile or registry is changed by development tests.

The desktop must display separate always-on-top Start and completion surfaces, plus the active Downloading surface. The extension-originated installed flow must be driven and captured before these three surfaces are claimed verified. Source tests and injected messages do not prove installed browser handoff or those presentation states.

## Installation-time pairing setup

The installed application registers the native host for the current user during `--squirrel-install` and `--squirrel-updated`, and removes that registration during `--squirrel-uninstall`. The companion extension is loaded unpacked from the `browser-extension` folder in the application resources. Its manifest `key` fixes the extension id to `hfabajdjnmccemhokjnipmaabdpljbbg`, which is the only origin the host accepts. The hook runs first and quickly, and every normal start repairs a registration that names another version's host. When the desktop exits or locks it revokes the pairing, so the extension shows Reconnecting only while the desktop is unreachable and shows Pairing expired, with the Pair action, once the desktop no longer knows the pairing; it learns this within a few seconds. Details are in the native host article. An installed v1.683.1 test exposed the update-time and pairing-state problems that this describes as fixed; the fixed behavior has not yet been re-verified on an installed build.

## Verification

`test/browser-download-receiver.test.js` verifies native approval, session revocation, caller allowlisting, strict proposal shape, URL/path checks, replay admission, lock during consent and bounded split-frame decoding. Existing download-service tests verify the actual queue's network and destination protections separately.

## Local extension packaging and transfer correlation

The extension packaging entrypoint stages local `vendor/material.js`, `vendor/search.js` and `vendor/regex-worker.js` through `scripts/build-browser-extension.mjs`. Material Web 2.5.0 and esbuild 0.25.11 remain pinned. The staging receipt records source/output hashes and explicitly marks signing, installation and runtime verification as not performed. Popup code uses no CDN.

Native preparation emits a ready download with `browserCaptureId`; transfer events preserve this identifier through completion or failure. Pending proposal cancellation emits `browser-proposal-cancelled`. The companion retains the proposed identifier and queries the native broker with `{type:'status',session,id}`. A proposed response means awaiting confirmation, never completed transfer. Installed caller and three-surface presentation proof remain pending.

## Host manifest location

The native host manifest is written to one fixed per-user file inside the Squirrel install root, `%LOCALAPPDATA%\MaterialFileEncryptor\native-messaging\org.dingding.material_file_encryptor.downloads.json`, never into the user-data profile. The Edge and Chrome registry keys therefore stay the same whichever `--user-data-dir` the app runs with, and Squirrel uninstall removes the file with the install root. Squirrel's uninstall leaves `Update.exe` and a `.dead` marker that a later cleanup removes, and each Setup run launches the app once. See the native host document for the migration of the earlier in-profile file.
