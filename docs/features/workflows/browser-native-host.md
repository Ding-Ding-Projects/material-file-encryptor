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

### Resuming a pairing after the browser stops the extension worker

The browser stops an idle extension service worker after about 30 seconds, which closes its native port. A pairing is not tied to that one port. When a port closes, the broker withdraws everything bound to it (pending prompts, protected grants, conversions and workflow authority) but keeps the pairing session itself, detached and unusable, until its original 15-minute expiry.

The extension keeps the session value only in `chrome.storage.session`: browser memory, cleared when the browser closes, never synced, and never written to disk or to `chrome.storage.local`. A new worker presents it on a new port with exactly `{type:"resume",session}`. The broker answers `{type:"resumed",expiresInSeconds}` only when all of these hold: the desktop is unlocked, the caller is the single allowed extension origin on a live native connection, the session is the exact unexpired value the receiver issued for that origin (compared in constant time), and it has not been revoked. Anything else gets the generic not-accepted error, and a refusal never spends or revokes the genuine session. A successful resume shows no desktop prompt, never extends the original expiry, and replaces any earlier port for the same origin, so late messages from the stale port are refused.

An explicit Disconnect in the extension sends exactly `{type:"unpair",session}` on the live port, which ends the session at once. Desktop lock, a desktop Disconnect, update preparation and exit still call `revoke()`, which discards the session entirely, so a later resume is refused and the extension reports that pairing expired. The extension shows one of four states: paired, reconnecting (the desktop cannot be reached right now: open and unlock it, and if it was closed or locked since you paired, pair again), pairing expired (the desktop no longer knows the pairing: pair again) or not paired. Reconnecting is shown only while the desktop is unreachable, and it never promises a recovery that the desktop will not honor, because exit and lock still revoke the pairing. Approving a new pairing on the desktop must still happen within 35 seconds.

The extension learns about a revocation in three ways, all of which end in pairing expired. First, a refused `resume` removes the stored value and records a secret-free `pairing-expired` marker in `chrome.storage.session`, so the state survives a worker restart instead of falling back to not paired; the marker is cleared when the person pairs again or disconnects. Second, when the desktop refuses a request that carried the session, for example after a lock, the extension asks once with `resume`: a refused `resume` means the desktop revoked the pairing and the extension clears it at once, while an accepted one leaves the pairing alone. Third, the options page and the popup send `{type:"verify-pairing"}` to the worker about every four seconds while visible (every ten seconds while not paired), and the worker answers by sending `resume` for the held session, so a lock, an exit or an update shows within a few seconds without pressing Refresh.

Requests from the worker to the desktop run one at a time with a bounded wait of 45 seconds and a limit of 16 waiting requests. Callers that arrive while one is in flight, such as the first Refresh after the worker idled, wait for the single resume and then proceed instead of failing as busy.

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

## Installation-time registration

The unpacked companion extension has a stable, reviewed identity. Its manifest
carries a `key` property holding the base64 DER public key, so the browser
derives the same extension id on every machine:
`hfabajdjnmccemhokjnipmaabdpljbbg`. The key and id are recorded in
`browser-extension/reviewed-identity.json`; the matching private key was
discarded because an unpacked extension does not need it. Staging in
`scripts/build-browser-extension.mjs` fails when the manifest `key` and that file
disagree, and it keeps the `key` in the staged manifest.

`scripts/write-browser-host-config.mjs` runs as part of the host publish step and
writes `browser-host-config.json` next to the host executable from that identity.
Because there is no packaged CRX3 for an unpacked extension, its `packageSha256`
field holds the literal `unpacked`.

The Squirrel hooks in `src/main/browser-host-squirrel.js` call
`src/main/browser-host-registration.js`. On `--squirrel-install` and
`--squirrel-updated` the app writes the host manifest (name, description, path to
the installed host executable, `stdio`, and the single allowed origin) into the
`native-messaging` folder of the per-user data directory. It then sets the default
value of two per-user keys with `reg.exe` and argument arrays:
`HKCU\Software\Microsoft\Edge\NativeMessagingHosts\org.dingding.material_file_encryptor.downloads` and
`HKCU\Software\Google\Chrome\NativeMessagingHosts\org.dingding.material_file_encryptor.downloads`.
Registration refuses a host executable outside the installation root and needs no
administrator rights. On `--squirrel-uninstall` exactly those two keys and the
manifest are removed. On `--squirrel-obsolete` the removal happens only when the
manifest still points into the obsolete installation, so an update never erases
the registration written by the new version. A failed hook is reported in its
result and never fails the installer.

