# Continuation: slotted clear-control geometry

Continue from the commit containing this document. The assigned source branch was clean and fast-forwarded to 172b5a2e2b70873acc457ff699a41c6966e6c370 before this bounded repair.

An isolated renderer run reported a 40x40 slotted clear host with a 48x48 touch layer; three top hit points reached the header after scrolling. The repair adds a scoped 48x48 host reservation for direct outlined-field trailing-icon buttons in src/renderer/modern.css. It preserves vendor touch/state layers, original operations/admission and the separate native-input wrapper geometry. No arbitrary stacking change was added. test/ui-renderer.test.js and its original nine-point assertion are unchanged.

Eight source checks in test/clear-fields.test.js pass. The added slotted-host source assertion failed before the CSS rule and passed after it. No native process, visible desktop, real data, build or renderer launch was touched by this repair. Independent source review and the coordinating owner's exact isolated runtime rerun are next. Actual hit ownership remains unverified for this source revision.

The packaged diagnostic entrypoint and interpreter files were not changed. Existing retained package evidence remains bound to its original source and hashes. Preserve ignored private announcement images. Integration, runtime lifecycle and final delivery remain with the coordinating owner.
