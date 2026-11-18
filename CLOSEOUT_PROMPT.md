# Split storage and Docker Hub drives continuation

## Landed and verified

- Pull request #22 merged into `main` as `c634a1236a2a242cb7f425f316e77d570585f94d`:
  - split storage with Safety backup (on by default) and mirrors;
  - folder-free Docker Hub drives (create and open) with a rich repository picker;
  - Docker Hub backup fixes:
    - several drives per repository;
    - clearer errors;
    - a lease retry so the one-click backup no longer races the open window;
    - the device code shown again with Docker CLI 29;
    - picker rescans after publishing.
- Normal release `v1.898.1` targets `c634a123` (not a draft, not a prerelease). It carries Setup.exe, the full nupkg, RELEASES and build provenance.
- End-to-end tests against real Docker Hub, run on the packaged app:
  - **Scripted:** create, write a text file, back up, delete local storage and cache, restore, unlock, read the file back intact.
  - **Through the UI, every step captured:** Docker Hub drive created with no folder choice, first sync, write, back up, lock, delete the local copy, open from Docker Hub without pressing Refresh, restore, unlock, read back intact.
  - **One-click backup through the UI:** completed and verified.

## Incomplete work

- Split storage moves to real removable drives and to Docker Hub have not been run from the packaged app. Mirror updates in the packaged app are unproven too.
- The installed app on this computer has not been updated to `v1.898.1`.
- The publication-language check is still paused as a release prerequisite. It restores once its protected exception data is refreshed.
- The test runs left several test drives (ciphertext only) in the public test repositories `transitdc/material-file-encryptor-storage` and `transitdc/mfe-material-files`. Delete them only if the owner asks.
- Cosmetic: the info icons beside Cancel and Create stay, because a guard requires them.

## Next actions

1. Update the installed app to the newest accepted release through its updater and verify the installed version.
2. Run split storage with a real second disk and a Docker Hub location from the packaged app, including Safety backup hold and retry.
3. Refresh the protected publication data, then restore the publication check as a release prerequisite.