The hooks run from `src/main/squirrel-hook-entry.js`, which is the first import of
the main module, so the registration happens before any other start-up work.
`src/main/squirrel-lifecycle.js` does only the registrations and the shortcut
change, then exits. Each `reg.exe` call is bounded to 5 seconds and a watchdog ends
the process after 6 seconds, so the hook stays inside the installer's time budget
even on a cold first start; an earlier arrangement could pass that budget and left
the manifest naming the removed version's host. The shortcut helper is started with
its output discarded and no longer holds the exit. As a second line of defence,
every normal start of the installed application calls `repairNativeHostRegistration`
in `src/main/browser-host-registration.js`. It compares the registered manifest with
this installation's host and allowed origin, leaves a matching one alone, and
otherwise rewrites it through the same checked registration.

To pair, open the browser extensions page, enable developer mode, choose load
unpacked, and select the `browser-extension` folder shipped in the installed
application resources. The id shown must equal the reviewed id above.

Verification status: unit tests with a fake registry runner cover the argument
arrays, key paths, uninstall removal, the install-root refusal, the id derivation
and the staged key. Installed pairing has not yet been exercised end to end; no
real Squirrel install, browser registry read-back or paired download took part.

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

### Status client scope: enroll-status-client

A third status-mode scope, `enroll-status-client`, lets the paired extension enroll as an independent status client. It follows the same rules as the two read scopes: a valid live pairing from the same native connection, no desktop prompt and no grant. The request is exactly `type`, `session` and `report`. The report has exactly `version`, `connection` (always `paired`), `lastRefresh` (a UTC time cut to the minute, or `null`) and four counts from 0 to 9999: `notes`, `schedules`, `tickets` and `operations`. Any other field, type or range is refused before anything runs, so no content, name, link or path can ride along.

The mediator hands a frozen copy of the report to the injected `enrollStatusClient` function and answers `status-client` with `state` set to `enrolled`, `pending` or `unavailable`. With no such function, or when it throws or answers anything else, the answer is `unavailable`. The shipped desktop injects `enrollStatusClient` from `src/main/browser-status-enrollment.js`, which creates one independent status-hub client (its own session, no exit hook) through the existing `createStatusHubClient` and updates it with a one-line summary built only from the bounded report fields. It answers `enrolled` when the hub client is configured and not degraded (the hub needs its ingest token) and `unavailable` otherwise. Enrollment against a live hub is unverified; the tests use a fake client.

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

## Confirm scope: publish-progress

The second scope of the Confirm approval mode is `publish-progress`. A paired
origin sends exactly `{type:'publish-progress', session, request}`, where
`request` has exactly the keys `destination` (`discussion-comment`,
`project-item-status` or `publication-draft`), `note`, `links` and
`projectStatus`. The extension sanitizes the note before sending, and the
desktop validates the request again in `src/shared/publication-request.js`
(a copy of the extension's `browser-extension/publishing.js`; a test compares
the two). A note of 1 to 2000 characters that the sanitizer would still change,
more than five links, a link that is not an https address with a public host,
no credentials and no secret-like query, or a status that does not match the
destination is refused as an error before any prompt appears. It is handled by
`src/main/browser-publish-mediation.js` and shares the single prompt gate with
the other Confirm scopes.

- The native prompt (`src/main/browser-confirm-prompt.js`) names the origin, the
  destination, the item status when relevant, the sanitized note (shortened to
  600 characters for display) and every link, in the current interface language.
  Reject is the default button and Escape means Reject.
- The answer is `publish-progress-result` with `schemaVersion` 1 and a
  `state` of `approved`, `rejected`, `busy` or `unavailable`. It never
  contains the note, a link, an account name, a secret or a path.
  `approved` means the desktop's publishing route returned exactly `true`
  after the person approved; any other route result, an error or a missing
  route is `unavailable`.
- The desktop wires `publishProgress` in `src/main/main.js` through
  `src/main/feature-services.js` to `src/main/browser-publish-adapter.js`. After
  the native prompt is approved, the adapter sends fixed GraphQL documents
  through `postNote` in `src/main/forge-workflow.js`, which uses the desktop's
  active signed-in forge account (protected product account or CLI keyring
  account) with the pinned bundled `gh`. The note and links travel as separate
  arguments, never inside the query text, and the credential exists only in the
  child process environment. A discussion comment is posted to the discussion
  titled "Browser extension progress" in this project's repository; if that
  discussion does not exist nothing is created. Project item status and
  publication draft need a configured project target (project id, item, status
  field and option ids); none is shipped, so those two destinations answer
  `unavailable` without a network call.
- With no connected account, a missing target or capability, a transport error
  or an aborted prompt, the adapter returns `false` and the answer is
  `unavailable`; it is never `approved`. The response is still only the fixed
  state word: the created item's link is deliberately not returned. Nothing logs
  the note. Live publication to a real forge account is unverified; the tests use
  a fake process runner and fake transports.
