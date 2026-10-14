# Authenticated browser-to-desktop channel (approved design)

Status: **Approved by the maintainer on October 14, 2026**, with the decisions
recorded under "Maintainer decisions". The "Candidate scopes" table records which
scopes are implemented so far. Each scope below is built and verified on its
own; approval of the design is not a claim that any scope works.

## Purpose

The browser extension currently works entirely from local, browser-only state.
Most of the remaining extension features need the desktop application to act on
the user's behalf: reading lock state, approving an unlock step, showing an
authenticator code, starting a file conversion, opening an external editor, or
reporting update status. Each of those needs a channel where the desktop, not
the browser, decides what is allowed.

This proposal defines that channel. Its central rule is simple: **the browser
never holds a secret that outlives one approved action, and every grant is
approved in the unlocked desktop by the person sitting at it.**

## Current baseline

These parts exist and are covered by tests. The proposal builds on them and does
not replace them.

- **Transport.** `MaterialFileEncryptor.BrowserHost.exe` relays native-messaging
  frames over a named pipe derived from the user SID, opened with
  `PipeOptions.CurrentUserOnly`, with the DACL read back and checked before the
  broker reports ready. Frames are length-prefixed strict UTF-8 JSON, at most
  64 KiB. See `docs/features/workflows/browser-native-host.md`.
- **Pairing.** A new extension origin is paired only after explicit approval in
  the unlocked desktop. Reject is the default. A pairing session lasts at most
  15 minutes, is held in memory only, and is revoked on lock or exit.
- **Protected mediation.** `src/main/browser-protected-mediation.js` already
  implements one scope, `read-profile-summary`. It issues a single-use grant of
  32 random bytes, bound to origin, pairing session and revocation generation,
  expiring after at most 60 seconds. Native authority objects never leave the
  main process. The native approval callback (`authenticateProfile`) is not yet
  provided, so the scope reports `authentication: "unavailable"`.

## Threat model

| Actor | Can do | Must not be able to do |
| --- | --- | --- |
| A web page the user visits | Send messages to the extension's content surface, if any | Reach the native host, observe grants, or trigger a desktop prompt |
| The extension itself | Ask for a scoped action; show the result | Hold a vault key, password, recovery code or long-lived token |
| Another process running as the same Windows user | Launch the host or connect to the user's pipe | Complete an action without a visible desktop approval |
| Another Windows user, or a lower-integrity process | Nothing | Open the pipe at all |
| A person at the locked desktop | Nothing through this channel | Approve anything; lock revokes every grant |

The same-user case is the important limit. A native-messaging origin string is
an allowlist value, not proof of browser provenance. Any process running as the
same user can impersonate the extension at the transport level. The design
therefore never treats transport identity as authorization. **Authorization
comes only from a human approving a specific, described action in the desktop.**

## Design

### 1. Scopes are a closed list

Each operation the browser may request is a named scope, declared in a reviewed
table in the main process. A scope fixes:

- the operation name and its exact request fields;
- whether it is read-only or changes state;
- the approval mode (see section 3);
- the longest grant lifetime it may receive (never more than 60 seconds);
- the exact response shape, which the main process checks before sending it.

Unknown scopes, extra fields and wrong types are rejected before any native
code runs, exactly as the current mediation does. Adding a scope is a reviewed
code change with its own tests. There is no generic "run this command" scope.

### 2. Grants are single-use and short-lived

The existing grant model is kept for every scope:

- 32 random bytes, base64url, generated in the main process;
- bound to origin, pairing session, revocation generation, scope and request
  fields (a grant for one file conversion cannot be replayed for another file);
- consumed on first use, whether the action succeeds or fails;
- expiring at the earliest of the scope limit, the pairing expiry and 60 seconds;
- at most one outstanding grant per origin.

Lock, sign-out, desktop exit, pairing revocation and update preparation all
increase the revocation generation, which invalidates every outstanding grant at
once.

### 3. Approval happens in the desktop, never in the browser

Three approval modes, from least to most friction:

- **Status.** For scopes that only report non-secret state (lock state, update
  available, download progress). They need a valid pairing, but no prompt per
  request. They never return paths, file names, contents or credentials.
- **Confirm.** For scopes that change state but expose nothing secret (open a
  file in the configured editor, start a conversion, queue an update check).
  The unlocked desktop shows a native dialog naming the origin, the action and
  its exact target. Reject is the default button. The dialog cannot be answered
  from the browser.
