# Browser extension workspace

Open workspace in the popup opens the extension-owned options tab. Connection, Personalization, Changelog, Notes, Documentation, Support, Dim sum, Models and Status are Material tabs with Arrow Left/Right and Home/End navigation, and each panel fades in unless reduced motion is requested. Tab changes keep the same controls rather than replacing the focused element. Shared local Material components and the bundled regex search are used without remote executable assets.

Language (English, Cantonese or bilingual), theme (system, light or dark) and the selected tab use a versioned bounded extension-origin local store. No browser storage sync, broad host permission or additional storage permission is used. Invalid or oversized cached settings fall back to defaults. A failed write retains usable page state and explicitly reports that the change was not saved. Reset restores browser-local defaults only. Bilingual labels stack their secondary line.

Connection and transfer observations are separate. Pairing never starts a transfer. Lost or invalid responses clear live observations instead of keeping stale success. Only exact extension popup and options page senders may use the bounded pairing/status/disconnect transport. Native transfer confirmation remains in the desktop.

Pairing does not authenticate a local profile. Personal wording application, shared mode, credentials, native settings, server management, converter and desktop-owned model controls remain unavailable until a reviewed authenticated mediation path exists. Independent English and Cantonese playfulness sliders run from 1 to 5 and default to 5, with independent resets. Popup status and options notices use the actual shared message translator. The emoji switch defaults off and decorates the local message preview dialog with one inaccessible decorative mark. It never alters button labels or state facts. Broader copy coverage and runtime acceptance remain pending. The displayed version comes from the extension manifest, and the build source and staging time come from the staged bundle, as described below. Status Hub enrollment is unavailable.

## Get the extension

