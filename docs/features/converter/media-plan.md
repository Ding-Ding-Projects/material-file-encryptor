# Offline image, audio and video conversion

The converter implements six fixed operations: PNG, JPEG, WAV (16-bit PCM), FLAC, MP3 (192 kbps), and MP4 (H.264 CRF 23 with AAC 128 kbps). Media remains disabled unless the optional packaged runtime passes executable hashes and an actual AppContainer source-probe, conversion, output-probe and full-decode startup check. No executable is discovered on PATH and no download occurs while converting.

## Accepted runtime and provenance

FFmpeg 9.0.2 is pinned to the release essentials archive distributed by Gyan, a Windows binary provider linked by the [official FFmpeg download page](https://ffmpeg.org/download.html). The [publisher page](https://www.gyan.dev/ffmpeg/builds/) identifies source revision `946fcce07b`, version 9.0.2 and GPLv3 licensing. Its [published archive checksum](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip.sha256) is checked before extraction. The binaries are **not Authenticode signed**. This acceptance is based on the explicitly reviewed publisher, HTTPS and pinned archive/executable hashes, not a claim of an upstream binary signature or reproducible build.

| File | SHA-256 |
| --- | --- |
| ffmpeg-9.0.2-essentials_build.zip | `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba` |
| ffmpeg.exe | `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec` |
| ffprobe.exe | `f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52` |

The GPLv3 project includes the distribution's LICENSE and README. Release packaging must also satisfy corresponding-source distribution obligations for FFmpeg and its linked components. The provider's source revision alone is not a complete corresponding-source bundle. This implementation does not claim that release obligation is already satisfied.

## Parent build integration

Run `node scripts/converter-media-runtime.mjs <resources/converter/media>` during the existing root build. The helper uses a bounded build-time download, verifies the archive and both executables, and copies only `ffmpeg.exe`, `ffprobe.exe`, `LICENSE`, `README.txt`, and `manifest.json`. Its returned object contains `version`, `ffmpegPath`, `ffmpegSha256`, `ffprobePath`, and `ffprobeSha256`. Paths are package-relative at final binding, so resolve them against the actual resource directory instead of saving build-machine paths into a public manifest.

Pass those four executable fields as `mediaRuntime` to `createWindowsSandboxProvider`, alongside the existing launcher and Node fields. Package the new `media.mjs` beside `windows-sandbox.mjs`; it executes in the trusted host and is not copied into the Node worker payload. Rebuild the native launcher with `MediaCommand.cs`. The parent owns root build scripts, application service binding and release compliance. The converter owns no alternate application entrypoint.

A missing or invalid optional media runtime disables only media adapters. Existing PDF, ZIP and data adapters retain their normal independently verified isolation path. The public catalog carries an explicit startup-verification reason.

## Execution and validation

The host accepts only the six registered operation identifiers. The native launcher chooses a fixed command, fixed staged filenames and the exact staged executable name. It retains the zero-capability AppContainer, one-process job, 256 MiB memory bound, 30-second deadline per operation, cancellation signal, authenticated nonce/result hash, and profile cleanup. Protocols are restricted to `file,pipe`; user arguments, arbitrary paths and process spawning are unavailable.

Every conversion performs four isolated operations: probe source, encode, probe output, decode output. The host rejects extra streams, unsupported image demuxers, animation, rotation metadata, dimension/layout changes, incorrect output codecs and duration drift. Images are limited to 8 megapixels and 4096 pixels per edge. Audio accepts one or two channels at 8–48 kHz for at most 10 minutes. Video accepts even dimensions up to 1920 by 1080 for at most 60 seconds. Input and media output each stay at or below 64 MiB. Sampled log/output storage limits supplement the job's hard memory and process limits; they are not a filesystem quota.

Source inspection presents actual probe metadata before submission. Each adapter requires explicit acknowledgement of metadata removal and encoding loss. JPEG discards transparency; WAV reduces to 16-bit PCM; MP3 and H.264/AAC are lossy. No resizing, rotation, sample-rate conversion or channel remix is silently requested. The queue retains source hashes, existing overwrite confirmation and complete-output atomic publication. Cancelling between stages prevents the next stage and publication. Cancelling an active media preview is included in the quit barrier.

## Verification

`test/converter-media.test.js` checks metadata bounds, codec/layout comparisons and the unavailable-runtime catalog. `test/converter-media-windows.test.js` uses `CONVERTER_MEDIA_TEST_ROOT` pointing at the verified directory containing both binaries; it generates disposable synthetic fixtures, exercises all six operations through the actual provider, and checks cancellation. Native `media-command.tests.ps1` checks fixed command and receipt contracts; `media-smoke.ps1` exercises actual AppContainer media and denied external references. No user media or visible desktop is needed.

Additional formats, arbitrary FFmpeg arguments, hardware encoders, streaming, subtitles, animated images, resizing and editing are outside this implementation. They remain unimplemented rather than being advertised as completed adapters.
