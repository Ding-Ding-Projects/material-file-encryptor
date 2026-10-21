# External instruction currency check

`scripts/check-vocabulary.mjs` checks the currency of an explicitly configured external instruction source without copying its content or digest into this repository. It is read-only and does not prove that a person or agent read or applied the instructions.

## Configuration

Set the process environment variable `PRIVATE_INSTRUCTIONS_SOURCE` to an existing absolute filename outside this repository. Alternatively, set the repository-local `privateInstructions.source` Git configuration value; the build and hook read it only when the environment variable is absent. The checker does not search personal directories or guess a source location. When neither setting exists, it prints a generic skip message and succeeds, allowing contributors without private instructions to build. An explicitly empty environment variable or invalid setting fails.

The external source must have exactly one level-two heading named `Vocabulary and locations`. The dictionary section starts at that heading and ends immediately before the next level-one or level-two heading, or at the end of the file. Heading recognition uses regular expressions at the start of a line. CRLF and CR are normalized to LF, and the section ends with one LF before hashing with SHA-256. Other sections do not affect its digest.

The sidecar filename is the configured source filename followed by `.lock.json`. Its strict schema contains exactly two fields: numeric `version` equal to `1`, and `sha256` containing the lowercase 64-character section digest. Keep the source and sidecar outside the public repository. The owner creates or refreshes the sidecar only after reviewing the canonical source. Builds and pushes never generate, repair, or update it automatically.

Missing sources, missing or malformed sidecars, stale digests, duplicate or absent headings, invalid UTF-8, and oversized input fail with exit code 1. Source text is limited to 2 MiB and the sidecar to 4 KiB. Output contains no source path, instruction text, digest, count, or underlying exception detail.

## Hook and build integration

The checked-in `.githooks/pre-commit` and `.githooks/pre-push` first invoke the same currency checker and propagate its exit status. They then invoke `scripts/check-publication-local.mjs` for the complete staged index or outgoing revision history. That adapter delegates to the installed private scanner; missing input, unavailable scanning, contamination and stale reviewed exceptions fail closed. Activating a hooks directory remains an explicit repository-owner operation; do not overwrite an existing hook configuration. The hooks need Node.js on PATH and do not install tools. The root build entrypoint invokes the currency checker after tool bootstrap and before output staging. Local hook and private-source configuration are not part of the distributed source.

Run `node --test test/check-vocabulary.test.js` for neutral synthetic fixtures covering absence, a valid lock, stale and malformed locks, line endings, scope extraction, external-path enforcement, and non-disclosing output. No canonical private content is included in those fixtures.

## Publication workflow and release boundary

`.github/workflows/publication-language.yml` provides the `publication-language` job for pull-request target events and as a reusable prerequisite of the Windows release workflow. The scanner checkout is bound to the reviewed immutable repository variable `PUBLICATION_SCAN_POLICY_SHA`. Candidate and event-base commits are fetched into a separate bare repository as objects only. Candidate actions, package scripts and application code are never executed by this scan.

The owner provisions `PUBLICATION_LANGUAGE_DATA` and `PUBLICATION_LANGUAGE_EXCEPTIONS` through the repository's protected secret store. Only the scanner-consumer step receives them. Rule data reaches the trusted scanner through standard input; reviewed exceptions use a temporary mode-0600 file outside candidate storage and are deleted when the step exits. Scanner children do not inherit the protected environment values. Published output contains a bounded verdict and category counts, without matched text, source snippets or protected input. No dictionary or fixed dictionary digest is tracked here.

Existing-branch pushes and pull requests scan the event-base-relative revision history. Unknown new-branch publication bases fail closed. Explicit manual execution checks the current tree only and does not establish outgoing-history safety. Local hooks act before transmission; remote checks cannot retract a completed push. Required branch protection and installed-hook activation must be read back separately before enforcement is claimed.

The Windows workflow builds, packages and publishes without running test or lint suites. Its publication privacy prerequisite is separate from product verification. Build provenance records `testsRunInCI: false` and an empty `ciTestGates` list. Installed runtime verification remains pending an independent local receipt. Source wiring alone does not establish configured secrets, an activated immutable pin, required protection or a successful remote run; those deployment checks remain pending owner review and readback.
