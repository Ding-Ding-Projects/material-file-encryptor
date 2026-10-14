# Full note reading and safe rendered text

The Notes tab retains a short list preview and provides **Read full note** for the complete saved body. The reader and note wizard review render Markdown through the same DOM-only renderer used for bundled documentation. Headings, emphasis, lists, tables and fenced code retain their structure. The original note remains unchanged. **Export full note** saves its complete Markdown body and title as UTF-8.

The reader supplies no asset catalogue and no relative-document routes. Remote images are not loaded. Source HTML stays text. Only HTTPS links without embedded credentials remain actionable; they open without an opener or referrer. Missing images and relative links have explanatory text. Empty text has an explicit empty state. The existing 4,000-character note limit applies before rendering, without silent truncation in the full reader.

This is local note support, not a provider connection or model execution feature. The current native browser bridge exposes download pairing and read-only protection observation, plus a narrowly scoped protected profile-summary operation. The [external-editor workflow](external-editor.md) uses separately authorized native selection and confirmation. The [conversion workflow](file-conversion.md) supports four native-confirmed fixed-option adapters. Model management and School mode still need native operations before the browser can offer working controls. No local browser setting is treated as native authority.

## Verification

Run `node --test test/extension-note-rendering.test.js test/extension-note-lifecycle.test.js test/browser-extension-notes.test.js` for format, full-length, rejected-input and link-boundary checks. These are deterministic DOM-model checks, not installed-browser or visual acceptance. Built extension and genuine runtime capture remain required separately.
