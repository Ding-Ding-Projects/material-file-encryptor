# Physical encrypted-part packing

New vaults default to an 80 MiB physical cap (83,886,080 bytes). The maximum accepted cap remains 90,000,000 bytes. The cap includes authenticated-record overhead. Encryption continues to use records no larger than 64 KiB; the cap is not a plaintext allocation size.

## Writes and final close

Each filesystem write finishes its encrypted objects and journals the updated record references before acknowledging durable success. It does not retain an unpublished temporary part across acknowledged writes. This staging can produce many small objects during a copy. A durable per-entry packing request is recorded with the write. The final writable descriptor close triggers background packing. Read-only descriptors do not prevent packing, and writable mapped views retain their writer lease until final Close rather than Cleanup. Two writers must both close before packing can adopt a replacement.

Packing clones an immutable entry, pins its source parts and key lifetime, then hydrates, authenticates and rewrites its records outside the namespace and filesystem callback locks. Adoption checks the path, entry identity, version, writer-admission generation, absence of active writers and queued target cap. A concurrent edit, truncate, rename, deletion or recreation prevents adoption. The request remains retryable where the entry still exists.

The replacement map is committed by an atomic full journal checkpoint, including the removal of obsolete overlay and base references. Existing delta updates merge record maps and are intentionally not used for this transaction. Finished parts exist before the checkpoint. Cancellation or a fault before adoption keeps the original entry. Interruption after the checkpoint keeps the new entry. Unreferenced ciphertext created by a cancelled attempt is retained safely; no automatic source garbage collection is performed.

## Existing-drive migration

The native command `startPacking` accepts optional `path` and `partSizeBytes` properties. Omitting the path queues every current file and saves the chosen cap as the default for future writes. The default migration target is 83,886,080 bytes. Selecting a path queues that file or subtree without changing the global default. The returned operation ID is observed with `operations` and cancelled with `cancelOperation`.

Migration is resumable: the encrypted checkpoint stores pending entry IDs and target caps. Completed packed generations are skipped. Files with active writers stay queued and are revisited after close or periodic maintenance. A completed command does not mean every deferred writer has closed; inspect `pendingPackingFiles` and `activeWriters`. Cancellation preserves completed adoptions and outstanding requests.

## Publication and responsiveness

One publication consumer snapshots durable pending commits. It verifies and copies immutable parts outside the core lock, writes every referenced part before its commit metadata, then acknowledges only that uploaded commit ID in a durable checkpoint. Commits created during publication remain pending. A source publication that succeeded before local acknowledgement is retried idempotently. Source unavailability preserves durable local work.

Synchronization gathers source metadata outside the namespace lock. Before replay, it captures local edits made during source I/O, so replay cannot replace those edits with an earlier view. Quiet version maintenance and filesystem Flush are local durability operations. Background packing and source publication are distinct phases; neither synchronous final-close repacking nor a larger plaintext buffer is used to hide copy latency.

## Diagnostics and retained history

`storageDiagnostics` reports the cap, pending packing count, active writers, packing state, current referenced-part count and physical bytes, historical-only referenced parts and bytes, and temporary part count and bytes. Physical byte totals are observed from available local or source files; missing remote-only objects are counted but contribute zero observed bytes. These totals are not a reclamation promise. Historical versions and their immutable source objects remain recoverable. Total physical storage can temporarily grow during migration because old history is intentionally retained.

## Verification scope

Synthetic native regressions cover two writer admissions, immutable export snapshots, concurrent writes, rename and delete/recreate races, cancellation before adoption, interruption before and after checkpoint, truncate and sparse regrowth, controlled publication stalls, published-but-unacknowledged retry, and dense data spanning more than two 80 MiB caps. The dense fixture uses 64 KiB and 1 MiB write sizes, verifies a plaintext SHA-256 before and after packing, and records referenced physical bytes and retained managed-memory change. A source-only or synthetic result does not prove an installed Explorer copy, a live user's migration, or peak process-memory behavior; those require separately recorded runtime evidence.
