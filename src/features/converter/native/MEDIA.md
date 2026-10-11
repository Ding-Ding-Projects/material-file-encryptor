# Isolated media commands

The trusted parent may supply `media: { "operation": "..." }` in the existing
launcher manifest. No other media properties or arbitrary arguments are accepted.
The executable must be staged beneath `payload`: `ffprobe.exe` for `probe`, or
`ffmpeg.exe` for all other operations. The parent verifies executable provenance.

Input is always `work/input-0.bin`, from 1 byte through 64 MiB. Conversion output
is always `work/result-0.bin`. The supported fixed operations are `probe`,
`image-png`, `image-jpeg`, `audio-wav`, `audio-flac`, `audio-mp3`, `video-mp4`, and
`validate`. Validation decodes the selected audio/video streams to a null output
with strict decoding errors. It does not merely inspect the container header.

The existing AppContainer token, zero capabilities, verified one-process job,
256 MiB process-memory bound, 30-second deadline, cancellation, and profile
cleanup apply unchanged. Media executables run directly as that sole process.
The protocol allowlist is `file,pipe`; allocation requests are capped at 64 MiB,
and decoder, encoder and filter thread counts are fixed to one. Output logs are
sampled at 1 MiB and output media at 64 MiB, alongside the existing sampled work
storage limit. These sampled bounds can briefly overshoot between checks.

No automatic rotation or scaling is performed. Image conversion selects the
first video frame. JPEG, MP3 and H.264/AAC conversion can be lossy, metadata and
chapters are removed, and JPEG cannot preserve alpha. The parent must disclose
these effects, reject unsupported source dimensions or ambiguous streams using
a prior isolated probe, and probe plus fully decode every converted result
before presenting it as validated. A completed conversion result explicitly
sets `validationRequired: true`.

`result.json` has schema 1 and the request nonce. Conversion outputs have
`name`, `filename: "result-0.bin"`, and a byte count. Probe results contain a
bounded stream/format description without the staging filename. Validation
returns `details.decoded: true`. All results are covered by the launcher's
existing result SHA-256 receipt. Result metadata is capped at 1 MiB.

Run `media-command.tests.ps1` for fixed-command and receipt assertions. Run
`media-smoke.ps1 -BinaryDirectory <verified-directory>` for actual isolated image,
audio and video conversions, metadata probes, full decodes, unknown-operation
rejection, and rejection of an HTTP-referencing playlist. The latter requires
the verified FFmpeg and FFprobe executables and invokes no external service.
