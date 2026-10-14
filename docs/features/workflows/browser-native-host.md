# Native browser messaging transport

`MaterialFileEncryptor.BrowserHost.exe` implements the Windows native-messaging
transport for `org.dingding.material_file_encryptor.downloads`. It has two modes:
the browser-launched host validates its configured caller origin and relays
messages through a same-user named pipe; the desktop launches `--broker` as a
hidden owned child and exchanges correlated bounded frames over standard I/O.
The transport does not open a vault, handle plaintext file contents, or store
browser pairing credentials on disk.

The production pipe name is derived from the current Windows user SID. Both the
client and server request `PipeOptions.CurrentUserOnly`. The server reads the
actual DACL back and accepts it only when it contains one allow entry for the
actual user SID with read and write access. Missing, broad, or unexpected permissions
stop the broker before it reports ready. This inspection avoids treating the token
owner SID used by some .NET versions as necessarily equal to the actual user SID.
Different integrity or elevation levels may still prevent connection. The
supported path uses the desktop and browser at the same normal user level.

## Consent and download states

An extension origin string is an allowlist value, not proof of browser provenance.
A process running as the same user can launch the host or connect to that user's
pipe. Every new pairing therefore still needs explicit approval in the unlocked
desktop. The approval must identify the proposed origin and explain that this
transport cannot authenticate a manually launched same-user process. Reject is
the default choice. Pair approval never approves a download or a destination.

The JavaScript broker delegates pairing and proposals to
`createBrowserDownloadReceiver`, with a 15-minute in-memory session and a maximum
of 64 unique proposals. It forwards accepted proposals only to the host-only
`receiveBrowserProposal` method. The renderer cannot call that method. The native
destination picker and explicit Start download action remain separate steps.

The extension may request an exact `{type:"status",session,id}` message for its
proposal. The broker reports `awaiting-confirmation`, `downloading`, `completed`,
`failed`, or `cancelled`, with byte progress from real desktop download events.
The correlation ID stays attached to the queue item as `browserCaptureId`.
Status responses never include a destination path, URL, plaintext, or credentials.
The desktop must revoke the broker on lock and close the owned child on exit.

`close()` revokes admission immediately and concurrent callers share its asynchronous
receipt. Within a three-second deadline it observes the owned process exit,
closure of all inherited standard-I/O streams, and outstanding response callbacks.
The receipt includes `processExited`, `stdioClosed`, pending request/response
counts, and `verified`. A missing exit, undrained stream or unresolved native
approval keeps `verified` false. No unrelated process is terminated and an issued
termination request is never treated as proof of process exit.
If an earlier receipt was unverified, a later retry observes the current exit and
drain state again. A completed successful receipt remains stable.

The desktop initializes `createBrowserHandoffLifecycle` from its bundled
`browser-host` directory. Missing or invalid reviewed configuration prevents
broker creation. The desktop's isolated verification mode also disables the
production broker, keeping synthetic tests separate from the current user flow.
Startup connects native consent, unlocked/closing admission, host-only proposal
delivery and download events. Every published locked or unverified helper state
revokes pairing. Quit, update preparation and verification exit await a verified
close receipt before completing service shutdown. `getState` includes a factual
`browserDownloadHandoff` status and the last close receipt.

The startup failure handler uses the same verified close boundary before
`app.exit(1)`. An unverified receipt retains the desktop, records recovery-required
state, and offers a native Keep running / Retry shutdown choice with Keep running
as default. Retry rechecks the same owned process and stream evidence. An unavailable
recovery dialog also retains the process and reports the unverified state. Startup
failure is not permission to leave an unverified broker behind.

General desktop feature IPC has a separate access context boundary: after the
main process validates the request frame, it passes the actual `event.senderFrame`
as the fourth native service argument. The main-owned frame getter returns
`window.webContents.mainFrame`. Renderer payloads never provide an actor, and
loopback adapter calls keep their context absent instead of borrowing that frame.
The access adapter must reject missing context. Native download proposal delivery
remains its own host-only route and does not invent a renderer access identity.

## Identity and registration plan

