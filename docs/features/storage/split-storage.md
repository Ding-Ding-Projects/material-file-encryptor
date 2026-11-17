# Split storage and mirrors

Split storage spreads the encrypted parts of a drive across several places: for example half in the main storage folder, a quarter on a USB drive and a quarter in Docker Hub. Mirrors keep complete, independently openable copies of the whole storage folder. Open **Split storage** from **Local tools**, from the link at the top of **Docker Hub storage**, or by searching for **Mirrors** in the command palette or the New tab catalog.

Every location holds only ciphertext: exactly the bytes already in `parts/`. The unit is one whole encrypted part, so the **Part size** setting in Storage maintenance decides how fine the split can be.

## What stays where

- The **main storage folder** always keeps `vault.json`, `commits/` and `activity/`. Metadata never leaves it for a share location.
- Each share location receives whole parts. Folders are written to `<folder>/MaterialFileEncryptor-Split/<drive id>/parts/`, with a copy of `placement.json` so the folder describes itself. Docker Hub receives its share as its own snapshot tag.
- `placement.json` in the main storage folder lists part ids, sizes, location ids, your labels and the settings. Part ids and sizes are already visible in `parts/`, so it adds no plaintext leakage. **Labels are visible to anyone who can read the storage folder**, so do not put secrets in them.

## Set up a USB share

1. Open **Split storage** and choose **Add a drive or USB location**.
2. Choose **Choose folder…** and pick a folder on the USB drive. A folder inside the main storage folder, the cache folder or the mounted drive letter is refused.
3. Give it a label such as `USB backup (E:)`, then set its **Share weight**. A weight of 1 next to a main weight of 2 gives the USB drive a third of the parts. The percentage next to each location and the bar update as you type.
4. Optionally set a **Capacity cap**. The planner never assigns more than the cap.
5. Choose **Preview**. The plan shows how many parts and bytes would move and which files would be unavailable if one location were disconnected.
6. Choose **Save settings**, then **Apply split**. Nothing moves until you apply.

## Add Docker Hub

Choose **Add Docker Hub** and enter a repository as `owner/name` in lowercase. Sign in on the Docker Hub storage view first. Only ciphertext is uploaded, each part as one content-addressed layer. A public repository is allowed because only ciphertext moves. As the [registry backup article](registry-sync.md) explains, a public repository holding `vault.json` would allow offline password guessing. This feature never uploads `vault.json` to a share location, so a split share does not add that exposure. Mirrors on Docker Hub do contain `vault.json`; use a key file or a long passphrase for those.

## Copies and split

**Copies of each part** decides how many different locations hold each part.

- **1 copy** is a pure split. **Every location that holds a share is needed to open the files stored on it.** If a USB drive is unplugged, the files stored there are unavailable until it is connected again.
- **2 or more copies** store extra copies in different locations. Redundancy costs space: two copies need roughly twice the total space.

## Rules

Rules pin files that match a pattern to one location, for example `Projects/**` to the main folder or `*.mp4` to the USB drive. The first matching rule wins. A part shared by several files follows the first file in path order. Everything unmatched is spread by share. A rule can target a share location, never a mirror.

## Safety backup

**Safety backup: keep everything on the main disk until the split finishes** is on by default, also for a configuration that has no such setting.

With it on, an apply job has phases you can follow in the job progress:

1. **Copying parts:** every part stays in the main folder while its new copies are written, flushed and checked against their SHA-256. Nothing is deleted anywhere.
2. **Verifying copies:** a final pass reads every target copy again.
3. **Releasing space on the main disk:** only if every planned copy verified, the main-disk copies of parts that no longer belong there are removed, each after re-checking that its new copies still exist and verify.

If a copy fails, a location disconnects or you cancel during the first two phases, the release phase never runs. The page then shows **Split not finished, your files are still all on the main disk**, the reason and a **Retry** button. Retrying continues from the copies that already verified. While a job is held, reads prefer the main copy.

Turning Safety backup off asks you to confirm in a dialog. Without it, each part is removed from the main disk as soon as its own new copy verifies, so the main disk no longer holds a full copy during the split. A USB drive that fails midway can then leave files unavailable until it is connected again. Target locations always need room for their full share, which is checked before the copy phase starts.

## What happens when a drive is unplugged

Nothing is deleted anywhere. The location shows **Not connected**, and the files stored only there are listed in the plan as unavailable until you reconnect it. Opening such a file shows a message that names the location, for example "This file is stored on USB backup (E:), which is not connected." Reconnect the drive and open the file again. A disconnected location never causes a removal.

## Mirrors

A **mirror** keeps a complete copy of the drive's encrypted storage folder: every part plus `vault.json`, `commits/` and `activity/`, laid out exactly like a storage folder at `<folder>/MaterialFileEncryptor-Mirror/<drive id>/`. Mirrors do not take part in weights, copies or rules, are not counted as a split copy, and keep working when splitting is turned off.

1. Choose **Add a mirror folder** or **Add a Docker Hub mirror** and pick the destination. A mirror folder may be on the same disk in a different folder.
2. Choose **Save settings**, then **Update mirrors now**.

A mirror on the same disk as the main storage shows this note: "This is on the same disk as your main storage, so it protects against mistakes but not against that disk failing." Use a different disk or Docker Hub to protect against hardware failure.

Each mirror shows its label, path, connected state, when it was last updated, and either **Up to date** or **Out of date since** a time with how many parts and bytes it is behind. Mirrors update after each successful apply, when the drive becomes idle after changes (after a short delay), and when you choose **Update mirrors now**. A disconnected mirror is skipped and catches up when it is connected again. Updates copy and verify new parts first, then metadata with `vault.json` last, then prune parts the drive no longer references, so a mirror never receives a partial metadata state. **Verify** on a mirror re-reads its copies and reports damaged or missing parts.

## Restore from a mirror

If the main disk is lost, open the mirror as a drive on its own:

1. Connect the disk or reach the Docker Hub repository that holds the mirror. For a Docker Hub mirror, restore it first through **Docker Hub storage**.
2. Choose **Open a drive from a mirror…** on this page, or **Unlock existing drive** in the main window.
3. Select the `MaterialFileEncryptor-Mirror/<drive id>` folder as the storage folder and unlock with your usual password or key file.

The mirror is read as a normal storage folder. Choose a new cache folder. Unlocking authenticates the drive key and the encrypted metadata exactly as before.

## Bring everything back

**Bring everything back** moves every part into the main storage folder, using the same verify-then-delete order. It ends the split but keeps your settings and mirrors.

## Security notes

- Only ciphertext leaves the main storage folder. Metadata files never move to a share location.
- Labels and the part ids in `placement.json` are visible to anyone who can read the storage folder.
- A part is removed from a location only after its replacement exists, is flushed to disk and verifies byte for byte. The last verified copy of any part is never deleted, and an interrupted move can be resumed.
- Rebalancing runs only while the engine is idle on the source.

## Verification state

The page is a front end for host methods named `splitStorageStatus`, `saveSplitStorage`, `previewSplitStorage`, `applySplitStorage`, `cancelSplitStorage`, `disableSplitStorage`, `verifySplitStorage`, `updateMirrors` and `verifyMirror`. When a build does not provide them, the page says Split storage is not available in this build and shows no data. Rendering and interaction are covered by `test/split-storage-panel.test.js` against fake status objects. Real transfers to a USB drive or Docker Hub need separate runtime verification on a built and installed application.
