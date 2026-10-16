# Personal wording

The desktop settings accept a UTF-8 JSON file with either canonical `{ "schemaVersion": 1, "entries": { "Original": "Replacement" } }` or legacy `{ "version": 1, "replacements": [{ "from": "Original", "to": "Replacement" }] }`. Files are limited to 256 KiB. There is no entry-count limit. Keys are limited to 160 Unicode code points and values to 1,000. Duplicate JSON keys, duplicate source strings, control characters, unsafe object names, extra fields (other than the optional `displayName` described below), unsupported versions and nesting beyond eight levels are rejected before any change is applied.

Validation is atomic. Invalid replacement files preserve the active mapping. Replacements match original labels once, longest first, without cascading; technical spans such as URLs, paths, numbers and command examples remain unchanged. Mappings affect label text only and are rendered as plain text.

Each accepted revision compiles one literal Unicode trie. A linear scan identifies protected technical spans without a generated regular-expression alternation. Rendering accepts at most 65,536 UTF-16 code units of input, performs at most 1,000,000 trie transitions, and produces at most 262,144 UTF-16 code units. If any render limit is exceeded, the whole original label is returned unchanged. Nothing is truncated or partially replaced. These are per-render resource limits, not limits on the number of entries accepted in a valid file.

Mappings stay in this device's local preferences. A failed storage write reports session-only use rather than claiming persistence. Reset restores original labels and removes mappings from stored preferences, with an explicit warning if storage cannot be changed. Actual mappings cannot be downloaded through an export control. They are never sent to network services, logs or telemetry.

The public documentation starts locked. Its visible picker validates files locally and retains a pending valid file only in memory. Public text remains unchanged until the private-profile controller calls `setAuthenticatedLocalSession(true)`. Only then does it read the local cache and apply wording. Calling it with false restores public wording immediately. Clearing works while locked too. The authentication controller is a separate integration requirement; this module does not claim that selecting a file authenticates a reader.

Focused tests cover canonical and legacy data, large inventories, Unicode limits, malformed and duplicate JSON, atomic rejection, cache validation, storage failures, reset and single-pass replacement.

## Callback fixture verification

The source-only upload fixture now executes the actual encrypted-cache persistence functions and bounds callback extraction before unrelated foundation mounting. It verifies locked pending input, authenticated encrypted storage, invalid input preservation, rejection after locking and asynchronous reset. This is not browser, packaged or installed acceptance.

## Drop to apply and the celebration

A personal wording file can also be dropped anywhere on the desktop window or on a browser extension page (the workspace and the popup). The Settings upload stays as the fallback and uses exactly the same validation, storage and celebration. Only a drag that carries files is handled. A drop into a text field is left to the field. Exactly one `.json` file within the size limit is accepted; anything else, or an invalid file, is refused with a localized message and nothing changes. A visible drop target with a reduced-motion fallback appears while files are dragged over the window.

A file may carry an optional top-level `displayName`, for example `{ "schemaVersion": 1, "displayName": "Team words", "entries": { "Original": "Replacement" } }`. It must be plain text of at most 40 Unicode code points, with no control characters or angle brackets, and it is never stored with the replacements. Files without it remain valid.

After wording applies, a full-window, non-blocking celebration animates the `displayName` in, holds for about three seconds and animates out, using the shared motion tokens. Without a `displayName` it shows the neutral text "Personal wording applied". It is announced with `role="status"` and `aria-live`, never takes focus and shows nothing else from the file. Under reduced motion it is a static notice for three seconds.

In the browser extension, wording applies only while the browser is paired with the desktop. If it is not paired, the dropped file is stored, a notice says it will apply after pairing, and no celebration plays.
