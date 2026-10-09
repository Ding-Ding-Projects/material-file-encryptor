# Active implementation goal

Deliver Material File Encryptor as a real Windows Explorer virtual drive with encrypted backing storage and an encrypted offline cache.

## Acceptance criteria

- [x] Mount a genuine WinFsp drive and support ordinary file create, read, edit, truncate, rename, replacement save, and deletion.
- [x] Authenticate encrypted records before returning plaintext; persist only encrypted backing data, metadata, staging, and cache.
- [x] Recover interrupted writes and preserve concurrent device edits without silently overwriting them.
- [x] Support password or key-file unlock and optional current-user Windows-protected automatic unlock.
- [x] Start with Windows, with a visible setting and a separate automatic-unlock choice.
- [x] Pin encrypted data for offline access and remove pins without losing dirty writes.
- [x] Configure maximum physical encrypted part size with a value textbox and KB/MB/GB; explicitly re-split existing files.
- [x] Deliver a tailored Material Design 3 desktop interface with accessible motion and reduced-motion support.
- [x] Publish a separate GitHub Pages documentation site with truthful downloads, diagrams, and real application captures.
- [x] Verify native behavior on Windows and record unsupported or unverified paths honestly.
- [ ] Complete installed-application and uninstall verification after resolving the missing-registration result.
- [ ] Finish the interactive drive-letter picker and manual-entry fallback, including styling and application checks.
- [x] Preserve frequent source checkpoints and integrate verified work into the default branch.

Windows CI has verified startup registration and its enable/disable setting. A fresh Windows sign-in remains unverified.

Source `c74b3a6`, Windows run `37863451177`, passed 34 real mounted-filesystem checks and the packaged GUI workflow. Setup installed and all 198 selected runtime entries matched, but verification stopped at `INSTALL_REGISTRATION_MISSING`; installed-app and removal checks did not run. The unfinished editable picker is preserved on the task branch at `6379eed` and is not on main.

The task plan is the active tracker. Native app-level goal tooling is unavailable in the current session; no tool-created goal or token budget is claimed.
