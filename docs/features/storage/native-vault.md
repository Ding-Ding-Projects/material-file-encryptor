# Native encrypted-folder storage

`native/MaterialFileEncryptor.Core` is the .NET 8 storage engine used by the Windows filesystem host. Explorer operations read and change an encrypted namespace directly. The engine never creates a plaintext working folder. Plaintext exists in application or filesystem-driver buffers while the volume is unlocked; an unlocked computer can read the mounted files.

## Credentials and cryptography

A new vault generates a random 32-byte master key. Password UTF-8 bytes or the exact contents of a 32-byte to 1 MiB key file wrap that key through PBKDF2-HMAC-SHA-256 with a random 32-byte salt and 600,000 iterations, followed by AES-256-GCM. `VaultCredentials.GenerateKeyFile()` generates 32 random bytes. Credentials remain the host's responsibility; the core does not store passwords or key-file paths. The host can export the unlocked master key for an explicitly enabled Windows DPAPI credential and restore it with `OpenWithMasterKey`.

The configuration's vault identifier, credential type, KDF parameters and wrapped key are public. Paths, lengths, timestamps, entry identifiers, record maps, pins and commit contents are encrypted. A separate authenticated key-check record rejects an incorrect restored master key even for an empty vault.

Every encrypted record uses a new random 12-byte nonce and a 16-byte authentication tag. AAD includes a format/domain marker and vault identifier; file records additionally bind their physical part identifier and byte offset. Metadata, journals, commit events and key wrapping use separate domains. Reads authenticate each record before returning its plaintext. Corrupt clean cache content can be replaced only after authenticating the entire source object. Corrupt content without an authentic source copy fails the operation.

## Layout and splitting

The selected storage folder contains `vault.json`, immutable `parts/<random-id>.mfe` ciphertext objects and encrypted `commits/<random-id>.mfe` events. The separate local cache contains those encrypted objects, its encrypted `journal.mfe`, and a public copy of the vault configuration. Storage and cache must be separate non-overlapping roots. Symbolic links and Windows junctions/reparse paths are rejected at these roots and managed object paths to prevent the cache from aliasing cloud objects.

A physical part packs independently authenticated records of up to 64 KiB plaintext. Its byte cap includes each record's 36-byte framing, nonce and tag. Small caps reduce the record payload to fit. Caps range from 1 KiB through 1 GiB; the default is 10 MiB. The host converts user-selected units to an exact byte count. `SetPartSize` changes the policy for new and subsequently changed files. Existing files retain their recorded cap until a data or length change or an explicit `ResplitAsync`; all resulting physical parts fit the new cap. Resplitting publishes a replacement version while retaining old objects. The engine performs no cloud garbage collection.

Sparse growth records a length without materializing all zero chunks. Reads of absent chunks return zeros. Shrinking a file removes later record references and clears a surviving boundary chunk so discarded bytes cannot reappear after extension.

## Namespace and multi-device publication

Paths follow case-insensitive Windows lookup rules, retain display spelling and reject traversal, empty components, invalid characters, trailing dots/spaces and Windows reserved names. The engine exposes create, directory create, enumeration, metadata, random-offset reads/writes, length changes, delete and atomic namespace rename/replacement. Stable entry IDs retain deleted or replaced content for existing open handles until their leases close.

Each local flush produces an immutable encrypted commit with a unique identifier and its observed parent heads. The encrypted event carries namespace changes, expected previous versions and ancestor-directory snapshots. Devices publish their own events rather than overwriting one manifest or relying on a cross-device file lock. Replay follows the commit DAG in a deterministic order. Concurrent edits keep both versions in the namespace with distinct stable identities; conflicting copies receive a visible ` (conflict ...)` suffix. Concurrent deletion cannot silently hide a surviving descendant edit: replay restores its required directory ancestors. Existing open handles remain usable after a synchronized remote deletion.

A receiving device authenticates metadata and all referenced content before admitting an incoming version. Incomplete, missing-parent or unauthenticated commits remain pending, and the last usable namespace stays available. Parts upload before their commit is published. Publication uses temporary files followed by replacement, with file data flushed before reporting local durability.

## Offline behavior and durability

`FlushAsync` first writes encrypted content and the encrypted namespace journal with disk flushes. If the source folder is absent or rejects publication, the successful local flush retains queued commits and exposes the failure through `VaultSyncStatus`; it does not claim provider synchronization. A later sync publishes queued objects and imports complete events. An abrupt process exit after a successful flush recovers the namespace and queued events from the encrypted journal.

`SetPinnedAsync(path, true)` fetches and verifies all required encrypted content before saving a pin. Folder pins also cover future descendants; a root pin covers the whole vault. Removing a pin does not discard unsaved changes. `EvictCache` protects pinned, open, orphaned-open, changed and unpublished content, and authenticates the source copy before removing a safe local ciphertext object. Metadata remains available in the journal. Unpinned content without a source copy fails clearly when requested offline.

The status describes access and publication to the selected local folder. OneDrive or Google Drive performs its own remote transport; the engine cannot assert that their servers have received a local folder change. This format exposes ciphertext sizes, object counts and activity timing; padding and provider-level traffic hiding are not implemented. Successful file flushes are covered by process-crash tests; this suite does not simulate sudden power loss or all filesystem/provider durability behavior. File ACLs, NTFS alternate data streams, hard links, byte-range locks and cloud garbage collection are outside the core's current interface.

## Reproduce the checks

```sh
dotnet run --project native/MaterialFileEncryptor.Core.Tests -c Release
```

The standalone runner uses only the .NET SDK and covers random access, sparse/truncated data, rename replacement and stable handles, case-only renames, credentials and key restoration, plaintext-leak scanning, Windows path validation, packed physical caps and resplitting, tamper rejection and verified source fallback, process-exit journal recovery, source outage and queued publication, deterministic concurrent edit copies, incomplete incoming versions, remote deletion with an open handle, descendant edits against recursive directory deletion, pin/eviction rules, and root/managed-child symbolic-link rejection. Windows Explorer/WinFsp behavior requires the separate Windows host checks.
