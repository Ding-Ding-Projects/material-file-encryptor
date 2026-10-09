# Integration recovery handoff

Objective: deliver the first installable encrypted-drive preview with chunked storage, actual Git history, selectable transports, History and Recycle Bin.

Current owner branch: codex/encryptor-integration. Baseline: 928ea6feb43e7acc245e1c33b423991376fd4341. The branch contains the storage/history, transport, interface and release work. It is an unfinished recovery checkpoint, not an accepted preview. Main publication remains pending.

Implemented source includes fixed-size ciphertext chunks, version and deletion records, lazy transport plumbing, History/Recycle Bin interface, desktop bridge operations, and copy-upgrade integration. The host wiring and combined package have not yet passed a production build. Two reviewed deletion-generation/atomic-restore cases are being repaired in the storage branch. Current transport checks passed 28 cases. Final full core and interface checks remain pending.

Next steps: incorporate storage fixes and main-only release protection; build using build.bat and build-installer.bat; run local tests and isolated current-account hidden-desktop checks; diagnose actual installer registration; publish and independently download/hash/test the installer; update evidence and documentation; integrate verified work into main and verify remote refs. Preserve all original vaults, existing installations and credentials. Do not automate host power/login actions.

Task record: https://github.com/Ding-Ding-Projects/material-file-encryptor/issues/1
Progress: https://github.com/Ding-Ding-Projects/material-file-encryptor/discussions/2

No installer runtime, release publication or cleanup completion is claimed. GitHub Projects is unavailable because the credential lacks read:project. No unrelated backlog is adopted.