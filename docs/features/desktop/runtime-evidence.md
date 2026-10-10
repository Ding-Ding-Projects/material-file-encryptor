# Runtime rejection evidence

When the installed lifecycle validator exposes a bounded rejected ancestry edge, the project adapter records it before the canonical command handler sanitizes the exception. It rethrows the original exception without authorizing any additional process action.

The recorder accepts only the versioned producer fields for missing-parent or child-before-parent rejection. It validates the exact child and optional parent identity, claimed parent PID, 100 ns creation ticks, absence/order statement and 64 KiB edge bound. Unsupported or unavailable metadata remains unrecorded.

Private records use exclusive new `rejected-edge-<random-id>.json` files directly below the validated saved lifecycle run root. The lifecycle file must be that root's `lifecycle.json`, its saved process must match the rejected validation root, and its state must remain created and not cleaned. Link/reparse components, changed lifecycle state, wrong output roots, existing destinations and unverifiable readback are rejected. On Windows the directory chain is pinned without delete sharing during creation. Each retained record contains the source lifecycle SHA-256, root identity and exact rejected edge. These records remain private diagnostic evidence and must never be published or packaged.

Standard output carries only sanitized failure codes, allowlisted reason/stage and neutral saved/unavailable counts. It never includes the private edge, executable paths or raw native messages. Recording failure preserves the original lifecycle rejection and leaves processes untouched. This evidence explains why proof stopped; it cannot establish process ownership or permit termination.

Focused offline tests cover exact missing-parent and timestamp-order records, unchanged exception identity, multiple retained records, strict schema and size rejection, stale lifecycle context, ownership mismatch, exclusive creation, reparse rejection and stdout redaction. No live desktop verdict is implied by these tests.

## Initial CDP ownership proof

Only the first baseline CDP plan opts into `startupOwnershipAttempts: 3`. The installed driver defaults to one attempt and accepts only integers from one through three. A retry is permitted only for `INVALID_NODE_IDENTITY` when the exact launch root remains valid and the rejected attempt's private snapshot was saved successfully. Each attempt acquires a fresh complete ownership proof, with 500 ms between attempts. Every rejected proof is retained; missing private evidence, any other rejection, or exhausted attempts stops attachment. An earlier failed proof never supplies ownership for a later attempt.

Later interface plans explicitly remove the baseline opt-in. Modern native inspections also remove it when deriving their inspection input from the baseline plan. Modern, keyboard, runtime and recovery plans otherwise retain the one-attempt default. All ancestry, port ownership, exact single-target and teardown protections remain unchanged. Focused source/plan tests verify opt-in placement; they do not claim a successful live startup.
