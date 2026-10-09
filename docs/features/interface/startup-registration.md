# Startup registration readback

The startup preference and the operating system's startup registration are separate facts. Saving the preference requests registration through the native login-item API; status reads the actual registration rather than assuming that the saved preference proves it exists or is enabled.

## Paths containing spaces

The pinned desktop runtime, version 44.7.0, parses the lookup path passed to `getLoginItemSettings` as a command line. An unquoted executable path containing spaces can therefore match only its first segment, while `setLoginItemSettings` has correctly written a quoted full path to the Windows Run entry. This produces a false disabled readback despite a successfully created registration. The behavior is described in the [upstream correction](https://github.com/electron/electron/pull/54364) and appears in the [pinned native implementation](https://github.com/electron/electron/blob/v44.7.0/shell/browser/browser_win.cc#L194).

The main process wraps only the getter's executable path in one pair of quotes and passes the exact `--startup` argument separately. Both verification-entry readback and ordinary application status use this normalization. Setter paths, registry ownership, the saved preference, and the native enabled-state result remain unchanged. The normalization also works for paths without spaces and does not duplicate existing surrounding quotes.

## Verification ownership and recovery

Verification creates a unique named entry, reads only that entry, and removes it when restoring the original absent state. A different entry belonging to the user is never modified. An existing verification-name collision stops before any mutation. A false or missing native readback remains a failure; it is not replaced with the saved preference or a success assumption.

Preserve a failed packaged-runtime receipt. A corrected source test does not retroactively make that receipt pass. Rebuild the candidate and repeat actual enable, disable, and restoration through the packaged settings control, including an executable path containing spaces, before claiming runtime acceptance. Confirm the unique entry is absent after restoration. This verifies registration and readback, not a real sign-in launch.

## Focused checks

Run `node --test test/startup-verification.test.js`. On Windows, the regression obtains parsing results from `CommandLineToArgvW`, demonstrates the unquoted-path mismatch, and checks the quoted lookup against a correctly quoted registry command. It covers space and no-space paths, exact arguments and name, unchanged setter input, enable/disable/restore, user-entry preservation, and both readback routes. The native-parser case is explicitly skipped on other platforms; those hosts do not prove Windows parsing behavior.
