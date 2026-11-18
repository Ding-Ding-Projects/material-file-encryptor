# Automatic Docker Hub backup and snapshot retention

Once you are signed in to Docker Hub and have read the public repository notice once, every drive backs up on its own. You do not pick repository names or schedules, and old snapshots are removed so a repository never fills up.

## Turn it on

1. Open **Docker Hub backup** and sign in.
2. Read the notice: backups go to a **public** repository. Only encrypted data is uploaded, but anyone can see that the repository exists, how many drives and snapshots it holds, their sizes, backup times and drive labels. File names and contents are never visible.
3. Choose **Turn on automatic backup**.

Nothing is uploaded automatically before step 3. To keep one drive on this PC only, turn off its switch in the drive table or choose **Stop backing up** in its row menu.

## When a drive backs up

- **After changes:** about 1 minute after the drive goes quiet. Each new change restarts the wait.
- **Periodic check:** every hour, which also catches anything missed, such as changes made while offline.
- **On lock:** a drive with changes waiting backs up when it locks.
- **On app close:** drives with changes waiting get up to 2 minutes to back up; anything still running then is cancelled and runs at the next start.
- **On reconnect:** drives that were waiting for the network back up as soon as it returns.

One drive backs up at a time. Using the drive always comes first: a running backup pauses at a safe point and resumes on its own. After a failure the app retries after 1, 5 and 15 minutes, then every hour.

**Back up while the app is closed** needs a Windows scheduled task and is off. It is shown in Settings but cannot be turned on yet.

## Where backups go

New drives go to one shared repository, `<account>/material-file-encryptor-storage`, created as public if it does not exist. Several drives share it safely: each snapshot names its drive's vault id, tags are `mfe-<device id>-<random>`, and encrypted layers are content addressed. **Settings > Backup > Repository layout** can switch new drives to one repository per drive, and **Move to its own repository** in a row menu moves one drive. Snapshots already in the old repository stay there.

A drive that already backs up to a repository you chose keeps it. A drive set up with a private repository is not backed up automatically; its own schedule still works.

## Keep snapshots for each drive

After every verified backup, the drive keeps:

- the latest **10** snapshots,
- one per day for **7** days that have snapshots,
- one per week for **8** weeks that have snapshots,

so at most **25** per drive. Change the three numbers in **Settings > Backup**. **Prune old snapshots now** in a row menu applies them without a new backup.

Pruning is deliberately narrow:

- Only snapshots **this PC** published **for this drive** are candidates. Other drives in the same repository, and this drive's snapshots from other computers, are never touched.
- The newest verified snapshot is always kept, and so is any snapshot a restore on this PC is reading.
- Each snapshot is removed by manifest digest with a delete-scoped Docker Hub token. The app then checks that both the digest and the tag answer "not found"; a tag that stays behind is removed through the Docker Hub API and checked again.
- A removal that cannot be confirmed never fails the backup. It is counted, shown on the page, and tried again after the next backup.
- Encrypted layers are left to Docker Hub; layers shared with other snapshots or drives stay usable.

Snapshots made before this update carry no creation time. The app dates them from the Docker Hub tag list; if that is unavailable they count as the oldest and are kept only by the "latest" rule.

## The 1,000 tag limit

The app reads at most 1,000 snapshot tags per repository, shared by every drive in it. Each repository row shows **N of 1,000 tags**. From 800 it turns amber and offers **Move drives to their own repositories**.

## What the page shows

- A summary line: backed up some minutes ago, backing up with a percentage, waiting for connection, or needs attention.
- The drive table grouped by repository: visibility, drive count and the tag meter, then each drive with its last backup, snapshot count, state and switch.
- The row menu: Back up now, Restore…, Prune old snapshots now, Move to its own repository, Stop or Start backing up, Open this drive.

## Verification state

- Unit and service tests cover retention selection, drive isolation, failure safety, retry timing, triggers and request validation.
- Pruning was run against real Docker Hub through the production sync service and transport with two synthetic drives in one repository: only the first drive's old snapshots were removed, the second drive's stayed, the deleted digest answered "not found", and the newest snapshot restored with its data intact.
- Not yet proven: a drive from another computer shown read-only in the table, renaming a drive label, removing all of a drive's backups from the row menu, a size column, and background backup while the app is closed. See ROADMAP.md.
