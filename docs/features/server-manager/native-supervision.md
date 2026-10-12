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

Runtime discovery now considers only a [reviewed owned portable runtime](preparation.md#reviewed-portable-java-runtime). It excludes PATH, JAVA_HOME, renderer-selected executables and unreviewed local installations. The native host embeds the pinned complete runtime inventory and independently verifies the archive, every member and the release-file major before registration. Java 21 on Windows x64 is the initial supported acquisition combination; other majors and architectures remain unavailable. This prepares owned files without global installation, Java execution or automatic server license acceptance. Installed-runtime discovery remains unfinished.

Verification and test modes deliberately disable the production native callback.
Synthetic tests verify the protected main-process wiring, identifier validation,
exact license confirmation, cancellation, registration identity and unavailable
configuration state. These tests do not prove native compilation, lease IPC,
child launch, actual configuration consumption, readiness, or graceful runtime
shutdown. Those need candidate-bound native and real-runtime evidence before
local-process support can be declared operational.

## Complete runtime member lifetime

The native execution owner now acquires verification and retention together. Every pinned runtime file and its directory ancestors remain held alongside the server distribution. Partial acquisition releases acquired handles. A proven failure before process creation releases them. Once process creation returns a child, an identity observation error retains that exact child and the complete member leases. Graceful-stop timeout also retains them. Release requires exit observation through the retained child process handle, never adoption of a matching PID.

The dedicated verifier adds fresh synthetic files and a managed .NET child. Its eight checks cover partial acquisition, no-launch release, process-creation failure, live DLL and legal-member mutation rejection, timeout retention, exact-exit release, uncertain post-spawn retention and uncertain exact-exit release. The negative mode deliberately releases runtime protection and must fail on the DLL write. Java and server files are never executed by this verifier. Candidate-bound compilation and execution of these new modes are pending; source assertions do not supply that evidence.

This bounded change protects inventoried members for the child lifetime. It does not close the existing writable-mapping limitation or prevent adding new directory contents. Complete loading-tree isolation and exact-version configuration proof remain separate admission requirements. Configuration admission remains false, and actual Java/server start remains unavailable.

After the root build, run the built server lease verifier through its verified .NET host with either --lifetime-fixture-root or --lifetime-negative-fixture-root and a fresh absolute fixture directory. The first mode must return 0 with eight passed checks; the negative mode must return 1 with the full-tree DLL writer rejection assertion. Retain source and binary identities with both receipts. Neither command constitutes runtime or server acceptance.
