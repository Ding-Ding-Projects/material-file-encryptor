# FFmpeg 9.0.2 corresponding-source review

## Verdict

**Incomplete. Do not include the optional Gyan media runtime in a public release on the basis of the currently collected material.** This is a technical evidence verdict, not an allegation about the publisher. The six media adapters remain implemented and locally verified; excluding their runtime would make those adapters unavailable and must be disclosed in the release scope.

The machine-readable [inventory](media-source-inventory.json) records 55 enabled external components or hardware interfaces from the README inside the exact accepted archive. It records 37 reported version strings and 18 missing version strings. A version string is not a source archive hash, patch inventory or build recipe. No component entry is marked source-complete.

## Exact examined object

- Archive SHA-256: `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`.
- ffmpeg.exe SHA-256: `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec`.
- ffprobe.exe SHA-256: `f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52`.
- Publisher README SHA-256: `0342de6bb39dd421cbec2c00d89ad274b640d75ad3f2cab09ffd647ce2d8f949`.
- Reported compiler: GCC 16.2.0, Rev3, MSYS2 project.
- Upstream FFmpeg revision resolves to `946fcce07b6dcd0331c8cc609192aeff5e1924f8`.

The exact binary's configuration is stored in the inventory. It enables GPL/version3/static linking and many external components. Restricting the application's command profiles does not remove code already linked into that binary.

## Primary-source investigation

The [publisher build page](https://www.gyan.dev/ffmpeg/builds/) lists the essentials components and describes static GPLv3 builds. The [9.0.2 release](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2) has six assets: essentials 7z/ZIP, full 7z/ZIP, and full-shared 7z/ZIP. None is identified as a corresponding-source archive. Its body supplies the FFmpeg revision link only.

The publisher support repository's recursive tree contains `.github/FUNDING.yml` and `README.md`; it contains no build scripts. A [publisher comment about the build environment](https://github.com/GyanD/codexffmpeg/issues/91#issuecomment-1474806731) describes MSYS2/MinGW64 and GCC. Another [publisher comment recommends media-autobuild_suite](https://github.com/GyanD/codexffmpeg/issues/119#issuecomment-2028846467) to a user. Neither identifies the exact script revision, configuration, component sources or patches for this accepted 9.0.2 object. The current build-page toolchain note says UCRT64; the older general comment is therefore retained as historical context, not treated as the exact build recipe.

The [FFmpeg legal page](https://ffmpeg.org/legal.html) discusses source availability, configuration and external-library licensing. A link to FFmpeg alone cannot establish the source closure for a static executable with additional linked components. This review creates no written offer and does not claim to satisfy an offer route.

## Missing evidence

Every component still lacks an authenticated matching source archive hash and exact build recipe in this collection. In particular:

- The README does not report versions for bzlib, gmp, gnutls, iconv, libfontconfig, libxml2, lzma and zlib.
- It also omits versions for cuda, cuda_llvm, cuvid, d3d11va, d3d12va, dxva2, libmfx, mediafoundation, nvdec and nvenc. These include platform interfaces; whether an exception applies requires explicit review instead of silently deleting them from the inventory.
- Reported versions for the remaining 37 components do not establish local patches, build configuration, generated files or transitive source closure.
- No exact 9.0.2 publisher build recipe or complete corresponding-source bundle was located in the examined official page, release assets or support repository.

No purported complete source archive was produced, downloaded or labelled releasable. Downloading unrelated current upstream versions would create an archive with the wrong evidence, not resolve these gaps.

## Concrete release choices

1. Obtain and validate the publisher's exact source closure, including build scripts, patches, configuration, all required linked-component sources and appropriate notices. Record each immutable source identifier and SHA-256, validate archive contents, and split any release assets below 1.5 GB.
2. Build a new minimal runtime from fully pinned and archived source inputs, then rerun provenance and AppContainer media checks against its new binary hashes. This creates a different accepted object and cannot inherit the Gyan binary's verification by name.
3. Explicitly exclude the optional media runtime from this release. The parent packager must omit the media directory and `mediaRuntime` binding, retain the disabled reasons in the catalog, and disclose PNG/JPEG/WAV/FLAC/MP3/MP4 conversion as unavailable in that release. The inventory's `release` object is a review proposal for this choice, not a mutation of the current package.

## Reproduction

Run `node scripts/converter-media-source-inventory.mjs <verified-runtime-directory> <output-json>`. The collector checks both executable hashes before running the bounded `-version` inspection. It parses the publisher README, preserves missing evidence as null, and never infers that a revision link constitutes complete source.
