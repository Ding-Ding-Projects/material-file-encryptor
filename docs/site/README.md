# Public website

This self-contained static site is intended to be published at the repository’s GitHub Pages URL. It needs no build step, external fonts, CDN, analytics, or server API. Stage the site and its diagrams together, matching the Pages workflow:

```sh
node scripts/build-site.mjs
python3 -m http.server 8080 --directory out/site
```

Open `http://localhost:8080/`. The deployment places the diagrams in `images/` alongside the page, so all assets also work beneath the repository’s GitHub Pages path. The repository’s Pages workflow owns the final deployed directory layout.

Run the content and behavior checks with `node --test test/site*.test.js` from the repository root. Check 320px layouts, keyboard navigation, light/dark/system appearance, the mobile menu, documentation search, guide links, FAQ, and the preferences dialog in a real browser before publishing.

The site defaults to **In development** and deliberately has no installer download link. Only enable a direct download after verifying a public release artifact and native Windows behavior. Workflow images are explanatory diagrams, not proof of native integration. Keep this distinction when adding real application captures.

Personal vocabulary files use the desktop application's version 1 contract: a `version` number and a `replacements` array of exact `from`/`to` string pairs. The optional file picker reads a maximum of 128 KB locally. Validated words replace text nodes only, never markup, URLs, attributes, code, or identifiers. Replacements are held in memory for the current tab and reset on reload. Only the appearance preference is saved in local storage. No personal vocabulary file, mapping, or user path belongs in the repository.
