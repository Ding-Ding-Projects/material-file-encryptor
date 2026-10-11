# Visitor preferences raw evidence

[English](visitor-capture.md) | [繁體廣東話](visitor-capture.zh-HK.md)

## Purpose and boundary

The manual capture workflow produces genuine page PNGs and computed-style measurements for the home-page visitor preferences surface. It does not evaluate UI quality, run tests or lint, provide an accessibility verdict, or gate a release. Independent review happens after downloading its outputs. A successful evidence-production job does not establish Material Design 3 acceptance.

## Exact production input

The inputs identify a full source commit, a successful main-branch documentation deployment run, its exact github-pages artifact ID and the artifact ZIP SHA-256. Admission checks those records through GitHub CLI, verifies downloaded bytes, rejects unsafe archive paths and links, and checks both site and workspace provenance against that source. Every extracted static file receives a size and SHA-256 inventory. The workflow serves that frozen production output on a task-owned loopback origin. It does not rebuild the site or assume mutable live content still represents the selected source.

The initial example identifies source befcc57f53796f8c496336edbe3bb0ed14688a3c, deployment run 38135624365, artifact 11700663249 and digest 8eacaebd4792ad45a9e665071c5cc56c6dd26e0b8534a3d0fad3d657c2d401d2. These are historical input defaults, not proof that a later live deployment has those bytes.

## Browser and scene

The separate dependency inventory pins Node.js, Python, GitHub CLI, Playwright 1.64.0 and Chromium revision 1248. The browser must run non-root with its sandbox enabled. There is no insecure fallback. Shared Linux packages are installed through the pinned Playwright installer; the package repository itself is not an immutable binary pin. Actual cloud package versions, browser version and executable digest are retained.

The first scene is a 320 by 844 CSS-pixel English viewport at device scale 1, with touch emulation. A fresh browser profile and context contain no account, uploaded vocabulary, credentials or user data. The controller opens the real preferences button, captures its initial state, selects the shared Appearance tab and requests dark through the original shared theme control. Legacy hidden selectors, storage injection and root-attribute overrides are not used. Missing controls are recorded as unperformed interactions; the resulting PNG is not labelled accepted or necessarily dark.

## Measurements and privacy

Raw measurements cover the outer dialog, shared body, tab navigation, theme field and open guidance shadows: geometry, scroll bounds, winning color/font/layout values and Material custom properties. Component registration is observed. Page targets, local resource outcomes, blocked external requests, process identities and closure observations are retained. Console text is represented by type and digest, not copied into uploaded output. External networking is blocked, so release metadata and other external content may differ from a live visit; this is declared in the receipt.

Only the evidence directory is uploaded. Static source trees, profiles, downloaded input archives, caches, debug endpoints and credentials are excluded. Captures show the public fresh-profile surface. Public reuse still requires pixel and metadata review. Browser-only pixels do not establish native input, physical-device behavior or Windows execution.

## Ownership and closure

The controller records the exact browser process image, creation ticks, observed descendants and generated profile identifier. It closes its context, browser server and connection with bounded waits, closes its own loopback server, and reports whether the recorded processes are absent and the profile is absent or retained. It performs no recursive profile deletion. Unknown or incomplete closure remains explicit. It never invents a Windows desktop or HWND for the Linux route.

## Verification state

Local controller checks exercise actual path containment and static-byte admission, including changed-byte rejection and restoration. They do not launch a browser and are not invoked by the cloud workflow. Fresh-cloud bootstrap, sandbox availability, actual capture production, visual inspection and Material Design 3 acceptance remain pending until genuine receipts exist. No capture is supplied by this source article.