- **Re-authenticate.** For scopes that touch protected material (show an
  authenticator code, step an unlock level, read a protected profile). The
  desktop asks for the user's existing vault credential or Windows Hello before
  issuing the grant. The credential is checked in the native layer and never
  crosses the pipe.

A desktop that is locked, minimized to tray with no visible window, or in
verification mode refuses every Confirm and Re-authenticate request. It does not
queue them for later.

### 4. Nothing secret is stored in the browser

- The extension keeps the pairing session only in `chrome.storage.session`
  (memory, cleared when the browser closes), never in `storage.local` or sync.
- Grants are held in a local variable for the single follow-up request and then
  dropped.
- Responses that contain a sensitive value, such as an authenticator code, are
  shown once in the popup and never written to extension storage, history,
  exports, notifications or logs. The code's own validity window is shown next
  to it.
- Diagnostics record scope names and outcomes only, never message bodies,
  sessions or grants. This already holds for the transport.

### 5. Rate limits and abuse resistance

- At most one pending desktop prompt at a time. Further requests are refused
  with "busy" until it is answered.
- Rejected prompts never revoke a pairing on their own. A pairing ends only
  when the desktop locks or exits, or when the person disconnects it in the
  desktop or the extension. The one-pending-prompt rule above is what keeps a
  noisy caller from stacking prompts.
- The existing per-connection cap of 256 requests and the 35-second request
  deadline still apply.

### 6. What the channel is not

- It is not a remote control. It works only between the browser and the desktop
  on the same Windows session. It never listens on a network port.
- It does not move plaintext file contents. Conversions and editor launches run
  inside the desktop against files the desktop already controls. The browser
  only sees a status and, at most, a file name the user already chose.
- It does not authenticate the browser to any online service.

## Candidate scopes

These are proposals for review, not commitments. Each needs its own approval.
The last column records implementation status only; it is not a verification
claim. Runtime verification (the compiled-host test, the native dialog captures
and the installed end-to-end path) is still outstanding for every scope.

| Scope | Mode | Returns | Implementation |
| --- | --- | --- | --- |
| `read-lock-state` | Status | `locked`, `unlocked` or `unavailable` | Implemented |
| `read-update-state` | Status | current version, available version, download progress | Implemented |
| `read-profile-summary` | Re-authenticate | existing safe summary (already implemented) | Implemented |
| `focus-authenticator` | Confirm | `shown`: the desktop authenticator window is brought forward; no code is returned | Implemented |
| `read-school-mode` | Status | the school mode's display name and whether it is on | Implemented |
| `set-school-mode` | Re-authenticate | `changed`, `unchanged`, `rejected`, `busy` or `unavailable`, and the resulting on/off state; Windows Hello is not used by this build, so the check is the vault password in the desktop | Implemented |
| `request-unlock-step` | Re-authenticate | the new unlock level | Not implemented |
| `open-in-editor` | Confirm | `opened` or a plain failure reason | Not implemented |
| `convert-file` | Confirm | job id and status updates | Not implemented |
| `begin-qr-pairing` | Confirm | a short-lived pairing QR image for a phone | Not implemented |

## Verification plan

No scope is called working until each of these exists:

1. Unit tests for request validation, grant binding, replay, expiry and
   generation revocation (extending `test/browser-protected-mediation.test.js`).
2. A compiled-host test proving that a same-user impostor process cannot finish a
   Confirm or Re-authenticate scope without the native approval callback.
3. Captures of each native approval dialog in the real built desktop, at default
   size, in English and Cantonese, light and dark.
4. A test showing that locking the desktop while a grant is outstanding makes
   the next use of that grant fail.
5. An extension-side test proving no grant or sensitive response reaches
   persistent extension storage.

## Maintainer decisions

The four open questions were answered on October 14, 2026:

1. **Status scopes require a pairing.** Lock and update state are readable only
   by a paired extension, so an unpaired process cannot learn whether the
   desktop is unlocked.
2. **Re-authenticate uses Windows Hello when it is available, otherwise the
   vault password.** Either is checked in the desktop and never crosses to the
   browser.
3. **Authenticator codes never appear in a browser surface.** The former
   `show-authenticator-code` scope is replaced by `focus-authenticator`, which
   only brings the desktop authenticator window forward after a Confirm prompt.
4. **Rejections never revoke a pairing automatically.** Only lock, exit or an
   explicit disconnect end it (section 5).
