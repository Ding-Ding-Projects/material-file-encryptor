# Record export matrix

All files use UTF-8. JSON, JSON Lines, YAML, TOML, XML, Markdown, HTML and SQL use LF; CSV and TSV use CRLF rows. The final newline is included. Exports are bounded to 10,000 records and 16 MiB of serialized JSON input. Exceeding a bound rejects the operation without truncation.

| Surface / record | Formats | Scope and actions | Exclusions |
| --- | --- | --- | --- |
| Unlocked private history metadata | JSON, JSONL, YAML 1.2, TOML, XML, CSV, TSV, Markdown, HTML, SQLite SQL | Individual checkbox selection, all filtered, invert filtered, clear, selected export, filtered export. Compare requires exactly two. Existing restore and label remain individual actions. | Snapshots, credentials, vocabulary and custom image bytes remain omitted, declared in every export. |
| Shared adapter | Same ten formats | Caller supplies the exact reviewed record set and redaction policy. | It does not read storage or implicitly redact arbitrary data. |
| Notifications | Adapter available | Consumer integration belongs to notification center. | Not verified by history tests. |
| Appearance and logo images | Existing local snapshot / appearance transfer only | Separate image safety rules apply. | This record adapter does not export image bytes. |

JSON and YAML preserve the versioned envelope. YAML uses the strict JSON subset of YAML 1.2. JSONL begins with a manifest and wraps each complete record. TOML stores each record as a JSON string in records_json. XML stores escaped complete JSON in record-json elements. CSV/TSV use schema_json, omissions_json and record_json columns, so nested fields and types survive instead of being flattened away. An empty table contains one manifest-only row with an empty record_json cell. Markdown and HTML contain escaped complete JSON in a preformatted block. SQL targets SQLite and inserts one complete JSON envelope into a dedicated record_export table inside a transaction; importing into an existing table fails rather than replacing it.

Generated language source, Protobuf and JSON Schema are not supported for these variable history metadata records: they describe executable bindings or a type contract, not a faithful record interchange without an additional schema decision. PDF, workbook and image exports are outside this bounded structured-record adapter. An archive is unnecessary for one self-contained text document. These exclusions do not claim universal export completion.

The adapter rejects cycles, sparse arrays, non-finite numbers, unsupported objects, hidden fields and computed accessors. Markup escapes active syntax and HTML prohibits external resources. SQL quotes apostrophes. Table cells contain JSON syntax rather than raw formula-bearing text. Selection is resolved from the currently visible filtered rows immediately before export, with an unlocked-session check after decryption. No bulk destructive removal is added; the existing confirmed retention prune remains the removal workflow.

Runtime capture remains pending the production matrix. Source checks are not visual evidence.
