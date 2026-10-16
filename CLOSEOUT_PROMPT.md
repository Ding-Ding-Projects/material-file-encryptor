````markdown
# Continuation handoff, 2026-10-16

## Objective

Continue until every required feature is implemented and every interface element follows Material Design 3 with transitions and motion. Inventory rows stay "unverified" until each one has real proof from an installed build. Do not upgrade source checks or stubbed runs into installed proof.

## Current main

`main` is at `5ff38608bf39d0747b46c761a2caaf1f475853df` (read back with `git ls-remote`). The most recent merges:
- `b66b9f0`: two-key confirmation on every destructive action. The 62 registered actions are in `src/shared/destructive-actions.js`, and `node scripts/audit-destructive-actions.mjs` reports 0 findings. Bulk file delete uses `desktop.delete-files` and bulk offline release uses `desktop.release-offline-copy`. A dropped wording file in the extension asks first only when it would replace existing wording.
- `5ff3860`: information icons on every surface and the desktop setup guide. The inventories are in `src/shared/local-ux/info-icon-*.js` and the guide is in `src/renderer/features/onboarding/`.

## Verification at 5ff3860

- The gated test set ran 1570 tests: 1562 passed, 4 failed and 4 were not counted as passes. All 4 failures were merge seams, fixed and rerun green (105/0, plus 361/0 for the tests that read the renderer). The known environment-only failures are renderer-dialog-lifecycle, renderer-feature-fixture, ui-headless-route and ui-renderer.
- The Material motion audit reports 0 findings. The inventory validator reports 0 problems. The public route contracts check is clean.

## Proven on an installed build (one physical Windows host)

- Install, update, uninstall, reinstall and rollback.
- Native messaging host registration, with repair at start.
- Pairing that survives an idle worker and expires on quit or lock.
- Lock and force lock with data intact.
- The Java requirement check.
- A real Vanilla 26.3 server: start, ready and stop.
- The quit routes.
- The runtime motion audit, with 0 findings.

Evidence is in `docs/evidence/installed-*.json` and `docs/evidence/runtime-motion-*.json`.

## Open work, in order

1. Merge `feature/inventory-new-ids` after it passes the gate. It adds two required features: drop-to-apply personal wording (desktop and extension, site not applicable), and packaged private documentation delivery (not applicable here, because this repository is public).
2. Build and install the next release. Then re-prove: confirmation dialogs, multi-select bulk actions, drop-to-apply and its celebration, information icons, the setup guide, access wiring, display name, element locks, accent, regex, focus and export.
3. Replace the affected screenshots in the README and on the site with inspected captures of that release.
4. Deferred to the next owner: the local container target, which needs Docker Desktop.
5. Last: a session-end automatic lock on a real restart. The owner restarts the computer. Then check that the drive auto-locks, unlock it with the saved test password, compare the file hashes with the recorded before state, and delete the test vault and password file.

## Constraints

- Push only `main`. Pushing a second branch at the same commit starts a duplicate release run.
- Never kill processes by image name.
- Never weaken Windows sign-in or change system security settings.
- The owner performs every restart.
- Keep published text in ordinary professional English.
````
