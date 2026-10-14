# Shared composition source handoff

Revision 2 was accepted by the independent design review reported by the coordinating owner before this source continuation. The five composition classes are implemented in `src/shared/surface/compositions.js`, registered in the shared registry, and imported by the shell. The desktop entry markup uses the real hosts. Only the three existing main/view construction and query expressions changed in `app.js`.

Each constructor owns one shadow part, one slot and one adopted stylesheet. Connection and disconnection control local listeners and observation. The receipt supplements checks of the registered constructor, actual part/slot identity, stylesheet identity and contents, connected state, supported projected anatomy and action primitive types. Fixed titlebar action and table head/body identities cannot be replaced by lookalikes. Record rows remain mutable. Named empty panels and malformed table records are rejected. The top bar uses group semantics to leave the titlebar as the single banner.

The focused run completed with 32 passing tests and zero failures:

```text
node --test test/surface-compositions.test.js test/gui-foundation.test.js test/renderer-primitive-styles.test.js test/history-selection.test.js
```

`git diff --check` passed. These are source and simulated-DOM checks only. No build, installer, mounted-drive, native-command, accessibility-tree or visual acceptance is claimed by this unit. The existing installed runtime, process set, mounts and primary dependency directory were not changed.

The coordinating owner handles article indexes/catalog registration and translation hashes, final source integration, the exact root build entrypoint, and source-bound hidden-desktop verification. Verify the full desktop normal/minimum viewport matrix, English/Cantonese/bilingual, light/dark, 100/125/150/200 percent scales, keyboard scrolling, visible focus, control no-drag behavior, table accessibility naming, selection action effects and personalized role variables. Preserve genuine captures and fail the acceptance gate on every substituted or removed composition.
