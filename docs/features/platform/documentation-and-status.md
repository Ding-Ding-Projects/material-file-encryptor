# Documentation browser and status integration

## Documentation

`buildDocumentationCatalog(root)` reads every Markdown file under `docs/`, including the wiki, plus available root project articles. Each document records its full source text, stable path-based ID, category, headings and content hash. Symbolic links are excluded. Run `node src/features/documentation/build-catalog.mjs <repository-root> <output.json>` during packaging, then supply the parsed bundle to `mountDocumentation`.

`mountDocumentation(host, { catalog, translate, onExport, initialId })` provides article navigation, full-text search with the existing bounded worker-based regular-expression builder, heading anchors, internal Markdown links and Markdown export. The DOM-only renderer supports tables, fenced code, emphasis, lists and task lists, quotes, local raster images, and the exact attribute-free details/summary containers used in project articles. Arbitrary source HTML is rendered as text, not executed. External links accept HTTP and HTTPS only and are explicitly marked. Missing internal articles and anchors are displayed without an active link. The catalog must be regenerated after documentation changes; packaging integration remains required.

Image references are resolved against their owning article and included as data URLs only when they resolve to local PNG, JPEG, GIF or WebP files within the repository. Each file is limited to 5 MiB. SVG, remote images, path escapes, unsupported files and missing images display an unavailable state rather than making an unexpected network request. Each accepted asset records its original path and SHA-256.

`parseChangelog(markdown)` exposes dated version sections. The separate `mountChangelog(host, { entries, translate, onExport })` module adds date and category filters, bounded regular-expression search and filtered Markdown export. The host supplies categories when its changelog source has them. Undated sections remain visible without date filters and are excluded when a date bound is active.

## Status

`createApplicationStatus` is a trusted-process adapter around the supplied official status client factory. It never implements transport or credential storage. The host must import the shipped client, supply its process configuration, call `checkpoint` for meaningful updates and `finish` at exit, and expose only `snapshot()` over IPC. The snapshot uses an allowlist without credentials, session keys, repository paths or raw server diagnostics. `mountStatus` accepts a `getStatus` callback and reports configured, unavailable and read-failure states without claiming that a configured client has successfully published.

No enrollment secret is collected by the renderer. A missing factory is `CLIENT_NOT_CONFIGURED`. Live publication, authentication, startup/exit wiring, reply interactions and complete status-client contract verification remain unverified until the host integrates the adapter.

## Delivery inventory

`contracts/feature-delivery.json` lists canonical feature identifiers independently for desktop and site. Missing rows remain explicit and do not imply completion. An `implemented` row requires existing implementation, documentation, localization, tests and evidence paths. `validateFeatureDelivery` rejects omitted or duplicated rows and incomplete implemented claims. The separately checked-in required identifier list prevents discovery from silently hiding an omitted feature.

## Verification and remaining work

Focused tests exercise real document discovery, heading collisions, link traversal, safe external-link rejection, dated changelog parsing and filtering, status redaction and omission regressions. A Cantonese resource map is supplied for the host translator. The optional `test/documentation-browser.test.js` launches isolated Edge through the configured low-level desktop CLI and exercises actual article navigation, anchors, tables, images, search and export. It requires `DOCS_LOWLEVEL_CLI` and `DOCS_PLAYWRIGHT`, with optional `DOCS_EDGE`; without them it reports an explicit skip. It does not claim production package or visual verification. Product mounting, translated-copy interaction, visual evidence, package generation and site wiring remain outstanding. This module does not establish visual conformance or complete delivery of any universal feature.
