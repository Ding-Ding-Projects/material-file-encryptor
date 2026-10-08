# Public website

This self-contained static site is intended to be published at the repository’s GitHub Pages URL. It needs no build step, external fonts, CDN, analytics, or server API. Stage the site and its diagrams together, matching the Pages workflow:

```sh
node scripts/build-site.mjs
python3 -m http.server 8080 --directory out/site
```

Open `http://localhost:8080/`. The deployment places the diagrams in `images/` alongside the page, so all assets also work beneath the repository’s GitHub Pages path. The repository’s Pages workflow owns the final deployed directory layout.

Run the content and behavior checks with `node --test test/site*.test.js` from the repository root. Check 320px layouts, keyboard navigation, light/dark/system appearance, the mobile menu, documentation search, guide links, FAQ, and the preferences dialog in a real browser before publishing.

The site defaults to **In development** and deliberately has no installer download link. Only enable a direct download after verifying a public release artifact and native Windows behavior. Workflow images are explanatory diagrams, not proof of native integration. Keep this distinction when adding real application captures.

Personal vocabulary files use the desktop application's version 1 contract: a `version` number and a `replacements` array of exact `from`/`to` string pairs. The optional file picker reads a maximum of 128 KB locally. Validated words replace text nodes only, never markup, URLs, attributes, code, or identifiers. Replacements are held in memory for the current tab and reset on reload. Appearance, language, emoji, and the two 1–5 message tone preferences are saved in local storage. Uploaded vocabulary payloads are never persisted; if a later file fails validation, the last valid mapping remains in memory until reset or reload. No personal vocabulary file, mapping, or user path belongs in the repository.


The language selector covers English, Cantonese, and bilingual text, including guide content, accessibility names, validation, captions, and dynamic status messages. Commands, URLs, source revisions, and product names remain exact. Search matches both original English and currently displayed translated guide content.

The interactive architecture explainer is conceptual. Its part-size calculation uses an illustrative 16 MB file with the current engine’s 36-byte record framing and up-to-64-KB data records, packed within the chosen physical part cap. The input matches the application’s inclusive 1 KB–1 GB limits (1 KB = 1,024 bytes) and requires a whole number of bytes. It describes example data, not the user’s files. Availability changes the read/write explanation. Playback runs only after a user action, pauses when hidden or offscreen, and becomes manual stepping under reduced motion. No diagram action invokes a filesystem or native driver.

The gallery contains genuine Linux Electron captures at source revision `1c5b67b`. Its captions distinguish interface evidence from pending native Windows mounting and release verification.
