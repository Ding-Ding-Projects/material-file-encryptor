# Docker Hub drives without choosing a folder

A Docker Hub drive keeps its encrypted files in a folder the app creates for you and backs them up to a Docker Hub repository. You never choose a storage or cache folder. Both flows start from the same repository picker.

- **Create a drive** asks whether the drive lives **On this computer** (the original flow, unchanged) or on **Docker Hub**.
- **Open a drive from Docker Hub** finds drives this app has already backed up, restores the one you pick, then unlocks it.

Both are also in the command palette as **New Docker Hub drive** and **Open a drive from Docker Hub**, so the New tab catalog lists them. The create and unlock dialogs carry a **Use Docker Hub, no folders** or **Open from Docker Hub** button.

## Create a Docker Hub drive

1. Choose **Create a drive**, then **Docker Hub**. No folder picker appears.
2. Sign in to Docker Hub if you are not already. The guided sign-in shows a one-time code and opens the official page. Your password is only typed on `login.docker.com`, and the code is never saved.
3. Pick a repository from the picker. The account's own `material-file-encryptor-storage` is proposed first, and the picker says when it already holds drives. A missing repository is created as a public repository.
4. Enter a drive name, a drive letter and a password, or choose a key file. The dialog repeats the public warning: anyone can download the encrypted files, and `vault.json` allows offline password guessing, so use a long passphrase or a key file.
5. Choose **Create drive**. The steps run in order and each one is shown: creating the folders, creating and mounting the drive, preparing the repository, saving the destination with an hourly schedule, and the first encrypted sync. The background task stays off until you turn it on.

If the drive itself cannot be created, the unused folders are removed and nothing is kept. If a later step fails, the drive stays mounted, the dialog names the reason and **Retry** repeats only the failed step.

## Open a drive from Docker Hub

1. Choose **Open a drive from Docker Hub**, or **Open from Docker Hub** in the unlock dialog.
2. Pick a drive. Each drive found in your repositories is a card; one click picks it together with its latest snapshot.
3. Review the snapshot list. The latest one is already selected, and restoring never changes Docker Hub.
4. Choose **Restore**. The snapshot is downloaded, every part is verified, and `vault.json` is written last. It is restored into a new folder in the app's own data area. **Advanced: choose folder** uses the native folder chooser instead.
5. Enter the password or key file and choose **Unlock and mount**. The repository is linked to the drive with the schedule switched off.

## The repository picker

- **Search** with the shared search control, which has its own regex builder beside it. Repository names, drive names and drive ids are searched.
- **Filters**: All, Has drives, Empty, Public and Private, each with a count.
- **Each row** shows the repository name, a public or private label, when it was last pushed, its size when Docker Hub reports one, and how many drives were found.
- **Drive cards** under a repository show the drive name when the snapshot carries one, a short drive id, the last backup time, the number of snapshots and the size.
- **Keyboard**: arrow keys, Home and End move through repository names and drive cards.
- **Progress**: results appear while the scan runs, **Refresh** scans again, and a repository that cannot be read shows its own message without blocking the list.

The list covers your account and the organizations Docker Hub lets you read. If organizations cannot be listed, the picker says so and shows only your account.

## How drives are detected

The app reads the repository's tags and groups the snapshot tags (`mfe-<device id>-<revision>`) by device. The newest snapshot of each device is fetched and verified, and its authenticated configuration names the drive. The scan is bounded in pages, repositories, tags, devices, concurrency and time, and finished results are kept for the session. New snapshots also carry the drive name as the optional manifest annotation `io.material-file-encryptor.drive-name`. The name is user text: anyone who can read a public repository can read it, so keep anything private out of it.

## Where the files live

The local encrypted copy sits in a per-drive folder below the application data area, in `Drives\<drive id>\storage` and `Drives\<drive id>\cache`. It is a cache plus local storage, and only ciphertext leaves the computer. **Show folder** opens it. Each folder is created fresh, never reused, never behind a link, and restricted to your account where the platform allows it. The same destination rules as every other folder apply.

## Failure modes

- **Signed out or offline**: the picker says which and offers the guided sign-in.
- **Repository the account may not create or write**: the dialog names the reason before anything else changes.
- **Interrupted or failed restore**: everything the restore created is removed, so no half-restored drive is left behind.
- **Wrong password at unlock**: the restored folder is kept and only the unlock is retried.

## Verification

The host side, the picker and both flows have source tests with a fake registry. Real Docker Hub listing, upload and restore are not covered by source tests and remain unverified until run against a real account.
