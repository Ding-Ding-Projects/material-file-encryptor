---
name: mfe-extension-evidence
description: Stage the local browser extension, capture its runtime evidence in a disposable headless browser profile, and measure parity against the checked-in design references. Use when the extension source changes or evidence must be refreshed.
---

# Browser extension staging, evidence and reference parity

## When to use

After editing anything below `browser-extension`, `src/shared` or the extension entry scripts, and whenever extension evidence or reference parity must be regenerated.

## Prerequisites

- Node 24 or later (the pinned runtime from the build tools folder is used by the entrypoints).
- A Chromium-based browser that can load an unpacked extension: Microsoft Edge or Google Chrome, found automatically, or set `MFE_EXTENSION_BROWSER` or pass `--browser <path>`.
- `npx` network access on the first run: the staging step runs `esbuild@0.25.11` through `npm exec`.
- A clean tracked source tree. The staging script records whether tracked extension sources were modified.

## Procedure

1. Stage the extension: `node scripts/build-browser-extension.mjs`. Output goes to `out/browser-extension`.
2. Capture evidence: `node scripts/capture-extension-evidence.mjs --extension out/browser-extension --out out/extension-evidence` (add `--quick` for a reduced matrix while iterating, never for a final receipt).
3. Measure parity with the references: `node scripts/compare-extension-references.mjs --extension out/browser-extension --out out/extension-reference-parity` (also accepts `--quick` and `--browser`).
4. Inspect the produced images yourself before accepting them. An unread capture is not evidence.

## Expected output

- Step 2 prints `<n> captures, <m> with failed checks, verdict all-checks-passed. Receipt: <dir>/receipt.json` and exits 0 only on that verdict.
- Step 3 prints the comparison count, a verdict of `measured`, the mean differing share and the number of reference states without a production route, and exits 0 only on `measured`.
- Receipts bind the staged extension identity and the source commit. A receipt for another commit does not prove the current source.

## Failure handling

- `No supported browser was found`: set `MFE_EXTENSION_BROWSER`.
- Failed capture rows are listed with their failures; fix the extension or the fixture, restage and rerun the whole capture.
- Never reuse captures from a previous stage after the source changed. Never edit, crop or recolour a capture.
- Every launch uses a new temporary browser profile and never the owner's real profile; if a run leaves a browser process behind, end only the process you started.

## Owner steps

- Signing and publishing the extension to a browser store is not performed by these scripts and needs the owner.

## Availability

The three scripts exist and run headless in a disposable profile. The reference comparison is a measurement of difference, not a pass for visual equivalence; judge the images as well as the number.
