# Disposable mounted-drive lifecycle checks

This verification runner accepts an already built package root, a private output JSON path, and the exact source commit. It uses the packaged native helper over redirected JSON input/output, selects a currently unused drive letter, and mounts only a newly created synthetic vault. No graphical interface is launched.

It checks idle-open-handle force lock, managed batch cancellation while retaining completed files and the original destination, and force-lock rejection during mapped I/O. The mapped-I/O result is verified only when the native response explicitly reports a nonzero active filesystem-I/O counter. A concurrent busy result without that counter is reported as unverified, not inferred.

The private fixture manifest retains exact paths. The public-compatible result contains hashes, test verdicts and teardown facts without machine paths. All mapped views are released before final detachment. Fixture cleanup runs only after the owned mount is absent.
