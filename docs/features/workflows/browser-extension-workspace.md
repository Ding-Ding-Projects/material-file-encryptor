# Browser extension workspace

Open workspace in the popup opens the extension-owned options tab. Connection, Personalization, Changelog and Status are Material tabs with Arrow Left/Right and Home/End navigation, and each panel fades in unless reduced motion is requested. Tab changes keep the same controls rather than replacing the focused element. Shared local Material components and the bundled regex search are used without remote executable assets.

Language (English, Cantonese or bilingual), theme (system, light or dark) and the selected tab use a versioned bounded extension-origin local store. No browser storage sync, broad host permission or additional storage permission is used. Invalid or oversized cached settings fall back to defaults. A failed write retains usable page state and explicitly reports that the change was not saved. Reset restores browser-local defaults only. Bilingual labels stack their secondary line.

Connection and transfer observations are separate. Pairing never starts a transfer. Lost or invalid responses clear live observations instead of keeping stale success. Only exact extension popup and options page senders may use the bounded pairing/status/disconnect transport. Native transfer confirmation remains in the desktop.

Pairing does not authenticate a local profile. Personal wording application, shared mode, credentials, native settings, server management, converter and model controls remain unavailable until a reviewed authenticated mediation path exists. Independent English and Cantonese playfulness sliders run from 1 to 5 and default to 5, with independent resets. Popup status and options notices use the actual shared message translator. The emoji switch defaults off and decorates the local message preview dialog with one inaccessible decorative mark. It never alters button labels or state facts. Broader copy coverage and runtime acceptance remain pending. The displayed version comes from the extension manifest, and the build source and staging time come from the staged bundle, as described below. Status Hub enrollment is unavailable.

## Changelog, build source and commands

The Changelog tab shows the release changelog without a network connection. Staging turns the repository changelog into a bundled module, because the page policy blocks every fetch; a filter narrows the releases locally. Cantonese mode shows each release's Cantonese summary, and bilingual mode shows the English items and the summary together.

The Status tab shows the extension version, the source commit the bundle was staged from and the staging time. When tracked extension inputs differed from that commit at staging, the commit is marked as having uncommitted changes. If either value cannot be read, the tab says it is unavailable rather than guessing.

Commands (Ctrl+K) opens a Material dialog listing every workspace action: opening each tab, pairing, disconnecting, refreshing observations, language and theme choices, the message preview and the settings reset. Typing filters the list, and actions that cannot run at that moment are shown disabled.

Focused tests cover malformed/oversized cache, failed saves, persistence, keyboard tab routing, forged sender paths and staged local-only CSP. Source staging hashes every workspace file. Signing, installed identity, real browser interaction, visual parity and display scaling remain unverified.

## Bundled copy measurement

The isolated shared message-style entry reduced the staged language bundle from 431,433 bytes to 999 bytes. The retained staging receipts bind both outputs by SHA-256. The staged helper matched the source helper for all 25 independent English/Cantonese level combinations; existing shared-language tests also passed. This measures bundled bytes, not browser startup or rendering speed. The shared frozen style table is reexported unchanged from the desktop translator.