`scripts/browser-native-registration.mjs` accepts a reviewed CRX3 package and a
version-1 public identity receipt containing `format`, `signatureVerified`,
`extensionId`, `publicKeyDerBase64`, `packageSha256`, and `publicKeySha256`. It
independently checks package and public-key hashes, derives the extension ID from
the public key, checks the CRX3 signed identity, and verifies the matching RSA or
ECDSA signature over the signed header and payload. A receipt's success flag
alone cannot satisfy verification. An unsigned source bundle is not accepted.

The generator additionally requires normalized absolute installed host and
manifest paths. It writes the native-host manifest, `browser-host-config.json`,
and an exact HKCU registration plan for Chrome and Edge. It does not execute
registration commands, install or remove a host, change a browser profile, or
open a user's browser. Existing output files are preserved rather than replaced.
When a reviewed package identity is unavailable, the configured native handoff
remains unavailable. No placeholder extension ID is shipped as trusted.

The build compiles the executable into `out/browser-host`; packaging must include
that directory and the verified configuration when it exists. The host uses the
existing unsigned Squirrel.Windows package route. Compiling or bundling this
transport does not prove installed caller trust, successful host registration,
extension publication, installed updates, or removal. Actual installation and
the installed update/removal lifecycle are deferred.

`build.bat /s /browser-host-only` is the focused production entrypoint for this
transport. It runs the existing dependency bootstrap and vocabulary check, publishes
the real self-contained Windows executable, and records its source and executable
hashes in `out/evidence/browser-host-build.json`. It does not package or install the
desktop. The full `build.bat /s` route publishes the same host before packaging.

## Status scopes

Two read-only scopes follow the Status approval mode of the approved
browser-to-desktop channel design: `read-lock-state` and `read-update-state`.
Both need a valid, live pairing from the same native connection, show no desktop
prompt, and answer with fixed non-secret fields only. They are handled by
`src/main/browser-status-mediation.js`, which rejects unknown fields, prototype
tricks and wrong types before it reads anything.

- `read-lock-state` returns `lock-state` with `state` set to `unlocked`,
  `locked` or `unavailable`. Locking the desktop revokes every pairing, so a
  paired caller normally sees `unlocked`; the first request after a lock fails
  and the caller is unpaired again. An unpaired caller never learns the lock
  state, because it receives the same refusal as for any other unpaired request.
- `read-update-state` returns `update-state` with `desktopVersion`,
  `availableVersion` (or `null`), a `phase` of `idle`, `checking`,
  `downloading`, `ready` or `unavailable`, and a `progress` between 0 and 1 or
  `null`. The phase is derived from the real update service state. The update
  service does not report download byte counts, so `progress` is `null` while
  downloading and 1 once an update is staged. No URL, tag, commit, path or feed
  detail is copied into the answer.

Both answers fit the existing 64 KiB frame and the 35-second request deadline.
Nothing is stored and no grant is issued.

## Confirm scope: focus-authenticator

The first scope of the Confirm approval mode is `focus-authenticator`. A paired
origin sends exactly `{type:'focus-authenticator', session}`. The unlocked
desktop then shows a native Material confirmation prompt, a main-owned modal
window that neither the browser nor the application renderer can answer. The
prompt names the requesting origin, the action and its exact target in the
current interface language (English, Cantonese or both). Reject is the default
button and Escape means Reject. It is handled by
`src/main/browser-confirm-mediation.js`, with the prompt text in
`src/main/browser-confirm-prompt.js`.

- After an approval the desktop brings its window forward and opens the
  authenticator view. The answer is `authenticator-focused` with
  `schemaVersion` 1 and a `state` of `shown`, `rejected`, `busy` or
  `unavailable`. It never contains a code, an account name, a secret or a path.
- At most one prompt is pending. A second request while one is pending is
  answered `busy` and is not queued.
- A locked desktop, a window that is hidden or minimized to the tray, a closing
  desktop, verification mode, or a build with no approval callback answers
  `unavailable` at once and never queues the request. Without the native
  approval callback no process can complete the scope.
- Lock, disconnect, exit and update preparation withdraw a pending prompt as
  rejected, and the request then fails because the pairing is gone. A
  rejection on its own never revokes the pairing.

## School mode scopes: read-school-mode and set-school-mode

