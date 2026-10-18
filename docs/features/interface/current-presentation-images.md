# Current screenshot replacement inventory

`contracts/current-presentation-images.json` explicitly maps all 24 screenshot originals displayed by the source baseline: ten README/public-image entries and fourteen home/gallery entries. The 445-occurrence gallery case is a synthetic deduplication test, not a capture inventory. Recordings, workflow diagrams and two previously withheld images are excluded from this replacement scope.

Every row starts pending. It records the exact old path/hash, current consumers, planned supported Windows state, language/theme/viewport tuple, caption and deduplication identity. A planned tuple is not observed evidence. Linux-labelled historical tiles map to current supported Windows equivalents with truthful new captions, not new Linux support. Only identical current state/configuration and caption mappings may share a replacement. Historical-only scenes may be documented as unavailable, but unavailable is incomplete delivery, never success.

## Preservation and promotion

Preserve old image bytes and original provenance without changing dates or source claims. Remove old images from current rendering even where a tile previously called itself historical. An archive or history may retain the bytes, but the current generated presentation must not ship the old captures. Do not overwrite historical originals to satisfy a hash check.

Capture actual built surfaces using the supported hidden-desktop route. Inspect raw pixels and privacy before promotion; do not generate, reconstruct, retouch or substitute mock images. Follow the maintainer's installed evidence-promotion procedure. Its version-1 receipt is kept in a private evidence root, never published with machine paths or process identities. This validator additionally requires `state.language` and `capture.timeZone` because the presentation inventory records them. Source/build paths in the private evidence root must be relative and contained; place verified copies there when the original build lives elsewhere.

An accepted row's `replacement` supplies repository-relative `path`, `sha256`, evidence-root-relative `receipt`, and `receiptSha256`. The receipt must bind source start/end, build bytes and build receipt, raw/promoted PNG equality, dimensions, tuple, inspection/privacy declarations, interaction/privacy sidecars, actual capture time and owned teardown. Its inventory record identity is the shared `dedupKey`. The validator checks declarations and bytes; it cannot prove an operator really inspected pixels or that a receipt is authentic. Independent inspection and producer provenance remain mandatory.

The build receipt must establish the successful exact `build.bat /s` invocation, matching source bookends, clean source at both ends, and executable, renderer archive and native host hashes. A normalized build receipt must trace a hash-verified original root receipt; arbitrary JSON with a valid file hash does not qualify. The capture receipt's `source` also supplies `rendererAsarPath`, `rendererAsarSha256`, `nativeHostPath` and `nativeHostSha256` for independent byte checks. Each consumer set is fixed independently of the editable inventory. Every home/gallery/README route and caption, gallery metadata, desktop README and extension documentation payload must retain its accepted replacement.

The validator decodes non-interlaced 8-bit RGB/RGBA PNG scanlines, checks every chunk CRC, inflates IDAT with a bounded exact output length, and reverses all five scanline filters. Unsupported PNG formats fail closed; do not recompress a genuine capture to change its evidence bytes. Old image hashes are independently pinned to baseline `96ea35e`, so editing inventory hashes cannot redefine stale content. Generated HTML/CSS/JavaScript/JSON and shipped documentation payloads are also scanned for old PNG bytes embedded as data URLs.

The runtime receipt must reference a separately hashed `geometryReceiptPath` and `geometryReceiptSha256`. That observed sidecar uses `schemaVersion: 1`, the exact `sourceCommit` and `hwnd`, `method: "observed-native-client-and-browser-geometry"`, `observedAt`, `viewportCss`, `devicePixelRatio`, `rendererZoom`, `nativeClientPixels`, and `capturePixels`. Width/height objects describe independently observed geometry; capture dimensions must match the decoded PNG. Page captures equal the native client pixels, while window captures may include window borders. `scaleKind` is either `device-pixel-ratio` or `physical-display`; the latter additionally requires independently observed `physicalDisplayScale` and `physicalDisplayScaleObserved: true`. Renderer zoom is never substituted for physical scaling or DPR. Missing measurements remain an acceptance gap, not values copied from the image header.

## Delivery gate and regression tests

Run the gate only after the producer is finished and the publication output is available:

```text
node scripts/check-current-presentation.mjs --repo-root <repository> --expected-source <capture-source-commit> --evidence-root <private-run-root> --presentation-root <generated-site-root> --desktop-root <unpacked-application-root> --extension-root <staged-extension-root>
```

The expected source must be explicit. The gate uses the production gallery/public-image parsers, checks the independent required identity set, pending/unavailable states, old source references and hashes, actual generated output, contained paths, receipt hashes, PNG structure/dimensions and metadata, source/tuple binding, freshness and compatible deduplication. Missing generated output or unpacked desktop/extension payloads fail closed. PNG files and embedded PNG data URLs are checked against old hashes. The caller must supply the actual shipped payloads, not an empty folder or source substitute. Live HTTP delivery and installed runtime inspection remain separate acceptance steps; a generated website check does not prove them.

```text
node --test test/current-presentation-images.test.js
```

The regression suite deliberately removes/duplicates identities, substitutes source/path bindings, supplies incompatible deduplication, renders stale images under historical labels, and supplies incomplete or forged evidence. Passing these negative tests means rejection works. It never means the 24 replacements exist. The actual delivery gate must fail while this inventory is pending. This increment changes no current images or publication manifests.
