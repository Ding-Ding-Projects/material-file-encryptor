# Material File Encryptor interface

The product is a Windows file manager for a real WinFsp drive. Files open through the mounted drive in ordinary applications. The backing folder and local offline cache hold encrypted data. There is no decrypted working folder.

## Visual direction

Use Material 3 with quiet sage color roles, consistent outlined icons, rounded controls, a navigation drawer and one continuous file table. This is a practical desktop utility. Avoid dashboard cards, statistic tiles, ornamental gradients, promotional hero layouts and invented file fixtures in the shipped interface.

The light surface is `#fafaf5`, navigation frame `#f0f1e9`, primary `#455c46`, on-primary white, primary container `#c6e8c3`, text `#1a1d18`, supporting text `#535b50`, outline `#747d6e` and divider `#d5dacd`. The dark surface is `#141813`, navigation frame `#10140f`, primary `#acd0a9`, on-primary `#19351e`, primary container `#304d33`, text `#e1e5da`, supporting text `#bcc5b5`, outline `#8e9887` and divider `#3d4739`. System, light and dark selections persist locally.

Use Segoe UI Variable, Segoe UI and system sans-serif in that order. Page titles are 32px at desktop size, supporting section headings 16px, controls 13px, file rows 12px and metadata 11px. Weight and spacing establish hierarchy without oversized titles. Icons share one 24-unit grid and a consistent outlined stroke.

## Window and navigation

The frameless titlebar has genuine minimize, maximize/restore and close controls connected to Electron. The clear titlebar is draggable; controls are explicitly non-draggable. Paths never appear in the window title.

The left navigation contains My drive, Available offline, Settings and How it works. Offline is a working filter. The file pane contains actual drive state, the mounted root, a prominent Open in Explorer action, encrypted storage/cache paths, import/search controls, selected-file actions and the file table. Filenames and paths are inserted as text and never interpreted as HTML.

A continuous table, restrained dividers and compact metadata keep the file list central. Name, availability, size and modified time are shown. Native radio selection works with the keyboard; Enter opens a selected file. Double-click opens the file through the mounted drive. Name and selection are retained at narrower widths; Modified gives way first. Long paths truncate with a full tooltip rather than causing horizontal page overflow.

At 780px the drawer becomes an icon rail. At 480px controls wrap and the rail narrows. The interface remains operable at a short viewport and 200% scale. Modal content scrolls independently while actions stay visible.

## Initial state and setup

Show no sample files or invented mounted status. The empty state introduces a private drive with Create a drive and Unlock existing drive. A driver notice displays the backend's actual availability and reason. Creating encrypted storage must not imply the mount succeeded.

Setup asks for encrypted storage, an encrypted local cache prefilled from backend defaults, an available drive letter, and a credential choice. Password and Key file are mutually exclusive. A password is masked with an explicit Show/Hide control and confirmation on creation. Key-file mode provides native choose and generate actions; generation appears only on creation. Key material is never shown. Password and key-file input values are cleared when the dialog closes.

The default maximum encrypted part size is 10 MB. KB, MB and GB are IEC multiples of 1024. Valid limits range from 1 KiB to 1 GiB and include physical encryption overhead. The numeric input rejects invalid values without coercion. Changing the limit applies to new and edited files only. Re-split existing files is separate, explicitly confirmed and accompanied by real operation progress.

## File behavior and state

The status model distinguishes locked, mounting, mounted, unlocked/unmounted and unmount blocked by open files. The mounted root reflects the backend's drive letter. Open in Explorer opens that real root. A mount retry remains available when unlocked but unmounted.

Import uses native file selection. Open uses an ordinary path on the native mounted drive. Export copy clearly warns that the chosen destination receives a decrypted file. Keep offline pins encrypted cached data. Remove offline copy releases unneeded encrypted cache while preserving backing storage. Neither action creates a plaintext directory.

Sync reports encrypted storage updates and backend errors. It does not claim cloud uploads completed. Busy operations prevent duplicate mutation requests, have visible text and use indeterminate progress unless the backend supplies actual totals. Errors remain visible, adjacent to the dialog or at the top of the active pane, until dismissed or retried. Success uses a short snackbar.

Lock unmounts before releasing keys. Blocked unmount preserves the working state and reports that open files need closing. The interface must not claim files were removed or a mount completed without a backend result.

## Settings

Start with Windows defaults on and is independently configurable. Automatic unlock defaults off. Enabling it requires an explicit explanation and confirmation: a protected drive key is saved for the current Windows user, which allows that account to unlock without a password or key file. Both credential types are supported. Forget saved credential disables and removes that remembered access. Interface preferences and logs never store the password or key-file contents.

English, Cantonese and bilingual labels are available. Emoji in dialogs is optional. Celebration budget changes success wording; Waiting room energy changes progress wording. Both sliders are functional and persist with appearance and language. Personal vocabulary JSON accepts a versioned, bounded list of label substitutions, stored locally and applied to labels only. No private vocabulary ships in the repository; file paths and names are never rewritten.

## Interaction and access

Controls have distinct hover, focus, pressed, disabled and busy states. Material easing is `cubic-bezier(.2,0,0,1)`, with 150ms state transitions, 220ms view entrances and 240ms dialog entrances. Motion stays subtle and does not stagger table data. `prefers-reduced-motion` removes travel and spinning; progress text remains visible. No operation depends on animation completion.

Use semantic controls, labels, table headers, modal dialogs, live progress and persistent alert text. Dialogs trap focus through the native HTML dialog element, begin at the first useful field and restore focus on close. Escape cancels an idle dialog. Confirmation starts with Cancel focused. Busy setup cannot be dismissed until the request completes. Focus rings use primary color with a visible offset. Availability always includes text, not color alone.

## Evidence

Rendered browser interaction tests may use an explicitly isolated test bridge to validate interface behavior; these cannot prove WinFsp operation and their fixture images must not be published as runtime screenshots. Actual Electron captures and real Windows Explorer behavior are required for product evidence. Inspect light and dark views at 390px, 768px and 1440px, short-height setup, keyboard selection, long filenames and 200% scale. A successful Linux UI test does not establish a working Windows mount.
