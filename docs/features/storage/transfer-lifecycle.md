# Managed transfers and safe drive lifecycle

The native helper provides additive asynchronous transfer controls. Existing synchronous methods remain available for older callers.

## Protocol

- `startImport` accepts `paths`, an array of one to 1000 absolute source paths outside the vault folders, and returns `operationId` immediately.
- `operations` returns at most 128 retained operation records. Each contains `operationId`, `state`, `bytesCompleted`, `totalBytes`, `completedFiles`, `totalFiles`, and a safe `error` when applicable.
- `cancelOperation` accepts `operationId`. Cancellation is independent of the controller and encryption locks. `accepted: false` means the operation is already terminal. Completed files stay installed; the unfinished staged file is discarded.
- `forceLock` returns `locked`, `busy`, `code`, `activeOperations`, and `queuedOperations`. Active or queued commands, transfers, preparation, synchronization, or filesystem I/O return a busy result. Idle open handles do not prevent a force lock. New admission is blocked before dispatcher detachment, and success is returned only after engine disposal clears the owned key.
- `listFiles` accepts numeric `cursor`, `limit` (1 to 1000), and optional `revision`. It returns `items`, `nextCursor`, `revision`, and `resetRequired`. A changed revision restarts paging at zero.

Commands share one bounded consumer. Control messages continue to be read while commands execute. Admitted request metadata is byte bounded below 64 MiB; managed file bodies are never queued and use one 64 KiB plaintext buffer. Transfer requests are limited to 64 outstanding operations. Terminal records are evicted from the bounded retained history.

## Storage and durability

New vaults use format 3. Independently authenticated content blocks are at most 64 KiB, and blocks are packed into immutable ciphertext parts within the configured physical cap. Authentication binds a block to its part identifier and offset. Existing format 1 and format 2 vaults remain readable. Editing a large legacy record writes bounded overlays instead of repacking the complete file. Truncation records a base-data ceiling, preventing later growth from exposing truncated bytes.

Managed imports create ciphertext and an encrypted staging journal without adding an incomplete file to the live namespace. The final install occurs under the engine lock. A conflicting destination is not overwritten. Cancellation before install removes staging metadata; completed files in a batch remain. A cancellation racing after installation cannot turn a completed result into a cancelled result. Immutable ciphertext left by a discarded stage contains no plaintext and is not made visible as a file.

Filesystem callbacks persist local encrypted state. Storage publication runs from synchronization outside the filesystem callback lock. Status reuses file and historical counters while their revisions are unchanged.

## Verification and limits

`native/MaterialFileEncryptor.Lifecycle.Tests` exercises queue admission, cancellation, force-lock busy results, atomic managed import, late-cancel semantics, and revision paging using disposable synthetic vaults. Root production builds use `build.bat /s`. Windows Explorer interaction and installer behavior require separate runtime verification; these native protocol checks do not establish those results.

An orderly parent EOF waits for admitted requests and refuses to dispose an engine while managed transfers remain active. Normal lock still refuses open drive handles. Force lock is separate and never reports success while encrypted work remains active.

## Incremental journal and activity

Accepted filesystem mutations append sequence-numbered encrypted records to a local journal. Each record authenticates its length, sequence, and predecessor digest. Acknowledgement follows a durable flush. Regular synchronization compacts these records into a checkpoint and immutable publication commits; the durable checkpoint records its high-water mark before old log data is retired. Startup ignores only an incomplete terminal record and rejects complete-record authentication or chain failures. `journal` status counters report appended bytes and frames separately from checkpoint bytes and count. `journal.pendingFrames` and `sync.pendingLocalFrames` report accepted local mutations awaiting checkpoint/publication work.

Status requests return an immutable cached snapshot directly from the input loop. Snapshot refresh occurs outside that reader, so a large encryption operation cannot prevent a later cancellation request from being read. Invalid requests also cannot force a blocking status refresh.

The helper records encrypted import, edit, rename, restore, cancel, export, and synchronization activity. Activity publication is explicit in the synchronization worker. Creating an event does not rescan the existing activity inventory. `listActivity`, `previewVersion`, `listVersionLabels`, `labelVersion`, and `exportVersion` expose the selected file history workflow. `startExport` adds cancellable export through the operation registry; the synchronous method remains compatible. User-selected export destinations are outside vault storage and cache folders. Atomic destination replacement keeps a previous exported file intact if preparation, decryption, or cancellation fails before installation.

