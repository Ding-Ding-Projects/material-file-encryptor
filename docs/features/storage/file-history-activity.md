# Selected-file versions and activity

The file-details component keeps the selected entry's stable identity, so a rename does not switch history to another file that later occupies the old path. Versions are supplied by `ListVersions(entryId)`. The existing whole-vault history remains available.

## Activity storage

`RecordActivity(entryId, action, path, versionId, detail)` records successful operations explicitly. Supported actions are import, edit, rename, restore, cancel, sync, delete, create, export, and label. Callers must supply only vault-relative paths and concise non-sensitive details, never host paths or credentials. No events are inferred from absent files or fabricated for previous operations.

Each immutable activity object is authenticated and encrypted with the vault key and an activity-specific associated-data domain. The storage and cache folders contain ciphertext `.mfe` objects; names are opaque random identifiers. `SynchronizeActivity()` verifies objects before copying between storage and cache and rejects conflicting identities. Call it from the successful synchronization path. A missing source leaves the local record available for subsequent synchronization. Authentication errors propagate rather than displaying untrusted activity.

`LabelVersion` records a bounded printable label against the immutable version identifier. `ListVersionLabels` returns the most recent label, including an empty label used to clear a previous value. `PreviewVersion` decrypts at most 256 KiB, accepts strict UTF-8 text, rejects binary control characters, and clears its temporary byte buffer. The returned text is intentional in-memory presentation data and must not be logged or persisted unencrypted.

`ListActivity` supports entry, action, inclusive UTC date, and timeout-bounded regular-expression filters. Pages contain at most 500 records. The cursor is the last returned event identifier in timestamp/identifier order. It remains anchored when newer events arrive; an unknown cursor is rejected. Deleting the cache and rebuilding requires calling `SynchronizeActivity` before querying. Activity cannot be listed while the vault is locked.

## Renderer integration

Import `mountFileDetails` from `src/renderer/features/file-details/index.js`, load its adjacent CSS, and pass a root plus `services` and `translate`. The returned object exposes `selectEntry(entry)`, `refresh()`, and `destroy()`. Services use lower-camel-case JSON and provide `listVersions(entryId)` and `listActivity(query)`. Optional `previewVersion(id)`, `restoreVersion(id)`, `exportVersion(id)`, and `labelVersion(id,label)` enable their corresponding controls. Their arguments are immutable version identifiers, not row indexes or current paths.

The Versions and Activity tabs expose date and regular-expression filters, activity type filtering, selection of visible versions, bulk export/restore, and version labels when the service supports labels. Preview accepts text or `{text}` and compares two selections line by line with additions and removals. It caps comparisons at 5,000 lines and renders text using DOM text nodes; binary or larger content must be exported. The host must apply its existing confirmation and destination workflow to restore/export services. Translation is supplied by the owning application. No network or persistent browser storage is used by this component.

## Verification and remaining integration

`test/file-details.test.js` checks date boundaries, regex errors, stable selection, empty results and safe text comparison. `ActivityTests.Run()` checks encrypted persistence, filtering, paging, identity after rename and tamper refusal; the owning test entrypoint must invoke it. The backend mutation and synchronization hooks, controller routing, renderer mount, localized copy, label persistence, and real built-interface verification are integration responsibilities and are not claimed by the standalone component.
