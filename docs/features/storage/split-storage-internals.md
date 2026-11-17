# Split storage internals

Developer notes for split storage and mirrors. The user guide is a separate article. Every location holds
only ciphertext: the same `parts/<id>.mfe` bytes the main storage folder already holds.

## Files

- `<storage>/placement.json` is the manifest. It records the settings (`enabled`, `copies`, `safetyBackup`,
  `locations`, `rules`), the verified holders of each part that is not only in the main folder (`parts`),
  part sizes and SHA-256 hashes, path-rule pins, registry layer references, mirror state and the last job.
  The desktop process is the only writer and always writes it atomically (temporary file, fsync, rename).
  A part missing from `parts` lives only in the main folder. Labels are user text and are visible to
  anyone who can read the storage folder.
- Share folders: `<folder>/MaterialFileEncryptor-Split/<vaultId>/parts/`, plus a copy of `placement.json`.
- Mirror folders: `<folder>/MaterialFileEncryptor-Mirror/<vaultId>/`, laid out exactly like a storage
  folder (`vault.json`, `parts/`, `commits/`, `activity/`), so it can be opened as an existing drive.
- Registry shares publish parts as layers of the registry backup snapshot format; `registryObjects`
  maps each part to the manifest digest that holds it. Registry mirrors publish one complete snapshot.

## Read path (native)

`native/MaterialFileEncryptor.Core/SplitPlacement.cs` parses the manifest (bounded, strict, rejects a
different vault id and folders that overlap the main folder). `VaultEngine.Placement.cs` integrates it:

- A part missing from the cache and the main folder is copied from a connected share folder or folder
  mirror into a temporary cache file, authenticated with the vault key, then moved into place.
- A registry-held part needs the desktop process. The engine raises the existing
  `VaultHydrationRequiredException` under the namespace lock; preparation outside the lock calls
  `FetchPlacedPartAsync`, which the host implements in `PartHydrationBridge.cs` as the `hydratePart` pipe
  event. The desktop process answers with the `hydratePartResult` command. Timeout five minutes,
  cancellable (`hydratePartCancel`), one registry fetch at a time. Fetched bytes are authenticated before use.
- When no copy is reachable the engine throws `SplitLocationUnavailableException`, whose message names the
  location ("This file is stored on USB backup (E:), which is not connected."). The host passes that message
  through unchanged.
- Recorded share copies count as available for metadata, so files stay visible while a location is
  unplugged. Publication never copies a placed part back into the main folder. Cache eviction removes a
  cached part only when the main copy or a connected folder copy authenticates first.
- Planning commands: `splitStorageInventory` (parts, sizes and rule pins; rules are globs where `**`
  crosses folders) and `splitStorageAffected` (current files that need disconnected locations, first 50 paths).
  Both need an unlocked drive.

## Moves (desktop process)

`src/main/split-storage/`: `config.js` (validation, manifest IO), `planner.js` (pure weighted rendezvous
hashing with copies, caps and pins), `folder-location.js`, `registry-location.js`, `mover.js`, `mirror.js`,
`service.js` and `ipc.js`.

- Moves run only while the drive is locked, inside the native `beginSnapshot` lease in locked-folder mode
  (`storageOnly: true`). A staged lease means the drive is open, so the job stops and releases it.
- Order per part: read a source copy (rejecting one whose hash differs from the recorded hash), write the
  target durably, re-read and compare SHA-256, record the holder. Removal happens only after the manifest
  stops listing the old copy; a failed manifest write keeps the old holders in memory and on disk.
- Safety backup (default on, including manifests that predate it): copy every part, then re-verify every
  target copy, and only then release main copies, re-verifying each target again just before release.
  Any failure, disconnect or cancel before release leaves every main copy in place and reports
  `safetyHeld` with `safetyHeldReason`. A retry skips copies already recorded.
- Room on each target is checked before copying. Disconnected locations are never written to or deleted
  from. Bring everything back is the same job with every target set to the main location.

## Mirrors

Update order: list metadata first, copy and verify missing parts, then `commits/` and `activity/`, then
`vault.json` last, then prune parts no location references. If any part cannot be copied the metadata
step is skipped, so the previous mirror stays consistent. Mirrors update after a successful apply, two
minutes after the last drive activity, and on demand; never during a move. Mirrors work with splitting off.
Same-disk folders are allowed and reported with `sameDisk: true`.

## Limits and open items

- A locked-folder Docker image or registry backup of a split drive is refused while parts live elsewhere;
  unlock the drive (the staged snapshot hydrates them) or bring everything back first.
- Registry layers are immutable; removing a part from a registry share only drops it from the manifest.
- Removable drive detection is a heuristic (any drive other than the system and main drives).
- Not yet proven in the packaged app or against a live registry.
