# Public website

This self-contained static site is intended to be published at the repository’s GitHub Pages URL. It needs no build step, external fonts, CDN, analytics, or server API. Stage the site and its diagrams together, matching the Pages workflow:

```sh
node scripts/build-site.mjs
python3 -m http.server 8080 --directory out/site
```

Open `http://localhost:8080/`. The deployment places the diagrams in `images/` alongside the page, so all assets also work beneath the repository’s GitHub Pages path. The repository’s Pages workflow owns the final deployed directory layout.

Run the content and behavior checks with `node --test test/site*.test.js` from the repository root. Check 320px layouts, keyboard navigation, light/dark/system appearance, the mobile menu, documentation search, guide links, FAQ, and the preferences dialog in a real browser before publishing.

The site identifies the published preview in `release.js`, but its direct installer CTA stays disabled until independently downloaded, packaged, installed and uninstall receipts are all verified for the exact release source and installer hash. Each receipt also records its actual verification time. `verifiedDownload` rejects missing, pending, draft, mismatched and malformed records. The browser reads this checked-in public summary; it does not independently verify installer bytes. Update it only from completed source-bound receipts. Workflow images are explanatory diagrams, not proof of native integration.

Personal vocabulary files use the desktop application's version 1 contract: a `version` number and a `replacements` array of exact `from`/`to` string pairs. The optional file picker reads a maximum of 128 KB locally. Validated words replace text nodes only, never markup, URLs, attributes, code, or identifiers. Replacements are held in memory for the current tab and reset on reload. Appearance, language, emoji, and the two 1–5 message tone preferences are saved in local storage. Uploaded vocabulary payloads are never persisted; if a later file fails validation, the last valid mapping remains in memory until reset or reload. No personal vocabulary file, mapping, or user path belongs in the repository.


The language selector covers English, Cantonese, and bilingual text, including guide content, accessibility names, validation, captions, and dynamic status messages. Commands, URLs, source revisions, and product names remain exact. Search matches both original English and currently displayed translated guide content.

The interactive architecture explainer is conceptual. Its part-size calculation uses an illustrative 16 MB file with the current engine’s 36-byte record framing and up-to-64-KB data records, packed within the chosen physical part cap. The input matches the application’s inclusive 1 KB–1 GB limits (1 KB = 1,024 bytes) and requires a whole number of bytes. It describes example data, not the user’s files. Availability changes the read/write explanation. Playback runs only after a user action, pauses when hidden or offscreen, and becomes manual stepping under reduced motion. No diagram action invokes a filesystem or native driver.

The gallery preserves five genuine Linux captures and the historical Windows evidence at their original source revisions. Four current packaged Windows captures at source `1e16dea8` show reviewed recovery and appearance states; their inventory contains original hashes and recorded UTC times. These images do not substitute for verification of a later published installer.

Capture provenance uses a translated description followed by a literal revision in a `code` element. Update the revision independently of the locale catalog. Image dimensions match `docs/images/captures/provenance.json`. The key-file selection image shows the real credential controls and scrollbar; the recording never autoplays.
