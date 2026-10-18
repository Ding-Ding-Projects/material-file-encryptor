# Mount multiple encrypted vaults

Use **Add vault** beside **Selected vault** to open another vault without locking the first. Choose Create or Unlock, select separate encrypted storage and cache folders, and select an unused drive letter. Switch the selector to manage a different vault. The selector shows each vault's letter and locked, mounted, or recovery state.

The workspace's files, history, transfers, storage maintenance, Lock, and Force lock apply to the selected vault. Existing Explorer mounts and background transfers continue when selection changes. **Lock selected drive** in the tray affects one vault; **Lock all drives** attempts every vault. Quit and update preparation require every vault to confirm a safe lock. A busy drive keeps the application running rather than silently abandoning its mount.

**Remove vault session** is available only after a non-primary vault is locked and its background work has finished. It removes the session from the workspace, not the encrypted files. The primary session cannot be removed. Additional sessions must be added and unlocked explicitly after restarting; automatic startup unlock remains limited to the primary vault. No passwords or key-file paths are saved in session preferences.

## Isolation and collisions

Each session has a separate native controller, encryption engine, command queue, key lifetime, filesystem host, cache identity, and transfer registry. Existing authenticated encryption and on-disk formats are unchanged. Native admission rejects duplicate drive letters, overlapping storage/cache folders, folder aliases through links or junctions, folders inside a reserved encrypted drive, and duplicate private-repository identities. Reservations survive busy operations and uncertain failures until native ownership is demonstrably released.

Switching is refused while a foreground operation or file dialog is pending. Browser pairing is revoked on a switch. File selections, history queries, pending confirmations, and credential form values are cleared; delayed requests carry their original session identity and cannot silently target a different vault. Plaintext exports and generated key files cannot be placed inside any active vault's storage, cache, or mounted drive.

Controllers share the native helper process. A fatal helper-process failure therefore affects every mount: all sessions report unverified teardown and require locked recovery. This is not process-level crash isolation. A normal operation or busy-lock failure remains scoped to its session.

## Verification

Offline desktop routing and lifecycle tests exercise independent state, stale request rejection, all-session shutdown attempts, safe removal, and protocol compatibility. Native controller regressions cover simultaneous admission, folder/drive/repository conflicts, per-session locking, late synchronization, and shutdown. CI runs the focused native regression entrypoint on Windows without claiming mounted-driver acceptance.

Actual simultaneous WinFsp mounts, Explorer I/O, busy handles, power-session behavior, and installed UI interaction still require Windows validation. Source tests and compilation alone do not establish those outcomes.
