# Public website

This self-contained static site is intended to be published at the repository’s GitHub Pages URL. It needs no compilation, external fonts, CDN, analytics, or server API. The root build stages the site and its diagrams together in `out/site`, matching the Pages workflow:

```sh
build.bat /s
python3 -m http.server 8080 --directory out/site
```

Open `http://localhost:8080/`. The deployment places the diagrams in `images/` alongside the page, so all assets also work beneath the repository’s GitHub Pages path. The repository’s Pages workflow owns the final deployed directory layout.

Run the content and behavior checks with `node --test test/site*.test.js` from the repository root. Check 320px layouts, keyboard navigation, light/dark/system appearance, the mobile menu, documentation search, guide links, FAQ, and the preferences dialog in a real browser before publishing.

The site identifies the published preview in `release.js`, but its direct installer CTA stays disabled until independently downloaded, packaged, installed and uninstall receipts are all verified for the exact release source and installer hash. Each receipt also records its actual verification time. `verifiedDownload` rejects missing, pending, draft, mismatched and malformed records. The browser reads this checked-in public summary; it does not independently verify installer bytes. Update it only from completed source-bound receipts. Workflow images are explanatory diagrams, not proof of native integration.

Personal vocabulary files use the canonical `schemaVersion: 1` contract with an `entries` object mapping source strings to replacement strings. Legacy `version: 1` files with a `replacements` array of exact `from`/`to` pairs remain accepted. Files are limited to 256 KiB, source strings to 1–160 Unicode code points, replacement strings to 1,000 Unicode code points, and JSON nesting to depth 8. There is no separate entry-count ceiling. Duplicate keys, unsafe keys, control characters, extra fields, and invalid entries are rejected. Valid wording is applied after the private profile is unlocked and saved locally when browser storage is available. Storage failure leaves wording active for the current session only. Invalid files preserve the prior valid mapping. Reset restores original wording and removes saved wording when storage permits. Nothing is uploaded. Public and locked text stays unchanged; links, technical identifiers, markup, and user input remain canonical. No personal vocabulary file, mapping, or user path belongs in the repository.


The language selector covers English, Cantonese, and bilingual text, including guide content, accessibility names, validation, captions, and dynamic status messages. Commands, URLs, source revisions, and product names remain exact. Search matches both original English and currently displayed translated guide content.

The interactive architecture explainer is conceptual. Its part-size calculation uses an illustrative 16 MB file with the current engine’s 36-byte record framing and up-to-64-KB data records, packed within the chosen physical part cap. The input matches the application’s inclusive 1 KB–1 GB limits (1 KB = 1,024 bytes) and requires a whole number of bytes. It describes example data, not the user’s files. Availability changes the read/write explanation. Playback runs only after a user action, pauses when hidden or offscreen, and becomes manual stepping under reduced motion. No diagram action invokes a filesystem or native driver.

The gallery preserves five genuine Linux captures and the historical Windows evidence at their original source revisions. Four current packaged Windows captures at source `1e16dea8` show reviewed recovery and appearance states; their inventory contains original hashes and recorded UTC times. These images do not substitute for verification of a later published installer.

Capture provenance uses a translated description followed by a literal revision in a `code` element. Update the revision independently of the locale catalog. Image dimensions match `docs/images/captures/provenance.json`. The key-file selection image shows the real credential controls and scrollbar; the recording never autoplays.

## Publication inventory and privacy

The root build publishes a fresh stage from explicit runtime assets, conceptual diagrams and reviewed original captures. It does not recursively publish `docs/site` or `docs/images`. Raw receipts and source snapshots remain outside the deployment. An existing stage is moved to a separate ignored preservation directory before replacement, so stale files cannot remain reachable in the new stage.

`gallery-review.json` lists approved original paths and binds each to its reviewed source revision and image SHA-256. `publication.mjs` verifies these bindings, original bytes and dimensions before staging. Generated `gallery-inventory.json` is the public, selected metadata record. Missing original capture timestamps remain unavailable.

Two historical captures are withheld because their pixels contain absolute local storage or cache paths. Their original bytes were preserved privately before removal from the current tree. No image was edited or reconstructed. Current removal does not undo historical publication and does not rewrite history. New captures require individual pixel review and source-bound provenance before joining the allowlist.

## Reviewed gallery publication pipeline

The gallery keeps its finite approved inventory in `docs/site/gallery-review.json`: 14 historical originals and two explicit exclusions. No new desktop or website capture is accepted by this change. Fresh runtime and publication verification remain separate requirements.

Approved records are grouped under reviewed workflow IDs with stable anchors. Each exact image SHA-256 appears once in the visual gallery; every recorded occurrence retains its own state, source revision, original-image link, theme, renderer scale, timestamp/timezone and verification scope. A duplicate across workflows belongs visually to the first approved occurrence's workflow and remains searchable by every occurrence's workflow. Original bytes and approved paths are retained, never rewritten or discarded. Images load lazily with intrinsic dimensions; provenance uses native expandable details. Search counts image cards, hides empty workflow groups and their navigation links, and leaves exclusions visible.

The public JSON is an explicit field projection. Unknown metadata, raw receipts, process identities, machine paths and approval bookkeeping are not copied into it. New additions require an explicit approved path and reviewed source/image binding, an exact `promotionReceiptSha256`, and `reviewedBindings[path].metadataSha256` matching SHA-256 of `JSON.stringify(projectGalleryRecord(record))` after its reviewed workflow is applied. The promotion receipt remains private; its digest is a reference, not proof that a reviewer inspected pixels. Perform the source-bound promotion workflow before approving the row. No digest replaces real provenance, closure or privacy inspection.

Optional public provenance fields are `artifactSha256`, `promotionReceiptSha256`, `viewportWidth` and `viewportHeight`. Missing historical values remain absent or visibly unavailable. Capture dates and timezone come only from validated producer provenance, never filenames, filesystem timestamps or publication time. Scale describes the recorded renderer scale and does not establish physical display scaling.

Focused verification uses `node --test test/site-publication.test.js test/site.test.js`. Negative cases cover unreviewed metadata, missing promotion proof, malformed provenance, overlapping exclusions and duplicate workflow IDs. A synthetic 445-occurrence case verifies exact-byte deduplication without losing occurrence records; it is a data test, not a claim that 445 genuine captures exist. Rendered acceptance of this new grouping remains pending.