Two scopes let a paired extension look at, and ask to change, the desktop's
school mode. The desktop owns the setting: it lives in the shared mode record
`shared-settings.json`, and the extension keeps no school mode of its own.
Both scopes are handled by `src/main/browser-school-mediation.js`.

- `read-school-mode` is a Status scope. The paired origin sends exactly
  `{type:'read-school-mode', session}` and no prompt appears. The answer is
  `school-mode` with `schemaVersion` 1, a boolean `enabled` and the mode's
  current display `name`. The name is plain text of at most 80 characters, with
  control, separator and format characters (including bidirectional overrides)
  removed, and falls back to a default when nothing readable remains. An
  unpaired caller gets the usual refusal, and an unreadable record fails the
  request instead of guessing.
- `set-school-mode` is a Re-authenticate scope. The paired origin sends exactly
  `{type:'set-school-mode', session, enabled}` with a boolean `enabled`. The
  unlocked desktop then runs a fresh native check of the person: the main-owned
  profile authentication dialog, in which the person types the existing vault
  password in the desktop. Windows Hello is not used by this build, because no
  Windows Hello integration exists in the repository. The password is checked
  in the native layer and never reaches the browser, the extension or the
  mediation module. Only after the check succeeds does the desktop write the
  setting, through the same shared record writer that the desktop's own
  Personalization screen uses, and tell the open window about it exactly as it
  does for a change made on the desktop.
- The answer is `school-mode-set` with `schemaVersion` 1, a `state` of
  `changed`, `unchanged`, `rejected`, `busy` or `unavailable`, and `enabled`,
  the desktop's current on/off state, or `null` when it could not be read. It
  contains no credential, profile data or path.
- The prompt is shared with Confirm mode: at most one is pending across both,
  and a second request is answered `busy` and is not queued. A locked desktop,
  a hidden or tray-minimized window, a closing desktop, verification mode, or a
  build with no authentication callback answers `unavailable` at once. Without
  the native callback no process can change the setting. An unanswered prompt is
  withdrawn as `rejected` after 30 seconds, before the host deadline, and lock,
  disconnect, exit and update preparation withdraw it too. A rejection never
  revokes the pairing.
- A mode that is on and protected by its own local credential can be turned off
  only on the desktop, where that credential is checked: the browser request is
  answered `rejected` and the record is left untouched. Turning a mode on, or
  turning off a mode that has no local credential recorded, needs only the
  vault password check.

## Element lock scopes: read-element-locks and set-element-lock

Two scopes let a paired extension see, and ask the desktop to change, the locks
on its own workspace tabs. The desktop owns every lock: it keeps them as the same
protected `element-lock:` records that its own element locks use, under the
identities `extension:connection`, `extension:personalization`,
`extension:changelog`, `extension:notes`, `extension:docs`, `extension:support`,
`extension:dimsum`, `extension:models` and `extension:status`. That fixed list,
one entry per options tab, lives in `src/shared/extension-lock-targets.js`; the
extension keeps an identical copy and a test compares the two. Any other target
is refused before anything else happens. The transport is
`src/main/browser-element-lock-mediation.js` and the record handling is in
`src/main/access-integration.js`.

- `read-element-locks` is a Status scope. The paired origin sends exactly
  `{type:'read-element-locks', session}` and no prompt appears. The answer is
  `element-locks` with `schemaVersion` 1 and `locked`, the list of tab ids that
  currently have a record, in the fixed order. No record contents, factor
  details or path are returned.
- `set-element-lock` is a Re-authenticate scope for locking and for unlocking.
  The paired origin sends exactly
  `{type:'set-element-lock', session, target, locked}` with a reviewed tab id
  as `target` and a boolean `locked`. The unlocked desktop then runs a fresh
  native check of the person: the main-owned profile authentication dialog, in
  which the person types the existing vault password in the desktop. Windows
  Hello is not used by this build, because no Windows Hello integration exists
  in the repository. The password never reaches the browser, the extension or
  the mediation module. Only after the check succeeds does the desktop write or
  remove the record.
- The answer is `element-lock-set` with `schemaVersion` 1, a `state` of
  `changed`, `unchanged`, `rejected`, `busy` or `unavailable`, the `target` and
  `locked`, the desktop's current state for that target or `null` when it could
  not be read. It contains no credential, record or path.