The extension is not published to a browser store and has no download of its own. It ships inside the desktop installer: download `MaterialFileEncryptor-Setup.exe` from the [latest release](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/latest) and install it. The Squirrel.Windows installer places the application under `%LOCALAPPDATA%\MaterialFileEncryptor\app-<version>\`, and the extension files are in its `resources\browser-extension` folder. In Microsoft Edge or Google Chrome, open the extensions page, turn on developer mode, choose **Load unpacked** and select that folder. Each desktop update installs a new `app-<version>` folder, so load the folder again after an update.

After **Check releases** on the Status tab finds a release, it also offers that release's desktop installer, but only when GitHub reports the exact `MaterialFileEncryptor-Setup.exe` asset as uploaded with a size at its expected download address. Drafts and prereleases are never offered. The installer and the extension are unsigned. This page does not verify an installation, and the folder layout above follows the Squirrel.Windows convention rather than a check on an installed copy.

## Changelog, build source and commands

The Changelog tab shows the release changelog without a network connection. Staging turns the repository changelog into a bundled module, because the page policy does not allow fetching the extension's own files; a filter narrows the releases locally. Cantonese mode shows each release's Cantonese summary, and bilingual mode shows the English items and the summary together.

The Status tab shows the extension version, the source commit the bundle was staged from and the staging time. When tracked extension inputs differed from that commit at staging, the commit is marked as having uncommitted changes. If either value cannot be read, the tab says it is unavailable rather than guessing.

Commands (Ctrl+K) opens a Material dialog listing every workspace action: opening each tab, pairing, disconnecting, refreshing observations, language and theme choices, the message preview and the settings reset. Typing filters the list, and actions that cannot run at that moment are shown disabled.

## Exports, setting details, reset confirmation and shortcuts

Preview export turns the currently filtered changelog into JSON, CSV or Markdown and shows the result before anything is saved. The export is read back first: the release and change counts must match, or no file is offered. CSV cells that begin with a formula character are prefixed with an apostrophe, so spreadsheets show the text instead of running it. Exports contain release notes only, never settings, pairing data or personal wording.

About these settings, under Personalization, lists each setting with its current value, what it changes and how it returns to its default. The workspace search finds these explanations.

Reset browser settings asks for a deliberate confirmation: turn on both confirmation switches, move the slider fully right, then choose Execute. Emergency exit cancels with nothing changed. Individual playfulness resets stay one step, because they change a single value.

Alt+1 to Alt+9 open Connection, Personalization, Changelog, Notes, Documentation, Support, Dim sum, Models and Status, and Ctrl+K opens the command palette, which lists these shortcuts beside their commands. Browser-reserved combinations such as Ctrl with a number, Ctrl+T and Ctrl+W are left to the browser.

## Name, accent, recent changes and filters

Name and accent, under Personalization, lets this browser use its own product name. The name, up to 60 characters without angle brackets or line breaks, replaces Material File Encryptor in the workspace heading, page title, version line, tab list name and popup. Leaving it empty restores the original name.

The accent colour comes from six presets or a typed #rrggbb value, with an opacity slider. Opacity is blended with the page surface, and text on the accent uses whichever of white or black reads better. The workspace states the resulting contrast and offers Apply accent only when it reaches 4.5:1. Use default accent returns to the built-in palette.

Recent changes lists up to 50 changes to language, theme, playfulness, emoji, product name and accent, with the time and a button that restores the earlier value. Tab moves, pairing state and anything secret are never recorded. Clear history uses the same deliberate confirmation as the full reset and leaves current settings unchanged.

The Filters button collapses the changelog filter and export controls. Collapsing keeps the filter text and its effect, and the button reads Filters (active) while a hidden filter still applies.

Settings stored by version 2 of the workspace gain an empty product name and accent when they are first read, keeping every earlier choice.

## Icon, logo, attention modes and documentation link

The extension ships its own icon at 16, 32, 48 and 128 pixels: the folder-and-lock mark in the application's green. Staging accepts only small PNG files inside the icons folder.

Choose logo, under Personalization, accepts a PNG, JPEG or WebP image of 64 KB or less. The type and size are checked before the file is read. The logo is kept in its own local record and appears beside the workspace heading and in the popup. Remove logo returns to the built-in mark.

Attention offers three local switches. Focus hides explanatory text. Reduced stimulus turns off motion and emoji decoration. Guided attention outlines the open panel. Turn off attention modes switches all three off. These switches change only presentation in this browser; they are not shared with the desktop application.

The Status tab links to the documentation website at its exact address, https://ding-ding-projects.github.io/material-file-encryptor/, and shows the address as text.

## Notes

The Notes tab (Alt+4) keeps short notes in this browser only, up to 50 of them. New note opens a side sheet above the current tab, so whatever was open underneath stays as it was. The sheet has three steps: a title, then an empty page for the note itself, then a review. Next checks each step before moving on, Back returns to the previous step, and Cancel or Escape keeps a draft that is restored the next time New note is opened. Closing the sheet returns focus to the button that opened it.

Select several notes with their checkboxes to act on them together. Export selected saves them as one Markdown file. Delete selected asks for the same deliberate confirmation as the full reset, then reports how many were deleted, how many could not be deleted (those stay selected) and how many were already gone.

## Scheduled changes, personal wording and fonts

Scheduled changes, under Personalization, sets the theme or language to change at a chosen date and time. The section states the time zone the times use, for example America/Toronto (UTC-04:00). Times less than a minute away, and a second change to the same setting in the same minute, are refused. Each scheduled change can be cancelled. Changes that come due while the workspace is open are applied within 30 seconds. Changes missed while it was closed are applied in order the next time it opens, and the workspace says how many were missed and when the earliest was due.

Personal wording imports a JSON file of the form {"schemaVersion":1,"entries":{"original":"replacement"}} with up to 200 plain-text entries of 60 characters or fewer. A file with any invalid entry is rejected whole and nothing changes. Wording changes interface text only, never notes, exports or anything sent to the desktop. Each original word is replaced once, so one entry's replacement is never rewritten by another. Clear wording restores the original text.

The workspace and popup use the Noto Sans font bundled inside the extension, checked against the application's font receipt when the extension is staged. The Hong Kong Chinese face is too large to bundle, so Chinese text uses the system font. No font or other resource is requested from outside the extension, apart from the dim sum catalogue when the user asks to load it.

## Offline documentation

The Documentation tab (Alt+5) reads the complete documentation set bundled with the extension, including every feature article and its Cantonese version, with no network connection. Search matches article titles and text. Links between articles open inside the tab, including links to a heading, and links to outside websites open in a new browser tab. Cantonese mode shows the Cantonese version of each article where one exists. The articles are rendered without running any HTML or script from the source text. Pages that exist only in the repository's online wiki are not bundled.

The extension talks to the desktop only through browser native messaging. It has no HTTP API, so no Postman collection exists for it.

Links written in a note become links only when they use https and carry no user name or password. They open in a new tab without sending a referrer or giving the opened page access back to the workspace. Other addresses, such as http or javascript ones, stay as plain text marked as not opened.

The Status tab also states the price plainly: Material File Encryptor and this extension are free, with no purchases, subscriptions or paid features, and nothing in the workspace asks for payment details.

## Narration, support tickets and screen recording

Narration, under Personalization, uses the browser's own speech engine. Choose a voice that suits the interface language and a speaking rate from 0.5 to 2. Read this tab (Alt+R) reads the open tab's headings, statuses and controls, naming each control's role and saying when it is unavailable. Stop reading, Escape, or moving to another tab stops speech. A new reading always replaces the previous one. When the browser has no speech engine, the workspace says so and disables reading.

The Support tab (Alt+6) keeps support tickets in this browser. A ticket has a title, a category (problem, question or suggestion), a description and a status (open, waiting or closed), and can be edited later. Up to three PNG, JPEG, WebP, text or JSON files of 200 KB or less can be attached. The diagnostics block (extension version, source commit, interface language, theme and browser) is shown for review and goes into an exported ticket only when its checkbox is ticked. Notes, wording, logos and credentials are never included. Nothing is sent anywhere: Export saves the ticket as a JSON file for the user to share, and Delete asks for the deliberate confirmation.

Screen recording starts only after the browser's own picker has been used to choose a tab or window. Stop recording, or stopping the share in the browser, ends it. The recording is then shown for review, and Save recording stays unavailable until the user confirms it shows nothing private. Saved recordings go to this computer only, and Discard recording removes it.

## Dim sum catalogue

The Dim sum tab (Alt+7; Models is Alt+8 and Status is Alt+9) shows the public catalogue of about 2,900 dim sum and other Hong Kong dishes. It is far too large to ship inside the extension, so it is loaded from GitHub only when Load catalogue from GitHub is chosen. The tab names the hosts it contacts before anything loads: raw.githubusercontent.com for the catalogue, api.github.com for the list of published illustrations, and github.com for an illustration that is opened. Requests carry no cookies and no referrer. The extension's page policy allows network access to the first two hosts only, and the catalogue is kept for a day, with Refresh catalogue fetching it again. Everything else in the workspace works without a network connection.

Search matches English and Chinese names, Jyutping and the dish's short name, and a category filter narrows the list. Each dish shows its description in the interface language, ingredients, allergens and dietary notes. Catalogue images are generated illustrations, published as assets on the catalogue's normal releases, and they are labelled as illustrations rather than photographs of real dishes. A dish with no published illustration says so instead of showing a stand-in picture. Add to my list keeps up to 200 dishes in this browser, and Show my list narrows the view to them.

The Status tab also has a Release code name section. Check releases contacts GitHub only when it is chosen. It reads the list of published releases (draft and prerelease entries are ignored) and finds the release for this build, first by the version tag and then, for a clean source checkout, by the source commit named in the release notes. The matching release is shown with its tag, its code name in English and Traditional Chinese, the dish photo and a link to the release page. The code name comes from the exact Code name line in the published release notes, and the photo is shown only when its address is an exact image file in a catalogue release of the public dim sum photo project. If no release matches, the page says so plainly and shows the newest published release labelled as the latest published release, never as this build. Offline, rate-limited and malformed responses show a readable message, and nothing is stored.

The Status tab also has a Desktop section. Nothing is requested until **Refresh desktop status** is chosen, and the only network is native messaging to the paired desktop (`read-lock-state` and `read-update-state`). It shows the desktop lock state, the desktop version, the update phase and, while an update is downloading or ready, an `md-linear-progress` bar (indeterminate only when the progress is unknown and reduced motion is not requested). A compatibility line compares the desktop version with the `desktopVersion` recorded in the staged bundle's provenance when it was built. If they differ, it says the extension was packaged with another desktop version and asks the person to load the extension again from the `app-<version>\resources\browser-extension` folder of the current desktop. An unpaired browser sees "Pair the browser first" and no desktop values. Answers with extra fields, wrong types or out-of-range values are discarded and shown as a plain "did not answer" state. No path, file name, URL or credential is ever shown. These checks use synthetic fixtures; no installed desktop or real browser registration took part, so the Desktop section is unverified end to end.

The Connection tab has an Authenticator section with one button, **Open authenticator on desktop**. It is disabled until the browser is paired, and nothing is sent until it is chosen. The button asks the paired desktop (`focus-authenticator`) to bring its authenticator forward; the person approves on the desktop, where Reject is the default. The page shows the outcome in plain words: shown, rejected, busy (the desktop is already asking another question), unavailable (locked, window hidden or closing) or pair first. Only a fixed state word comes back, so no code, account name or secret ever appears in the browser. Answers with extra fields or unknown states are discarded and shown as a plain "did not complete" message. These checks use synthetic fixtures; no installed desktop, real browser registration or captured native prompt took part, so this button is unverified end to end.

The Status tab also has a School mode section, below the Desktop section. The extension has no school mode of its own, so the section only displays the desktop's mode and requests a change. Nothing is sent until a button is chosen. **Read school mode** asks the paired desktop (`read-school-mode`) and shows the mode name and whether it is on. Once read, a second button offers the opposite change (**Turn on school mode** or **Turn off school mode**) and sends `set-school-mode`. The person types the vault password on the desktop, never in the browser, and Windows Hello is not used. The page shows the outcome in plain words: now on, now off, already on or off, not confirmed on the desktop, busy, unavailable or pair first. Answers with extra fields, unknown states, a wrongly typed value or a name that is empty, over 80 characters or contains control characters are discarded and shown as a plain "did not complete" or "could not be read" message. Names are shown as text only and nothing is stored in the browser. These checks use synthetic fixtures; no installed desktop, real browser registration or captured native prompt took part, so this section is unverified end to end.

The Status tab also has a Locks section, above its other content. The desktop owns every lock, and the extension never unlocks anything on its own. Nothing is sent until a button is chosen. **Read locks** asks the paired desktop (`read-element-locks`) which workspace tabs it has locked, and lists every tab with a **Lock** and an **Unlock** button. Choosing one sends `set-element-lock` for that tab, and the person types the vault password on the desktop, never in the browser; Windows Hello is not used. Locking and unlocking both need that check. A locked tab stays in the tab bar but is marked disabled, with a lock indicator and an accessible name saying the desktop locked it, and selecting it shows a short explanation instead of its panel. The Status tab holds the controls, so it cannot be locked from the browser; if the desktop locked it anyway, the Locks section stays reachable. When the desktop cannot be reached the page keeps the last list it read, in memory for that page session only, and says it may be out of date. Answers with extra fields, unknown tabs or a wrongly typed value are discarded and shown as a plain "did not complete" or "could not be read" message, and nothing is stored in the browser. These checks use synthetic fixtures; no installed desktop, real browser registration or captured native prompt took part, so this section is unverified end to end.

The Status tab also has a Feature coverage section. At staging, the build writes a record of every extension row in the feature inventory, with its status, behavior verdict, evidence verdict, the first 240 characters of its reason and the extension target identities, and the build fails if a row claims to be implemented without evidence files, verified built and visual evidence and a present behavior verdict. The section shows counts by status, a search field and a status filter. A fixed note states that these are inventory records and not proof of delivery. Reasons are recorded in English.

Focused tests cover malformed/oversized cache, failed saves, persistence, keyboard tab routing, forged sender paths and staged local-only CSP. Source staging hashes every workspace file. Signing, installed identity, real browser interaction, visual parity and display scaling remain unverified.

## Bundled copy measurement

The isolated shared message-style entry reduced the staged language bundle from 431,433 bytes to 999 bytes. The retained staging receipts bind both outputs by SHA-256. The staged helper matched the source helper for all 25 independent English/Cantonese level combinations; existing shared-language tests also passed. This measures bundled bytes, not browser startup or rendering speed. The shared frozen style table is reexported unchanged from the desktop translator.
