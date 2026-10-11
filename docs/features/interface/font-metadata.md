# Local font metadata and variable axes

This source foundation reads local font metadata and supplies a separate typed
axis picker. It is not yet mounted in the appearance editor. No native or browser
interaction acceptance is claimed.

## Local inventory

The Windows provider inspects the operating-system Fonts directory and the
current user's Microsoft/Windows/Fonts directory. It enumerates matching files
without a recent-font list or an entry-count slice. Linked entries and paths
escaping the selected location are rejected. Unsupported legacy or compressed
formats and missing locations remain explicit inventory outcomes.

SFNT and TTC/OTC files supply Unicode family/style names, `fvar` axes and named
instances. Each axis has a tag, name, minimum, default, maximum and hidden flag.
Static faces report `static-font`. Naming and variation tables are limited to
4 MiB each, table/collection directories to 4096 records, with checked offsets,
record sizes, version numbers and axis ranges. These resource limits report
unsupported variation metadata above 64 axes or 4096 instances, and per-file
metadata output above 4 MiB. They report
unsupported input rather than silently truncating a successful inventory.
Only the required tables are read. Font files are never changed, installed,
downloaded or returned to the renderer. Face identity uses a location index,
relative file identity and collection index, without an absolute host path.

## Integration API

`personalization.fontMetadata` accepts an optional `requestId`. The matching
`personalization.cancelFontMetadata` aborts that request. Progress events use
`fontMetadataProgress` and include the request identity and outcome counts.
The existing `listFonts` family-name result remains unchanged. Desktop action
allowlisting and the actual editor mount must be integrated before exposure.

`mountFontPicker` accepts a catalogue, `getCurrent`, `mutate`, `translate`,
`attachSearch`, `registerHelp` and `disabled`. It offers searchable face names,
local typeface previews with system/CJK fallback, typed numeric axes, named
instances and a default-axis reset. Applying an invalid or unavailable axis
does not call `mutate`. All admitted changes await that original callback,
which must retain the editor's validation, permissions, persistence and history.
The picker does not create a second storage or history path.

The callback receives `fontFamily` and `fontVariationSettings`. The latter uses
validated axis tags and finite bounded numbers. Selecting a family does not
guarantee selection of a distinct installed style face; explicit face mapping,
bundled-font merging, full typography controls and rendered evidence remain
separate pending integration work. The caller owns cancellation and atomicity
of a mutation already admitted when the picker is destroyed.

## Verification boundary

Fixture checks cover SFNT/TTC names and axes, malformed bounds, cancellation,
linked/outside paths, per-file outcomes, typed draft rejection and one original
mutation callback. One read-only Windows provider probe reported 335 scanned
files, 166 faces, four variable faces and 193 unavailable outcomes. Reasons were
unsupported installed formats and a missing user-font location. That probe read
the provider with SHA-256
`1454a5ad56514d0e478e222622a8d21edaa1244060b9a1a067446d0ba683c503`.
Subsequent relative-identity and resource-bound changes are fixture-verified, not relabelled as
part of that earlier probe. No font installation, raw-byte export, GUI drive or
build occurred.