- Locking writes a single-factor password lock whose verifier is a copy of the
  local profile verifier, so the person opens it with the vault password they
  already have and no new secret is created. An existing lock is never replaced
  (`unchanged`), and locking with no usable local profile is `rejected`.
  Unlocking removes a record only while it is still a single-factor password
  lock that matches the current profile verifier. A stronger policy, a lock with
  another password, or a profile that has changed since is `rejected` and left
  untouched, so it can only be removed on the desktop. Writes use the protected
  store's revision check, so a concurrent change is `rejected` rather than
  overwritten.
- The prompt is shared with Confirm mode and school mode: at most one is pending
  across all three, and a second request is answered `busy` and is not queued. A
  locked desktop, a hidden or tray-minimized window, a closing desktop or a
  build with no authentication callback answers `unavailable` at once; without
  the native callback no process can change or remove a lock. An unanswered
  prompt is withdrawn as `rejected` after 30 seconds, before the host deadline,
  and lock, disconnect, exit and update preparation withdraw it too. A rejection
  never revokes the pairing.

The desktop's own screens do not display or enforce the `extension:` records,
because no desktop control carries those identities. The records are the
desktop's durable statement of what the extension must keep locked, and removing
one that this route cannot remove is currently a desktop-side task through the
protected record store; a desktop screen for that is not built.

## Unlock ladder scopes: read-unlock-ladder and request-unlock-step

Two scopes let a paired extension see where the desktop's local profile sits on
its unlock ladder and ask for the next step. The desktop owns the ladder, the
shared cooldown and every challenge. The transport is
`src/main/browser-unlock-ladder-mediation.js`; the desktop state is read through
`readNativeWaitingLadder` in `src/main/access-integration.js`, which asks the
existing access state machine in `src/main/access-challenges.js` for the profile
target.

What the ladder is in this build matters for reading the scopes. The ordered
levels are the desktop's escalation levels for the profile credential: every
five wrong credentials add a level, each level doubles the shared waiting
period from 30 seconds, and the period reaches its one hour cap at level 8. The
public ladder therefore has nine ids, `level-0` to `level-8`, and any higher
stored level reads as `level-8`. A correct credential clears the escalation.
The desktop's waiting challenges (the dish choice, arithmetic and mole rounds)
are answered in the desktop window by its renderer; the main process has no
entry point that runs one, and this route does not invent one.

- `read-unlock-ladder` is a Status scope. The paired origin sends exactly
  `{type:'read-unlock-ladder', session}` and no prompt appears. The answer is
  `unlock-ladder` with `schemaVersion` 1, `level` (the current level id),
  `levels` (the ordered ids), `cooldownUntil` (the end of the shared cooldown in
  epoch milliseconds, or `null` when none is running) and `recovery` (`none`,
  `available` or `required`). No credential, challenge, answer, counter of failed
  attempts or path is returned. The desktop has no recovery workflow for the
  profile credential, so `recovery` is always `none` in this build; the field
  exists so the extension can show a future state without a protocol change.
- `request-unlock-step` is a Re-authenticate scope. The paired origin sends
  exactly `{type:'request-unlock-step', session}`. The answer is `unlock-step`
  with `schemaVersion` 1, a `state` of `advanced`, `cooldown`, `complete`,
  `rejected`, `busy` or `unavailable`, the `level` the desktop reports (or
  `null`) and `cooldownUntil`.
- A running cooldown is reported and never bypassed: the answer is `cooldown`,
  no prompt is shown and the credential is not even tried until the cooldown
  ends. With no escalation there is nothing to climb and the answer is
  `complete`, again with no prompt.
- Only when the cooldown has ended and a level is still recorded does the
  unlocked desktop run a fresh native check of the person: the main-owned
  profile authentication dialog, in which the person types the existing vault
  password in the desktop. Windows Hello is not used by this build, because no
  Windows Hello integration exists in the repository. The password never reaches
  the browser, the extension or the mediation module. The desktop's own state
  machine clears the escalation when the credential is correct, and the module
  then reads the state again. `advanced` is reported only when the level read
  back is lower than before; a check that left the level unchanged is
  `rejected`, a failed read afterwards is `unavailable`, and a wrong credential
  is `rejected` with the level and cooldown the desktop now reports, which may
  include a cooldown the wrong attempt started.
