# Material File Encryptor

A Windows Explorer drive that encrypts files into a folder managed by OneDrive, Google Drive, or any other folder-sync client. Open and edit files normally; keep selected files available offline in an encrypted local cache.

**Development status:** the native drive and desktop interface are being implemented. The diagrams below describe the agreed architecture, not a verified release. No installer is published yet.

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

Windows is the delivery target. Explorer integration requires the genuine WinFsp filesystem driver. Build scripts, native tests, installer packaging, and screenshot capture are in development. This README will record actual results and real captures when they are available; a Linux renderer check will not be presented as Windows Explorer verification.

</details>
