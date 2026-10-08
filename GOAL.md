# Active implementation goal

Deliver Material File Encryptor as a real Windows Explorer virtual drive with encrypted backing storage and an encrypted offline cache.

## Acceptance criteria

- [ ] Mount a genuine WinFsp drive and support ordinary file create, read, edit, truncate, rename, replacement save, and deletion.
- [x] Authenticate encrypted records before returning plaintext; persist only encrypted backing data, metadata, staging, and cache.
- [x] Recover interrupted writes and preserve concurrent device edits without silently overwriting them.
- [ ] Support password or key-file unlock and optional current-user Windows-protected automatic unlock.
- [ ] Start with Windows, with a visible setting and a separate automatic-unlock choice.
- [x] Pin encrypted data for offline access and remove pins without losing dirty writes.
- [x] Configure maximum physical encrypted part size with a value textbox and KB/MB/GB; explicitly re-split existing files.
- [x] Deliver a tailored Material Design 3 desktop interface with accessible motion and reduced-motion support.
- [ ] Publish a separate GitHub Pages documentation site with truthful downloads, diagrams, and real application captures.
- [ ] Verify native behavior on Windows and record unsupported or unverified paths honestly.
- [x] Preserve frequent source checkpoints and integrate verified work into the default branch.

The task plan is the active tracker. Native app-level goal tooling is unavailable in the current session; no tool-created goal or token budget is claimed.
