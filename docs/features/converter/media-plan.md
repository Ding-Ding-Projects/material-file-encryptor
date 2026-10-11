# Offline image, audio and video integration plan

Status: planned, not enabled. No executable has been downloaded or accepted as part of this plan. Existing unavailable catalog entries remain unavailable until the complete package, isolation and runtime checks pass.

## Source and package ownership

The first media implementation can use one minimal static FFmpeg build for PNG/JPEG images, WAV/FLAC/AAC audio, and MPEG-4/AAC MP4 video. Pin **FFmpeg 9.0.2** from its official signed source release, not a moving executable URL. The [official download page](https://ffmpeg.org/download.html) lists that release and its signature procedure; it explicitly states that the project distributes source, while linked Windows binaries are third-party builds. Its published release key fingerprint is `FCF986EA15E6E293A5644F10B4322F04D67658D8`.

The parent build owns source acquisition, signature verification, SHA-256 pinning, the reproducible toolchain/build recipe, license notices, packaging, and the final executable hashes. Do not enable a format from a developer installation or PATH. Build only the named encoders/decoders/muxers/demuxers/protocols, with network and external-program integrations disabled. Keep a machine-readable exact codec inventory from the accepted binary. Optional GPL components or additional codec libraries require their own version, source, license and hash entries before use.

A second image-specific phase may use **ImageMagick 7.1.2-33** from the [official distribution](https://imagemagick.org/download/) when features beyond the initial PNG/JPEG route are needed. Its exact source/signature and dependency inventory must be reviewed independently. A strict [security policy](https://imagemagick.org/security-policy/) must deny delegates and every coder except the selected formats. This second tool is unnecessary for the first image implementation and must not be downloaded merely because it appears in this plan.

Example source-manifest entry, deliberately incomplete until source verification:

```json
{
  "id": "ffmpeg",
  "version": "9.0.2",
  "sourceUrl": "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz",
  "signatureUrl": "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.asc",
  "signingKeyFingerprint": "FCF986EA15E6E293A5644F10B4322F04D67658D8",
  "sourceSha256": null,
  "buildRecipeSha256": null,
  "binarySha256": null,
  "enabled": false,
  "state": "awaiting-source-verification-and-local-build"
}
```

Null hashes are not accepted by runtime code. The packaging step replaces them only with verified values, includes every required binary/library, and emits the immutable package manifest.

## Converter-owned implementation

1. Add a native launcher mode for an explicitly identified and hash-verified media executable. Preserve the current Node mode. The trusted parent chooses one fixed argument template from an adapter ID; renderer values never become arbitrary arguments or shell commands.
2. Stage the executable and approved libraries read-only. Stage selected bytes under fixed input names. Run one executable per fresh AppContainer and one-process job; do not permit Node to spawn FFmpeg inside its current job. Preserve zero network capabilities, token/job readback, memory/deadline/storage bounds, cancellation, profile deletion, and nonce-bound receipts.
3. Use a separate bounded FFprobe invocation to inspect dimensions, stream count, frame count, duration, sample rate and channels. Reject unsupported streams, playlists, external references, excessive dimensions/duration, and malformed metadata. The [protocol documentation](https://ffmpeg.org/ffmpeg-protocols.html) defines `protocol_whitelist`; explicitly allow only `file,pipe`, never the default protocol set. Build-time network disabling and AppContainer network denial remain additional boundaries.
4. Initially cap still images at 8 megapixels and one frame, audio at two channels/48 kHz/10 minutes, and video at 1920x1080/30 fps/60 seconds. Use the existing 256 MiB memory and 30-second process deadline initially; larger limits require measured evidence and an explicit adapter contract. Input/output byte limits remain enforced independently.
5. Execute only fixed conversion templates. Example PNG target arguments: `-nostdin -hide_banner -loglevel error -protocol_whitelist file,pipe -i input.bin -map 0:v:0 -frames:v 1 -pix_fmt rgb24 output.png`. Paths are fixed staged names and options are bounded enumerations. Audio/video templates explicitly select streams, codecs, sample formats and muxers. Disable unselected streams and metadata rather than relying on automatic selection.
6. Reopen every output in a fresh isolated probe and verify its signature, streams, dimensions, duration, frame/channel limits and requested codec. Decode a bounded sample where applicable. Only then return output bytes to the existing atomic publisher.
7. Expose previews and exact disclosures before enqueue: JPEG quality and transparency loss; image metadata/profile removal; animation reduction; audio resampling/bit-depth or channel changes; video frame-rate/resolution changes; codec loss and unsupported subtitles/attachments. Require explicit confirmation for each lossy path.

Runtime-manifest shape after verification:

```json
{
  "adapterId": "image-png",
  "tool": "ffmpeg",
  "toolVersion": "9.0.2",
  "executable": "media/ffmpeg.exe",
  "executableSha256": "VERIFIED_SHA256_REQUIRED",
  "companions": [],
  "argumentTemplate": "image-to-png-v1",
  "protocols": ["file", "pipe"],
  "limits": { "inputBytes": 67108864, "outputBytes": 134217728, "pixels": 8000000, "frames": 1, "milliseconds": 30000, "memoryBytes": 268435456 },
  "enabled": false
}
```

## Acceptance before enabling

Verify the exact packaged binary offline with PATH empty; reject a missing/changed executable or library hash; exercise valid and malformed fixtures for every enabled pair; test network/external-reference rejection, timeout, cancellation, memory and expansion bounds; verify source immutability and destination rollback; inspect the actual UI previews, disclosures and queue outcomes. Disabled entries are not completed implementations.
