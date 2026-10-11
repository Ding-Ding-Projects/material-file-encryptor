# Personal wording

The desktop settings accept a UTF-8 JSON file with either canonical `{ "schemaVersion": 1, "entries": { "Original": "Replacement" } }` or legacy `{ "version": 1, "replacements": [{ "from": "Original", "to": "Replacement" }] }`. Files are limited to 256 KiB. There is no entry-count limit. Keys are limited to 160 Unicode code points and values to 1,000. Duplicate JSON keys, duplicate source strings, control characters, unsafe object names, extra fields, unsupported versions and nesting beyond eight levels are rejected before any change is applied.

Validation is atomic. Invalid replacement files preserve the active mapping. Replacements match original labels once, longest first, without cascading; technical spans such as URLs, paths, numbers and command examples remain unchanged. Mappings affect label text only and are rendered as plain text.

Mappings stay in this device's local preferences. A failed storage write reports session-only use rather than claiming persistence. Reset restores original labels and removes mappings from stored preferences, with an explicit warning if storage cannot be changed. Actual mappings cannot be downloaded through an export control. They are never sent to network services, logs or telemetry.

The public documentation starts locked. Its visible picker validates files locally and retains a pending valid file only in memory. Public text remains unchanged until the private-profile controller calls `setAuthenticatedLocalSession(true)`. Only then does it read the local cache and apply wording. Calling it with false restores public wording immediately. Clearing works while locked too. The authentication controller is a separate integration requirement; this module does not claim that selecting a file authenticates a reader.

Focused tests cover canonical and legacy data, large inventories, Unicode limits, malformed and duplicate JSON, atomic rejection, cache validation, storage failures, reset and single-pass replacement.