- The prompt is shared with Confirm mode, school mode and element locks: at most
  one is pending across all four, and a second request is answered `busy` and is
  not queued. A locked desktop, a hidden or tray-minimized window, a closing
  desktop or a build with no authentication callback answers `unavailable` at
  once; without the native callback no process can advance the ladder. An
  unanswered prompt is withdrawn as `rejected` after 30 seconds, before the host
  deadline, and lock, disconnect, exit and update preparation withdraw it too. A
  rejection never revokes the pairing.

This route therefore does not bring the desktop's waiting challenges to the
browser and does not let the browser answer one. It never shortens a cooldown.
What it can do is let the person clear a recorded escalation, after the cooldown
has ended, by proving the vault password on the desktop, which the desktop's own
sign-in would also do.

Status of the design's scopes: `read-lock-state`, `read-update-state`,
`focus-authenticator`, `read-school-mode`, `set-school-mode`,
`read-element-locks`, `set-element-lock`, `read-unlock-ladder` and
`request-unlock-step` are implemented in the main process and the extension,
`read-profile-summary` is covered by the protected mediation, and the remaining
candidate scopes in the design are not implemented. The school mode, element
lock and unlock ladder scopes are verified with synthetic fixtures, a fake native
broker and, for the records and the ladder state, a real access state machine
with a stand-in for the native vault check. No real desktop dialog, installed
build, real browser registration or captured prompt took part, so they are
unverified end to end, including the repaint of an open desktop window after a
browser-requested school mode change, whether the desktop's lock screens ever
show the extension records, and whether the desktop's unlock screens reflect a
level cleared through this route without a reload.

## Bounds and verification

All transport frames use a four-byte little-endian length, strict UTF-8 JSON,
and a 64 KiB maximum. Empty, oversized, truncated, duplicate-field and unsafe
prototype-field input is rejected. The broker accepts at most two connected
clients and caps each connection at 256 requests. Its child startup deadline is
five seconds and a connected request has a 35-second deadline. Transport
diagnostics omit message bodies and session values.

`test/browser-native-host.test.js` verifies a freshly signed synthetic CRX3
fixture, signature tampering, receipt mismatch, path refusal, explicit consent,
unknown fields, replay and session expiry, caller allowlisting, all three lifecycle
states, correlated child framing and oversize rejection. The native executable's
`--self-test` route exercises framing rejection and a unique owned same-user pipe,
including actual ACL readback and round-trip traffic. These fixtures do not touch
a real vault, a mounted drive, browser profile, registry entry, or installation.
Installed-browser behavior and the visible three-surface presentation require
separate real installed evidence before they can be claimed verified.

The focused transport continuation passed the exact production entrypoint and
10 native synthetic checks. The JavaScript suite passed 14 tests with no skips
when supplied `MFE_BROWSER_HOST_EXE` from that build. Its compiled-host test copies
the built host into a fresh owned fixture directory, adds only a generated synthetic
configuration, launches both real relay processes hidden, verifies explicit
pairing, proposal, pending/active/completion status and replay rejection, then
closes its owned processes and removes the fixture. These are transport and
protocol results, not installed-browser or visible desktop acceptance evidence.

`test/browser-status-scopes.test.js` covers the two status scopes: response
shape, unpaired and expired refusal, unknown fields, absence of paths and URLs,
revocation on lock, and the extension background validation. It uses synthetic
fixtures only. No installed desktop, no real browser native-messaging
registration and no real update feed took part, so the end-to-end path from a
browser to a running desktop remains unverified.

`test/browser-confirm-scopes.test.js` covers the Confirm scope with synthetic
fixtures: the default Reject button and Escape, the localized prompt text, the
single pending prompt and the busy answer, refusal without queuing when the
desktop is locked, hidden or closing, cancellation on lock, disconnect and
close, a rejection that keeps the pairing, a caller without the native approval
callback, the fixed answer shape with no secret fields, and the extension
background validation. No installed desktop, no real native-messaging
registration and no captured native prompt took part. The prompt has not been
captured in the real built desktop in English and Cantonese, light and dark, so
the visual presentation is unverified, and so is the end-to-end path from a
browser to a running desktop.
