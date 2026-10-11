# Storage maintenance

Open Storage maintenance from the workspace navigation after unlocking a drive. Refresh storage reads actual native diagnostics. It separates parts referenced by current files, parts retained only by history, temporary files, queued files and active writers. Counts and byte totals describe physical encrypted storage, not plaintext file lengths.

The physical part target is entered in MiB. The default 80 MiB is exactly 83,886,080 bytes. The maximum is 90,000,000 bytes. Pack current files queues a cancellable native operation and saves the requested target. Active writers may delay packing; close or finish writing those files before expecting the queue to drain. Existing file contents and historical references remain subject to the engine's durability rules.

Each packing row reports its state, phase and transferred bytes. A total that is not yet known uses indeterminate progress. Cancellation requests cancellation of that operation, rather than claiming immediate rollback. Refresh again to observe its terminal result.

Current-reference and history-only counts are deliberately separate. Historical versions can continue to retain older parts after packing. Packing does not pad short parts, rewrite all history or guarantee that total storage immediately decreases. The panel provides no history deletion or garbage-collection shortcut.

Bridge validation rejects unexpected fields, traversal paths and oversized targets. The desktop must be unlocked and accepting work. Requests rejected during application shutdown or update preparation do not start a new operation. This panel does not install an update or restart the computer.

Focused synthetic tests cover byte conversion, bridge validation and progress semantics. Actual runtime interaction and layout evidence are recorded separately during integration; source tests do not prove the mounted workflow.
