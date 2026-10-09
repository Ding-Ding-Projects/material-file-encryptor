# Active implementation goal

Deliver the first Material File Encryptor preview as a real Windows Explorer virtual drive with fixed encrypted chunks, Git history, folder/private GitHub transport, an encrypted offline cache, and recoverable deletion.

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
- [ ] Complete final built-application verification of the editable drive-letter picker and manual-entry fallback.
- [x] Preserve frequent source checkpoints and integrate verified work into the default branch.

Windows CI has verified startup registration and its enable/disable setting. A fresh Windows sign-in remains unverified.

The editable picker is included in the current integration candidate. Source `216829e1` passed 39 real mounted-filesystem checks after repairing held-deleted-handle restoration and concurrent identity reconciliation. Source `4f0a4b48` passed the integrated JavaScript suite, ten live private transport checks and complete Squirrel package integrity. Final GUI, installed-app, removal and downloaded-release verification remain pending. [Exact verification boundaries](docs/features/release/preview-verification.md).

The roadmap tracks preview delivery. Earlier Windows run `37863451177` remains historical evidence of `INSTALL_REGISTRATION_MISSING`; it is not a verdict about the current candidate.
