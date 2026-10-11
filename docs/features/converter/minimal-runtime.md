# Minimal media runtime build

This build replaces the broad third-party binary with a source-controlled FFmpeg 9.0.2 configuration and zlib 1.3.2. It is a separate candidate runtime. Existing media binary hashes and their test results never transfer to this candidate.

## Source verification

The exact official FFmpeg tarball has SHA-256 `8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`. Its detached signature was verified against the published release-key fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8`. The [official release page](https://ffmpeg.org/download.html) describes the signature procedure.

The exact zlib 1.3.2 tarball has SHA-256 `bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16`, published on the [zlib download page](https://zlib.net/). Both unmodified source archives must accompany a distributed candidate together with this recipe, notices, configuration and the candidate's binary hashes.

## Existing toolchain

The examined host has GCC 13.2.0 (MinGW-W64 x86_64-ucrt-posix-seh, r8), GNU Make 4.4.1, Git Bash and GPG. No compiler or toolchain installer was downloaded. The recipe requires explicit absolute paths to these existing tools and a dedicated build directory:

```text
node scripts/converter-minimal-runtime.mjs <build-directory> <bash.exe> <gcc-directory> <mingw32-make.exe>
```

The script downloads only the two pinned source archives, verifies both hashes before executing configure, builds zlib's static target with its supplied `win32/Makefile.gcc`, then configures and builds FFmpeg and FFprobe. The exact configure argument inventory is exported from the script and checked by `test/converter-minimal-recipe.test.js`. A local receipt records the resulting executable hashes. The build is bounded to four compilation jobs and a 30-minute parent deadline.

## Intended capabilities

Networking, automatic external dependency discovery, devices and all unselected components are disabled. Only `file` and `pipe` protocols are enabled. PNG/JPEG, PCM WAV, FLAC, AAC and MPEG-4 use native codecs. MP3 requests the operating system's `mp3_mf` encoder; its availability and behavior in an AppContainer remain a required runtime check. Native MPEG-4 replaces H.264 for this candidate and requires matching codec disclosure and output validation before integration.

No GPL or nonfree configure flag is requested. zlib is the only additional source component selected. Windows UCRT, Media Foundation and D3D11 are operating-system interfaces. The D3D11 interface is needed by the Media Foundation implementation even though no hardware encoder is selected. The toolchain and its runtime licensing remain separately documented by their distributor; this recipe does not relabel them as FFmpeg source.

## Acceptance state

Source verification and recipe checks have passed. Configuration, compilation, exact output inventory, six-format isolated runtime checks, source-package validation and parent packaging are still required. This document does not claim the candidate is ready to distribute.
