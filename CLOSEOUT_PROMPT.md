# Continuation: history selection visibility

Continue from the commit containing this document on the existing assigned guidance branch. The branch was clean, fetched, and equal to its remote preservation branch before editing.

Removed only the obsolete history first-column display:none rule from src/renderer/style.css. The actual selection radio is bound into that first cell. Recycle last-column hiding, shared nonwrapping heading rules, production controllers and restore admission/callbacks remain unchanged.

Six focused history-selection source checks pass; the added visibility regression failed before removing the rule and passed afterward. test/ui-renderer.test.js now verifies actual radio visibility and focus, Enter selection, selected metadata, no restoration from selection or cancelled confirmation, and independent row/selected restore actions with exact call counts. Existing multilingual narrow/normal heading checks remain. Syntax check passed. Actual renderer execution has not run for this revision and remains with the coordinating owner after independent review.

No native process, visible desktop, build, real data, diagnostic entrypoint or interpreter was changed. Retain the prior slotted-clear geometry repair and all ignored announcement images. Integration, runtime lifecycle and final delivery remain with the coordinating owner.
