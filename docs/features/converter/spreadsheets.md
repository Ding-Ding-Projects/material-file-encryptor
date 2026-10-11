# Spreadsheet table conversion

The converter imports and exports single-sheet XLSX and ODS tables through CSV, TSV, JSON, and each other. Output uses explicit string cells. It preserves leading zeroes, Unicode, whitespace, blank cells, and quoted delimiter content. CSV delimiter, line-ending and formula-like text controls remain available.

This is a table conversion workflow, not a workbook editor. Confirm the disclosed loss of formatting, metadata, original value types and workbook structures. Stored numeric, date, time and boolean values are exported as strings without number-format rendering. Actual formula cells, multiple sheets, hidden XLSX rows/sheets, merged cells, external relationships, macros, embedded objects and unsupported cell structures are rejected. Formula-like string cells use the selected reject, escape or preserve policy; none are evaluated by the converter.

Inputs and outputs are limited to 8 MiB, 10,000 rows, 256 columns and 100,000 cells. ZIP CRC, path, link, expansion and entry limits apply before XML parsing. XML has bounded depth and node count and rejects DTDs and custom entities. Operations run through the existing verified AppContainer worker, with its 256 MiB memory and 30-second time limits. Output is reopened and compared to the intended string table before the queue publishes it atomically.

Focused tests cover round trips, whitespace, shared container detection, CSV options, formula refusal, external links, multiple sheets, huge references, XML entities and repetition limits. The native test also converts both formats and reads them back through a real AppContainer. External office-suite visual fidelity has not been claimed.
