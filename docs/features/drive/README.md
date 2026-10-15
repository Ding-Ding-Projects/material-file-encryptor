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
- Optional saved unlock stores the 32-byte master key under current-user Windows DPAPI, bound to the vault identity. The protected file lives in `%LOCALAPPDATA%\\MaterialFileEncryptor-Data\\Credentials`, with a protected owner/System ACL, separately from the Squirrel installation directory. Passwords and key-file paths are not persisted there. Forgetting saved unlock deletes that protected credential. Uninstalling the application retains this credential data; use Forget saved unlock before uninstalling to remove it.
- Windows kernel share modes and byte-range locks are enforced by WinFsp. Open handles refer to stable entry identities; rename, replacement, and deletion retain the content associated with an existing handle until its final descriptor closes, including retained memory-mapped views. Extended Windows rename requests with POSIX semantics permit shared-delete open replacement; legacy `MoveFileEx` requests follow Windows open-handle restrictions and can return access denied until the affected handles close.

## Locking, Force lock and restarts

**Lock** unmounts the drive gracefully, commits the encrypted journal and clears the key. It refuses while a program still has a file or folder on the drive open, because dismounting under that program would pull the drive out from under it. The refusal keeps the drive unlocked and names the kind of holder it can identify without exposing any file name or program path: data still being read or written, Windows Explorer (a window or preview pane showing the drive), Windows Search or a security scan, or another program. Every message points at Force lock. Status carries the same kinds in `unmountHolders` while `unmountBusy` is true. No file name is recorded or logged.

**Force lock** is the way out when something keeps the drive busy. It does not refuse because work is running or because a program has a file open. It proceeds in this order:

1. It blocks new commands, transfers and synchronization from starting.
2. It cancels running transfers and the running synchronization, and waits up to 15 seconds (`timeoutMs`, at most 60 seconds) for them to stop. Cancelling a transfer discards its unfinished staged file and keeps files that were already installed. Commands that cannot be cancelled are waited for, not interrupted.
3. It waits briefly for the encryption lock, which the status refresh also uses for a moment every second. That momentary hold used to make Force lock report busy while nothing was using the drive.
4. It releases every file and folder descriptor that other programs still hold, commits the encrypted journal, dismounts the drive through WinFsp, and clears the key. Programs that had files open lose access to the drive; anything they had already written was acknowledged only after it reached the journal.

If something still cannot stop within the deadline, the result is `busy` with a code (`operations-active`, `crypto-active` or `filesystem-handles-active`) and the drive stays mounted. A successful result reports `releasedHandles`, the number of descriptors it closed.

### What happens if you restart while the drive is mounted

- **Windows shutdown, restart or sign-out (clean).** When Windows announces the session is ending, the desktop application revokes browser access, force locks the drive with a short deadline (about three seconds of waiting, four in total) so shutdown is never held up, removes its interrupted-session marker, and exits. Before that, when Windows first asks whether the session may end, the application only commits the journal, because another program can still cancel the shutdown and a lock then would pull the drive away from work the user keeps doing.
- **If the lock does not finish in time.** The marker stays. Every acknowledged write is already in the encrypted journal, so nothing is lost; the next start opens locked, reports that an interrupted session was detected, and replays the journal when you unlock.
- **Sleep or hibernate.** The drive stays mounted so work continues on resume. The application commits the journal when the machine suspends, so a power loss while asleep replays from a committed state.
- **Power loss or a crash.** Nothing runs. A write is acknowledged only after its encrypted frame and journal entry are durable, so on the next unlock the journal replays every acknowledged write and ignores a torn final frame. A write that had not been acknowledged yet may be absent; a partly written one is never exposed.
- **The desktop application closes first.** The helper process sees its pipe close. It waits 30 seconds for programs to close their files and then force locks, because nothing is left that could unlock or lock the drive again.

Abrupt process termination cannot run a graceful unmount; acknowledged writes are retained in the encrypted journal for the next unlock.

Credentials saved by earlier development builds inside `%LOCALAPPDATA%\\MaterialFileEncryptor\\Credentials` are ignored and never migrated automatically. Unlock manually and enable saved unlock again to use the independent data directory. Existing development-build credential files are left untouched; forgetting a current credential cannot restore one from the old location.

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
| `create`, `unlock` | `storageDir`, `cacheDir`, `driveLetter`; exactly one of `password` or `keyFilePath`; optional `driveName`, `autoUnlock`, `partSizeBytes` |
| `autoUnlock` | `storageDir`, `cacheDir`, `driveLetter`; uses the current user's saved DPAPI key |
| `mount` | Optional `driveLetter`, `driveName`; requires an unlocked vault and available driver |
| `unmount` | None; retains the unlocked engine |
| `lock` | None; gracefully unmounts, flushes, and clears the engine key; refuses with the kind of holder while a program still has the drive open |
| `forceLock` | Optional `timeoutMs` (0 to 60000, default 15000); cancels transfers and synchronization, releases other programs' open files, flushes, dismounts, and clears the engine key |
| `flushJournal` | None; commits the encrypted journal without locking, used before the machine suspends |
| `importFiles` | `paths`: array of user-selected original file paths |
| `keepOffline`, `releaseOffline` | `path`: virtual vault path |
| `setPartSize` | `partSizeBytes`: default cap for new and subsequently edited files (initially 10 MiB) |
| `resplit` | `path`, `partSizeBytes`: rewrite that file's encrypted parts |
| `sync` | None |
| `setAutoUnlock` | `enabled`; enabling requires an unlocked vault |
| `forgetSavedCredential` | None for the current vault; `storageDir`, `cacheDir` if no vault has been opened |

Create and unlock authenticate the vault; mount is a separate request. The desktop opens `driveLetter + "\\"` through Explorer after mounting.

The vault dialog also offers a drive name, the volume label that File Explorer shows next to the drive letter. It defaults to `Material Files`, must be 1 to 32 characters after trimming (the NTFS and WinFsp volume label limit), and cannot contain control characters or any of `\ / : * ? " < > |`. The field validates inline and blocks submit until the name is valid. The optional `driveName` request field is checked again by the main process and by the native controller, which falls back to `Material Files` when it is absent. The last used name is stored in the local preferences file beside the drive letter and fills the field the next time the dialog opens. The name is applied when the drive mounts, so changing it for an already mounted drive requires locking and unlocking it.

Status contains `locked`, `mounted`, `unmountBusy`, `unmountHolders`, `driveLetter`, `driveName`, `storageDir`, `cacheDir`, `files`, `partSizeBytes`, `sync`, `driver`, `autoUnlock`, `availableDriveLetters`, and `lastOfflineRelease`. A successful offline release records its virtual `path` and actual `bytesFreed`; zero means no eligible local ciphertext was removed. Targeted eviction retains dirty, pending, pinned, open, and shared content, and verifies the source copy before deletion. Each file reports `id`, virtual `path`, logical `size`, `modified`, actual encrypted `partCount`, its `partSizeBytes`, and `offline`. Part size includes authenticated-record overhead; encrypted parts do not exceed their cap.

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
