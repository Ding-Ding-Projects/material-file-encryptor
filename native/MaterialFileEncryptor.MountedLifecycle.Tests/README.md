# Disposable mounted-drive lifecycle checks

The runner accepts a built package root, private output JSON path and full source commit. It mounts only a newly created synthetic vault through the packaged native helper. No GUI is launched.

Force lock must remain busy while an idle handle or mapped descriptor remains retained. The mapped writer runs in a separate child process so a fatal native exception cannot erase the parent receipt. The parent requests writer stop, waits for child exit and view disposal, then detaches and authenticates again to verify exact mapped bytes. Child failure, missing readiness, unexpected successful detach, or changed reopened bytes prevents success. Parent timeouts preserve fixture identity for independent teardown.

Use `--ordinary-only` to omit the concurrent mapped writer. Ordinary operations still include editor replacement, open-handle rename, mapped persistence, explicit deletion, delete-on-close and native copy interruption. Historical successful forced detach with idle handles does not establish the revised conservative contract.

Run adversarial native checks only against a reviewed repair and freshly source-bound package, with this disposable fixture. No user vault is permitted.

Writer signaling errors never skip the join attempt. Normal joins wait at most 15 seconds, followed by an owned termination attempt and a 5-second final join. An unknown writer exit retains the helper and fixture without attempting detach. Helper shutdown uses the same bounded sequence and bounds its output-reader join separately. Force-lock responses and the original workload exception are saved in a progress receipt before teardown; teardown exceptions cannot skip the final report attempt. Child identity, exit establishment, join errors and termination state remain in that report.

`--teardown-self-test` runs deterministic injected signal, join and termination failures without starting a native helper or mounting a drive. It checks that signal failure still joins, an unobservable exit remains unknown within bounded waits, and the original signal failure survives a successful post-termination join.
