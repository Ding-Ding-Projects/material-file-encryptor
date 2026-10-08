# Material File Encryptor

A Windows Explorer drive that encrypts files into a folder managed by OneDrive, Google Drive, or any other folder-sync client. Open and edit files normally; keep selected files available offline in an encrypted local cache.

**Development status:** the native engine and desktop interface are implemented. Thirteen native storage checks and twelve desktop/site checks pass locally; actual Windows mounting and installer verification are pending. The diagrams describe the architecture and are separate from real application captures. No installer is published yet.

[Project goal](GOAL.md) · [Interface design](DESIGN.md) · [Source](https://github.com/Ding-Ding-Projects/material-file-encryptor) · [Planned documentation site](https://ding-ding-projects.github.io/material-file-encryptor/)

## How it works

![Planned architecture: Explorer accesses a mounted WinFsp virtual drive, which encrypts files and metadata in the selected sync folder and maintains an encrypted offline cache. Password or key file unlocks the drive.](docs/images/drive-workflow.png)

The mounted drive returns authenticated, decrypted bytes when applications read files. New and edited files become encrypted records and parts in the selected backing folder. Your existing cloud client transfers those encrypted objects between devices.

<details>
<summary>Access, offline use, startup, and split sizes</summary>

![Planned lifecycle: writes use an encrypted journal; reads decrypt on access; offline pins retain ciphertext; Windows startup supports manual or protected automatic unlock; new split sizes affect future writes with a separate re-split action.](docs/images/offline-workflow.png)

- Unlock with a password or key file. Optional automatic unlock protects the remembered vault key for the current Windows user.
- Start the app with Windows; choose whether to unlock automatically.
- Keep offline downloads and pins encrypted data. Files still decrypt through the mounted drive when accessed.
- Choose a maximum encrypted part size using a value textbox and KB, MB, or GB. Cryptographic framing counts toward the limit. New and edited files use the selected limit; **Re-split existing files** is a separate operation.
- Keep credentials and their backups outside encrypted storage and the cache. Losing all unlock credentials loses access.
- Copying a file outside the mounted drive intentionally creates a plaintext copy. Applications and Windows may create their own temporary files, thumbnails, or paging data.

</details>

<details>
<summary>Build and verification status</summary>

Windows 10/11 x64 is the delivery target. Explorer integration requires the genuine WinFsp filesystem driver. From a fresh Windows checkout, build and start the app with:

```powershell
cmd /c "build.bat /s && out\material-file-encryptor-win32-x64\MaterialFileEncryptor.exe"
```

The build obtains verified user-scoped Node and .NET tools, the pinned browser used by UI tests, and the signed WinFsp installer. If the driver is missing, **Install WinFsp** opens the bundled installer with its normal Windows elevation flow. Reopen the app after driver installation. `build-installer.bat /s` produces a genuine unsigned Squirrel.Windows installer; Windows publisher warnings are expected for the app installer.

Local verification covers the encrypted engine, range I/O, recovery, conflicts, offline pins, part limits, desktop bridge and renderer interactions. Real Electron captures on Linux verify interface behavior and isolation; they do not prove Windows Explorer mounting. Windows CI exercises a real drive through ordinary file operations and produces separate evidence.

</details>
