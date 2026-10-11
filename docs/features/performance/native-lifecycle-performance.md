# Native lifecycle and performance evidence

These results are separate from the earlier [unbound packaged status measurement](native-helper.md). The raw private receipts were read and a public-safe fact summary is stored in `native-lifecycle-summary.json`. No private fixture path, process command line, payload or raw log is included.

## Performance receipt

The receipt was recorded at `2026-10-11T00:29:11.4953239+00:00` using the `synthetic-native-helper-protocol` route. Its helper SHA-256 is `8c2f10f9be848566f5890960aa7a842365724bbadb62ea270e4f77c0ccfdaceb`. The receipt does not identify a source commit, so the hash identifies the measured helper and no current-source binding is inferred.

| Measurement | Observed value | Scope |
| --- | --- | --- |
| Idle wall time | 60,004.3041 ms | One helper process |
| Idle CPU time | 453.125 ms | One helper process |
| Logical processors | 32 | Normalization divisor |
| Idle total-capacity CPU | 0.0235985676% | CPU time / wall time / 32 × 100 |
| Active import input | 268,435,456 bytes | Synthetic input |
| Status samples during running operation | 30 of 30 | Helper JSONL status requests |
| Status median | 0.4573 ms | Helper acknowledgement |
| Status p95 | 0.7782 ms | Helper acknowledgement |
| Status maximum | 0.855 ms | Helper acknowledgement |
| Cancellation acknowledgement | 2.3634 ms | Accepted, below recorded 250 ms budget |
| Cancellation to terminal state | 541.3325 ms | Terminal state `cancelled` |
| Peak sampled working set | 65,277,952 bytes | Sampled process value, not an exact all-time peak |
| Peak sampled private bytes | 31,629,312 bytes | Sampled process value |

This is neither a GUI latency measurement nor a whole-computer resource guarantee. Synthetic helper operations did not mount a drive or access a user vault. Process allocation instrumentation was not enabled, so helper-managed allocation totals remain unknown. The 65,536-byte plaintext import buffer and 67,043,328-byte admitted metadata budget are source contracts rather than measured process-allocation totals.

The separate in-process core case edited one byte of a 4,194,304-byte legacy file and flushed local state. It added 1,793 ciphertext bytes, took 27.1303 ms and allocated 21,187,824 bytes on the measured thread. The durability check passed. Fixture creation was excluded from that allocation scope. The low ciphertext growth does not establish low allocation overhead; the 21,187,824-byte result remains an explicit optimization concern.

Performance receipt SHA-256: `2d0b64de5057edb232f1386a38b4bb216623077eeaa08a761bd0c6e427e91be8`.

## Ordinary mounted operations

The ordinary-operation receipt identifies source `7e6877556da7aae8426d76d817c95c23fd33e719` and helper SHA-256 `7ba9bb0c3ba575d32c7bd2688998d8f1f3270ff86dc0dd2a089e1f5b5c73d8a4`. The route was `native-helper-protocol-and-win32-mapped-io`; no GUI was used. All ten listed ordinary checks passed:

- Idle open-handle force lock and immediate unlock with the old idle handle.
- Editor temporary-save and open-handle rename.
- Mapped write, flush and reopen, with 4,096 verified bytes.
- Ordinary close retaining a 4,096-byte partial file because close carries no cancellation intent.
- Explicit delete and delete-on-close.
- Native copy progress cancellation.
- Reference-volume copy stop and mounted-volume copy stop, each reporting the observed destination-removal behavior.
- Managed batch cancellation retaining a completed file and the original destination while leaving the incomplete file absent; acknowledgement was 1.9741 ms.

The ten-check count includes the two idle-handle checks separately. The receipt reports mounted state false, drive absent and owned fixture removed at teardown. Receipt SHA-256: `a009b856002c71c724135dceafa808f8d8325bb051e195c5d29748885ac335eb`.

## Unresolved forced-detach boundary

A separate concurrent forced-detach probe with an active mapped writer produced a native fatal exception. Whether this was an expected mapped-writer detach outcome is **unknown**. Its classification remains unresolved. The ten ordinary passes neither erase that result nor prove complete force-lock safety for concurrent mapped writes. No full lifecycle, release, installer or GUI acceptance is claimed here.