Random immutable part identifiers allow a part to contain several independently authenticated blocks. Integrity comes from each block's authentication and its bound part identifier and offset, not from treating the filename as a digest. Regression checks reject byte tampering, equal-sized block substitution, and truncation, and separately read an independently constructed format 2 ciphertext fixture.

## Source-bound ordinary mounted verification

The [native lifecycle evidence](../performance/native-lifecycle-performance.md) records ten passing ordinary checks at source `7e6877556da7aae8426d76d817c95c23fd33e719`, helper SHA-256 `7ba9bb0c3ba575d32c7bd2688998d8f1f3270ff86dc0dd2a089e1f5b5c73d8a4`. The checks cover idle-handle force lock/reunlock, temporary-save rename, mapped write/flush/reopen, ordinary close semantics, deletion, progress-copy cancel/stop comparison and managed batch cancellation. No GUI was used. Successful fixture teardown is recorded separately from operation correctness.

A separate forced detach with a concurrent mapped writer produced a native fatal exception. Its expected-detach classification is unknown and remains unresolved. Do not infer full force-lock safety or erase the adverse probe from the ten ordinary passes.

## Current-file export source addition

Source `6086ff30c532c6a59a2ddc0869a28651e9a20dc1` adds current-file export to `startExport`: supply exactly one of `path` or `versionId`, plus `destination`. A current `path` is exported from an immutable read snapshot whose referenced ciphertext remains protected from cache eviction until disposal. The worker streams at most 65,536 plaintext bytes per block to a same-directory temporary file, checks cancellation between preparation and writes, flushes it durably and replaces the destination atomically.

Cancellation before installation preserves a prior destination and removes the temporary output. Installation wins a late cancellation and is reported as completed. The plaintext buffer is cleared and the snapshot disposed in the finalization path. Exporting the current file does not manufacture a history version.

This paragraph records implemented source behavior only. At the reviewed parent baseline `8ec5ef37e593fe4ef8ba88e9e4205bc67c4c36c3`, this export addition was not yet integrated. The ordinary mounted receipt predates it and does not verify it. Final parent integration, packaged execution and mounted current-export acceptance remain unverified.
## Legacy authentication memory and cost

On Windows, legacy format 1 and 2 records use the Microsoft CNG `BCryptDecrypt` authenticated chaining API. A first pass verifies the complete record into a cleared, bounded discard buffer. Only after the final tag succeeds does a second pass over the same write-excluding file handle decrypt the requested range. Format 1 retains its record-offset associated data; format 2 retains both its associated data and whole-object SHA-256 identity. No plaintext staging file is created.

Legacy records have one authentication tag for the entire record. A small read or edit therefore still requires authentication work proportional to that legacy record, and decryption may scan the prefix leading to the requested range. Bounded overlays avoid rewriting the entire legacy file, but do not make old authentication independently seekable. Modern format 3 records retain independent authentication at no more than 64 KiB per block.

Owned transfer buffers share a process-wide 64 MiB admission budget across current reads/writes, staged imports, managed imports/exports, synchronization, ciphertext copying and legacy authentication. Reservations conservatively include the bounded stream buffers used by those operations. Exhaustion produces a retryable failure instead of waiting while holding an engine lock. This is a transfer-buffer bound, not a process working-set limit: caller-provided output, metadata/object graphs, runtime overhead and the operating system cryptographic provider's internal allocations are separate. `transferBuffers` exposes active/peak reserved bytes and the limit; `VaultEngine.LegacyReadBuffers` separately reports the legacy reader's accounted workspaces.

Focused tests include independent 90,000,000-byte format 1 and 2 records, one-byte overlay edits, block-boundary and empty records, invalid associated data/tags/ciphertext/truncation, shared-budget exhaustion, concurrent readers, and cancellation during both passes. The provider contract is documented in [Microsoft's authenticated cipher mode information reference](https://learn.microsoft.com/en-us/windows/win32/api/bcrypt/ns-bcrypt-bcrypt_authenticated_cipher_mode_info).
