# Disposable mounted-drive lifecycle checks

This verification runner accepts an already built package root, a private output JSON path, and the exact source commit. It uses the packaged native helper over redirected JSON input/output, selects a currently unused drive letter, and mounts only a newly created synthetic vault. No graphical interface is launched.

It checks idle-open-handle force lock, managed batch cancellation while retaining completed files and the original destination, and force-lock rejection during mapped I/O. The mapped-I/O result is verified only when the native response explicitly reports a nonzero active filesystem-I/O counter. A concurrent busy result without that counter is reported as unverified, not inferred.

The private fixture manifest retains exact paths. The public-compatible result contains hashes, test verdicts and teardown facts without machine paths. All mapped views are released before final detachment. Fixture cleanup runs only after the owned mount is absent.

Pass `--ordinary-only` as the fourth argument to check editor temporary-save replacement, rename while an existing handle remains open, mapped-write persistence, immediate unlock while an old detached handle remains open, explicit deletion, delete-on-close, and native copy interruption. A normal close retains written bytes because it carries no cancellation intent. Native `CopyFileEx` cancellation removes its incomplete destination. The stop callback is compared with a disposable normal-volume reference rather than assuming its destination-retention behavior.

The default concurrent mapped-write/force-lock probe is adversarial. If force lock succeeds between filesystem callbacks, an already mapped writer can receive a fatal native memory exception when it next accesses the detached mapping. Run this probe in its own disposable process and retain its fixture manifest for independent teardown verification. A prior busy response with a nonzero active-I/O counter proves only the overlap observed in that response; it does not prove that later mapping access after a successful forced detach is safe.
