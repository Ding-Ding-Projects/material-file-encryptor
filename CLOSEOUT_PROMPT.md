# Implementation handoff

The agreed goal is a real Windows Explorer virtual drive using WinFsp, encrypted backing storage in a user-selected synchronized folder, and an encrypted offline cache. Password or key file unlocks the drive. Windows startup is supported; automatic unlock is optional and uses current-user Windows protection. Encrypted part size is a value plus KB/MB/GB, affecting new and edited files; existing files have an explicit re-split action.

Current source is in development. The diagram images are generated planning illustrations. Native behavior, the desktop bridge, installer, startup, documentation site, and real screenshots are being implemented. Do not treat the obsolete plaintext-workspace prototype as the final architecture. No Windows, installer, or release success is claimed at this checkpoint.

Continue native storage, WinFsp integration, desktop interface, and build work in their owned paths. Run meaningful native and desktop checks, collect actual Windows evidence, update the README and goal checklist to factual results, and preserve frequent source checkpoints. Report unavailable verification explicitly.
