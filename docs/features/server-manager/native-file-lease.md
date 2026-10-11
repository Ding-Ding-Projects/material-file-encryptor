# Native server file lease primitive

`ServerFileLease.Acquire` accepts a trusted session-owned server root, its admitted server JAR SHA-256, and a separately approved runtime root, executable path and SHA-256. It does not discover or adopt existing servers, approve runtimes, or expose a renderer-controlled file API.

On Windows, the primitive pins every directory ancestor with native handles that deny delete sharing. It rejects reparse points, unexpected final handle paths, non-regular files and multiply linked files. It opens the exact JAR and executable with read sharing alone, then hashes those held files and retains protected duplicate handles. Existing writers prevent admission; new write, rename and delete attempts are blocked while the lease remains held. These sharing guarantees do not claim protection from a pre-existing writable memory mapping.

`AssertHeld` checks the retained native handles. `Release` is explicit and idempotent. The lifecycle owner must retain the object on unknown process ownership, timeout or uncertain IPC outcome, and release only after proven pre-spawn failure or exact owned-process exit. Partial acquisition closes only this attempt's handles and does not remove or overwrite files. Process termination inherently closes its OS handles, so this primitive alone is not crash-surviving supervision.

The native primitive is not yet wired into `LocalProcessServerAdapter` or host IPC. Trusted ownership registration, runtime approval, request identity, timeout recovery and lifecycle retention across IPC remain pending. The adapter's default lease service remains unavailable.

The root build compiles `MaterialFileEncryptor.ServerLease.Verifier` without running it. Its output is uploaded separately and excluded from application packages and ASAR contents. A reviewer runs the compiled DLL through the verified existing .NET host with `--fixture-root` and a new, explicit synthetic directory. The verifier retains its files and `receipt.json`, covering handle sharing, ancestor replacement, unknown ownership retention, explicit release, partial acquisition, existing writers, runtime containment and a real Windows junction. Compilation, downloaded-DLL identity and actual verifier execution have separate verdicts. No live Java server, full manager or GUI acceptance is established by this unit.

The compiled verifier also creates a writable mapping, closes its original file handle, and attempts admission and mutation. Its receipt distinguishes admission rejection from an observed mapped mutation despite a held sharing lease; neither outcome silently becomes an immutable-byte guarantee.

## First execution and child-free fixtures

Delivery is framework-dependent (`--self-contained false`), matching the existing mounted verifier. The build receipt binds the verifier DLL SHA-256. Before the first execution, independently verify the downloaded source receipt and DLL against the intended cloud run, then invoke `MaterialFileEncryptor.ServerLease.Verifier.dll` through the already verified existing .NET host. This is the initial route, not a response to an execution denial. No new executable has been attempted. The optional Node consumer accepts `SERVER_FILE_LEASE_DOTNET` and `SERVER_FILE_LEASE_VERIFIER_DLL`, verifies the delivered DLL binding before launch, and compares the resulting DLL and host digests.

The junction fixture now constructs a native mount-point reparse buffer directly in its new synthetic directory. It starts no shell or child process. An interrupted verifier run remains unverified; its retained fixture must be inspected before reuse. Neither interruption nor missing receipts establishes release, successful checks, or server acceptance.
