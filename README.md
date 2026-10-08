# Material File Encryptor

A Windows Explorer drive that encrypts files into a folder managed by OneDrive, Google Drive, or any other folder-sync client. Open and edit files normally; keep selected files available offline in an encrypted local cache.

**Development status:** seventeen native storage checks and seventeen desktop/site checks pass locally. All 33 real Windows mounted-workflow checks pass, including access from a separate process; packaged desktop and installer verification are pending. The diagrams explain the architecture and are separate from real application captures. No installer is published yet.

[Project goal](GOAL.md) · [Interface design](DESIGN.md) · [Source](https://github.com/Ding-Ding-Projects/material-file-encryptor) · [Documentation site](https://ding-ding-projects.github.io/material-file-encryptor/) · [Windows verification](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/workflows/windows.yml)

## How it works

![Conceptual architecture: Explorer accesses a mounted WinFsp virtual drive, which encrypts files and metadata in the selected sync folder and maintains an encrypted offline cache. Password or key file unlocks the drive.](docs/images/drive-workflow.png)

The mounted drive returns authenticated, decrypted bytes when applications read files. New and edited files become encrypted records and parts in the selected backing folder. Your existing cloud client transfers those encrypted objects between devices.

The documentation site includes an [interactive workflow explanation](https://ding-ding-projects.github.io/material-file-encryptor/#interactive-workflow) with selectable steps, access modes, and encrypted part sizes. Its illustrations explain the design; they are separate from native verification.

<details>
<summary>Real application captures</summary>

These captures show the actual Electron application at source commit `2a9887009f3bb2b64a3e5be37754d1d6612b6fd1`, driven through its sandboxed renderer on an isolated Linux display at 1180 × 850. They verify interface states; native Windows evidence is recorded separately in the linked workflow. [Capture provenance and image hashes](docs/images/captures/provenance.json).

[Watch the real application-window walkthrough](docs/images/captures/desktop-linux.webm) (Linux, 15 fps; interface behavior only).

![Real application: locked drive screen with create and unlock actions, navigation, and an honest unavailable Windows driver state on Linux.](docs/images/captures/desktop-locked.png)

![Real application: create-drive dialog with encrypted storage and cache folders, password or key-file credentials, drive letter, and split-size controls.](docs/images/captures/desktop-create.png)

![Real application: key-file credential segment selected, with tailored lock/key icons and a slim themed scrollbar.](docs/images/captures/desktop-keyfile-choice.png)

![Real application: dark settings screen with appearance, language, message preferences, startup, automatic unlock, and part-size controls.](docs/images/captures/desktop-settings-dark.png)

![Real application: help screen explaining encryption, offline access, and copying plaintext outside the drive.](docs/images/captures/desktop-help.png)

</details>

<details>
<summary>Access, offline use, startup, and split sizes</summary>

![Conceptual lifecycle: writes use an encrypted journal; reads decrypt on access; offline pins retain ciphertext; Windows startup supports manual or protected automatic unlock; new split sizes affect future writes with a separate re-split action.](docs/images/offline-workflow.png)

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
