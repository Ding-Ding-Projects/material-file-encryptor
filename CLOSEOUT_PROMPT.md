# Current capture publication handoff

Continue the request to add many current, verified application captures to the existing public gallery for Material File Encryptor.

## Current state

The integrated source is `dff280d05f498211e5105387a4e52aac66578861`. This publication branch starts from that exact source. Existing gallery changes are integrated; this handoff records the separate capture-publication assessment. No new image was approved or published.

## Capture inventory and evidence

- The 37-image set from the recent website verification depicts `gallery.html`, the documentation website itself. It is not an application capture set and is excluded from the product gallery.
- The current application run is bound to source `21e627402bd6075f3f9ee9b9e2d33badb82b1af7` and executable SHA-256 `39747c42e5f0514cda250d2fe3cf807e9934ed3ca675ea99feb97e3c880cc0be`.
- The final preserved run inventory contains 403 PNG files: 400 planned modern captures are present, 397 have valid capture probes, and 3 present captures failed tuple validation. Another 45 planned modern captures are absent. Three separate baseline captures are retained.
- Pixel review inspected 288 workspace captures and 112 available dialog and clear-control captures. Across the workspace set, 224 captures have no sensitive pixels observed but remain candidates only, while 64 originals show local machine paths and are withheld. The review recorded 57 language observations and 56 pending table-overflow observations; these counts overlap.
- The dialog and clear-control review found 18 pixel candidates, 17 with matching valid probes. One candidate came from an invalid tuple. Publication readiness remains zero. Thirteen clear-control tuples completed.
- The run ended with `CLI_INVALID_RESULT`; full workflow verification is false. Graceful exit, recorded-process absence, desktop closure, startup restoration and credential forgetting were recorded. No GUI key was created. Physical display-scale acceptance remains unverified.
- Pixel review and a valid probe do not supply a canonical publication receipt. Per-image canonical receipts, dedicated privacy-scan receipts, publication inventory and documentation bindings, and a build timestamp are still absent. The production receipt and logs do not record the build start or completion time needed for `artifactBuiltAt`. No filename or filesystem timestamp was substituted.

## Next safe work

Record UTC build start and completion times in future production receipts. Then finish the affected and missing capture matrix against the integrated source, preserve exact per-image privacy and interaction evidence, produce the canonical promotion receipts and documentation bindings, and verify the updated public images individually. Until those receipts exist, leave all new application captures out of the public gallery. Preserve every original and its existing review result.
