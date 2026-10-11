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

## Final detach settlement

After every workload descriptor and mapped writer has released normally, final detach has a monotonic 60-second settlement deadline. The former ten 100 ms retries could finish within one native background tick while synchronization was still flushing or recording history. Sixty seconds is a bounded verification allowance, not a native service-level guarantee: persistent activity at that deadline remains incomplete acceptance.

Each iteration records a timestamped read-only `status` response followed by the native `forceLock` response. The native admission boundary still decides whether detach is safe. A busy response waits 500 ms before the next iteration; calls receive at most 20 seconds, capped by the remaining settlement budget. The overall await is also capped by the remaining deadline. No handle check, admission condition, background operation or descriptor-held test is disabled. The same settlement policy runs again after authenticated reopen and byte verification.

Every observation includes method, start/end UTC, monotonic elapsed milliseconds, exact response or diagnostic. Each is persisted to the progress receipt before continuing. Terminal outcomes are `detached`, `deadline-exceeded`, `protocol-timeout`, `protocol-error`, and `invalid-response`. Only an explicit `locked:true,busy:false` response received before the deadline establishes detach. A timeout stops the sequence because an in-flight response has unknown outcome; it does not trigger another detach request. A missing or contradictory response cannot pass. Original workload and teardown errors remain separately recorded by the existing runner.

Use a fresh output path for every run. Existing final, progress or fixture receipts are rejected before fixture creation, preserving earlier failed evidence. The prior source-bound `11268c2` receipt remains historical incomplete acceptance; this change does not reinterpret it as success.

`--settlement-self-test` injects delayed synchronization, persistent busy, malformed replies, protocol timeout and protocol failure. It verifies bounded remaining-call budgets, timestamps and retention of every status/busy response without launching a helper or mounting a drive. A passing self-test proves policy behavior only. A new source-bound real mounted run and authenticated reopen remain required after independent review.

## Unknown protocol outcomes retain the caller too

A response timeout does not cancel the native operation. The caller carries unknown settlement, protocol and writer outcomes into its outer teardown executor. That executor sends no further detach request and performs no helper stop or fixture deletion when outcome is unknown. It checks again after a teardown request, so a timeout during teardown also prevents a subsequent stop. The protocol adapter independently rejects further calls after an uncertain request.

The incomplete final receipt records runner PID, creation time and executable; helper PID, creation time and executable; fixture identity; the last confirmed mount state; and the retention/recovery disposition. An unknown mount outcome is not established by a drive-directory observation. The runner remains alive holding the original redirected pipes: simply returning would close stdin and could implicitly stop the helper. Retention is not successful teardown or acceptance.

The retained caller observes the already-issued original response task and actual exit of its owned helper. A late response is saved without upgrading acceptance or issuing another operation. Active observation is limited to one hour. At that limit a separate hold receipt records `observation-limit-retained`; the runner then passively retains its pipes while awaiting actual owned-helper exit and separately reviewed recovery. It never forces EOF, detach, stop or deletion at that limit. Only observed owned-helper exit releases this hold. Receipt-write failure is reported and cannot turn the retained path into implicit EOF.

Hold receipts are separate from the original incomplete report and include timestamps and exact runner/helper identities. Recovery must be independently reviewed for those identities, and must preserve the synthetic fixture and original receipts. No persistent service or system configuration is created.

The injected outer-caller self-test executes the same teardown executor used by `Program.cs`: unknown settlement allows zero detach/stop calls; a timeout in teardown allows no stop; unknown writer exit allows neither action. The retention test verifies that an expired observation deadline leaves the caller pending until owned exit is established. Removing the outer unknown-outcome check makes this test fail. These tests launch no helper and establish no real mounted acceptance.

### Reporting cannot release retained ownership

The complete teardown, identity collection, report serialization, receipt writing and console output run inside an ownership executor whose outer `finally` enters retention whenever protocol or writer outcome is unknown. Retention is no longer conditional on reporting finishing successfully. Console diagnostics are nonthrowing. Every hold-record callback is isolated from the passive owned-exit wait; identity, serialization, filesystem and diagnostic-writer failures may prevent a receipt, but cannot release the original pipes. A failed original reply is recorded only when possible, then retention continues. Failure to create or complete the owned-exit observer also retains the caller instead of declaring exit.

Injected checks execute this shared ownership executor with throwing report bodies and a real throwing `TextWriter`. A throwing hold-record callback combined with a failed original response must leave the hold pending until actual injected owned exit. These tests distinguish diagnostic failure from ownership release and do not establish a real helper's exit or mounted acceptance.

## Cloud compilation and separate runtime checks

The exact root `build.bat /s` and `build-installer.bat /s` paths compile this verification tool through the pinned .NET SDK as framework-dependent `win-x64` output in `out/verification/mounted-lifecycle`. The existing Windows workflow uploads that directory alongside build evidence. It does not execute the self-tests or mounted checks in CI. A successful cloud compilation proves compilation and delivery only; it cannot establish mounted, native I/O, GUI or retention acceptance.

The installer does not include this tool: Forge ignores the whole `out` source directory and its explicit `extraResource` list includes only native helper, converter, runtime tools, driver and dependency manifest paths. `out/verification` is absent from that resource list. Verify the actual package independently before claiming package-content acceptance.

After downloading the exact source-bound workflow artifact, run its managed assembly with the matching .NET 8 runtime and `--settlement-self-test` for the injected settlement/outer-ownership checks. This executes the compiled test binary without a local compiler, helper launch or mount. A real mounted run still requires the reviewed packaged helper, exact production hash, fresh evidence path and independent authorization.

The reporting-exception correction and cloud-delivery addition were initially preserved without local compilation because physical memory pressure prevented that route. The source-bound historical compiled result below supersedes that initial unrun state; it does not establish a current mounted run.

### Failed bounded stop also retains pipes

The shared teardown executor consumes the bounded stop's actual `ExitEstablished` result. A false result or a thrown stop leaves disposition `owned-stop-exit-unestablished`, requires the unconditional runner hold, and issues no additional request. A stop attempt alone is not exit proof. The injected executor cases include both a false stop result and a thrown stop, each requiring retention after exactly one stop attempt. These cases were initially uncompiled and unrun; the exact historical compiled synthetic result below now supplies that bounded evidence.


## Historical compiled synthetic acceptance

Source `b516d3e3b8eb4a20f210a555d9be8263dc1b9bf8` was compiled and delivered by [workflow38116846135](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/38116846135), artifact11694395806. The downloaded `MaterialFileEncryptor.MountedLifecycle.Tests.dll` had SHA-256 `c44228b3e37bef7d50bd6a6dac86a5c980b8491942425142a1f0da706f5e5447`. Its `--settlement-self-test` execution on .NET8.0.31 exited0 at2026-10-11T06:15:38.516819Z, with explicit settlement and outer teardown self-test success. This exercised compiled synthetic paths without launching a helper or mounting a drive.

Before this documentation correction, current main already contained equivalent versions of the four preserved patches and all four contributed verifier blobs matched the preserved source exactly. Executable source remains unchanged. An ancestry-preserving integration retains main's later build and workflow additions. Historical product-mounted receipts remain bound to their own sources; this result does not certify current installed startup, corrective installation, real updating/restart or current native/GUI acceptance.
