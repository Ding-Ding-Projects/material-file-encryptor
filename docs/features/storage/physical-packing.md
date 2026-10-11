# Physical encrypted-part packing

New vaults default to an 80 MiB physical cap (83,886,080 bytes). The maximum accepted cap remains 90,000,000 bytes. The cap includes authenticated-record overhead. Encryption continues to use records no larger than 64 KiB; the cap is not a plaintext allocation size.

## Writes and final close

Each filesystem write finishes its encrypted objects and journals the updated record references before acknowledging durable success. It does not retain an unpublished temporary part across acknowledged writes. This staging can produce many small objects during a copy. A durable per-entry packing request is recorded with the write. The final writable descriptor close triggers background packing. Read-only descriptors do not prevent packing, and writable mapped views retain their writer lease until final Close rather than Cleanup. Two writers must both close before packing can adopt a replacement.

Packing clones an immutable entry, pins its source parts and key lifetime, then hydrates, authenticates and rewrites its records outside the namespace and filesystem callback locks. Adoption checks the path, entry identity, version, writer-admission generation, absence of active writers and queued target cap. A concurrent edit, truncate, rename, deletion or recreation prevents adoption. The request remains retryable where the entry still exists.

The replacement map is committed by an atomic full journal checkpoint, including the removal of obsolete overlay and base references. Existing delta updates merge record maps and are intentionally not used for this transaction. Finished parts exist before the checkpoint. Cancellation or a fault before adoption keeps the original entry. Interruption after the checkpoint keeps the new entry. Unreferenced ciphertext created by a cancelled attempt is retained safely; no automatic source garbage collection is performed.

## Existing-drive migration

The native command `startPacking` accepts optional `path` and `partSizeBytes` properties. Omitting the path queues every current file and saves the chosen cap as the default for future writes. The default migration target is 83,886,080 bytes. Selecting a path queues that file or subtree without changing the global default. The returned operation ID is observed with `operations` and cancelled with `cancelOperation`.

Migration is resumable: the encrypted checkpoint stores pending entry IDs and target caps. Completed packed generations are skipped. Files with active writers stay queued and are revisited after close or periodic maintenance. A completed command does not mean every deferred writer has closed; inspect `pendingPackingFiles` and `activeWriters`. Cancellation preserves completed adoptions and outstanding requests, and durably pauses automatic packing. The timer and writable-handle close cannot resume a paused migration. An explicit new startPacking request resumes it. Status exposes paused and diagnostics exposes packingPaused.

A cancellation carries its packing request generation through publication. An older operation cannot pause a newer explicit packing or resplit request.

## Publication and responsiveness

One publication consumer snapshots durable pending commits. It verifies materialized source parts and copies missing immutable parts outside the core lock before writing commit metadata, then acknowledges only that uploaded commit ID in a durable checkpoint. Remote-only immutable objects advertised by the transport retain lazy availability without downloading unchanged content. Corrupt materialized source parts are repaired only from authenticated local ciphertext; otherwise the commit remains pending. Commits created during publication remain pending. A source publication that succeeded before local acknowledgement is retried idempotently. Source unavailability preserves durable local work.

Encrypted local history hashes at most 64 paths per child, with a 24,000-character argument budget and a 128 MiB batch budget; a single larger object still obeys the existing publication cap. Index updates also use at most 64 entries per child. Immutable ciphertext comparisons, bounded publication batches and part-before-metadata ordering remain enforced.

Synchronization gathers source metadata outside the namespace lock. Before replay, it captures local edits made during source I/O, so replay cannot replace those edits with an earlier view. Quiet version maintenance and filesystem Flush are local durability operations. Background packing and source publication are distinct phases; neither synchronous final-close repacking nor a larger plaintext buffer is used to hide copy latency.

## Diagnostics and retained history

`storageDiagnostics` reports the cap, pending packing count, active writers, packing state, current referenced-part count and physical bytes, historical-only referenced parts and bytes, and temporary part count and bytes. Physical byte totals are observed from available local or source files; missing remote-only objects are counted but contribute zero observed bytes. These totals are not a reclamation promise. Historical versions and their immutable source objects remain recoverable. Total physical storage can temporarily grow during migration because old history is intentionally retained.

## Verification scope

Synthetic native regressions cover two writer admissions, immutable export snapshots, concurrent writes, rename and delete/recreate races, cancellation before adoption, interruption before and after checkpoint, truncate and sparse regrowth, controlled publication stalls, published-but-unacknowledged retry, and dense data spanning more than two 80 MiB caps. The dense fixture uses 64 KiB and 1 MiB write sizes, verifies a plaintext SHA-256 before and after packing, and records referenced physical bytes and retained managed-memory change. A source-only or synthetic result does not prove an installed Explorer copy, a live user's migration, or peak process-memory behavior; those require separately recorded runtime evidence.

## Source-bound synthetic acceptance

Source `e06df2a14643932f5f23289ae4eea2d8e45b3676` completed the exact `build.bat /s` entrypoint with exit 0. The final native core run passed 43/43 checks. The packaged-helper mounted run passed with a 167,895,616-byte fixture, 64 KiB and 1 MiB write requests, two writable descriptors, a retained mapped writer, three current parts, and authenticated reopen. Its plaintext SHA-256 was `0BFB35A1F43C4A06403A7BC845E1D1B6A8D55088918931CA548E2DB6D734BE60` before and after reopen.

Measured unrelated I/O took 12.5979 ms during packing and 14.0371 ms during publication; status took 0.2705 ms and 0.2172 ms respectively. The helper's sampled maximum private bytes were 78,237,696 and its peak working set was 117,022,720 bytes. Native transfer reservation peaked at 852,292 bytes against a 67,108,864-byte limit. These counters exclude other processes and are not a universal memory bound. The core fixture retained 2,103,416 additional managed bytes after forced collection, which is not peak allocation.

A separate unmounted probe using the same packaged helper measured current physical parts of 83,866,588, 83,866,588 and 254,672 bytes, totaling 167,987,848 bytes. The remaining cap capacity was 19,492, 19,492 and 83,631,408 bytes. It authenticated an exported 167,895,616-byte fixture with SHA-256 `4af23f0cbe2c2b15762df1381f430e1fff026ce509f80966d3178bfacaf964eb`. This separate fixture has a different byte pattern and is not a per-part observation from the mounted run.

Mounted detach settled in 26.8498 ms after the workload and 11.471 ms after authenticated reopen, each on its first attempt under the unchanged 60,000 ms deadline. The mapped writer and helper exited normally without forced termination; the synthetic drive was absent and owned fixtures were removed. Earlier source `1fd3581` exceeded that deadline and remains recorded as incomplete, rather than being reclassified by the later success. Machine-readable source, binary hashes, measurements and limitations are recorded in `docs/evidence/storage-packing-e06df2a.json`. No user vault, installation, update or removal was exercised.
