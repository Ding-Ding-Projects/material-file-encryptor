# Prospective graceful-exit handle retention

`scripts/owned-exit-handle-keeper.py` is a verification-only persistent sidecar. It does not launch, close or terminate a target application. It prevents reuse of the exact recorded process identifiers during a prospective graceful-exit verification by retaining noninheritable `PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE` handles. It does not explain historical failures or accept earlier rejected evidence.

Run the original adapter's `prepare-exit` first. Start the sidecar as a hidden subprocess with piped standard input/output, the selected direct CLI environment, and these arguments:

```text
--state <canonical-owned-run-root>/lifecycle.json
--helper-sha256 <reviewed-helper-sha256>
--script-sha256 <reviewed-sidecar-sha256>
--source-commit <reviewed-source-commit>
--receipt <canonical-owned-run-root>/exit-handle-keeper.json
--timeout 90
```

The sidecar validates the installed lifecycle state through the existing direct transport projection, original exit-proof policy, ancestry and exact identity comparisons. It requires the live full tree to contain exactly the proof identities before acquisition and again after acquisition. Each native handle PID and fresh CIM identity must match its original proof identity, with no timestamp tolerance or path normalization. Partial acquisition never produces readiness, and every acquired handle is released on failure.

Wait for `HANDLES_READY`, then perform the genuine browser close externally. Send exactly `{"command":"confirm"}`. The sidecar runs the unchanged, hash-bound original adapter `confirm-exit` using the provenance-bound Python executable while retaining every acquired handle. It requires actual exit code zero, the original successful absence/desktop flags, and an additional unchanged `_recorded_tree_absent` result. It permits only the original adapter's `cleaned:false` to `cleaned:true` lifecycle transition. It never writes lifecycle or exit-proof state.

After `ORIGINAL_CONFIRM_VERIFIED`, send exactly `{"command":"release"}`. Success requires final unchanged inputs and original true absence, followed by successful closure of every owned native handle. Caller-supplied success flags cannot replace original verification. EOF, invalid commands, expiry or any failure closes owned handles and returns nonacceptance. Failed native handle closure is recorded as failure; process exit provides the operating system's final handle-table retirement. The deadline is checked between bounded identity/transport operations and while waiting for commands; a query already in progress can consume its existing bounded timeout.

Standard output contains only neutral codes and counts. Captured adapter output is never forwarded. The exclusive private receipt is written and read back inside the original canonical run root using the installed helper's no-link checks and pinned directories. It binds original/final lifecycle hashes, untouched proof and identities, helper, sidecar, adapter, policy, transport and Python hashes, source commit and held-interval events. It must remain private because it contains exact identity and machine-path evidence. Existing receipts are never overwritten.

Offline tests cover exact full-tree ownership, CIM/native acquisition races, partial acquisition, input changes, initial ancestry rejection, command order, actual adapter exit behavior, absence, timeout, EOF and failed handle release. They do not establish browser runtime acceptance. A fresh browser run requires separate authorization and original closure verification.

## Failed-attempt diagnostics and preservation

Failure receipts retain only a bounded stage identifier, exception class name and up to eight projected callsites. They exclude exception messages, stack source lines, arbitrary machine paths and identity payloads from that diagnostic block. Standard output continues to contain only neutral codes and counts. Generic historical failures without these diagnostics remain unexplained; a later successful query cannot recover their lost exception.

The default `exit-handle-keeper.json` remains exclusive and is never overwritten. A separately authorized attempt may use `exit-handle-keeper-<32 lowercase hexadecimal characters>.json` in the exact same canonical lifecycle root. Existing original receipts, lifecycle state and exit proof remain preserved. The new attempt must independently satisfy every original ownership, identity, ancestry, full-tree, absence and release check. A new filename never substitutes for acceptance or grants authority to close a browser.
