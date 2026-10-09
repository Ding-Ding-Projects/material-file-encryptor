# Preview implementation handoff

The first preview integration implements fixed encrypted chunks, real Git history, selectable folder/private GitHub transport, History and Recycle Bin. Production delivery is restricted to main. Recovery branches are published separately and are not release acceptance.

Verified milestones: 31 core checks, seven controller groups, 39 transport checks, ten live checks against a private synthetic GitHub fixture, and 32 non-browser JavaScript checks with one platform-specific skip. The controller regressions include callback-safe hydration and replacement saves after a chunk-cap change. The production package passed at f3c6eddcb69fafbd347948d57387b20702b2eaa8; newer source requires a rebuilt candidate. Squirrel setup from the earlier a265 candidate is diagnostic only.

A current-account hidden desktop exercised actual packaged navigation, themes, languages and locked History/Recycle Bin. Its assertions passed, but lifecycle cleanup reported failure after the desktop disappeared; the original receipt remains failed. The next runner records full process identities before teardown. No passing installed-runtime claim exists.

WinFsp was installed through native elevation with exit 0 and its registration read back. All 37 mounted self-tests passed at a265d860907013d3216b8768dfee64acac457112, including the exact 90,000,000/90,000,001 boundary and history-preserving recycling. Later hydration changes need final mounted verification.

The f3c6 hidden-desktop run verified native Tab focus and historical content restoration, then timed out while waiting for the background synchronization banner during Bin restoration. Owned processes and the hidden desktop were confirmed absent, and its synthetic credential was retired. Local mutation completion and background transfer completion now have separate assertions. A bounded hidden-native replay verified version/Bin restored bytes; final background history completion remains under investigation.

Current-account diagnostic setup created matching uninstall registration in both registry views, so the earlier CI registration failure has not reproduced here. Setup exit status and full package integrity remain unverified. The diagnostic installation remains task-owned and retained while a reported package-entry CRC mismatch is investigated. Do not overwrite it or claim installer acceptance.

Folder recovery uses a conservative explicit-selection interface: candidate deleted descendants carry opaque identifiers, users choose which to restore, and older independent deletions remain untouched unless selected. Exact known recursive deletion batches remain recoverable together.

Next: finish synchronization and package-integrity diagnostics; rebuild the exact candidate after all diagnostic processes release its runtime; run final mounted and hidden-desktop checks including explicit descendant selection; verify installer lifecycle using actual completion evidence; publish and independently download/hash/verify the release; refresh final captures and delivery receipts; integrate into main and verify remote refs. Preserve original vaults, existing installations and credentials. No host power or login action is authorized.

Task: https://github.com/Ding-Ding-Projects/material-file-encryptor/issues/1
Progress: https://github.com/Ding-Ding-Projects/material-file-encryptor/discussions/2
GitHub Projects is unavailable with the current read:project scope. Historical Windows evidence remains bound to c74b3a6828e3d1893015598f2df1c9bd4ce84c32 and its INSTALL_REGISTRATION_MISSING result.
