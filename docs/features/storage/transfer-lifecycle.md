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
