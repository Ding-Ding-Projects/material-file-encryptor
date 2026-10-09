# Material File Encryptor

A Windows Explorer drive with encrypted fixed-size content blobs, recoverable history, and a Recycle Bin. Choose a synchronized folder or a private GitHub repository for transfer. Keep selected files available offline in an encrypted local cache.

**Development status:** packaged source `1e16dea8` passed 70 actual Windows GUI checks with all 73 captures inspected, including create/unlock dialogs, drive-letter selection, mounted-byte persistence, History and Recycle Bin recovery. The same source passed 39 JavaScript checks (one platform-specific skip), 34 core checks, eight controller groups and full 739-entry Squirrel package integrity verification. Earlier source-bound evidence includes 39 actual mounted-drive checks and ten live private transport checks. The integrated test-only transport fixture repair passed 42 checks at `d0c5e036`; the native source matches the integration tree. Setup, 573-entry installed-payload comparison and registration checks passed; installed application execution passed 70 checks with 72 inspected captures. Uninstall returned zero but its directory-presence check rejected updater-only residue; a separate read-only classification now verifies those exact updater hashes while preserving the original failed receipt. Release publication, independent release download verification and final delivery remain pending. [Exact source revisions and evidence boundaries](docs/features/release/preview-verification.md) · [Sanitized verification summary](docs/images/captures/preview/verification-summary.json). Historical captures below retain their earlier source boundaries.

