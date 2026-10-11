# Local model regression verification

The independent review of source `b66b82c07fa194386ba910bd0e0f0f002987e9ac` identified three defects. This record describes the focused repair and its verification, not a packaged UI acceptance verdict.

| Defect | Repair | Regression |
| --- | --- | --- |
| Concurrent initial calls observed empty state while the initial file read was still pending. A mutation could persist those defaults. | Every initial reader and mutation awaits one shared initialization promise. | Concurrent catalog/cart/session reads plus a cart mutation preserve seeded disk state. |
| Tag parsing scanned 2,800 characters past an anchor, borrowing the next tag's size and context. | Metadata comes only from the current tag anchor. Missing values remain null. | An unknown tag directly before a `4GB`, `8K` tag retains null values while its neighbor gets the reported values. |
| A repeated-quantifier expression ran synchronously in the renderer. | Expressions execute only inside a disposable worker with a 150 ms deadline. Superseded queries and destruction terminate pending workers; invalid results leave no old actionable rows. | The actual worker times out on `'a*'.repeat(20) + 'b'` against 100 `a` characters, while a 25 ms main-event-loop timer fires. Valid anchored search, invalid syntax, replacement, disposal and bounds are covered separately. |

For each defect, the original corresponding source file from `b66b82c` was temporarily restored, its focused regression was observed failing, and the repaired bytes were restored in a `finally` block. All three original-source trials returned a nonzero result. The repaired combined run passed all 18 tests:

```text
node --test test/ollama.test.js test/ollama-regex.test.js
tests 18
pass 18
fail 0
```

The pathological-expression test completed in approximately 156 ms in that run. This duration is observational, not a guaranteed scheduling bound for every machine. The deadline includes worker startup. No model service was started, no model downloaded and no real user history used. Browser worker creation under the final packaged content-security policy still requires integration verification.
