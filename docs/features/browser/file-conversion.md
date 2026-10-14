# Browser-initiated local conversion

The Connection workspace provides Source, Formats, Review and Jobs steps. Pair first, choose a source through the desktop picker, load the verified catalogue, select a compatible format, then choose output and confirm on the desktop. The browser receives only an opaque selection identifier, detected type and byte count. File names, paths, contents, previews, hashes and credentials remain native.

## Current adapter boundary

This increment supports four fixed-option adapters: `json-format`, `text-utf8`, `base64` and `hex`. Formats are enabled only when the existing native service reports the bundled adapter and verified operating-system isolation available. Every catalogue category remains visible with a searchable list. Other adapters are visibly disabled because their browser options are not yet supported. Native-unavailable adapters remain disabled. This increment does not complete the universal converter requirements, PDF operations, other format options, batch selection or output-open/export controls.

The review states the selected format's encoding and metadata behavior. Native confirmation shows the exact source and destination and repeats the disclosure. Sources remain unchanged. Output is never allowed to replace an existing file. The existing converter performs bounded byte detection, source revalidation, capacity checks, isolated conversion, validation and atomic publication.

## Acceptance, progress and cancellation

Before admitting a job, the native service checks live browser authority immediately before atomically publishing its queue record. Revocation before this boundary prevents admission. Once accepted, durable work belongs to the desktop and continues even if the browser disconnects or its response is lost. The browser does not revoke accepted work merely because a temporary connection expires.

Jobs shows at most 20 records per page, filtered by a native-generated owner identifier bound to the paired session. Paging streams the durable queue rather than retaining all jobs in browser memory. Refresh reads actual states and coarse native progress, not estimated completion. Pause, resume and cancel require explicit native confirmation and enforce the same owner boundary. Native error details and output names are not forwarded. A failed job directs the user to the desktop.

Stop waiting and disconnect cancels pending browser admission, not already accepted jobs. An acknowledgement lost after acceptance is explicitly uncertain: inspect the desktop. Re-pairing creates a new visibility scope; prior jobs remain recoverable through desktop history. Restart recovery uses the existing durable converter queue and protected native grants. No browser-only setting pretends to restore native access.

## Verification

`test/extension-converter.test.js` covers rejection before atomic admission, durable completion after acceptance, owner-filtered listing/control, safe metadata projection and typed requests. `test/extension-converter-controls.test.js` exercises production controls with a deterministic DOM model. The native/extension transport checks reject extra fields and path-bearing responses. These checks do not prove installed native isolation, signed-extension installation, real dialogs, visual layout or an actual packaged conversion. Those runtime acceptance steps remain unverified.

Browser pages use one-use physical continuation cursors, not numeric offsets. Each scan inspects at most 64 directory entries, 256 KiB in total and 32 KiB per record, with cancellation checked between reads. A page can contain no owned jobs while still offering Continue scan. Restart list closes the prior cursor. Revocation closes owned cursors and releases unaccepted prepared-source grants; accepted-job grants remain for recovery. Queue controls check authorization at atomic publication and again before worker effects. A control already durably accepted still reconciles its worker under the record lock after caller revocation.

Native close receipts include pendingDisposals. A bounded close timeout remains unverified while any grant disposal is unsettled. A later close readback can verify after settlement without repeating grant release or process termination.

A failed unaccepted-grant release retains its exact owned disposal action. A later explicit close retries unfinished actions once, without replaying successful releases or process termination. Persistent rejection remains incomplete. Native removal compares the retained grant record and refuses a changed record; newly picked grants receive new identifiers. Disposal waits for any in-flight acceptance decision so accepted recovery grants are never selected for release.
