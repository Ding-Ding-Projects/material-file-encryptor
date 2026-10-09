# First installable preview

## Encrypted storage and recovery

- [x] Verify integrated format 2 fixed ciphertext chunks, 10 MiB default and 90,000,000-byte physical maximum in core/controller checks at `1e16dea8`.
- [x] Verify changed-chunk reuse, authenticated reads and explicit re-split in the core checks at `1e16dea8`.
- [x] Verify actual Git history and folder synchronization with mounted runtime recovery at `1e16dea8`.
- [x] Verify lazy private GitHub transport with ten real source-bound checks at `4f0a4b48`.
- [x] Integrate the test-only cancellation fixture repair from `d0c5e036`, which passed 42 transport checks, and confirm identical native source in the integration tree.
- [x] Verify quiet-save version timing in core checks and manual versions/restore through the packaged GUI at `1e16dea8`.
- [x] Verify file/subtree recycling, bulk restore, collision preservation and history after emptying the bin in core checks and packaged recovery flows.
- [x] Verify non-destructive copy upgrade and rejection of original-folder overlap in core checks at `1e16dea8`.
- [x] Repair restoration identity reuse while deleted handles remain open; prove original-handle write isolation through actual WinFsp operations.
- [x] Persist concurrent live-identity reconciliation and verify repeated replay, a new live lease and another device reopening.

## Desktop and delivery

- [ ] Verify the modern workspace and every editable-field clear control in the real built application; source candidate `3733857d` is reviewed and tested.
- [ ] Verify the startup-readback correction for paths containing spaces in the packaged and installed application; native-parser checks at `100182f` pass.
- [ ] Verify the website's two clear controls and source-bound download eligibility in its built/live surface; 12 source checks pass at `96125c4`.
- [x] Publish `v0.1.0-preview.16.1` from `56020da`, independently download all four assets, verify their sizes/hashes, and retain its failed runtime verdict with a known-issue warning.
- [ ] Publish a corrective normal release and independently verify its downloaded runtime; publication and runtime acceptance have separate verdicts.

- [x] Verify History, Recycle Bin, explicit descendant selection, offline pinning and readable selection headings in the packaged Windows application at `1e16dea8`.
- [x] Verify real create/unlock dialogs, picker selection, manual lowercase drive input and mounted-byte persistence at `1e16dea8`.
- [x] Verify dark/light themes, English/Cantonese/bilingual controls and startup registration restoration in the packaged flow at `1e16dea8`.
- [ ] Verify transport-setup visual states in the built Windows application.
- [ ] Verify copy-upgrade visual states in the built Windows application; core behavior is verified separately.
- [x] Resolve installation registration detection and verify 573 installed payload entries plus the real installed 70-check desktop flow.
- [x] Verify exact updater-only residue with 17 focused cases and a read-only diagnostic; preserve the original directory-presence failure.
- [ ] Run the revised full installer lifecycle against independently downloaded release bytes.
- [ ] Build and publish an unsigned Squirrel preview with exact source and package evidence.
- [ ] Independently download, hash and verify the released installer.
- [ ] Refresh documentation and real captures from the final verified candidate.
- [x] Promote four original public-safe captures from the reviewed 73-capture packaged run at `1e16dea8`; retain path-bearing captures privately.
- [x] Replace the old archive writer and verify every Squirrel package entry through decompression and CRC checks.
- [x] ~~Make preview publication an explicit source-pinned dispatch rather than a side effect of documentation pushes.~~ Superseded on 2026-10-09 by automatic normal releases for every branch push and manual dispatch.

## Explicit follow-up work

- [ ] Automatic updates and update lifecycle verification (outside this preview).
- [ ] Fresh sign-in and broad Windows version certification (outside this preview).
- [ ] Real cloud-provider certification (outside this preview).
- [ ] Permanent history purge (outside this preview; emptying the bin retains historical recovery).

- [ ] Confirm the restored automatic per-push normal release publisher on a real workflow run, including downloadable installer assets and timing notes. Local workflow/source checks pass; live publication is pending.

- [x] Promote the existing release in place to non-draft and non-prerelease, retain its tag and bytes, and verify GitHub classification readback.
