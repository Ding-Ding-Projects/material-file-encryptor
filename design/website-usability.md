# Homepage navigation and entry-point refinement

Status: design handoff, awaiting independent review and built-site verification.

Source baseline: `4d24ad3dda2152968d372c4e24543d959fb61bb7`.
Target: the existing static homepage in `docs/site/index.html`, its shared styles, localization dictionary, homepage controller, and `site-foundation.js` navigation/control integration. Preserve GitHub Pages at `https://ding-ding-projects.github.io/material-file-encryptor/`.

## Problem and scope

The header currently exposes seven text destinations alongside preferences and release status. At intermediate widths it wraps into several rows; its mobile version presents the same destinations without grouping. The opening offers source browsing before a clear documentation entry point. Refine these two entry surfaces, keeping the existing page sections, interactive workflow, documentation articles, wiki, browser workspace, capture evidence, and release implementation intact.

This is an additive hierarchy improvement, not a new product interface or a claim that the complete feature or capture backlog has passed. Existing historical capture labels and current-capture acceptance gaps remain unchanged. No new screenshot or product claim is required.

## Proposed composition

At wide widths, retain the indigo Material 3 palette, local fonts, folder-and-lock wordmark, restrained surface treatment, and existing editorial hero. The header contains the brand, three primary links (How it works, Security, Docs), a secondary navigation disclosure named Explore, the existing preferences control, and Release status. The Explore disclosure contains Documentation library, Wiki, Browser workspace, and Capture gallery, in that order. Present its items as vertically stacked links with full-width targets, ordinary text wrapping, and no decorative cards or badges. Use an opaque surface-container menu with a fine outline and the existing overlay shadow treatment.

Use the existing registered Material component conversion and control system. Inspect its actual rendered DOM before selecting CSS or event targets. Navigation remains real links, including the component system's supported anchor internals; do not replace links with click-only pseudo-links or introduce a second component framework. Disclosure buttons expose accurate expanded state and control relationships. Adapt the current preferences integration rather than cloning it.

Start compact navigation at 1100 CSS pixels and below. Above that width, use compact mode as a measured fallback whenever translated content would overflow the available header width. Never shrink labels or clip text to preserve the wide layout. Keep one explicit controller for the effective compact state; CSS, resize handling, and accessibility state must agree. The old hard-coded 800px controller breakpoint must not survive independently.

In compact mode, keep the wordmark and a named navigation toggle in one header row. Opening reveals two visibly named groups: On this page (How it works, Security, Docs, Release status) and Explore (Documentation library, Wiki, Browser workspace, Capture gallery). Website preferences appears as a final visible action. The Explore group is already expanded here, avoiding a disclosure inside a disclosure. Use a single DOM instance of each destination and preferences control across both layouts. Group headings are supporting text, not interactive controls.

At 320px use 20px content gutters, allow the brand to wrap naturally, and preserve a 44px minimum navigation toggle target. The expanded panel occupies the available viewport width and scrolls vertically within the available height below the measured header. Measure the collapsed top header row independently for the panel offset and available height, not the entire expanded `.site-header`. The existing ResizeObserver measures the whole header, so do not include the expanded panel height in its own available-height calculation. Keep a separate row-height variable or ensure the panel remains out of flow; retain the full sticky-header measurement where anchor offset actually needs it. Never use a fixed 72px offset. A visible focused item must scroll into view inside this panel. Compact navigation must remain usable in a 320 by 568 viewport and with translated labels.

Keep the hero heading and supporting product description. Retain How it works as the filled primary action. Replace the outlined Explore the source hero action with Read the documentation, targeting `library.html`. Keep the repository discoverable as an underlined Explore the source text link alongside the existing preview note, preserving the note's factual wording. At narrow widths the two main actions stack with full available width; the source link sits below them. At wide widths the actions may share a row and wrap naturally. The existing release-aware header action continues to target the detailed release section rather than implying an available installer.

## Interaction and accessibility

The compact navigation is a nonmodal disclosure. Opening leaves focus on its toggle; Tab enters destinations in reading order. Escape closes and returns focus to that toggle. Clicking outside closes without stealing focus. Following an internal anchor closes navigation, then reveals the destination below the measured sticky header; keyboard activation must leave focus at a meaningful destination heading or section, never in newly hidden navigation. Following an external page link retains normal browser behavior, including open-in-new-tab gestures.

The wide Explore disclosure follows the same nonmodal pattern. Escape closes it and restores its trigger. An outside click or following a destination closes it. Opening preferences closes navigation, opens the existing modal, and establishes the existing dialog focus behavior. Closing preferences restores a visible trigger: the preferences action when it remains visible, otherwise the compact navigation toggle. Resizing across layouts resets obsolete expanded state and moves focus to the visible navigation toggle if the previously focused control becomes hidden. Do not steal focus from unrelated page content.

A closed disclosure removes all its links from keyboard navigation and the accessibility tree. Do not apply ARIA menu or menuitem roles to ordinary website navigation. Keep the skip link, semantic landmarks, unique IDs, descriptive accessible names, visible focus rings, 44px targets, and existing reduced-motion support. Body text contrast remains at least 4.5:1; control boundaries and focus indicators remain distinguishable at 3:1. Use 150–180ms state transitions with no more than 8px travel; reduced motion removes travel.

Localize Read the documentation, Explore, On this page, and any new expanded-state names in English, Cantonese, and bilingual mode through the existing locale mechanism. Bilingual secondary text wraps below or alongside the English label within the same target. It must never force horizontal scrolling. Preserve system, light, and dark preferences and existing preference persistence.

## Destination contract

