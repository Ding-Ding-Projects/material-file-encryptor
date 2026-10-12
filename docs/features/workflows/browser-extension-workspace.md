# Browser extension workspace

Open workspace in the popup opens the extension-owned options tab. Connection, Personalization and Status are internal tabs with Arrow Left/Right and Home/End navigation. Tab changes keep the same controls rather than replacing the focused element. Shared local Material components and the bundled regex search are used without remote executable assets.

Language (English, Cantonese or bilingual), theme (system, light or dark) and the selected tab use a versioned bounded extension-origin local store. No browser storage sync, broad host permission or additional storage permission is used. Invalid or oversized cached settings fall back to defaults. A failed write retains usable page state and explicitly reports that the change was not saved. Reset restores browser-local defaults only. Bilingual labels stack their secondary line.

Connection and transfer observations are separate. Pairing never starts a transfer. Lost or invalid responses clear live observations instead of keeping stale success. Only exact extension popup and options page senders may use the bounded pairing/status/disconnect transport. Native transfer confirmation remains in the desktop.

Pairing does not authenticate a local profile. Personal wording application, shared mode, credentials, native settings, server management, converter and model controls remain unavailable until a reviewed authenticated mediation path exists. Funny-level and dialog emoji controls are not implemented by this initial slice. The displayed version comes from the extension manifest; source build provenance and updated-at evidence remain unavailable. Status Hub enrollment is unavailable.

Focused tests cover malformed/oversized cache, failed saves, persistence, keyboard tab routing, forged sender paths and staged local-only CSP. Source staging hashes every workspace file. Signing, installed identity, real browser interaction, visual parity and display scaling remain unverified.
