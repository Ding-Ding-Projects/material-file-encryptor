# Screenshot archive

These screenshots were taken from earlier builds of the app, extension and documentation site. The README now shows only captures of the current build. Every image file stays in the repository, unchanged, at its original path, together with the caption and provenance it had when it was published. Nothing on this page is a capture of the current build.

Current captures and their receipts are in the [README](../README.md#current-captures). Captures that a newer capture of the same screen replaced earlier are also tracked in the [superseded capture list](../design/superseded-captures.md).

## Original captions and provenance

### Redesign build dc166dc9, 2026-11-16 (replaced in the README on 2026-11-17)

Every image below is a genuine capture of the packaged app built from source `dc166dc9` (version 0.2.0). Each was taken in its own isolated profile with neutral test files, inspected by eye, and left unedited. The [capture manifest](images/captures/redesign-dc166dc9/manifest.json) records every image's hash, size, viewport, theme, language and capture method, and lists what could not be captured. Captures of earlier builds are kept in the [screenshot archive](screenshots-archive.md).

#### Home and navigation

The Home page opens on a card for each part of the app. The New tab catalog and the navigation menus each carry their own search box and Regex builder.

<details>
<summary>Home, New tab catalog and Settings menu (6)</summary>

| Home, drive locked | Home, drive mounted | Home, dark |
|---|---|---|
| ![Home with flagship cards for the drive, offline files, history, Recycle Bin, Docker Hub storage, local access and Local tools, drive locked, light, English](images/captures/redesign-dc166dc9/home-locked-light-en.png) | ![Home with a mounted drive, card status lines and recent activity, light, English](images/captures/redesign-dc166dc9/home-mounted-light-en.png) | ![Home with a mounted drive, dark, English](images/captures/redesign-dc166dc9/home-mounted-dark-en.png) |

| Home, English and Cantonese | New tab catalog | Settings menu |
|---|---|---|
| ![Home with a mounted drive, light, English and Cantonese together](images/captures/redesign-dc166dc9/home-mounted-light-bilingual.png) | ![New tab catalog listing every page, tool and setting with its own search box and Regex builder button](images/captures/redesign-dc166dc9/new-tab-catalog-light-en.png) | ![Settings menu opened from the navigation rail with a scoped filter, a Regex builder button and the settings destinations](images/captures/redesign-dc166dc9/settings-menu-light-en.png) |

</details>

#### Drive, history and recovery

A mounted drive shows the folder tree, command bar, file list and a details panel with the encrypted part map and versions.

<details>
<summary>Locked drive, creating a drive, files, details, History and Recycle Bin (10)</summary>

| Drive, locked | Create a drive | Drive, files |
|---|---|---|
| ![Drive page with the locked card offering Unlock existing drive and Create a drive, light, English](images/captures/redesign-dc166dc9/drive-locked-light-en.png) | ![Create a drive dialog with the encrypted storage folder, cache folder and drive letter filled in with neutral folders](images/captures/redesign-dc166dc9/create-drive-dialog-light-en.png) | ![Mounted drive with a folder tree, command bar, file list, details panel and mounted drive panel, light, English](images/captures/redesign-dc166dc9/drive-files-light-en.png) |

| Drive, one file selected | Command bar overflow menu | Drive, files, dark |
|---|---|---|
| ![Mounted drive with one file selected, showing the encrypted part map, its versions and cloud backup status in the details panel](images/captures/redesign-dc166dc9/drive-file-selected-light-en.png) | ![Drive command bar overflow menu with a filter box, a Regex builder button and the actions that do not fit on the bar](images/captures/redesign-dc166dc9/drive-command-bar-overflow-light-en.png) | ![Mounted drive file list, dark, English](images/captures/redesign-dc166dc9/drive-files-dark-en.png) |

| Drive, dark, bilingual | History | Recycle Bin |
|---|---|---|
| ![Mounted drive file list, dark, English and Cantonese together](images/captures/redesign-dc166dc9/drive-files-dark-bilingual.png) | ![History page listing saved versions with Restore as new version actions](images/captures/redesign-dc166dc9/history-light-en.png) | ![Recycle Bin page with its actions, search box and an empty table](images/captures/redesign-dc166dc9/recycle-bin-light-en.png) |

| Available offline |
|---|
| ![Available offline page with its empty state and the same details panel](images/captures/redesign-dc166dc9/available-offline-light-en.png) |

</details>

#### Local tools

Thirteen tools sit behind one launcher with its own search and Regex builder.

<details>
<summary>Tool launcher, regex builder, Base64, type generator, virtual disks, charts, sketch board and world generator (14)</summary>

| Local tools | Local tools, dark | Local tools, dark, bilingual |
|---|---|---|
| ![Local tools page with a search box, a Regex builder button, category filters and tool tiles](images/captures/redesign-dc166dc9/local-tools-light-en.png) | ![Local tools page, dark, English](images/captures/redesign-dc166dc9/local-tools-dark-en.png) | ![Local tools page, dark, English and Cantonese together](images/captures/redesign-dc166dc9/local-tools-dark-bilingual.png) |

| Regex builder | Regex builder, expression | Base64 toolkit |
|---|---|---|
| ![Regex builder panel beside the Local tools search box with the regular expression switch off](images/captures/redesign-dc166dc9/regex-builder-closed-light-en.png) | ![Regex builder with the regular expression switch on, an expression, a valid verdict and test text; the tool list is filtered to three matches](images/captures/redesign-dc166dc9/regex-builder-expression-light-en.png) | ![Base64 toolkit with options, input and output areas and file actions](images/captures/redesign-dc166dc9/tool-base64-light-en.png) |

| Type generator | Virtual disks | Live charts |
|---|---|---|
| ![Type generator with a JSON sample, target language and inference options](images/captures/redesign-dc166dc9/tool-type-generator-light-en.png) | ![Virtual disks page with attached disks, selected file and a create form](images/captures/redesign-dc166dc9/tool-virtual-disks-light-en.png) | ![Live charts page with the drive used space chart for a mounted drive](images/captures/redesign-dc166dc9/tool-live-charts-mounted-light-en.png) |

| Sketch board | Server preparation | World generator, options |
|---|---|---|
| ![Sketch board with pen, shape and text tools above an empty canvas](images/captures/redesign-dc166dc9/tool-sketch-board-light-en.png) | ![Server preparation page with the four server targets and the create server form](images/captures/redesign-dc166dc9/tool-server-preparation-light-en.png) | ![World generator form with version loading, seed, difficulty and game mode](images/captures/redesign-dc166dc9/world-generator-options-light-en.png) |

| World generator, area | World generator, output |
|---|---|
| ![World generator area picker with its chunk grid and size summary](images/captures/redesign-dc166dc9/world-generator-area-light-en.png) | ![World generator output options with the licence checkbox and Generate the world button](images/captures/redesign-dc166dc9/world-generator-output-light-en.png) |

</details>

#### Narrow layout at 390 by 844

At 390 pixels wide the navigation moves into a drawer, cards stack and the file table becomes a list of cards.

<details>
<summary>Home, navigation drawer, tools and drive on a narrow window (6)</summary>

| Home | Navigation drawer | Local tools |
|---|---|---|
| ![Home at 390 by 844 pixels with the cards stacked in one column](images/captures/redesign-dc166dc9/home-390x844-light-en.png) | ![Navigation drawer at 390 by 844 pixels opened from the menu button](images/captures/redesign-dc166dc9/navigation-drawer-390x844-light-en.png) | ![Local tools at 390 by 844 pixels with category chips and tool tiles](images/captures/redesign-dc166dc9/local-tools-390x844-light-en.png) |

| Drive | Command bar overflow | Home, dark, bilingual |
|---|---|---|
| ![Mounted drive file list at 390 by 844 pixels as cards](images/captures/redesign-dc166dc9/drive-files-390x844-light-en.png) | ![Drive command bar overflow menu at 390 by 844 pixels](images/captures/redesign-dc166dc9/drive-command-bar-overflow-390x844-light-en.png) | ![Home at 390 by 844 pixels, dark, English and Cantonese together](images/captures/redesign-dc166dc9/home-390x844-dark-bilingual.png) |

</details>

#### Settings, personalization and local access

Appearance, language, text size, high contrast, sound and animation controls, in light and dark themes and in English, Cantonese or both.

<details>
<summary>Settings, high contrast and text size, languages, personalization and animation editor (9)</summary>

| Settings, startup and storage | Settings, appearance and language | High contrast and 130 percent text |
|---|---|---|
| ![Settings page with its search box, startup and unlocking switches and encrypted part size](images/captures/redesign-dc166dc9/settings-startup-storage-light-en.png) | ![Settings appearance and language section with theme, row density, text size, high contrast and language](images/captures/redesign-dc166dc9/settings-appearance-light-en.png) | ![Settings with high contrast on and text size at 130 percent, which enlarges the whole interface](images/captures/redesign-dc166dc9/settings-high-contrast-text-130-light-en.png) |

| Settings, bilingual | Settings, dark, bilingual | Personalization, language and voice |
|---|---|---|
| ![Settings appearance section, light, English and Cantonese together](images/captures/redesign-dc166dc9/settings-appearance-light-bilingual.png) | ![Settings appearance section, dark, English and Cantonese together](images/captures/redesign-dc166dc9/settings-appearance-dark-bilingual.png) | ![Personalization page, Language and voice tab, with its search box and Regex builder](images/captures/redesign-dc166dc9/personalization-language-light-en.png) |

| Personalization, appearance | Animation and transitions | Local access |
|---|---|---|
| ![Personalization page, Appearance tab, with theme, density and accent colour](images/captures/redesign-dc166dc9/personalization-appearance-light-en.png) | ![Animation and transitions editor with the Calm, Standard, Expressive and Playful profiles](images/captures/redesign-dc166dc9/motion-editor-profiles-light-en.png) | ![Local access page, Local profile tab, with its search box and Regex builder](images/captures/redesign-dc166dc9/local-access-light-en.png) |

</details>

#### Docker Hub drive, no folders

These captures show creating a drive on Docker Hub without choosing any folder, and opening a backed-up drive from Docker Hub, as the packaged app rendered them on source `a2581b24` (the [capture manifest](images/captures/docker-hub-drive/manifest.json) names what was left out for privacy). The signed-in account is real and its name is only the public repository namespace.

<details>
<summary>Docker Hub drive, no folders (7)</summary>

| Create: where | Create: repository picker | Create: details |
|---|---|---|
| ![Create a drive dialog, step 1 Where, with two choice cards: On this computer (choose a folder) and Docker Hub (no folder to choose)](images/captures/docker-hub-drive/create-where-light-en.png) | ![Create a drive dialog, step 3 Repository, showing the signed-in account, the search box with Regex builder and Refresh, the filter chips and repository rows with drive cards](images/captures/docker-hub-drive/create-repository-picker-light-en.png) | ![Create a drive dialog, step 4 Details, with the chosen repository, name, letter, password fields, the public warning and where the local copy lives](images/captures/docker-hub-drive/create-details-light-en.png) |

| Docker Hub storage after backup | Open: drive cards | Open: snapshots |
|---|---|---|
| ![Docker Hub storage page with the saved destination, public visibility, last verified digest and the snapshot controls](images/captures/docker-hub-drive/docker-hub-storage-after-backup-light-en.png) | ![Open a drive from Docker Hub dialog, step 1 Drive, with filter chips and a repository holding nine detected drives as cards](images/captures/docker-hub-drive/open-picker-drive-cards-light-en.png) | ![Open a drive from Docker Hub dialog, step 2 Snapshot, with the latest snapshot selected, restore into the app's own folder, drive letter and Advanced: choose folder](images/captures/docker-hub-drive/open-snapshots-light-en.png) |

| Open: unlock |
|---|
| ![Open a drive from Docker Hub dialog, step 4 Unlock, after the snapshot was restored and verified](images/captures/docker-hub-drive/open-unlock-light-en.png) |

</details>

#### Docker Hub backup

No account was signed in for these captures. They show the page as the app renders it with no saved account, and after the guided sign-in could not reach the service.

<details>
<summary>Docker Hub storage before sign-in and after an unfinished sign-in (2)</summary>

| Docker Hub, before sign-in | Docker Hub, sign-in did not finish |
|---|---|
| ![Docker Hub storage page before any sign-in, with the guided sign-in steps and the drive list empty](images/captures/redesign-dc166dc9/docker-hub-initial-light-en.png) | ![Docker Hub storage page after Start guided sign-in on a computer with no connection, offering Retry guided sign-in](images/captures/redesign-dc166dc9/docker-hub-sign-in-unfinished-light-en.png) |

</details>

Earlier builds' captures, with their original dates and provenance, are in the [screenshot archive](screenshots-archive.md).


### Setup guide, local packaged 0.2.0

Local packaged 0.2.0 at source `ca91b0209c3aa0bf0f378f62a60cefc778ef869a`, captured on 2026-10-17 at 03:45:42.410 UTC. This is the initial setup welcome screen at 1180 × 850, English, light theme, renderer scale 1. Native window icon handles were checked separately; this image does not establish an installed copy, rendered tray or taskbar icons, setup completion, or full workflows. [Capture inventory](evidence/installed-icons-ca91b020-inventory.json). Earlier captures retain their original provenance.

### Original gallery introduction

Every image below is a genuine capture of a real build; none is a mock, design preview or edited image. Each group is collapsed: choose its heading to open it. Capture times are unavailable because no validated timestamp was recorded, and earlier captures were withdrawn when these replaced them. They remain unchanged in Git history and are listed with their hashes in [the gallery review](site/gallery-review.json).

### Release 1.779.1: setup, destructive confirmation, wording, element locks and settings

Fifteen captures of the extracted full release package for version 1.779.1, built from source `b83449e`. This was a release package run, not an installed copy. Each frame was taken by window handle on a task-owned hidden desktop with an isolated profile and a throwaway vault holding neutral test files. The information icons in these frames are the compact 28 pixel controls. Machine-readable details are in [the capture manifest](images/captures/reproof-1.779.1/manifest.json) and [the proof record](evidence/installed-proof-1.779.1.json). Captures these replaced are listed in [the archive](../design/superseded-captures.md).

### Release 1.782.1: drive frames

Six captures of the extracted full release package for version 1.782.1, built from source `4a49919`. This was a release package run, not an installed copy. Each frame was taken by window handle on a task-owned hidden desktop with an isolated profile and a throwaway vault holding neutral test files. They replace the older drive frames, which were taken before the compact information icons existed. Machine-readable details are in [the capture manifest](images/captures/reproof-1.782.1/manifest.json) and [the proof record](evidence/installed-proof-1.782.1.json).

### Desktop application

92 captures of the installed desktop application, version 1.702.1, built from source `9394b35`. Each was taken by window handle on a task-owned hidden desktop at 150 percent display scale (a 1280 by 800 window, saved at 1920 by 1200 pixels) with an isolated profile and a throwaway vault that holds test files only and uses neutral folder names. The capture host reported no frame showing a private path. The run captured 312 frames in all, covering 52 screens in light and dark themes and in English, Cantonese and bilingual modes; these are the ones published. A tabbed screen's own frame shows the tab named in its caption, and a few dark and bilingual frames show the last tab visited. Home is the first group. The drive, Pair a browser and server frames were retaken from a later installed release, listed with its own manifest below. The six drive frames were retaken again from the 1.782.1 release package, shown in the release 1.782.1 section above. The [capture manifest](images/captures/refresh-b4cbf0e/desktop-capture-manifest.json) records every frame's hash.

### Browser extension

Headless Microsoft Edge with the staged extension from source `b4cbf0e`, loaded unpacked into a disposable profile. No desktop was paired, so connection states read as unavailable; the Models captures use a fake local model server and the Status captures read the live published releases.

### Documentation site

Captures of the documentation site staged from source `048cfbd` and served from loopback in a disposable headless Microsoft Edge profile, light theme, English. They show public pages only, not native-product or installed acceptance. The workspace page was not captured because its article list renders unstyled.

The refresh folder holds a [manifest](images/captures/refresh-b4cbf0e/manifest.json) with each image's hash, size, viewport and source commit; the later installed round has its own [manifest](images/captures/refresh-6ef15e8/manifest.json). `node scripts/refresh-screenshots.mjs capture` and `node scripts/refresh-screenshots.mjs desktop` regenerate it, and `node scripts/apply-screenshot-refresh.mjs` rewrites every reference. The earlier original captures, including the history-guidance and packaged Windows images, were removed from the current tree and remain in Git history; their records stay in the [preview inventory](images/captures/preview/inventory.json), [preview verification summary](images/captures/preview/verification-summary.json), [Linux capture provenance](images/captures/provenance.json) and [Windows capture provenance](images/captures/windows/provenance.json). The diagrams here explain behavior; they are not screenshots or runtime evidence.

## Images by original folder

### `installed-icons-ca91b020` (1)

| Local packaged 0.2.0 setup guide in English and light theme |
|---|
| ![Local packaged 0.2.0 setup guide in English and light theme](images/captures/installed-icons-ca91b020/setup-guide-light-en.png) |

### `refresh-5db936f/desktop` (9)

| Pair a browser | Pair a browser, dark | Pair a browser, Cantonese |
|---|---|---|
| ![Pair a browser](images/captures/refresh-5db936f/desktop/pair-a-browser-light-en.png) | ![Pair a browser, dark](images/captures/refresh-5db936f/desktop/pair-a-browser-dark-en.png) | ![Pair a browser, Cantonese](images/captures/refresh-5db936f/desktop/pair-a-browser-light-yue.png) |

| Pair a browser, bilingual | Help menu with Quit Material File Encryptor | Command palette searching for Quit |
|---|---|---|
| ![Pair a browser, bilingual](images/captures/refresh-5db936f/desktop/pair-a-browser-light-bilingual.png) | ![Help menu with Quit Material File Encryptor](images/captures/refresh-5db936f/desktop/quit-help-menu-light-en.png) | ![Command palette searching for Quit](images/captures/refresh-5db936f/desktop/quit-palette-query-light-en.png) |

| Server card, failed: Ended unexpectedly, exit code -1 | Server card, failed: Ended unexpectedly, exit code -1, dark | Server card, failed, scrolled to the last log lines |
|---|---|---|
| ![Server card, failed: Ended unexpectedly, exit code -1](images/captures/refresh-5db936f/desktop/server-card-failed-light-en.png) | ![Server card, failed: Ended unexpectedly, exit code -1, dark](images/captures/refresh-5db936f/desktop/server-card-failed-dark-en.png) | ![Server card, failed, scrolled to the last log lines](images/captures/refresh-5db936f/desktop/server-card-failed-logtail-light-en.png) |

### `refresh-6ef15e8/desktop` (7)

| Server card, running | Server card, running, dark | Server card needing Java 25 after the Java check, dark, bilingual |
|---|---|---|
| ![Server card, running](images/captures/refresh-6ef15e8/desktop/server-card-running-light-en.png) | ![Server card, running, dark](images/captures/refresh-6ef15e8/desktop/server-card-running-dark-en.png) | ![Server card needing Java 25 after the Java check, dark, bilingual](images/captures/refresh-6ef15e8/desktop/server-java25-needed-dark-bilingual.png) |

| Java-check refusal message, dark, bilingual | Server running, dark, bilingual | Server logs ending with the Done line, dark, bilingual |
|---|---|---|
| ![Java-check refusal message, dark, bilingual](images/captures/refresh-6ef15e8/desktop/server-java-check-refusal-dark-bilingual.png) | ![Server running, dark, bilingual](images/captures/refresh-6ef15e8/desktop/server-running-card-dark-bilingual.png) | ![Server logs ending with the Done line, dark, bilingual](images/captures/refresh-6ef15e8/desktop/server-running-logs-dark-bilingual.png) |

| Close dialog while a server runs: keep in the tray, stop and quit, or cancel |
|---|
| ![Close dialog while a server runs: keep in the tray, stop and quit, or cancel](images/captures/refresh-6ef15e8/desktop/close-dialog-server-running-dark-bilingual.png) |

### `refresh-b4cbf0e/desktop` (65)

| Home | Home, dark | Home, Cantonese |
|---|---|---|
| ![Home](images/captures/refresh-b4cbf0e/desktop/home-light-en.png) | ![Home, dark](images/captures/refresh-b4cbf0e/desktop/home-dark-en.png) | ![Home, Cantonese](images/captures/refresh-b4cbf0e/desktop/home-light-yue.png) |

| Home, bilingual | New tab popover | New tab popover, dark |
|---|---|---|
| ![Home, bilingual](images/captures/refresh-b4cbf0e/desktop/home-light-bilingual.png) | ![New tab popover](images/captures/refresh-b4cbf0e/desktop/newtab-popover-light-en.png) | ![New tab popover, dark](images/captures/refresh-b4cbf0e/desktop/newtab-popover-dark-en.png) |

| New tab popover, bilingual | Available offline | Available offline, Cantonese |
|---|---|---|
| ![New tab popover, bilingual](images/captures/refresh-b4cbf0e/desktop/newtab-popover-light-bilingual.png) | ![Available offline](images/captures/refresh-b4cbf0e/desktop/offline-light-en.png) | ![Available offline, Cantonese](images/captures/refresh-b4cbf0e/desktop/offline-light-yue.png) |

| Create a drive dialog | Create a drive dialog, dark | Create a drive dialog, Cantonese |
|---|---|---|
| ![Create a drive dialog](images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-light-en.png) | ![Create a drive dialog, dark](images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-dark-en.png) | ![Create a drive dialog, Cantonese](images/captures/refresh-b4cbf0e/desktop/create-drive-dialog-light-yue.png) |

| Unlock a drive dialog | Unlock a drive dialog, bilingual | Lock message when a program still has files open |
|---|---|---|
| ![Unlock a drive dialog](images/captures/refresh-b4cbf0e/desktop/unlock-drive-dialog-light-en.png) | ![Unlock a drive dialog, bilingual](images/captures/refresh-b4cbf0e/desktop/unlock-drive-dialog-light-bilingual.png) | ![Lock message when a program still has files open](images/captures/refresh-b4cbf0e/desktop/lock-holder-message-light-en.png) |

| Force Lock confirmation | History | History, dark |
|---|---|---|
| ![Force Lock confirmation](images/captures/refresh-b4cbf0e/desktop/force-lock-confirm-light-en.png) | ![History](images/captures/refresh-b4cbf0e/desktop/history-light-en.png) | ![History, dark](images/captures/refresh-b4cbf0e/desktop/history-dark-en.png) |

| History, Cantonese | Recycle Bin | Recycle Bin, bilingual |
|---|---|---|
| ![History, Cantonese](images/captures/refresh-b4cbf0e/desktop/history-light-yue.png) | ![Recycle Bin](images/captures/refresh-b4cbf0e/desktop/recycle-bin-light-en.png) | ![Recycle Bin, bilingual](images/captures/refresh-b4cbf0e/desktop/recycle-bin-light-bilingual.png) |

| Converter, Source files | Converter, Formats | Converter, Options |
|---|---|---|
| ![Converter, Source files](images/captures/refresh-b4cbf0e/desktop/tools-converter-light-en.png) | ![Converter, Formats](images/captures/refresh-b4cbf0e/desktop/tools-converter-tab2-light-en.png) | ![Converter, Options](images/captures/refresh-b4cbf0e/desktop/tools-converter-tab3-light-en.png) |

| Converter, Queue and result history | Converter, Queue and result history, dark | Documents and downloads |
|---|---|---|
| ![Converter, Queue and result history](images/captures/refresh-b4cbf0e/desktop/tools-converter-tab4-light-en.png) | ![Converter, Queue and result history, dark](images/captures/refresh-b4cbf0e/desktop/tools-converter-dark-en.png) | ![Documents and downloads](images/captures/refresh-b4cbf0e/desktop/tools-documents-light-en.png) |

| Storage maintenance | Status | Status, dark |
|---|---|---|
| ![Storage maintenance](images/captures/refresh-b4cbf0e/desktop/tools-storage-maintenance-light-en.png) | ![Status](images/captures/refresh-b4cbf0e/desktop/tools-status-light-en.png) | ![Status, dark](images/captures/refresh-b4cbf0e/desktop/tools-status-dark-en.png) |

| Status, bilingual | File details | Local models, Model Store |
|---|---|---|
| ![Status, bilingual](images/captures/refresh-b4cbf0e/desktop/tools-status-light-bilingual.png) | ![File details](images/captures/refresh-b4cbf0e/desktop/tools-file-details-light-en.png) | ![Local models, Model Store](images/captures/refresh-b4cbf0e/desktop/tools-local-models-light-en.png) |

| Local models, Pull cart | Local models, Local chat | Local models, Profiles |
|---|---|---|
| ![Local models, Pull cart](images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab2-light-en.png) | ![Local models, Local chat](images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab3-light-en.png) | ![Local models, Profiles](images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab4-light-en.png) |

| Local models, Help | Local models, Help, dark | Local models, Help, bilingual |
|---|---|---|
| ![Local models, Help](images/captures/refresh-b4cbf0e/desktop/tools-local-models-tab5-light-en.png) | ![Local models, Help, dark](images/captures/refresh-b4cbf0e/desktop/tools-local-models-dark-en.png) | ![Local models, Help, bilingual](images/captures/refresh-b4cbf0e/desktop/tools-local-models-light-bilingual.png) |

| Server preparation, create a server on any target | Server preparation, scrolled to the server card, dark | Server preparation, Cantonese |
|---|---|---|
| ![Server preparation, create a server on any target](images/captures/refresh-b4cbf0e/desktop/tools-server-targets-panel-light-en.png) | ![Server preparation, scrolled to the server card, dark](images/captures/refresh-b4cbf0e/desktop/tools-server-targets-panel-dark-en.png) | ![Server preparation, Cantonese](images/captures/refresh-b4cbf0e/desktop/tools-server-preparation-light-yue.png) |

| Server card, Overview | Server card, Logs | Server card, Settings |
|---|---|---|
| ![Server card, Overview](images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab1-light-en.png) | ![Server card, Logs](images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab2-light-en.png) | ![Server card, Settings](images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab3-light-en.png) |

| Server card, Plugins and mods | Settings, Cantonese | Personalization, Language and voice |
|---|---|---|
| ![Server card, Plugins and mods](images/captures/refresh-b4cbf0e/desktop/tools-server-card-tab4-light-en.png) | ![Settings, Cantonese](images/captures/refresh-b4cbf0e/desktop/settings-light-yue.png) | ![Personalization, Language and voice](images/captures/refresh-b4cbf0e/desktop/settings-personalization-light-en.png) |

| Personalization, Appearance | Personalization, Schedules | Personalization, Attention |
|---|---|---|
| ![Personalization, Appearance](images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab2-light-en.png) | ![Personalization, Schedules](images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab3-light-en.png) | ![Personalization, Attention](images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab4-light-en.png) |

| Personalization, Private local history | Personalization, Private local history, dark | Local access, Local profile |
|---|---|---|
| ![Personalization, Private local history](images/captures/refresh-b4cbf0e/desktop/settings-personalization-tab5-light-en.png) | ![Personalization, Private local history, dark](images/captures/refresh-b4cbf0e/desktop/settings-personalization-dark-en.png) | ![Local access, Local profile](images/captures/refresh-b4cbf0e/desktop/settings-local-access-light-en.png) |

| Local access, Authenticator | Local access, Support Tickets | Local access, Access history |
|---|---|---|
| ![Local access, Authenticator](images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab3-light-en.png) | ![Local access, Support Tickets](images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab4-light-en.png) | ![Local access, Access history](images/captures/refresh-b4cbf0e/desktop/settings-local-access-tab5-light-en.png) |

| Local access, Access history, bilingual | Updates | Updates, dark |
|---|---|---|
| ![Local access, Access history, bilingual](images/captures/refresh-b4cbf0e/desktop/settings-local-access-light-bilingual.png) | ![Updates](images/captures/refresh-b4cbf0e/desktop/update-page-light-en.png) | ![Updates, dark](images/captures/refresh-b4cbf0e/desktop/update-page-dark-en.png) |

| Help, How it works | Help, How it works, dark | Help, How it works, Cantonese |
|---|---|---|
| ![Help, How it works](images/captures/refresh-b4cbf0e/desktop/help-how-it-works-light-en.png) | ![Help, How it works, dark](images/captures/refresh-b4cbf0e/desktop/help-how-it-works-dark-en.png) | ![Help, How it works, Cantonese](images/captures/refresh-b4cbf0e/desktop/help-how-it-works-light-yue.png) |

| Help, Documentation | Help, Changelog |
|---|---|
| ![Help, Documentation](images/captures/refresh-b4cbf0e/desktop/help-documentation-light-en.png) | ![Help, Changelog](images/captures/refresh-b4cbf0e/desktop/help-changelog-light-en.png) |

### `refresh-b4cbf0e/extension` (28)

| Workspace Home | Workspace Home, dark | Workspace Home, Cantonese |
|---|---|---|
| ![Workspace Home](images/captures/refresh-b4cbf0e/extension/home-1280x900-light-en.png) | ![Workspace Home, dark](images/captures/refresh-b4cbf0e/extension/home-1280x900-dark-en.png) | ![Workspace Home, Cantonese](images/captures/refresh-b4cbf0e/extension/home-1280x900-light-yue.png) |

| Workspace Home at 360 pixels, dark, bilingual | Popup with the section launcher | Popup, dark, bilingual |
|---|---|---|
| ![Workspace Home at 360 pixels, dark, bilingual](images/captures/refresh-b4cbf0e/extension/home-360x780-dark-bilingual.png) | ![Popup with the section launcher](images/captures/refresh-b4cbf0e/extension/popup-380-light-en.png) | ![Popup, dark, bilingual](images/captures/refresh-b4cbf0e/extension/popup-380-dark-bilingual.png) |

| Popup, Cantonese | Connection | Personalization |
|---|---|---|
| ![Popup, Cantonese](images/captures/refresh-b4cbf0e/extension/popup-380-light-yue.png) | ![Connection](images/captures/refresh-b4cbf0e/extension/section-connection-1280x900-light-en.png) | ![Personalization](images/captures/refresh-b4cbf0e/extension/section-personalization-1280x900-light-en.png) |

| Personalization at 360 pixels, dark, bilingual | Changelog | Notes |
|---|---|---|
| ![Personalization at 360 pixels, dark, bilingual](images/captures/refresh-b4cbf0e/extension/section-personalization-360x780-dark-bilingual.png) | ![Changelog](images/captures/refresh-b4cbf0e/extension/section-changelog-1280x900-light-en.png) | ![Notes](images/captures/refresh-b4cbf0e/extension/section-notes-1280x900-light-en.png) |

| Documentation | Documentation search while offline | Support |
|---|---|---|
| ![Documentation](images/captures/refresh-b4cbf0e/extension/section-documentation-1280x900-light-en.png) | ![Documentation search while offline](images/captures/refresh-b4cbf0e/extension/offline-documentation-search-light-en.png) | ![Support](images/captures/refresh-b4cbf0e/extension/section-support-1280x900-light-en.png) |

| Dim sum | Progress and publication | Servers |
|---|---|---|
| ![Dim sum](images/captures/refresh-b4cbf0e/extension/section-dimsum-1280x900-light-en.png) | ![Progress and publication](images/captures/refresh-b4cbf0e/extension/section-publishing-1280x900-light-en.png) | ![Servers](images/captures/refresh-b4cbf0e/extension/section-servers-1280x900-light-en.png) |

| Servers, dark, bilingual | Models connected to a local server | Models chat with a streamed reply |
|---|---|---|
| ![Servers, dark, bilingual](images/captures/refresh-b4cbf0e/extension/section-servers-1280x900-dark-bilingual.png) | ![Models connected to a local server](images/captures/refresh-b4cbf0e/extension/models-connected-light-en.png) | ![Models chat with a streamed reply](images/captures/refresh-b4cbf0e/extension/models-chat-light-en.png) |

| Status with the published release | Status with the installer link | Status coverage list at 360 pixels |
|---|---|---|
| ![Status with the published release](images/captures/refresh-b4cbf0e/extension/status-release-light-en.png) | ![Status with the installer link](images/captures/refresh-b4cbf0e/extension/status-installer-link-light-en.png) | ![Status coverage list at 360 pixels](images/captures/refresh-b4cbf0e/extension/status-coverage-narrow-light-en.png) |

| Status without a paired desktop | Connection at the 360 pixel minimum, Cantonese | Models at the 360 pixel minimum, 2x, dark, bilingual |
|---|---|---|
| ![Status without a paired desktop](images/captures/refresh-b4cbf0e/extension/status-desktop-unpaired-light-en.png) | ![Connection at the 360 pixel minimum, Cantonese](images/captures/refresh-b4cbf0e/extension/matrix-options-connection_minimum_1x_light_yue.png) | ![Models at the 360 pixel minimum, 2x, dark, bilingual](images/captures/refresh-b4cbf0e/extension/matrix-options-models_minimum_2x_dark_bilingual.png) |

| Popup at 360 by 640, 2x, dark, bilingual |
|---|
| ![Popup at 360 by 640, 2x, dark, bilingual](images/captures/refresh-b4cbf0e/extension/matrix-popup_minimum_2x_dark_bilingual.png) |

### `refresh-b4cbf0e/site` (6)

| Home page | Home page at 320 pixels, DPR 2 | Documentation library |
|---|---|---|
| ![Home page](images/captures/refresh-b4cbf0e/site/home-1280x900-light-en.png) | ![Home page at 320 pixels, DPR 2](images/captures/refresh-b4cbf0e/site/home-320x800-dpr2-light-en.png) | ![Documentation library](images/captures/refresh-b4cbf0e/site/library-1280x900-light-en.png) |

| Wiki | Capture gallery | Browser extension local models article at 360 pixels |
|---|---|---|
| ![Wiki](images/captures/refresh-b4cbf0e/site/wiki-1280x900-light-en.png) | ![Capture gallery](images/captures/refresh-b4cbf0e/site/gallery-1280x900-light-en.png) | ![Browser extension local models article at 360 pixels](images/captures/refresh-b4cbf0e/site/article-local-models-360x800-light-en.png) |

### `reproof-1.779.1/desktop` (16)

| Setup guide, Look and language step with the choice search icon beside each select | Setup guide, Look and language step in English and Cantonese | Setup guide, Requirements step with Back, Skip this step, Next and Skip setup |
|---|---|---|
| ![Setup guide, Look and language step with the choice search icon beside each select](images/captures/reproof-1.779.1/desktop/setup-guide-look-light-en.png) | ![Setup guide, Look and language step in English and Cantonese](images/captures/reproof-1.779.1/desktop/setup-guide-look-light-bilingual.png) | ![Setup guide, Requirements step with Back, Skip this step, Next and Skip setup](images/captures/reproof-1.779.1/desktop/setup-guide-requirements-light-en.png) |

| Setup guide, Finish step with the saved summary, dark | Drive, two files selected for a bulk action, dark | Confirm destructive action for deleting two selected files, dark |
|---|---|---|
| ![Setup guide, Finish step with the saved summary, dark](images/captures/reproof-1.779.1/desktop/setup-guide-finish-dark-en.png) | ![Drive, two files selected for a bulk action, dark](images/captures/reproof-1.779.1/desktop/drive-bulk-selection-dark-en.png) | ![Confirm destructive action for deleting two selected files, dark](images/captures/reproof-1.779.1/desktop/confirm-bulk-delete-dark-en.png) |

| Confirm destructive action for Force Lock, dark | Personal wording applied from a dropped file, with the full-window announcement and a saved notice, dark | Invalid personal wording file refused with a transient notice and no banner |
|---|---|---|
| ![Confirm destructive action for Force Lock, dark](images/captures/reproof-1.779.1/desktop/confirm-force-lock-dark-en.png) | ![Personal wording applied from a dropped file, with the full-window announcement and a saved notice, dark](images/captures/reproof-1.779.1/desktop/wording-applied-celebration-dark-en.png) | ![Invalid personal wording file refused with a transient notice and no banner](images/captures/reproof-1.779.1/desktop/invalid-wording-notice-light-en.png) |

| Lock an element dialog with the Create lock button visible at the default window size | Settings, Appearance and language, dark, with compact information icons | Drive, unlocked, top of the page |
|---|---|---|
| ![Lock an element dialog with the Create lock button visible at the default window size](images/captures/reproof-1.779.1/desktop/lock-element-dialog-light-en.png) | ![Settings, Appearance and language, dark, with compact information icons](images/captures/reproof-1.779.1/desktop/settings-appearance-dark-en.png) | ![Drive, unlocked, top of the page](images/captures/reproof-1.779.1/desktop/drive-toolbar-light-en.png) |

| Drive, file list, dark | Force Lock confirmation, dark | Settings |
|---|---|---|
| ![Drive, file list, dark](images/captures/reproof-1.779.1/desktop/drive-toolbar-dark-en.png) | ![Force Lock confirmation, dark](images/captures/reproof-1.779.1/desktop/confirm-force-lock-dark-en.png) | ![Settings](images/captures/reproof-1.779.1/desktop/settings-light-en.png) |

| Local access, Element locks |
|---|
| ![Local access, Element locks](images/captures/reproof-1.779.1/desktop/element-lock-created-light-en.png) |

### `reproof-1.782.1/desktop` (12)

| Drive, locked, with an information icon beside Create a drive and Unlock existing drive | Drive, locked, bilingual | Drive, file list with a compact information icon beside each file action |
|---|---|---|
| ![Drive, locked, with an information icon beside Create a drive and Unlock existing drive](images/captures/reproof-1.782.1/desktop/drive-locked-light-en.png) | ![Drive, locked, bilingual](images/captures/reproof-1.782.1/desktop/drive-locked-light-bilingual.png) | ![Drive, file list with a compact information icon beside each file action](images/captures/reproof-1.782.1/desktop/drive-files-light-en.png) |

| Drive, one file selected, with Open, Export copy, Keep offline and Delete enabled | Drive, file list, bilingual, Availability text wrapping beside its icon | Drive, file list, dark, bilingual |
|---|---|---|
| ![Drive, one file selected, with Open, Export copy, Keep offline and Delete enabled](images/captures/reproof-1.782.1/desktop/drive-file-selected-light-en.png) | ![Drive, file list, bilingual, Availability text wrapping beside its icon](images/captures/reproof-1.782.1/desktop/drive-files-light-bilingual.png) | ![Drive, file list, dark, bilingual](images/captures/reproof-1.782.1/desktop/drive-files-dark-bilingual.png) |

| Drive, locked | Drive, locked, bilingual | Drive, file list |
|---|---|---|
| ![Drive, locked](images/captures/reproof-1.782.1/desktop/drive-locked-light-en.png) | ![Drive, locked, bilingual](images/captures/reproof-1.782.1/desktop/drive-locked-light-bilingual.png) | ![Drive, file list](images/captures/reproof-1.782.1/desktop/drive-files-light-en.png) |

| Drive, one file selected | Drive, file list, bilingual, Availability text wrapping beside its icon | Drive, file list, dark, bilingual |
|---|---|---|
| ![Drive, one file selected](images/captures/reproof-1.782.1/desktop/drive-file-selected-light-en.png) | ![Drive, file list, bilingual, Availability text wrapping beside its icon](images/captures/reproof-1.782.1/desktop/drive-files-light-bilingual.png) | ![Drive, file list, dark, bilingual](images/captures/reproof-1.782.1/desktop/drive-files-dark-bilingual.png) |

