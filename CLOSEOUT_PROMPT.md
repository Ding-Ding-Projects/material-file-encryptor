# Continuation: exact localized navigation fixture

The existing assigned branch was clean, fetched and safely fast-forwarded to 83e14d8627b9782d5acc12221c22ed4f0b8b2d4c before this change. Continue from the commit containing this document.

Only the two Settings/How it works menu-name matchers in test/ui-renderer.test.js changed, plus a bounded source fixture. Each matcher now accepts exactly English, Cantonese and the supported middle-dot bilingual name. Actual rail click, menuitem role lookup, visible-view wait and existing language/width checks remain unchanged.

The source fixture exercises the actual helper for all six names and checks its ordered actions, while rejecting partial, suffixed and cross-language names. It failed before repair and passed afterward. Syntax and diff checks passed. No browser, native process, build, capture, VM, OS user or real data was touched. Independent review and the coordinating owner's actual renderer run remain next. Historical build evidence retains its original source identity.

Preserve earlier clear-control geometry and history-selection repairs, existing ignored announcement images and the current physical Windows route. Integration, actual runtime ownership and final delivery remain with the coordinating owner.
