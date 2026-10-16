---
name: mfe-site-and-screenshots
description: Stage the documentation and landing site, refresh screenshots from the real staged surfaces, and apply the refresh to the site, gallery and README. Use when documentation or the interface changes and public images must stay current.
---

# Site build and screenshot refresh

## When to use

After documentation, site or interface changes, and whenever a published image no longer matches the current build.

## Prerequisites

- Node 24 or later; run from the repository root with a clean tree so `site-provenance.json` records `sourceDirty: false`.
- The staged extension (`out/browser-extension`) for extension captures.
- A Chromium-based browser (Edge or Chrome, or `--browser <path>`).
- For desktop captures: a capture manifest produced from a real installed build (see `mfe-installed-verification`).

## Procedure

1. Stage the site: `node scripts/build-site.mjs`. It writes `out/site` and keeps any previous output as a separate folder.
2. Capture web and extension surfaces: `node scripts/refresh-screenshots.mjs capture --out docs/images/captures/refresh-<short-commit> --extension out/browser-extension --site out/site` (`--only extension` or `--only site` narrows it).
3. Import desktop captures from a manifest: `node scripts/refresh-screenshots.mjs desktop --desktop-manifest <manifest.json> --out docs/images/captures/refresh-<short-commit>`. To replace an earlier set use the `desktop-update` command with `--desktop-manifest <manifest.json> --supersede <earlier folder>`.
4. Inspect every new image. Reject blank, cropped, stale or personal-data captures.
5. Point references at the refresh: `node scripts/apply-screenshot-refresh.mjs --folder docs/images/captures/refresh-<short-commit>`. It records earlier images as withdrawn (path and SHA-256) in `docs/site/gallery-review.json`, rewrites the gallery data, the site capture section and the README gallery, and deletes superseded folders. Withdrawn images remain in version history unchanged.
6. Rebuild the site (step 1) and run `node --test test/*.test.js` to check the references.

## Expected output

- Step 1 prints how many documentation articles and reviewed capture records were staged.
- Step 2 prints `<n> captures written under <directory>` followed by one line per image with its size and a SHA-256 prefix; any `ERRORS:` suffix means that capture failed its checks.
- Step 5 changes tracked files; review the diff before committing.

## Failure handling

- Never fabricate, edit or relabel a capture. A missing capture stays a recorded gap.
- If the site build fails on documentation pairs or the content catalog, run `node scripts/refresh-public-route-contracts.mjs` and recompute the language-pair hashes as described in `docs/features/platform/documentation-and-status.md`.
- Do not apply a refresh whose captures came from a different commit than the build being described.

## Owner steps

- Publishing the staged site to the hosting provider and reading back the live address is an owner or release step, not part of these scripts.

## Availability

All four scripts exist. Desktop captures depend on an installed build and an off-screen desktop session, which this skill does not create.
