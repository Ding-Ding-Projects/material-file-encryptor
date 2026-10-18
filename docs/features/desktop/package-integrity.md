# Package integrity and local installer verification

## Private packaging boundaries

Forge excludes `.agent` as a complete, case-insensitive directory segment at any depth. Similar names such as `.agent-helper` remain eligible. This protects local task material even when the source directory contains ignored files, since Git ignore rules do not define the packager's input policy.

The Forge `postPackage` hook and the production build both require `scripts/package-privacy.mjs` to accept the produced application directory before installation packaging proceeds. The inspector walks external resources and the real `resources/app.asar` entry inventory, rejects `.agent` entries and links, and reads every archived file to reject missing or truncated data. Each packed or unpacked file must also carry supported SHA-256 integrity metadata: its content hash, positive safe-integer block size, exact block count and every block hash must match the extracted bytes. Missing, malformed or inconsistent metadata and same-length content corruption fail closed. Unpacked files receive an independent file-type and length check, including empty entries that the archive reader otherwise returns without reading their loose file. Missing, empty or unreadable output fails closed. Archive caches are discarded before inspection, so replacing an archive cannot reuse an earlier verdict.

These embedded hashes detect inconsistency with the archive header; they do not authenticate the publisher or protect against replacement of both content and metadata. The accepted archive SHA-256 fingerprints the inspected archive. Downloaded package provenance, installer extraction and actual runtime behavior retain their separate verification requirements.

Diagnostics contain only neutral result codes, entry/rejection counts and the accepted archive SHA-256. Rejected entry names, file contents, archive metadata and underlying exception messages are never printed. This is a directory-boundary protection, not a general-purpose secret detector: confidential material must still remain outside approved package inputs.

Run `node --test test/package-privacy.test.js` for the focused regression. Eight tests use harmless synthetic files to cover exclusion removal, actual private-entry rejection, restored acceptance, external-resource rejection, packed and unpacked same-length corruption, empty and multiblock content, missing or malformed integrity metadata, and production-hook propagation. The four added integrity tests failed against the previous length-only inspector and pass with hash validation. No private source material is used. Production output and installer verification remain separate required evidence.

`build-installer.bat /s` bootstraps official 7-Zip 26.04 from the upstream release, verifies the archive, extraction helper and x64 standalone executable against `dependencies.json`, and stages the existing Squirrel.Windows vendor distribution. The supported `vendorDirectory` option selects that distribution with its legacy ZIP writer replaced by the verified standalone writer. Squirrel's updater and setup components remain unchanged and unsigned.

