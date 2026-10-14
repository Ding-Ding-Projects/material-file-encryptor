# Local renderer task timing

The desktop renderer exposes a read-only `window.mfePerformance.snapshot()` for an owned local measurement. Records contain fixed phase and view identifiers, a process-local sequence, an outcome, and monotonic start and duration values. The default retains 128 completed records and at most 32 pending spans. Nothing is uploaded or persisted. Queries, file paths, article text, credentials and native response payloads never enter a record.

The first locked-drive ready record requires current locked status, available create and unlock actions, and connected visible content. History and Recycle navigation readiness follows the current archive request, filtered rows and controls. Documentation readiness follows the initial article and its filtered navigation. Successful empty collections remain ready; unavailable work, worker errors, superseded requests and disposal retain separate outcomes. Mount and startup settlement are phases, not proof that every workflow is ready. Other navigation is explicitly unmeasured.

Ready content also waits for observed static stylesheet loading, the document font readiness promise, registration of current custom elements and their exposed initial update completion. This does not prove pixel correctness, accessibility, every nested shadow component, or later interactions. Observation runs alongside startup, with a five-second bound. It changes no scheduler or native operation. Closing the page aborts observers and settles pending timing records as disposed.

Compare normal production packages using identical isolated fixtures, build configuration, viewport, scale, theme, language, native availability and interaction sequence. Record the source commit, package hash and raw snapshots separately. Use the renderer's monotonic durations; exclude tool attachment, polling, screenshots and verification overhead. Compare multiple cold starts separately from repeat navigation. Development or verification profiles are separate cohorts. No end-to-end speed improvement is claimed by this instrumentation, and built runtime measurements remain pending.

Focused synthetic tests cover fixed identifiers, bounded retention, read-only snapshots, stale navigation, disposal, actual resource completion, timeout and failure, successful empty searches, regex worker failure and concurrent request outcomes. These tests do not replace packaged runtime verification.

## Renderer test cancellation and timing

The source renderer cases keep their original 120,000 ms and 90,000 ms test
deadlines. Their actual test-context `AbortSignal` controls the raw page,
locator, keyboard and mouse adapters before the Material control wrappers.
Admission is checked before dispatch, again after awaited progress persistence,
and after an already dispatched operation settles. This also prevents a
Material field's evaluation from chaining into a later input after cancellation.

An in-flight operation is not retroactively reported as cancelled or killed.
Its actual settlement may append a completion row, then the adapter propagates
the original abort reason so no next assertion or interaction starts. These
checks do not terminate native processes, interrupt an existing driver call or
promise that cancellation and process exit share a timestamp.

Progress is initialized before browser acquisition and uses monotonic elapsed
time from case start. Version 3 `progress.json` adds a one-time `deadline`
snapshot containing elapsed time, last-started and last-completed rows, and
separate phase/request snapshots. Later completion rows and the rolling
128-row history cannot overwrite that snapshot. Existing receipts retain their
original schema and source binding.

Owned browser closure and independent server closure remain outside the aborted
page adapter. Diagnostic page evaluation is skipped once the test is aborted.
Queued progress persistence is drained during teardown. This improves
cancellation behavior and diagnosis; it does not establish faster execution,
successful runtime behavior, capture acceptance or complete native cleanup.

Focused source checks execute the actual adapter functions and both actual case
callbacks with inert page endpoints. They prove post-abort input/evaluation
rejection, cancellation during progress writes and Material evaluation,
truthful in-flight completion, an immutable deadline after history rollover,
and owned closure. Removing cancellation checks or allowing later rows to
rewrite the deadline snapshot makes the targeted check fail.
