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
