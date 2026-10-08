# Encrypted Explorer drive

The Windows helper exposes an authenticated vault as a drive through the real [WinFsp](https://github.com/winfsp/winfsp) filesystem driver. Explorer and ordinary applications read and write the drive. The encrypted storage folder is a synchronization destination; it is not a plaintext workspace.

Install the official signed WinFsp 2.1 driver before mounting. The application reports a missing or unavailable driver and leaves the vault unmounted. The unmodified official .NET binding is pinned in `native/vendor/WinFsp`; its origin, checksums, and GPLv3 license accompany the source. The helper requires .NET 8 when run from a framework-dependent build; packaged Windows builds can include the runtime.

WinFsp - Windows File System Proxy, Copyright (C) Bill Zissimopoulos.
https://github.com/winfsp/winfsp

## Data handling

- Plaintext exists in application and helper memory during user reads, edits, and imports. The helper does not create decrypted files in the storage folder, cache folder, or a separate workspace.
- The cache contains authenticated encrypted content, metadata, and a durable encrypted journal. It must be a separate, non-overlapping folder from synchronized storage.
- A successful filesystem write persists encrypted content and the encrypted journal before acknowledging the write. Flush, size changes, rename, and deletion also persist the journal. Background synchronization runs every 15 seconds while unlocked.
- Import streams a user-selected original directly into the encryption engine. The original remains in its original location. A name collision imports under a numbered name; it never overwrites an existing vault file.
- Passwords and key-file bytes are used only for unlocking. Credential byte buffers and master-key exports are cleared after use. A .NET password string received over the inherited pipe remains subject to garbage collection; there is no claim that managed strings can be reliably erased.
- Optional saved unlock stores the 32-byte master key under current-user Windows DPAPI, bound to the vault identity. The protected file lives in the user's local application-data credentials folder, with a protected owner/System ACL. Passwords and key-file paths are not persisted there. Forgetting saved unlock deletes that protected credential.
- Windows kernel share modes and byte-range locks are enforced by WinFsp. Open handles refer to stable entry identities; rename, replacement, and deletion retain the content associated with an existing handle until its final descriptor closes, including retained memory-mapped views. Extended Windows rename requests with POSIX semantics permit shared-delete open replacement; legacy `MoveFileEx` requests follow Windows open-handle restrictions and can return access denied until the affected handles close.

A busy unmount fails with a clear message and keeps the drive unlocked. Close applications and Explorer windows using that drive, then retry. The helper does not force-unmount automatically. During orderly pipe shutdown it waits for live handles to close. Abrupt process termination cannot run a graceful unmount; acknowledged writes are retained in the encrypted journal for the next unlock.

Hard links, alternate data streams, reparse points, and per-file ACL changes are not implemented. The drive grants access to its owning Windows user and System. External applications can save plaintext to locations they choose; this helper cannot control their own temporary files or backups.

## Local JSONL protocol

The parent starts `MaterialFileEncryptor.Host.exe` with inherited stdin and stdout pipes. There is no listening network server. Each request is one JSON line:

```json
{"id":1,"method":"status","params":{}}
```

Responses are `{ "id": 1, "result": ... }` or `{ "id": 1, "error": "..." }`. The helper also emits `{ "event": "status", "status": ... }`. Stdout contains only protocol JSON; stderr contains generic shutdown diagnostics without credentials or file contents. IDs must be scalar strings of at most 64 characters or numbers. Requests are limited to 1 MiB and depth 32.

| Method | Parameters |
| --- | --- |
| `status` | None |
| `create`, `unlock` | `storageDir`, `cacheDir`, `driveLetter`; exactly one of `password` or `keyFilePath`; optional `autoUnlock`, `partSizeBytes` |
| `autoUnlock` | `storageDir`, `cacheDir`, `driveLetter`; uses the current user's saved DPAPI key |
| `mount` | Optional `driveLetter`; requires an unlocked vault and available driver |
| `unmount` | None; retains the unlocked engine |
| `lock` | None; gracefully unmounts, flushes, and clears the engine key |
| `importFiles` | `paths`: array of user-selected original file paths |
| `keepOffline`, `releaseOffline` | `path`: virtual vault path |
| `setPartSize` | `partSizeBytes`: default cap for new and subsequently edited files (initially 10 MiB) |
| `resplit` | `path`, `partSizeBytes`: rewrite that file's encrypted parts |
| `sync` | None |
| `setAutoUnlock` | `enabled`; enabling requires an unlocked vault |
| `forgetSavedCredential` | None for the current vault; `storageDir`, `cacheDir` if no vault has been opened |

Create and unlock authenticate the vault; mount is a separate request. The desktop opens `driveLetter + "\\"` through Explorer after mounting.

Status contains `locked`, `mounted`, `unmountBusy`, `driveLetter`, `storageDir`, `cacheDir`, `files`, `partSizeBytes`, `sync`, `driver`, `autoUnlock`, `availableDriveLetters`, and `lastOfflineRelease`. A successful offline release records its virtual `path` and actual `bytesFreed`; zero means no eligible local ciphertext was removed. Targeted eviction retains dirty, pending, pinned, open, and shared content, and verifies the source copy before deletion. Each file reports `id`, virtual `path`, logical `size`, `modified`, actual encrypted `partCount`, its `partSizeBytes`, and `offline`. Part size includes authenticated-record overhead; encrypted parts do not exceed their cap.

## Verification

Build the helper:

```powershell
dotnet build native/MaterialFileEncryptor.Host/MaterialFileEncryptor.Host.csproj -c Release
```

On Windows with the official driver installed, run the real filesystem test:

```powershell
dotnet run --project native/MaterialFileEncryptor.Host/MaterialFileEncryptor.Host.csproj -c Release -- --self-test
```

The test mounts a free drive letter and uses normal .NET/Win32 filesystem I/O for create/read, range writes across record boundaries, flush, zero extension, truncation, share-mode conflicts, busy-unmount refusal including a memory-mapped view after its original file handle closes, replacement while the old destination remains open, directory rename with an open child, enumeration, lock/reopen, deletion with an open reader, empty-directory deletion, and current-user DPAPI unlock. It uses disposable encrypted storage/cache test folders and emits one JSON result. Exit 0 indicates every check passed; exit 1 indicates failure; exit 2 indicates Windows is required.

Linux verification exercises the JSONL protocol, authentication, import, part counts, pinning, resplit, offline unlock, ciphertext-only cache/storage scanning, and orderly EOF. A Linux build or protocol test does not verify a mounted Windows drive. The real driver test must run on Windows before calling the Explorer workflow verified.