[Project goal](GOAL.md) · [Interface design](DESIGN.md) · [Source](https://github.com/Ding-Ding-Projects/material-file-encryptor) · [Documentation site](https://ding-ding-projects.github.io/material-file-encryptor/) · [Windows verification](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/workflows/windows.yml)

## History and recovery

Format 2 keeps separate ciphertext-addressed chunks and encrypted snapshot metadata in real Git history. Versions are saved after 30 seconds without writes to a file, or with **Save version now**. Retention defaults to forever; the restore-list period does not erase history. Deleted files remain recoverable from the Recycle Bin, and emptying it preserves historical recovery without promising reclaimed space. Existing vaults require an explicit verified copy upgrade. [Storage and recovery guide](docs/features/storage/history-and-recycle-bin.md) · [Transport details](docs/features/storage/git-transport.md).

## Verified preview captures

These four original captures come from packaged source `1e16dea8edb66ea5e6cf31009b0dbcc953f18d74`, at 1180 × 752 and 150% scale on 2026-10-09 UTC. The actual drive workflow passed 70 recorded checks and all 73 captures were inspected. Create/unlock controls, mounted bytes, history recovery, explicit descendants, offline pinning and startup restoration were exercised. Path-bearing captures remain private. Installation and release download checks are reported separately. [Capture inventory and hashes](docs/images/captures/preview/inventory.json).

![Actual packaged History view with a retained synthetic file version and restore action.](docs/images/captures/preview/history-preview.png)

![Actual packaged Recycle Bin with a recoverable synthetic file and an unbroken selection heading.](docs/images/captures/preview/recycle-preview.png)

![Actual packaged descendant chooser keeps independently deleted children unchecked.](docs/images/captures/preview/descendant-preview.png)

![Actual packaged dark settings after selecting the appearance control.](docs/images/captures/preview/dark-settings-preview.png)

## How it works

![Conceptual architecture: Explorer accesses a mounted WinFsp virtual drive, which encrypts files and metadata in the selected sync folder and maintains an encrypted offline cache. Password or key file unlocks the drive.](docs/images/drive-workflow.png)

The mounted drive returns authenticated, decrypted bytes when applications read files. New and edited files become encrypted records and parts in the selected backing folder. Your existing cloud client transfers those encrypted objects between devices.

The documentation site includes an [interactive workflow explanation](https://ding-ding-projects.github.io/material-file-encryptor/#interactive-workflow) with selectable steps, access modes, and encrypted part sizes. Its illustrations explain the design; they are separate from native verification.

<details>
<summary>Real Linux application captures</summary>

These captures show the actual Electron application at source commit `2a9887009f3bb2b64a3e5be37754d1d6612b6fd1`, driven through its sandboxed renderer on an isolated Linux display at 1180 × 850. They verify interface states; native Windows evidence is recorded separately in the linked workflow. [Capture provenance and image hashes](docs/images/captures/provenance.json).

[Watch the real application-window walkthrough](docs/images/captures/desktop-linux.webm) (Linux, 15 fps; interface behavior only).

![Real application: locked drive screen with create and unlock actions, navigation, and an honest unavailable Windows driver state on Linux.](docs/images/captures/desktop-locked.png)

![Real application: create-drive dialog with encrypted storage and cache folders, password or key-file credentials, drive letter, and split-size controls.](docs/images/captures/desktop-create.png)

![Real application: key-file credential segment selected, with tailored lock/key icons and a slim themed scrollbar.](docs/images/captures/desktop-keyfile-choice.png)

![Real application: dark settings screen with appearance, language, message preferences, startup, automatic unlock, and part-size controls.](docs/images/captures/desktop-settings-dark.png)

![Real application: help screen explaining encryption, offline access, and copying plaintext outside the drive.](docs/images/captures/desktop-help.png)

</details>

<details>
<summary>Real Windows application captures</summary>

These seven original viewport captures show the actual packaged Electron application at source `c74b3a6828e3d1893015598f2df1c9bd4ce84c32` on a disposable Windows Server 2022 runner. Ordinary mounted file access, encrypted offline pinning, startup registration toggles and graceful locking passed. They do not prove the later installed-app or uninstall checks. Per-image capture timestamps were not recorded. [Provenance and original receipts](docs/images/captures/windows/provenance.json) · [Windows run](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/37863451177).

The Windows recording is withheld because it briefly displays a machine-profile path. The original CI recording is retained without masking or editing.

![Actual Windows application: locked drive and custom navigation.](docs/images/captures/windows/desktop-locked.png)

![Actual Windows application: create-drive dialog, manual folder fields and password credential segment.](docs/images/captures/windows/desktop-create.png)

![Actual Windows application: custom key-file credential segment and themed scrollbar.](docs/images/captures/windows/desktop-keyfile-choice.png)

![Actual Windows application: real mounted M drive with a file written and read through ordinary Windows operations.](docs/images/captures/windows/desktop-mounted.png)

![Actual Windows application: the same file pinned in the encrypted offline cache.](docs/images/captures/windows/desktop-offline.png)

![Actual Windows application: dark settings with separate startup and optional automatic-unlock controls.](docs/images/captures/windows/desktop-settings-dark.png)

![Actual Windows application: help explaining the drive, encrypted cache and plaintext export.](docs/images/captures/windows/desktop-help.png)

</details>

<details>
<summary>Access, offline use, startup, and split sizes</summary>

![Conceptual lifecycle: writes use an encrypted journal; reads decrypt on access; offline pins retain ciphertext; Windows startup supports manual or protected automatic unlock; new split sizes affect future writes with a separate re-split action.](docs/images/offline-workflow.png)

- Unlock with a password or key file. Optional automatic unlock protects the remembered vault key for the current Windows user.
- Start the app with Windows; choose whether to unlock automatically.
- Keep offline downloads and pins encrypted data. Files still decrypt through the mounted drive when accessed.
- The default physical encrypted chunk size is 10 MiB. The hard maximum is 90,000,000 bytes including cryptographic framing; the final chunk can be shorter. New and edited files use the selected limit; **Re-split existing files** is a separate operation.
- Keep credentials and their backups outside encrypted storage and the cache. Losing all unlock credentials loses access.
- Copying a file outside the mounted drive intentionally creates a plaintext copy. Applications and Windows may create their own temporary files, thumbnails, or paging data.

</details>

<details>
<summary>Build and verification status</summary>

Windows 10/11 x64 is the delivery target. Explorer integration requires the genuine WinFsp filesystem driver. From a fresh Windows checkout, build and start the app with:

```powershell
cmd /c "build.bat /s && out\material-file-encryptor-win32-x64\MaterialFileEncryptor.exe"
```

The build obtains verified user-scoped Node and .NET tools, portable Git and GitHub CLI distributions, and the signed WinFsp installer. Explicit local verification installs its own browser tools when required; production builds do not run tests or lint. If the driver is missing, **Install WinFsp** opens the bundled installer with its normal Windows elevation flow. Reopen the app after driver installation. `build-installer.bat /s` produces a genuine unsigned Squirrel.Windows installer; Windows publisher warnings are expected for the app installer.

Local verification covers the encrypted engine, range I/O, recovery, conflicts, offline pins, part limits, desktop bridge and renderer interactions. Real Electron captures on Linux verify interface behavior and isolation; they do not prove Windows Explorer mounting. Every authorized branch push and manual dispatch builds, packages and publishes a unique normal non-draft Windows release without tests or lint. Release notes state that runtime verification is pending and include the exact source, workflow run and timing. Mounted-drive and installed-lifecycle verification run explicitly on a local Windows account with isolated fixtures.

</details>
