# Closeout: v2 interface, Docker Hub backup and sharing

## Landed and verified

`main` is at `8a219d8c`. Normal release `v1.936.1` (not a draft, not a prerelease) is built from it, with Setup.exe, the full nupkg, RELEASES and build provenance.

Merged pull requests:

| PR | Change |
|---|---|
| #22 | Split storage with Safety backup and mirrors; folder-free Docker Hub drives with a repository picker; several drives per repository |
| #30 | Share a file through Docker Hub with a receive command; revoke deletes the manifest by digest |
| #31 | Incremental, honest sync that never blocks the drive. Preparation dropped from 263 s to 57 s and temporary disk from 8.9 GB to 35 MB on a 4.4 GB drive. |
| #32 | Version 2 interface (navigation tree, tables, inline unlock, help as tooltips); the personal wording file applies again with whole-word matching |
| #33, #34, #35, #36 | Snapshot retention per drive; automatic backup; one Docker Hub pull per backup; backup page and settings |
| #37 | Quit never hangs during a pending backup; status bar shows backup state; palette entries |
| #38 | 67 inspected README screenshots of the packaged build |
| #40 | Interface fixes from #39, including an inherited-history sync failure for drives created in a reused folder |

Live proofs ran against real Docker Hub in the packaged app:
- create a drive, back up, delete the local copy, restore and read back;
- folder-free Docker Hub drive, created and reopened through the UI;
- share, receive and revoke;
- incremental sync on a 4.4 to 5.8 GB drive;
- automatic backup with pruning.

## Open work

- #41: backup progress jumps from 0 to the total; a redundant hourly schedule is saved under new Docker Hub drives; drives already hit by the history collision are not repaired automatically; three older screenshots need recapturing; the device sign-in code screen is not captured.
- #14, #3, #1: older items, unchanged in this work.
- The publication-language check is still paused as a release prerequisite. It can be restored once its protected exception data is refreshed.
- Background backup while the app is closed is not built; it needs a scheduled-task decision.
- New requirement, not started: while a newer build is being made but not yet published, the app shows "Update coming soon" with real build progress (build number, each stage and its state, start time, elapsed time, a labelled estimate, and what the build contains). It never installs anything or invents progress, and it becomes the normal update offer once the release is verified.

## Next actions

1. Fix #41, starting with upload byte progress.
2. Refresh the protected publication data, then restore the publication check as a release prerequisite.
3. Decide on background backup while the app is closed.
