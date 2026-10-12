# Protected local server supervision

The desktop main process composes preparation with the existing private native
host pipe. Browser callers cannot invoke this feature. Renderer requests carry
only a session-owned server identifier; they cannot select an executable, root,
URL, port, command, provider, digest, or a license-consent boolean.

License acceptance opens a native confirmation dialog identifying the exact
prepared server version and distribution SHA-256. Cancel leaves `eula=false`.
Acceptance persists only after that dialog confirms the version-bound license
contract. Acceptance does not start the server.

The native host registers verified server bytes beneath its initialized session
root. Native lifecycle operations serialize admission, registration, status,
start, graceful stop and close. The same native process owns both the Java child
and its deny-write/delete file leases. A graceful stop checks exact creation time
and executable identity, writes `stop`, then waits for at most ten seconds. A
timeout retains supervision and leases; another bounded observation is allowed.
No force termination is attempted. Parent-pipe EOF requests graceful shutdown and
retains the native host while shutdown remains unverified.

## Current admission limits

Actual server start is unavailable. The required exact-version generated network
configuration proof has not been retained, so native configuration admission
always fails closed. No loopback property schema, management setting, readiness,
or historical version compatibility is inferred from the catalogue.

Runtime discovery considers only a reviewed bundled `server-runtime` inventory.
It excludes PATH, JAVA_HOME, renderer-selected executables, and unreviewed local
installations. The inventory must bind Java major version, executable SHA-256 and
the release-file SHA-256. No reviewed runtime inventory is currently bundled.
This implementation performs no runtime installation or automatic license
acceptance. Installed-runtime discovery and trusted package acquisition remain
unfinished work.

Verification and test modes deliberately disable the production native callback.
Synthetic tests verify the protected main-process wiring, identifier validation,
exact license confirmation, cancellation, registration identity and unavailable
configuration state. These tests do not prove native compilation, lease IPC,
child launch, actual configuration consumption, readiness, or graceful runtime
shutdown. Those need candidate-bound native and real-runtime evidence before
local-process support can be declared operational.
