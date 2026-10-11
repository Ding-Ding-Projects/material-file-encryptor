# Native helper status measurements

Measured at 2026-10-11T00:30:32.294Z on Windows x64. The existing packaged helper was exercised through the repository's `NativeClient` JSONL pipe. Five fresh helper processes each answered one initial status request followed by twenty sequential warm status requests. Each process exited after its input pipe closed. No vault was created or unlocked, no drive was mounted, no file was imported or exported, and no GUI was launched.

| Measurement | Observed milliseconds |
| --- | --- |
| Initial status, process 1 | 185.398 |
| Initial status, process 2 | 98.099 |
| Initial status, process 3 | 99.309 |
| Initial status, process 4 | 91.678 |
| Initial status, process 5 | 98.980 |
| Warm status, minimum of 100 | 0.112 |
| Warm status, median of 100 | 0.167 |
| Warm status, maximum of 100 | 0.690 |

The driver probe reported available. Initial latency includes process startup and native initialization. The operating-system cache was not flushed. Warm latency includes client dispatch, JSON serialization and the pipe round trip. No concurrent work was introduced by this measurement. These figures cannot establish encryption throughput, large-file latency, responsive behavior under active transfer, durability, cancellation time, browser speed or installed behavior.

The measured executable SHA-256 was `b2dca6f3acf8e5cae3fd032c85068a51a30b035021dfbe9bf2675bad9cd71c9f`; its managed assembly SHA-256 was `c1a1aeaed74edcbb6211058578b277184ead79e735bed2751c76e903b1231bfb`. The package was already present. It was not rebuilt or rebound to the current source, so source equivalence is **unverified**. The complete 105 samples and scope limits are retained in `native-helper-measurements.json` beside this article. This article deliberately provides no source-performance or release-acceptance claim.

## Later source-bound performance and lifecycle results

The [native lifecycle and performance evidence](native-lifecycle-performance.md) records a different measured helper, idle CPU normalization, status latency during active synthetic import, cancellation and ten ordinary mounted-operation checks. Its distinct hashes and source boundaries must not be mixed with the earlier status samples above. A concurrent forced-detach mapped-writer native fatal exception remains unresolved; ordinary passes do not establish full safety.
