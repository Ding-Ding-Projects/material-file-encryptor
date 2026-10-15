# Browser extension evidence and reference comparison

Two scripts capture the staged browser extension and bind every capture to the exact bytes that were staged.
They read and render only; they do not sign, install or publish the extension.

## Build identity

`scripts/build-browser-extension.mjs` writes `bundle-receipt.json` with the SHA-256 and size of every staged file.
It also computes a build identity: the SHA-256 of the sorted `path sha256` lines of every staged file except
`vendor/provenance.js` (which carries the identity) and the receipt itself. The identity is stored in the receipt
and in `vendor/provenance.js`. The Status section of the extension workspace shows its first 16 characters as
**Build fingerprint**, so a person can compare the running extension with a receipt.

## Product evidence

`node scripts/capture-extension-evidence.mjs` (add `--quick` for one theme, language and viewport):

1. Re-reads every staged file, checks it against `bundle-receipt.json`, recomputes the build identity and checks
   that `vendor/provenance.js` carries the same identity. Any difference stops the run.
2. Loads the staged directory as an unpacked extension into a new temporary headless browser profile. The user's own
   browser profile is never opened, and the temporary profile is deleted afterwards.
3. Opens the workspace Home, every section the page declares and the popup, in light and dark themes, in English,
   Cantonese and bilingual, at 1280 × 800 and 320 × 568 for the workspace and 400 × 560 and 320 × 480 for the popup.
4. For each state it checks what the page reports: the document language, the theme, the visible view or section,
   the build fingerprint, the loaded extension version, sideways scrolling and script errors. It then saves a PNG.
5. Writes `out/extension-evidence/<identity prefix>/receipt.json` with the build identity, the source commit, the
   browser version, every check result and the SHA-256 of every image. The exit code is non-zero when any check fails.

The receipt says `installation: not-performed`: an unpacked load into a temporary profile is not a store
installation, and no store-installed extension is exercised by this script.

## Reference comparison

`node scripts/compare-extension-references.mjs` (add `--quick` for the first tuple of each state):

- Serves this checkout read-only on `127.0.0.1` (GET only, no hidden paths, nothing outside the checkout) and opens
  each state in `design/extension-completion/states.json` that has a production route in the extension.
- Renders the reference and the staged extension at the same viewport, device scale, theme and language, saves both
  captures and measures the share of pixels where any colour channel differs by more than 48.
- The extension side is shown as it renders without a paired desktop. A reference that depicts a desktop-dependent
  state is still compared with what the extension shows on its own, and the receipt says so.
- Lists every reference state that has no production route in the extension.
- Writes `out/extension-reference-parity/<identity prefix>/receipt.json`. The receipt reports measured differences
  only. It never declares the reference and the extension equivalent.

## Limits

- These scripts need Microsoft Edge or Google Chrome. Set `MFE_EXTENSION_BROWSER` to use another executable.
- Captures stay in `out/`, which is not committed. Publishing a capture is a separate, reviewed step.
- A passing run proves the checks listed above for that build in a headless browser. It does not prove behaviour with
  a paired desktop, a store installation or a person's real browser profile.
