# Mount multiple encrypted vaults

Use **Add vault** beside **Selected vault** to open another vault without locking the first. Choose Create or Unlock, select separate encrypted storage and cache folders, and select an unused drive letter. Switch the selector to manage a different vault. The selector shows each vault's letter and locked, mounted, or recovery state.

The workspace's files, history, transfers, storage maintenance, Lock, and Force lock apply to the selected vault. Existing Explorer mounts and background transfers continue when selection changes. **Lock selected drive** in the tray affects one vault; **Lock all drives** attempts every vault. Quit and update preparation require every vault to confirm a safe lock. A busy drive keeps the application running rather than silently abandoning its mount.

**Remove vault session** is available only after a non-primary vault is locked and its background work has finished. It removes the session from the workspace, not the encrypted files. The primary session cannot be removed. Additional sessions return as locked choices after restarting and must be unlocked explicitly; automatic startup unlock remains limited to the primary vault. Their storage and cache folder choices are retained so unsynchronized encrypted cache data stays discoverable. No passwords, key-file paths or unwrapped keys are saved in session preferences. Invalid settings are preserved rather than silently overwritten; recovery errors keep the original folder choices available for repair.

## Isolation and collisions

Each session has a separate native controller, encryption engine, command queue, key lifetime, filesystem host, cache identity, and transfer registry. Existing authenticated encryption and on-disk formats are unchanged. Native admission rejects duplicate drive letters, overlapping storage/cache folders, folder aliases through links or junctions, folders inside a reserved encrypted drive, and duplicate private-repository identities. Reservations survive busy operations and uncertain failures until native ownership is demonstrably released.

Switching is refused while a foreground operation or file dialog is pending. Browser pairing is revoked on a switch. File selections, history queries, pending confirmations, and credential form values are cleared; delayed requests carry their original session identity and cannot silently target a different vault. Plaintext exports and generated key files cannot be placed inside any active vault's storage, cache, or mounted drive.

Controllers share the native helper process. A fatal helper-process failure therefore affects every mount: all sessions report unverified teardown and require locked recovery. This is not process-level crash isolation. A normal operation or busy-lock failure remains scoped to its session.

## Verification

Offline desktop routing and lifecycle tests exercise independent state, stale request rejection, all-session shutdown attempts, safe removal, and protocol compatibility. Native controller regressions cover simultaneous admission, folder/drive/repository conflicts, per-session locking, late synchronization, and shutdown. CI runs the focused native regression entrypoint on Windows without claiming mounted-driver acceptance.

The opt-in `--multi-mount` controller test passed on Windows at source commit `5b70939d4e916afd02a06d1759e7b64c4a937463`: two real WinFsp drives mounted simultaneously, distinct same-name data remained isolated, a busy lock preserved its session, and locking either drive left the other intact. The test confirmed drive-letter release and removed its disposable storage, cache and history. This does not establish Explorer UI interaction, power-session behavior, or installed renderer acceptance; those remain separate validation tasks.
