# Shared surface design handoff

Base source: `3dcdfb706e80bd024ec0cfa4eac7ff26f841e2f9`.

Target: the existing desktop renderer, with locally bundled registered Material Web 2.5.0 components. No framework migration is included. The module can also be imported by an offline documentation renderer, with that surface supplying its own views, commands, storage and export callback.

## Design route

Material Designer was considered first. The available tool inventory exposed no callable Material Designer creation/export/handoff interface, and no `material-designer` checkout was present in the current user's GitHub folder during inspection. This file is a local implementation handoff, not a claimed Material Designer export or a rendered reference. No preview or fabricated image is used as production evidence.

## Addressable states

1. Initial workspace: registered tabs, build provenance and action controls.
2. Tab search expanded, plain-text or worker-isolated expression mode.
3. Tab action menu: pinned/unpinned, final-tab close disabled, restoration available/unavailable.
4. Palette: bounded card or full size; command rows and live inline setting controls.
5. Notification center: populated/empty, unread-only, each severity, valid/invalid regex, export enabled/unavailable.
6. Each search workbench: guided/raw expression, valid/invalid/timeout, Unicode capture result and replacement preview.
7. Provenance: valid build time with timezone, missing version, missing/invalid build time.

## Required runtime matrix

Use the product's documented normal and minimum viewport. Cover English, Cantonese and bilingual, light/dark, and 100%, 125%, 150%, 200% display scales. Each capture must bind source commit and packaged artifact hash. Evaluate keyboard-only and touch menu access, focus restoration, reduced motion, reader labels, long labels, clipping, local worker loading under the production CSP, and host callback behavior. None of this runtime matrix has been claimed as passed by this source-only lane.

The implementation destinations and remaining deviations are listed in `docs/features/surface-foundation/coverage.md`. Preserve this file as design intent and replace its pending evidence only with actual built-artifact receipts.

## Full-width navigation and discovery

The workspace tab strip occupies its own full-width grid row. Tab search, restoration, group management and selected-tab actions wrap on the following row, so their intrinsic width does not squeeze the navigation strip. Tabs retain their Material keyboard behavior and horizontal scrolling; no fixed view count or label truncation is introduced.

The existing **Find all views** control expands the existing search and includes every registered view, including closed views. Results explicitly identify open or closed state. Activating a closed result reopens it through the tab model and activates it. Dynamic registration supplies the same trusted label map used by the workspace and command palette. Query, regex settings and expanded search state survive shell reconstruction; keyboard focus returns to the selected result. Group collapse remains effective in normal navigation but cannot hide a matching discovery result.

Focused model/DOM tests verify closed-view discovery and persistent reopening, dynamic registration, localized state labels and the existing expression-filter path. The full-width layout still requires the next source-bound built capture at normal and minimum viewports; these source checks are not visual evidence.
