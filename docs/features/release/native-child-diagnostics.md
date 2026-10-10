# Synthetic direct-child timing diagnostics

The optional `NativeChildTrace` sink at `VaultProcessRunner.RunAsync()` is disabled by default. No production host or graphical workflow activates it. The native core test executable accepts `--native-child-trace <private-output-file>` to run one synthetic operation, writing a new receipt without overwriting an existing file.

The trace retains the runner's already-owned direct-child handle through final observation. It records fixed synthetic categories, sequence and host/child identity, exact native creation and exit FILETIME decimal strings, zero-time wait and exit results, native error codes, UTC observation intervals and monotonic intervals. It never records arguments, executable names or paths, working directories, environment, credentials, output or arbitrary exception messages.

The in-memory operation is bounded to 60 seconds, 128 children and 64 KiB. Missing observations, active children, deadline expiry, count/byte overflow and sink faults explicitly mark the receipt incomplete. Diagnostics do not change the runner's ordinary output, cancellation, process teardown or return value. They do not authorize ownership or replace any required CIM identity.

The dedicated mode checks real short-lived and held children, retained-handle exit times, cancellation, released process objects, identity mismatch, sink faults, overflow and exact schema privacy. Its trace must be retained in ignored private evidence with a source binding and SHA-256. Build through `build.bat /s` before running the source-bound mode. Verification results are recorded separately in the handoff.

This diagnostic covers direct children only. It cannot establish the identity or lifecycle of grandchildren, reconstruct historical observations, prove a historical graphical failure cause, or supply installed-package acceptance. No global tracing, subscription, elevation or automatic production activation is involved. Installer production is separate and is not needed to exercise this test-only mode.
