---
name: mfe-release-verification
description: Verify a published release against its metadata, build provenance, asset hashes and RELEASES row before installing or relying on it. Use before any installed proof, update test or claim that a release is good.
---

# Release verification

## When to use

Before installing a release for testing, before citing a release in evidence, and after publishing one.

## Prerequisites

- The forge command line client signed in with read access to the repository. Signing in is an owner step.
- A clean target worktree checked out at the commit the release says it was built from.
- Windows PowerShell for `scripts/prepare-downloaded-release.ps1`.

## Procedure

1. Read the release: `gh release view <tag> --json tagName,targetCommitish,isDraft,isPrerelease,assets > release.json`, and download all assets into an empty directory with `gh release download <tag> --dir <download-dir>`.
2. Require a normal release: `isDraft` and `isPrerelease` must both be false.
3. Run the preparation check: `powershell -NoProfile -File scripts/prepare-downloaded-release.ps1 -DownloadedDirectory <download-dir> -TargetWorktree <worktree> -ReleaseMetadata release.json -Tag <tag> -ExpectedSource <40-hex commit>`. It checks the source commit, that the tag, target commit and provenance agree, the asset set (Setup executable, `RELEASES`, at least one full package, `build-provenance.json`), and every asset size and SHA-256 against both the provenance file and the forge digest.
4. Check the `RELEASES` row by hand: it is one line `<sha1> <name>-full.nupkg <size>`. The name and byte size must match the package file and the SHA-1 must match its bytes (`Get-FileHash -Algorithm SHA1`).
5. Check the Setup executable is unsigned as designed: `Get-AuthenticodeSignature` reports `NotSigned`. A signed or tampered Setup is a finding, not a pass.
6. Record the tag, target commit, the Setup and `RELEASES` SHA-256 values, the `RELEASES` row and the signature status in an evidence file under `docs/evidence`, with no local paths.

## Expected output

- The preparation script exits 0 and prints no error code. Error codes such as `SOURCE_MISMATCH`, `RELEASE_FLAGS_REQUIRED`, `RELEASE_ASSET_COUNT_MISMATCH` or `SOURCE_NOT_CLEAN` name the exact check that failed.
- `scripts/test-downloaded-release.ps1` exercises the same checker with synthetic fixtures and should be run when the checker itself changes.

## Failure handling

- Any mismatch means the release is not verified. Do not install it, do not edit the metadata to match, and report the code and the values.
- Draft or prerelease flags, a missing asset or an unavailable forge read leave the verification incomplete.
- A release that targets a commit not descended from the source being tested may still be valid evidence for its own commit only.

## Owner steps

- Signing in to the forge, publishing a release and approving any release asset upload belong to the owner.

## Availability

The checker and its fixture test exist in `scripts`. Verification covers bytes and metadata only; it proves nothing about installation or runtime until the installed verification skill has been run.
