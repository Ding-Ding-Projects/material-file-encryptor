# External instruction currency check

`scripts/check-vocabulary.mjs` checks the currency of an explicitly configured external instruction source without copying its content or digest into this repository. It is read-only and does not prove that a person or agent read or applied the instructions.

## Configuration

Set the process environment variable `PRIVATE_INSTRUCTIONS_SOURCE` to an existing absolute filename outside this repository. The checker does not search personal directories or guess a source location. When the setting is absent, it prints a generic skip message and succeeds, allowing contributors without private instructions to build. An empty or invalid setting fails.

The external source must have exactly one level-two heading named `Vocabulary and locations`. The dictionary section starts at that heading and ends immediately before the next level-one or level-two heading, or at the end of the file. Heading recognition uses regular expressions at the start of a line. CRLF and CR are normalized to LF, and the section ends with one LF before hashing with SHA-256. Other sections do not affect its digest.

The sidecar filename is the configured source filename followed by `.lock.json`. Its strict schema contains exactly two fields: numeric `version` equal to `1`, and `sha256` containing the lowercase 64-character section digest. Keep the source and sidecar outside the public repository. The owner creates or refreshes the sidecar only after reviewing the canonical source. Builds and pushes never generate, repair, or update it automatically.

Missing sources, missing or malformed sidecars, stale digests, duplicate or absent headings, invalid UTF-8, and oversized input fail with exit code 1. Source text is limited to 2 MiB and the sidecar to 4 KiB. Output contains no source path, instruction text, digest, count, or underlying exception detail.

## Hook and build integration

The checked-in `.githooks/pre-push` invokes the same checker and propagates its exit status. Activating a hooks directory remains an explicit repository-owner operation; do not overwrite an existing hook configuration. The hook needs Node.js on PATH and does not install tools. The parent build entrypoint must separately invoke `node scripts/check-vocabulary.mjs` before build work. Adding these files alone does not claim that the build invocation or local hook configuration is active.

Run `node --test test/check-vocabulary.test.js` for neutral synthetic fixtures covering absence, a valid lock, stale and malformed locks, line endings, scope extraction, external-path enforcement, and non-disclosing output. No canonical private content is included in those fixtures.
