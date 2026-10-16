---
name: mfe-installed-verification
description: Verify a verified release on a real installation, including install and update with Setup.exe, native messaging host registration readback, uninstall, reinstall, rollback, and the evidence receipt. Use when a release must be proven installed and working.
---

# Installed application verification

## When to use

After `mfe-release-verification` has accepted a release and a person has decided that the installed behaviour must be proven on a real host.

## Prerequisites

- A Windows 11 host reserved for the test, an off-screen desktop for any user interface driving, and a record of the starting state: installed version, application folders, and the file inventory of the owner profile (names and counts only).
- Release assets that passed `mfe-release-verification`.
- An isolated application profile for anything that writes data. Never run tests against the owner's real vault or profile contents.
- Two releases when rollback is tested: the one under test and an older verified one.

## Procedure

1. Snapshot the starting state: installed version, `Update.exe` presence, application folders, shortcuts, the uninstall entry, the application startup value, and the native messaging registry keys for Chrome and Edge under `HKCU\Software\<vendor>\NativeMessagingHosts\<host name>`.
2. Install or update: run the verified `MaterialFileEncryptor-Setup.exe` once, silently where supported. Setup launches the application on the owner profile by itself; confirm the process and window, then quit through the application's own Help menu Quit command.
3. Read back the native host registration: both registry keys exist and point at one manifest inside the install root's fixed location; the manifest names the installed `MaterialFileEncryptor.BrowserHost.exe` and the expected extension origin (see `scripts/browser-native-registration.mjs` and `docs/features/workflows/browser-native-host.md`). A key pointing at an isolated test profile is a side effect of running a different build against that profile and heals on the next install or launch.
4. Run the installed checks that apply: `scripts/windows-installer-check.ps1 -Mode Verify` for the Squirrel layout, and the interface drive and motion checks from the other skills against the installed build.
5. Uninstall with `Update.exe --uninstall` from the install root. Read back: application files removed, shortcuts removed, uninstall entry removed, startup value removed, this application's native messaging keys removed, other applications' keys untouched, owner profile files kept. Known residue: the install root keeps `Update.exe` and a small removal marker; `scripts/squirrel-uninstall-residue.ps1` and `scripts/diagnose-uninstall-residue.ps1` describe it.
6. Reinstall with Setup of the same release and repeat the readbacks from steps 2 and 3.
7. Rollback: run Setup of the older verified release over the newer install. Squirrel replaces the install root rather than refusing; confirm the older version is the only and current one, the registration, shortcuts, uninstall entry and startup value point into it, and its own drive check passes in the isolated profile. Then run Setup of the newer release again and repeat the readbacks.
8. Compare the owner profile before and after by names and counts. Changes to caches, logs and the host manifest are expected; changes to preferences and local state are not.
9. Write the receipt to `docs/evidence/` (see the existing `installed-proof-*.json` and `installed-lifecycle-uninstall-rollback.json` for the shape): host described without machine or user names, releases used with commit and hashes, each readback result, residue and problems found, and the end state with zero leftover test processes.

## Expected output

A dated receipt in `docs/evidence` whose claims are each backed by a readback you actually performed. Anything not performed is written as not performed.

## Failure handling

- Stop at the first unexpected state, record it, and do not repair the host by hand to make the proof pass.
- If the application will not quit by its own command, end only the exact process you started and record that.
- Do not delete the owner profile, the install root or any registry key you did not create.

## Owner steps

- Licence acceptance in the installer, UAC consent for any elevated step, firewall prompts, restarts, and approving the use of the real host are owner steps. Never initiate a restart or sign-out.
- Choosing which release is promoted and publishing the receipt is the owner's decision.

## Availability

The installer scripts, native host registration plan and residue diagnostics exist in `scripts`. Prior installed proofs are recorded in `docs/evidence`. This procedure was written from those proofs; running it again on a new host or release produces a new receipt and does not inherit the old one.
