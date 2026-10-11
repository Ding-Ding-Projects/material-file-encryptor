# Animation and Transition authoring

## Current boundary

This is an incomplete source implementation draft shared by the installed application and public documentation appearance editor. The model, native animation adapter and authoring controls are preserved. Earlier focused model/API-consumer checks passed, but later refinements, mounted-control coverage, guidance integration and rendered acceptance remain pending. Saved values and injected API tests do not prove visible motion. No current capture or timed recording is claimed.

## Authoring and rendering

Motion is stored on each appearance layer. The selected element, layer and state remain explicit. The Animation and Transition tab exposes ordered tracks and rules, enable/mute/solo, grouping, dependencies, offsets, stagger, property entry, keyframes, segment easing, timing, markers, triggers and native timeline options. Numeric controls remain available beside timeline scrubbing. Undo, redo, appearance revisions, named presets, style copying, reset and validated JSON portability carry the motion data.

The adapter calls the target renderer's native animation API. The property chooser enumerates computed renderer properties and accepts explicit custom-property names. CSS parsing alone does not establish interpolation. A renderer rejection is shown and portable authored values remain intact. Element tracks animate the exact target. Independent layer tracks require a real rendered image-layer node; CSS layers cascading onto one element do not create independent pixel surfaces. Replacing an image overlay cancels its old native consumer and binds the replacement, so continuity across overlay reconstruction still needs timed acceptance.

Timing includes fractional milliseconds, automatic duration, signed delay/end delay, finite or infinite repetitions, iteration start, direction, fill and signed/zero playback rate. Keyframes retain explicit offsets or absolute/relative times, computed values, per-segment easing and composition. Native document timelines use milliseconds. Scroll/view timelines are feature-detected, with source, axis, inset and attachment ranges preserved; numeric progress seeking and frame semantics still require completed source and browser verification.

## Capability and security limits

Native repeated-iteration delay and spring physics are unavailable through this renderer adapter. Their portable settings remain visible and prevent an unsupported preview from being called applied. Named/Bezier/linear/step easing is passed to the renderer's timing-function parser. Composition and iteration accumulation are used only where the renderer exposes them. The existing shared rainbow speed remains authoritative and its reserved properties cannot be overridden through a track.

Triggers are limited to the selected target's state, allowlisted interaction events, visibility progress and explicit animation commands. They never run code, fetch resources, authenticate, or perform protected product operations. Imported CSS values reject URLs and declaration breakout. Versioned motion input has a byte budget, finite numeric validation, cycle detection and prototype-key rejection; unknown future data stays portable without execution.

Reduced-motion presentation retains the authored model, cancels native handles and uses a static final value. Preview playback is paused after 30 seconds and releases its animation-frame observer on destruction. Application/OS preference propagation, exact state inheritance, playback interruption, overlapping properties and layer reconstruction still need real timed verification. Scheduled motion overrides and complete per-control guided documentation remain unfinished integration requirements.

## Verification and capture queue

The handwritten capability matrix identifies implementation and consumer boundaries. Tests exercise portable appearance round trips, timing validation, dependency cycles, actual target API calls, transitions, event scope, reduced-motion cancellation and teardown. Negative source checks remove a tab, setting or consumer. These are source/API-boundary results, not built renderer evidence.

After a pinned build is authorized, both surfaces require every capability driven through the real editor, per-click captures plus timed recording or sampled computed styles, exact timing/trigger assertions, reload and reduced-motion checks, and bounded resource teardown. Every current README, documentation, wiki, gallery and download-presentation capture must be replaced with inspected source-bound captures. Preserve originals as clearly labelled history until replacements and references are verified. Generated images cannot substitute.

## Standards

- [Web Animations](https://www.w3.org/TR/web-animations-1/)
- [Scroll-driven Animations](https://drafts.csswg.org/scroll-animations-1/)

No HTTP API is introduced; a Postman collection is not applicable.
