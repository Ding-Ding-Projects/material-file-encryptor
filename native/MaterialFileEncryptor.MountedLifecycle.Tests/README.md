# Disposable mounted-drive lifecycle checks

The runner accepts a built package root, private output JSON path, full source commit and expected native-helper SHA-256 from the actual production receipt. It verifies helper bytes before fixture creation and again immediately before launch. A mismatched or malformed expected hash prevents helper launch. It mounts only a newly created synthetic vault through the packaged native helper. No GUI is launched.

```text
dotnet run --project native/MaterialFileEncryptor.MountedLifecycle.Tests -- <package-root> <private-output.json> <40-character-source-commit> <64-character-helper-sha256-from-production-receipt> [--ordinary-only]
```

The caller must obtain both source identity and expected helper hash from the same source-bound production receipt. Computing a new expected hash from an arbitrary candidate immediately before invoking this runner does not establish production provenance. No tracked automation caller exists at this revision; this README defines the invocation contract.

Force lock must remain busy while an idle handle or mapped descriptor remains retained. The mapped writer runs in a separate child process so a fatal native exception cannot erase the parent receipt. The parent requests writer stop, waits for child exit and view disposal, then detaches and authenticates again to verify exact mapped bytes. Child failure, missing readiness, unexpected successful detach, or changed reopened bytes prevents success. Parent timeouts preserve fixture identity for independent teardown.

Use `--ordinary-only` to omit the concurrent mapped writer. Ordinary operations still include editor replacement, open-handle rename, mapped persistence, explicit deletion, delete-on-close and native copy interruption. Historical successful forced detach with idle handles does not establish the revised conservative contract.

Run adversarial native checks only against a reviewed repair and freshly source-bound package, with this disposable fixture. No user vault is permitted.

Writer signaling errors never skip the join attempt. Normal joins wait at most 15 seconds, followed by an owned termination attempt and a 5-second final join. An unknown writer exit retains the helper and fixture without attempting detach. Helper shutdown uses the same bounded sequence and bounds its output-reader join separately. Force-lock responses and the original workload exception are saved in a progress receipt before teardown; teardown exceptions cannot skip the final report attempt. Child identity, exit establishment, join errors and termination state remain in that report.

`--teardown-self-test` runs deterministic injected signal, join, termination, diagnostic-drain and helper-admission failures without starting a native helper or mounting a drive. It checks that signal failure still joins, an unobservable exit remains unknown within bounded waits, the original signal failure survives a successful post-termination join, output retention remains bounded, and changed helper bytes are rejected.

Child stdout and stderr are independently drained while retaining at most 16,384 characters each. Each stream records observed character count, truncation, read failure and a bounded five-second drain timeout. Numeric and unsigned hexadecimal child exit codes accompany its process identity. These diagnostic receipts are private: native exception text can contain machine paths. Never publish raw child output without separate review. A drain timeout or read failure prevents success.

Historical diagnostic source `1944cc9828b5405e2145ce3af70c290fb6b40945` is retained by `origin/codex/parallel-storage-lifecycle`. It is not an ancestor of this lane at this revision; integration must preserve that history separately. Its wider 4 MiB write-region scenario is excluded from this retained-descriptor regression. The current child repeatedly writes a deterministic 65,536-byte region, sufficient to retain the mapped descriptor and verify authenticated reopened bytes. The historical unsafe detach behavior and unbounded waits have not been restored.