After production, `scripts/package-integrity.ps1` runs the pinned reader's archive test over every full and delta `.nupkg`. It verifies decompression and stored CRC for every entry, including entries outside the runtime comparison manifest. Failure prevents successful packaging and preview publication. The receipt records the reader digest, source commit and each package's digest, size, entry count and exit result. Selected runtime hashes and `RELEASES` hashes remain separate checks.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-package-integrity.ps1` for the focused regression. A valid archive passes; corruption in an otherwise unselected entry must fail. The test removes only its exact synthetic files.

Local installer verification requires `MFE_LOWLEVEL_CLI` pointing to the installed cheap hidden-desktop tool and its installed lifecycle helper. `windows-installer-check.ps1 -Local -ExpectedCommit <full-sha>` uses `local-installer-process.py` for Setup and Update. A Python worker launched through Lowlevel inherits the unique hidden desktop, retains the child process handle and records its creation time and exit result. The parent records process identities, waits for their absence, and closes only the empty owned desktop. Timeouts retain evidence and running processes rather than terminating installation.

The installed desktop check uses `local-headless-desktop-check.mjs` and the same independently reviewed capture and mounted-runtime flow as local packaged verification. Interactive pixel review remains required. Installation, startup registration, mounted operation, normal exit and uninstall require their own successful receipt; packaging success proves none of those outcomes. Uninstall records every remaining installation-root entry, including any Squirrel marker or log, instead of claiming the directory disappeared.

### Failed desktop-run recovery

A failed local desktop run first revalidates its saved isolated window and full process ancestry, then attempts the existing `window.drive.verificationQuit()` route on the exact CDP target. Startup restoration and recorded-process absence must both be confirmed. The original run failure remains in its receipt even when recovery succeeds.

Process proofs use complete UTC creation timestamps, executable paths and connected parent identities. Only `PROCESS_NOT_FOUND` establishes absence; query failures, changed identities, invalid ancestry and `IDENTITY_BOUND_TERMINATION_UNAVAILABLE` retain the owned processes and fail recovery. There is no PID-only termination fallback. Older failed receipts remain unchanged and cannot supply a new valid identity proof. Every direct adapter entrypoint returns sanitized JSON on failure, preserving the exact lifecycle code without traceback or private path details. Unproven ancestry stops both quit and cleanup recovery.

Offline regression checks are `node --test test/ui-lifecycle-recovery.test.js test/ui-headless-route.test.js` , `python -B test/test_local_headless_lifecycle_policy.py` and `python -B test/test_local_headless_adapter_errors.py`. They exercise recovery ordering, exact-target binding, stale ancestry, PID reuse and query failures without launching or terminating an application.
### Verified updater-only uninstall residue

The pinned Squirrel updater `2.0.1+eef37460ae` can leave its running root `Update.exe` and the packaged managed `app-<version>/squirrel.exe` after removing the product. Its upstream [full-uninstall path](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/UpdateManager.ApplyReleases.cs) writes a one-space `.dead` marker; [best-effort deletion](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/Utility.cs) swallows removal exceptions. The [managed executable detector](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/SquirrelAwareExecutableDetector.cs) does not dispose its Cecil assembly object. A transient detector handle is a source-supported explanation, not a lock directly measured during the original run.

`squirrel-uninstall-residue.ps1` accepts an absent or empty root, the exact one-space marker, or optional root `Update.exe` and an exact expected-version directory containing only `squirrel.exe`. Both helpers must match the trusted pre-uninstall updater digest and helper residue requires the marker. Any other file, directory, nested content, version, marker bytes, helper digest or reparse path fails. No helper is deleted. The lifecycle still requires updater exit zero, registration and startup absence, and no installed processes. `applicationDirectoriesRemoved` remains false when the helper directory survives; `applicationPayloadRemoved` records the exact classifier verdict and `installRetained` describes product payload retention.

Run `scripts/test-squirrel-uninstall-residue.ps1` for valid and deliberately invalid synthetic cases. `diagnose-uninstall-residue.ps1` separately reclassifies retained residue read-only, binds its report to the original failed lifecycle/process receipts and package hashes, records both original source and current checker revisions, and verifies live registration/startup/process absence. It refuses to overwrite its output. That diagnostic does not rerun installation or rewrite the original failed receipt, and is not evidence of a new complete lifecycle run.

Preview notes link the verified public dim-sum catalog release image. The product release does not attach a copied catalog image. Publication rechecks package integrity before writing its release plan. Existing source-owned image files are retained until separately authorized migration.

## Automatic release publication

Every authorized branch push and manual dispatch builds, packages and publishes one unique normal non-draft release. There is no pull-request trigger, main-only job restriction or dispatch-only publication condition. CI gates publication on isolated native vault-session tests and offline encrypted-image workflow tests with mocked Docker and network operations. Provenance records these completed gates. GUI interactions, installation, updater behavior, real simultaneous mounts and Docker Hub uploads are not verified by these CI gates; installed runtime verification remains pending an independent local receipt.

Manual dispatch may optionally constrain the checkout to an exact source SHA:

```powershell
gh workflow run windows.yml --repo Ding-Ding-Projects/material-file-encryptor --ref main -f source_commit=<expected-full-sha>
```

Omit `source_commit` to publish the selected ref without an additional constraint. Checkout and event SHA must still agree. A mismatched supplied SHA fails with `PUBLICATION_SOURCE_CHANGED`.

The pinned Windows runner invokes `build.bat /s` and `build-installer.bat /s`, bootstraps missing tools, and publishes the unsigned Squirrel setup, full package, RELEASES and build provenance. Delivery tags use `v1.<run_number>.<run_attempt>`, a monotonically increasing numeric sequence distinct from the recorded application/package version; existing tags and releases are never overwritten. Published assets are downloaded and hash-compared. Notes link the workflow run and record UTC first-job start, publication completion and duration. Safe outputs are retained even after a failed build or publication.

## Runner selection

A first `select-runner` job decides at run time where the build job runs. `scripts/select-runner.mjs` reads the self-hosted runner inventory through the REST API: runners registered on the repository, plus runners in organization runner groups that are open to this repository (selected-repository groups are checked for this repository, and groups closed to public repositories are skipped). A runner is chosen only when it is online, idle and carries every required label (`self-hosted`, `Windows`, `X64` by default, overridable with `RUNNER_REQUIRED_LABELS`). Busy, offline and mislabelled runners are skipped. The build job receives the answer through `runs-on: ${{ fromJSON(needs.select-runner.outputs.runner) }}`.

When no runner qualifies, the token cannot read the inventory, or the API fails, the job selects the pinned hosted image `windows-2022` and records why. The token is the first available of `RUNNER_INVENTORY_TOKEN`, `ORG_TOKEN` and the workflow token. Reading repository runners needs administration permission, so the workflow token usually falls back to the hosted image. No build waits on an offline label. The workflow has no pull-request trigger, so a self-hosted runner is reachable only from authorized branch pushes and dispatches.

The decision, reason, required labels and a per-runner table (status, busy flag and why each was skipped) are written to the job summary and kept for 14 days as the `runner-selection-evidence` artifact. This is capacity evidence only. The choice of runner is not a test or verification result, and the promotion job keeps the pinned hosted image. `node --test test/runner-selection.test.js` covers selection, skipping, labels, fallback and the output shape with fixture API responses; it never contacts GitHub.

## PDF debug-map exclusion

Packaging excludes only `.map` files below `node_modules/pdf-lib/`. Executable modules and legal notices remain included, and the source installation keeps the upstream debug maps. Runtime debugging therefore loses those upstream source mappings. This main-baseline adaptation preserves the existing resource list. At `a0239c91d517ca06d9725f36dd76874f5ab33ece`, the exact root build exited 0, all 994 retained PDF files matched source hashes, 560 maps were absent, and five extracted-runtime PDF checks passed. The existing packager omission of `yarn.lock` is separate. Selected ASAR hashes and verification limits are in [the public proof](../../evidence/main-performance-20261012.json). These results do not certify installed or GUI behavior. Package size is separate from application speed.

## Local assistant state exclusion

Local `.claude` and `.codex` directories, including nested worktrees and session state, are excluded from packaging at complete directory boundaries. The package inspector independently rejects them in actual archives and loose resources. Similar public names with suffixes are not excluded. Root-local ignore rules preserve this state outside source tracking; they do not delete another session.

`node --test test/package-privacy.test.js` includes a regression that failed against the previous checker, then verifies packed and loose rejection, restored-package acceptance and precise boundaries. Nine focused checks passed after the repair. A new full package still requires its own production receipt.
