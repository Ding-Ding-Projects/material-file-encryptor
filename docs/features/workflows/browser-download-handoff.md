# Browser download handoff

The companion extension provides an explicit link context-menu command. Its Pair browser action requests approval in the unlocked installed desktop. The native receiver requires an exact registered extension origin, native consent and an unpredictable session with a 15-minute expiry. Pairing is revoked when the desktop locks or the receiver closes. It admits at most 64 unique proposals per session and two concurrent requests. The session stays in extension memory and is not persisted or logged.

A proposal contains an HTTPS URL, a path-free suggested filename and a nonnegative browser identifier. Unknown fields, unsafe URL schemes, embedded credentials, unsafe ports, path characters and duplicate proposals are rejected. Native messages use Chrome's four-byte little-endian length prefix, strict UTF-8 JSON and a 64 KiB limit. The extension has no download or host-page permission and does not intercept or cancel existing browser transfers.

Receiving a proposal emits the desktop Start download state, with the source and suggested name. `prepareCapturedDownload` opens the native destination picker and creates a ready queue item. The existing `startDownload` action is a separate explicit confirmation; cancellation leaves the transfer unstarted. Actual transfers retain the existing public-DNS validation, redirect checks, size limits, progress, cancellation and atomic new-file destination behavior.

## Integration boundary

`browser-extension/` is companion source, not an installed or signed extension package. The final extension identity must be derived from the project-owned package key, then registered in a genuine native-host manifest. The installed host must validate the operating-system-supplied caller origin before connecting it to `createBrowserDownloadReceiver`. The service's `receiveBrowserProposal` entrypoint is host-only, never a renderer or ordinary browser request action. Host executable packaging, user-visible installation, signature proof and registration are separate work; no browser profile or registry is changed by development tests.

The desktop must display separate always-on-top Start and completion surfaces, plus the active Downloading surface. The extension-originated installed flow must be driven and captured before these three surfaces are claimed verified. Source tests and injected messages do not prove installed browser handoff or those presentation states.

## Verification

`test/browser-download-receiver.test.js` verifies native approval, session revocation, caller allowlisting, strict proposal shape, URL/path checks, replay admission, lock during consent and bounded split-frame decoding. Existing download-service tests verify the actual queue's network and destination protections separately.

## Local extension packaging and transfer correlation

The extension packaging entrypoint stages local `vendor/material.js`, `vendor/search.js` and `vendor/regex-worker.js` through `scripts/build-browser-extension.mjs`. Material Web 2.5.0 and esbuild 0.25.11 remain pinned. The staging receipt records source/output hashes and explicitly marks signing, installation and runtime verification as not performed. Popup code uses no CDN.

Native preparation emits a ready download with `browserCaptureId`; transfer events preserve this identifier through completion or failure. Pending proposal cancellation emits `browser-proposal-cancelled`. The companion retains the proposed identifier and queries the native broker with `{type:'status',session,id}`. A proposed response means awaiting confirmation, never completed transfer. Installed caller and three-surface presentation proof remain pending.