- At most one prompt is pending. A second request is answered `busy` and is not
  queued. A locked desktop, a hidden window or a closing desktop answers
  `unavailable` at once. Lock, disconnect, exit, update preparation and the
  30-second deadline withdraw a pending prompt as rejected, and an approval that
  arrives after the withdrawal is not an approval.
- The extension page treats a missing, malformed or late answer as expired and
  shows it in plain words. Nothing is published in that case.

This scope is verified with synthetic fixtures, a fake native process and a
stubbed publishing route only. No installed desktop, real forge, live project or
captured native prompt took part, so it is unverified end to end.

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

## Server manager scopes: read-servers, read-server-catalog and manage-server

Three scopes let a paired extension show, and ask the desktop to change, the
Minecraft servers that the desktop server manager owns. The extension never runs
a server and never holds a target credential. SSH keys, SSH passwords, container
sockets and addresses stay in the desktop, and a request can only name one of
four fixed target ids: `local-process`, `local-container`, `ssh-process` and
`ssh-container`. The transport is `src/main/browser-server-mediation.js` and the
mapping onto the desktop manager is `src/main/browser-server-adapters.js`.

- `read-servers` is a Status scope. The paired origin sends exactly
  `{type:'read-servers', session}` and no prompt appears. The answer is
  `servers` with `schemaVersion` 1, `manager` (`available` or `unavailable`),
  `targets` (the four ids in fixed order, each with a boolean `available`) and
  at most 100 `servers`. A server has exactly `id`, `name`, `target`, `flavor`,
  `version` and `state`, and the state is one of `preparing`, `prepared`,
  `starting`, `running`, `stopping`, `stopped`, `failed` or `unavailable`. No path,
  address, port, log line or credential is returned. A desktop build with no
  server manager answers `unavailable` with no servers.
- `read-server-catalog` is a Status scope. The paired origin sends exactly
  `{type:'read-server-catalog', session, cursor}`, where `cursor` is `null` or a
  string of up to five digits. The answer is `server-catalog` with `catalogue`
  (`ready`, `not-loaded` or `unavailable`), `flavors` (an id, a display name and
  the target ids it supports), `versions` (at most 100 per page, each an id and
  a channel of `release`, `snapshot`, `old_beta` or `old_alpha`), `total` and `next`,
  the cursor for the following page or `null`. Only flavors the desktop can
  really prepare are listed: Vanilla, Paper, Purpur, Fabric, Forge and NeoForge,
  each with the targets a browser may create, which are `local-process` and
  `local-container`. The
  extension cannot make the desktop download a catalogue, so a desktop that has
  not loaded one answers `not-loaded` and the extension says so.
- `manage-server` is a Re-authenticate scope. The paired origin sends exactly
  `{type:'manage-server', session, action, server, options}`. The `action` is
  `create`, `start`, `stop`, `restart`, `change-setting` or `install-plugin`. For
  `create`, `server` is `null` and `options` has exactly `target`, `flavor` and
  `version`. For `start`, `stop` and `restart`, `server` is a server id and `options`
  is `null`. For `change-setting`, `options` has exactly `key` and `value`, where the
  value is a boolean, a whole number or a short text without control characters.
  For `install-plugin`, `options` has exactly `plugin`, an identifier that is never
  a URL, a path or a file. A request with any other field, including a host, a
  key, a password or a path, is refused before anything else happens.
- The unlocked desktop then runs a fresh native check of the person: the
  main-owned profile authentication dialog, in which the person types the
  existing vault password in the desktop. Windows Hello is not used by this
  build. The password never reaches the browser, the extension or the mediation
  module. Only after the check succeeds does the desktop manager act.
- The answer is `server-managed` with `schemaVersion` 1, a `state` of `changed`,
  `unchanged`, `rejected`, `busy` or `unavailable`, the `action` and the `server` id,
  which for `create` is the id of the new server and otherwise echoes the request.
  `changed` means the desktop accepted the request, not that a server is now
  running; the extension reads the servers again for the real state.
- What the desktop manager does today: `create` for any flavor on `local-process`
  or `local-container` asks the managed-server service to prepare the server, but
  only when that target reports itself available. The request carries no host,
  key or path, so an SSH server cannot be created from a browser. `start`, `stop`
  and `restart` act on verified-download servers and on managed servers on any of
  the four targets; `start` needs the exact server license accepted in the desktop
  and is answered `rejected` until it is. `change-setting` edits one key of a
  managed server's `server.properties` through the desktop's typed schema, and
  `install-plugin` installs a Modrinth project whose published SHA-512 matches the
  received file, only while the server is stopped. A refused key, value, release
  or digest is answered `rejected`. Servers prepared by the older verified-download
  flow have no settings or plugin surface and are answered `unavailable`. A target
  that cannot run, a failing or malformed desktop answer and an unsupported action
  are answered `unavailable`; an unsupported action is answered without a prompt,
  so nobody is asked to approve something that cannot happen.
