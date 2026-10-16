---
name: mfe-build-and-verify
description: Build the Material File Encryptor application, produce the unsigned Squirrel.Windows installer, and run the local verification suite. Use when asked to build, package, or check the repository locally.
---

# Build, package and verify locally

## When to use

Use before claiming that a change builds, before producing installer files, and when a maintainer asks for the local verification sweep.

## Prerequisites

- A Windows 11 host with PowerShell. The scripts download pinned, hash-checked tools into a per-user build tools folder (`MaterialFileEncryptor-BuildTools` under the local application data folder) on first run; see `scripts/bootstrap.ps1` and `dependencies.json`.
- Network access for the first run only. Later runs reuse the verified cache.
- `scripts/check-vocabulary.mjs` runs at the start of every build and may print a skip reason when the private instruction source is absent; that is expected on a public checkout.

## Procedure

1. Build the application: `build.bat /s`. The `/s` switch (or `--silent`) skips the final pause. `build.bat /browser-host-only` publishes only the native browser host.
2. Build the installer: `build-installer.bat /s`. It calls `scripts/build.ps1 -Installer`, refuses to start if `out/make/squirrel.windows/x64/reassembly-unsettled.json` exists, and writes Squirrel output below `out/make/squirrel.windows/x64`.
3. Check the produced package: `powershell -NoProfile -File scripts/package-integrity.ps1` (reads every `.nupkg` below that folder and writes `out/evidence/package-integrity.json`). It needs the pinned archive reader that the bootstrap installs, and stops with `PINNED_ARCHIVE_READER_REQUIRED` otherwise.
4. Run the local verification sweep: `powershell -NoProfile -File scripts/verify-local.ps1`. It runs, in order, `npm test`, the native core tests (`dotnet run --project native/MaterialFileEncryptor.Core.Tests -c Release`), the Playwright browser install, `scripts/windows-mounted-check.ps1` and `npm run test:desktop`.
5. For a quick source-only check without the driver, run `node --test test/*.test.js` with the pinned Node from the build tools folder on `PATH`.

## Expected output

- `build.bat` and `build-installer.bat` return the real exit code of the underlying script. Exit code 0 is the only success. Receipts appear under `out/evidence`.
- The installer folder contains `MaterialFileEncryptor-Setup.exe`, a `-full.nupkg` and a `RELEASES` file with one row.
- `verify-local.ps1` stops at the first failing step with `Local verification failed: <code>`.

## Failure handling

- A bootstrap hash mismatch or untrusted signature is a hard stop. Do not bypass it; report the file and the expected hash.
- `SQUIRREL_PREVIOUS_PRODUCER_UNSETTLED` means a previous installer run did not finish; inspect `out/make/squirrel.windows/x64`, keep its contents, and report instead of deleting.
- Test failures that depend on a display, a browser profile, Ollama or a mounted drive are environment failures when they reproduce on an unchanged `main`. Name the failing test files and do not call the run green.
- Retry an unchanged failing command at most three times, then keep the evidence and stop.

## Owner steps

- The WinFsp driver installation (`scripts/bootstrap.ps1 -InstallDriver`, or `scripts/verify-local.ps1 -InstallDriver`) needs administrator consent through the native UAC prompt and may require a restart. A person must approve both.
- Never initiate a restart, shutdown or sign-out from a script or agent.

## Availability

All entrypoints and scripts above exist in this repository. The mounted-drive check needs the WinFsp driver on the host; without it that step is unverified, not passed. Installation and runtime acceptance are proven only by receipts under `docs/evidence`, never by a successful build alone.
