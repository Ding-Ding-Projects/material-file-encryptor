# Native conversion isolation

`ConverterSandbox.exe --request <absolute-manifest-path>` accepts a manifest written
by the trusted desktop process. This is not a renderer-callable general process
launcher. The desktop process must choose and verify every staged file and the
launcher binary before invocation.

```json
{"schema":1,"nonce":"32-or-more-hex-characters","runtime":"absolute-payload-node.exe","worker":"absolute-payload-worker.mjs","directory":"absolute-temporary-staging-directory","timeoutMs":30000,"memoryBytes":268435456}
```

The staging directory must be below the current user's temporary directory. It
contains `payload/node.exe`, the worker and its local dependencies, and a separate
`work/request.json` plus input files. Reparse points are rejected. The worker gets
`--request`, `--result` and `--nonce` arguments. It writes `work/result.json` with the
matching nonce. The worker result format belongs to the desktop adapter.

Each invocation creates a unique AppContainer profile with zero capabilities.
The launcher checks the actual suspended process token for AppContainer status,
the expected SID, and zero capability entries before resuming. It assigns the
process to a job with a single-process limit, kill-on-close and a 256 MiB process
memory limit, then reads those job limits back. The deadline is 30 seconds.

Protected file ACLs grant the current owner and LocalSystem full control, and the
unique AppContainer SID read/execute on the staging root and payload. Only `work`
receives AppContainer modification rights and a low-integrity label. Parent
environment secrets are not forwarded. A minimal allowlist supplies operating
system and profile paths; these names do not grant filesystem access. The Node
symbolic-link preservation flags avoid its startup realpath walk outside staging.

The job limit blocks additional executable processes. A Node child-launch probe
can stall inside native process creation rather than return an immediate error;
the job deadline terminates that attempt. No optional child-process-policy
attribute is used because it prevented the staged runtime from initializing on
the verified host. The job limit remains active.

Every 100 ms the launcher checks `work/cancel.signal` and enumerates work storage.
It terminates the job for cancellation, a deadline, more than 2,000 entries,
reparse points, or more than 256 MiB of work files. This sampled storage bound is
not a filesystem hard quota and can briefly overshoot between checks. The input
and result size checks are additional bounds, not a substitute for disk quotas.

The parent must await launcher exit before deleting staging. Success requires a
zero child exit, a matching result nonce, and the SHA-256 of the actual result
bytes. The final single-line JSON receipt is emitted only after handles close and
the AppContainer profile is deleted. It includes token verification, job limits,
timeout/cancellation/storage state, profile deletion and the result hash. Setup,
validation, or cleanup failures return a nonzero status with the native error or
HRESULT. A parent must never accept partial output or a missing cleanup receipt.

`smoke.ps1` exercises conversion, read-only payload, an owner-only file outside
staging, and a loopback listener reachable by the parent before and after the
isolated probe. Loopback rejection may appear as a bounded connection timeout
rather than an immediate access error. Other modes are `child`, `memory`,
`storage`, `cancel`, and `timeout`. The child test distinguishes an absent execution
marker plus deadline termination from immediate process-creation rejection.

Reference: [Microsoft AppContainer process creation](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer).