- The prompt is shared with Confirm mode, school mode, element locks and the
  unlock ladder: at most one is pending across all of them, and a second request
  is answered `busy` and is not queued. A locked desktop, a hidden or
  tray-minimized window, a closing desktop or a build with no authentication
  callback answers `unavailable` at once. An unanswered prompt is withdrawn as
  `rejected` after 30 seconds, and lock, disconnect, exit and update preparation
  withdraw it too. A rejection never revokes the pairing.

Status of the design's scopes: `read-lock-state`, `read-update-state`,
`focus-authenticator`, `publish-progress`, `read-school-mode`, `set-school-mode`,
`read-element-locks`, `set-element-lock`, `read-unlock-ladder` and
`request-unlock-step` are implemented in the main process and the extension, as are
`read-servers`, `read-server-catalog` and `manage-server`,
`read-profile-summary` is covered by the protected mediation, and the remaining
candidate scopes in the design are not implemented. The school mode, element
lock, unlock ladder and server manager scopes are verified with synthetic fixtures, a fake native
broker and, for the records and the ladder state, a real access state machine
with a stand-in for the native vault check. No real desktop dialog, installed
build, real browser registration or captured prompt took part, so they are
unverified end to end, including the repaint of an open desktop window after a
browser-requested school mode change, whether the desktop's lock screens ever
show the extension records, and whether the desktop's unlock screens reflect a
level cleared through this route without a reload.

## Pairing code: begin-qr-pairing

The maintainer retargeted `begin-qr-pairing` on October 14, 2026 from pairing a
phone to pairing the browser by QR. It adds an optional proof to the existing
`pair` message. It does not replace the native approval prompt, which stays
mandatory for every pairing.

- **Showing a code.** The unlocked desktop has a **Pair a browser** tab with a
  **Show pairing code** button. The main process issues the code and the tab
  shows it as text and as a QR image drawn with the existing QR encoder. The QR
  holds exactly the code, with no address and nothing else. **Hide pairing code**,
  the two-minute expiry and closing the tab clear it.
- **The code.** It has 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (no `0`, `O`, `1`, `I` or `L`), drawn with `crypto.randomInt`. It is valid for
  2 minutes and single use. Only one code is active: showing a new one replaces
  the old one. The desktop refuses to issue a code while it is locked, closing or
  preparing an update, and when the native receiver is not running. Lock, exit,
  update preparation and closing the receiver clear it. It lives only in memory
  and is never logged, notified, stored or put in a response.
- **Using a code.** The extension may send `{type:"pair",code}` instead of
  `{type:"pair"}`. Any other extra field is refused as before. A supplied code is
  compared in constant time with the single active code before any prompt. A
  wrong, expired, used or unissued code is refused without a prompt. Five wrong
  codes in a row clear the active code. A pair message with no `code` follows the
  unchanged flow.
- **Approval.** With a matching code the prompt still appears, still defaults to
  Reject and now also says that the extension entered the code shown on this
  desktop. A rejection leaves the code unspent until it expires. Approval spends
  it. If the code changed while the prompt was open, pairing is refused.
- **Identity.** After pairing, the extension reads the desktop version through
  the existing `read-update-state` scope and shows it beside "Paired with this
  desktop". No identity material is invented: the version is a label, not proof.

`test/browser-pairing-code.test.js` covers the alphabet, the cryptographic
source, expiry, replacement, single use, the five-wrong reset, the refusal paths
that never reach a prompt, approval still being required, consumption after
approval, clearing on lock and close, and responses that never carry the code.
`test/browser-pairing-view.test.js` checks the desktop tab with a stub document
and decodes the QR to prove its payload is exactly the code. These use synthetic
fixtures. No installed desktop took part, no real native-messaging registration
was used, and no real camera scanned a real QR, so the end-to-end path is
unverified.

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

`test/browser-server-scopes.test.js` covers the server manager scopes with synthetic
fixtures: the fixed target, action, state and channel lists in the desktop, the
page and the background, strict request and answer shapes, the refusal of any
host, key, password, path or URL field, the fresh native check before every
change, the shared single prompt and the busy answer, refusal without a prompt
for actions the desktop manager lacks, withdrawal on lock, disconnect and close,
the adapters over a fake desktop manager, the native broker framing, the
background validation, and the page's filters, create dialog and localization.
No real desktop server manager, real server, container, SSH host, installed
desktop or captured prompt took part, so the whole path from a browser to a
running server is unverified.

`test/server-managed-adapters.test.js` covers the adapters over the managed-server
service with fake processes, Docker, SSH and network: create, the license gate,
start, stop, restart, setting changes, Modrinth plugin installs, and the
`unavailable`, `rejected` and `busy` answers for a target that cannot run, an SSH
create and an unaccepted license. No real server, container or SSH host took part.

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