| Entry | Destination | Required behavior |
| --- | --- | --- |
| Brand | `#overview` | Return to opening |
| How it works | `#workflow` | Reveal existing workflow |
| Security | `#security` | Reveal existing security section |
| Docs | `#documentation` | Reveal existing searchable homepage guides |
| Documentation library / Read the documentation | `library.html` | Open complete local documentation |
| Wiki | `wiki.html` | Open local wiki content |
| Browser workspace | `workspace.html` | Open existing separate browser workspace |
| Capture gallery | `gallery.html` | Preserve historical/current evidence distinctions |
| Release status | `#download` | Preserve release.js-controlled truth and destinations |
| Explore the source | `https://github.com/Ding-Ding-Projects/material-file-encryptor` | Open real public source |
| Website preferences | Existing preferences dialog | Preserve preferences and focus behavior |

Verify every local route and anchor in built output and the live deployment. Do not redirect documentation or wiki entries to source-hosted articles.

## Navigation integration and adjacent usability corrections

The existing foundation controller can hide inactive sections. Anchor navigation must therefore activate the owning section through that controller before scrolling and focusing. Explicitly activate the owning foundation tab on every ordinary internal-link activation, including a repeated `#security` when the URL already contains that hash but Overview has since become active. The sequence is Security link, Overview tab, then the same Security link. A hashchange listener alone cannot repair it because the hash may not change. Preserve modified-click and new-tab gestures without intercepting them. Synchronize tab selection, section visibility, and URL state through one navigation path. Also support direct fragment loading, browser Back/Forward, and the existing guide-reveal behavior. Never unhide every section as a shortcut.

Include the following bounded corrections identified by the source audit, verifying each in the built site before asserting the diagnosis is resolved:

- Preference command search indexes the active language and both labels in bilingual mode, including Cantonese queries. Preserve the real command actions, clear behavior, and honest empty state.
- The visible documentation-search label must identify and focus the actual rendered search control, including its component-supported accessible label. Remove a stale `for` relationship to a hidden legacy field; preserve one clear accessible name.
- Restore readable vertical rhythm inside `.documentation-article`: body paragraphs and lists use 16px separation; headings use 32px above and 12px below, with no excess top margin on the article's first heading. Scope these rules to article content so navigation and controls are unaffected. Keep existing heading hierarchy, text, routes, and responsive wrapping.

Add exact interaction states `home-repeat-anchor` (Security link, Overview tab, same Security link), `home-history-navigation` (two section transitions then Back/Forward), `preferences-localized-search` (Cantonese and bilingual queries), `documentation-search-label` (activate visible label and type a query), and `documentation-article-rhythm` (open an existing long article). Apply the language/theme/scale and viewport matrix below to these affected surfaces. Preserve an explicit failing-before/passing-after interaction check for the repeated-anchor defect and label focus relationship.

## State and evidence inventory

All states use the actual built homepage. Setup is deterministic through ordinary user interaction, with an isolated browser profile, saved language/theme settings, and no injected mock content. Routes below are relative to the deployed home. A design preview or this document is not production evidence.

| State ID | Route and setup | Acceptance focus |
| --- | --- | --- |
| `home-wide` | `/`, navigation closed in wide mode | Header fits, hero action hierarchy, original product copy |
| `home-explore-open` | `/`, open Explore in wide mode | All four destinations, focus, outside-click and Escape dismissal |
| `home-compact` | `/`, compact navigation closed | No hidden tabbable links, readable brand and toggle |
| `home-navigation-open` | `/`, open compact navigation | Both groups, all destinations, preferences, bounded vertical scroll |
| `home-preferences-return` | `/`, open preferences from navigation and close | Existing modal unchanged; focus returns to visible control |
| `home-anchor-arrival` | `/#documentation`, activate Docs from open navigation | Menu closes, target visible and meaningfully focused; repeat Security, Overview tab, Security |
| `home-resize` | `/`, resize while Explore or compact navigation is open | State and focus remain coherent across layouts |

For each applicable state capture 1280 by 900 and 320 by 568 baseline viewports, both light and dark, English/Cantonese/bilingual, and 100%, 125%, 150%, 200% display scales. A wide-only state at the minimum viewport maps explicitly to its compact equivalent; record the responsive transition rather than claiming a hidden wide menu was tested there. Record viewport dimensions in CSS pixels, actual device scale and browser zoom separately, so display scale is not confused with viewport size. Also exercise 1099, 1100, and 1101 CSS-pixel transition widths, keyboard-only operation, reduced motion, system theme changes, and 200% browser zoom.

Retain source/build binding, exact capture tuple, genuine screenshot paths, and target/ancestor bounding boxes plus winning computed layout values for any overflow finding. Check document and panel scroll widths; confirm focus targets are within the viewport or can be scrolled into view. Capture the worst-case bilingual expanded navigation at 320px. Run the existing site's relevant checks and focused browser interaction checks; manually inspect the captures before claiming visual acceptance.

## Assets, reference status, and limits

No asset is added, replaced, generated, or relabelled. The inline folder-and-lock symbol, existing local fonts, Material component bundle, `images/drive-workflow.png`, `images/offline-workflow.png`, and all capture-gallery assets retain their source and evidence labels. The two workflow images remain explanatory diagrams. Existing Linux and Windows images remain historical captures with their original provenance.

This file is an implementation handoff, not a rendered visual reference. No design-reference application, matching reference captures, or visual-diff proof has been produced in this bounded design assignment. If the repository's reference-parity contract treats this design folder as requiring that infrastructure, record the missing implementation/evidence as an open requirement; do not assert parity from this document.

Intentional changes from the original site design: the compact breakpoint moves upward to accommodate the accumulated destinations; secondary destinations are grouped under Explore on wide screens; the hero offers local documentation before source browsing. Existing framework, hosting, release state, images, and deeper content remain unchanged. Independent review must approve this handoff before implementation. Built and live verification remain separate outstanding acceptance steps.
