# Archive and structured-data adapters

The bundled adapters run inside the same AppContainer as PDF conversion. No external executable, PATH lookup, service, or downloaded package enables these formats.

## ZIP

`zip-list`, `zip-extract`, and `zip-repack` accept one ZIP file. Listing exports a JSON entry index. Extraction requires an approved destination-directory grant and preserves relative paths. Repacking supports stored and Deflate entries, validates the resulting archive by reopening it, and compares every name and byte sequence.

Only stored and Deflate entries with UTF-8 or ASCII names are supported. Encrypted archives, ZIP64, multiple volumes, symbolic links, special files, unsafe paths, duplicate case-insensitive names, file/directory conflicts, corrupt CRCs, overlapping payloads, and unsupported compression methods are rejected. Limits are 1,000 entries, 16 MiB per expanded entry, 64 MiB total expanded content, a 100:1 expansion ratio, 16 path components, and 240 UTF-8 bytes per name. The overall input cap remains 64 MiB. These conservative limits intentionally reject some otherwise valid archives.

All destination paths are checked before output publication. Existing files are never replaced by directory extraction. Parent directories cannot redirect through symbolic links or junctions. Each output is published atomically; a competing external writer during publication can still stop a later output, in which case completed output names are reported. No source file is changed. Archive comments, extra fields, permissions and unsupported metadata are not restored or retained; extraction and repacking require the disclosure confirmation.

## CSV, TSV and JSON tables

The six directions are CSV/TSV to JSON, JSON to CSV/TSV, and CSV to TSV or TSV to CSV. JSON tables are rectangular arrays of string arrays. Headers are ordinary first-row strings; values are never guessed as numbers, dates, booleans, or formulas.

CSV permits comma, semicolon, or tab delimiters. TSV uses tabs. Quoted delimiters, embedded CR/LF, doubled quotes, empty cells, blank rows and header-only documents are supported. Output line endings can be LF or CRLF. Strict UTF-8 is required and BOM removal is disclosed. Malformed quoting, unequal row widths, nonstring JSON cells, invalid Unicode and resource-limit violations are rejected. Every output is reparsed and compared with its intended table.

Limits are 16 MiB input/output, 100,000 rows, 1,024 columns, 1,000,000 cells and 1 MiB per cell. Spreadsheet applications may evaluate formula-like strings. The visible policy is explicit: reject such cells, preserve them with a warning, or prefix an apostrophe and report the changed-cell count. The UI defaults to rejection. Conversion requires the disclosure confirmation.

XLSX, ODS, 7z and RAR remain visibly unavailable. Delimited-text support is not described as a full spreadsheet engine.
