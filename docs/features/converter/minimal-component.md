# Reviewed minimal media component

## Local acceptance

The source-built component passed real AppContainer conversion, output probing and complete decoding for PNG, JPEG, WAV, FLAC, MP3 and MP4. Cancellation passed. The combined pipeline deadline regression terminates the active stage and prevents later stages. The native command profile remains fixed and rejects arbitrary arguments.

The exact accepted runtime hashes are:

- `ffmpeg.exe`: `3afaeabe603e0a869f782621b8ef3877c98db8832dac756fd4518af9cfc2b8a3`
- `ffprobe.exe`: `6f02e4e18eb928ff48d8fdad2840d8419a1868931cbdf0da6d1da8f8a59987a4`

The executable import table contains operating-system DLLs only. Neither executable contains the build user's absolute path. Their embedded configuration uses a relative zlib path. The source was compiled with the existing GCC 13.2.0 toolchain and GNU Make 4.4.1, with two compiler jobs at below-normal priority. No new toolchain was installed.

## Assets for parent review

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `ffmpeg-9.0.2-minimal-v1-win64.zip` | 19533797 | `da315b36eaae5f0aeee512fea6f0c920c25e13d80c9d77a9db23ed626e30eddd` |
| `ffmpeg-9.0.2-minimal-corresponding-source.zip` | 13594970 | `7f6e1fe23c78ba7d3419adf31be83f53229bc7a93c6e0cdd74a43af02a850e75` |
| Inner runtime `manifest.json` | See inventory | `995e6efd01e257486139be36889033029983486844cf627510120a57770124e8` |

The outer archive contains ten files: both executables, five license/notice files, README, manifest, and the full source archive. Every outer file was extracted and verified against [the exact component inventory](minimal-component-release.json). All eleven source inventory members were likewise extracted and verified. The source archive contains the original FFmpeg/zlib archives, exact build helper and source manifest, enabled-component configuration, and notices. No source download is deferred to satisfy the distributed source bundle.

The source build links zlib and uses operating-system Media Foundation/D3D11 interfaces. It does not enable GPL/nonfree codecs. The source archives carry their complete original license files; the component also includes LGPLv2.1, GPLv3, the GCC Runtime Library Exception and MinGW-w64 runtime notices. The earlier Gyan source-closure review applies to that earlier binary only, not this new object.

## Publication and fresh-machine bootstrap

Publication is parent-owned and has not occurred. Use a reviewed immutable component tag, a normal non-prerelease release, and `--latest=false` so the component does not replace the application's latest release. Upload the reviewed outer archive and optionally the same standalone source archive. Read back names, sizes and hashes before considering publication complete.

Once published, call:

```text
node scripts/converter-minimal-component.mjs <immutable-GitHub-release-asset-URL> <resources/converter/media>
```

The helper downloads only the pinned 19.5 MB archive, checks its complete SHA-256 before extraction, verifies all ten file hashes and sizes, and returns `profile`, `ffmpegPath`, `ffmpegSha256`, `ffprobePath`, and `ffprobeSha256`. Pass this object as `mediaRuntime` to the existing provider. A matching cache requires all ten files to validate. There is no compiler requirement for this route and no network operation during conversion.

This helper replaces the Gyan download helper for a release using this component. Do not publish a guessed URL or silently fall back to Gyan. The previous runtime may remain a local comparison fixture, but must not enter this component package.

## Rebuilding source

Use the supplied [minimal build recipe](minimal-runtime.md). Rebuilding requires existing Git Bash, GCC 13.2.0 MinGW-w64 and GNU Make 4.4.1. The recipe contains the exact configuration and downloads only hash-pinned source and notices. It defaults to two jobs at below-normal priority. Compiler warnings from upstream source were retained; no warning-free or bit-identical rebuild claim is made. A newly rebuilt binary has a new acceptance boundary and must receive fresh manifest hashes and AppContainer checks.

The component bootstrap rejects reparse points in the destination and its existing ancestors, preserves any invalid existing destination, and validates ZIP member names, sizes, local-header agreement and link attributes before extraction. Extraction has a 30-second deadline. Files are copied into a fresh sibling staging directory, validated, then renamed into an absent destination. Copy errors preserve their original diagnostic and remove the incomplete stage. This protects a trusted build directory; an unrelated process able to rename its ancestors concurrently remains outside this helper's authority. No archive bytes changed for this bootstrap hardening.
