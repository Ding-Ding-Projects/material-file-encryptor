# Version 2 frame and pages

The desktop app works like a dense desktop tool instead of a website. This article describes the frame, the pages
that changed and the decisions behind them.

## Frame

- **Title bar.** The app mark, a drive switcher (the open drive's letter and name; its menu lists every drive and
  Add a drive), the drive tabs, the tabs the person opened from the New tab catalog, the **+** New tab catalog, a
  search field for every drive and command with a `.*` regular-expression toggle inside it, the **?** help-mode
  button, notifications and the window controls.
- **Left tree.** Home; Drives with each drive and the open drive's folders under it, and **+** to add a drive;
  Available offline (with its count), History and Recycle Bin; Docker Hub backup, Shared files (when that feature is
  present), Local tools, Settings and Help. Settings and Help list their own pages (Personalization, Local access,
  Updates, Documentation, What is new) as child rows. Right-click or Shift+F10 on Settings or Help opens the grouped
  menu that also offers Quit.
- **Pages.** Each page has one toolbar with at most one filled primary, a table with column headers, and, where it
  helps, a details pane.
- **Status bar.** One thin line: mount state, counts, sync state, encryption and language.

## Decision: page tabs fold into the tree

Pages no longer open as tabs by themselves. Every page is one click away in the left tree, so the title bar keeps
tabs only for drives and for what the person opened as a tab. The New tab catalog still opens any page, tool or
setting as a tab, and its **Open every tab** command still opens every page as a tab. The pages remain open and
reachable in the background (the earlier open-by-default rule still applies to the page list itself); only the tab
strip shows less. Closing a tab removes it from the strip; the page stays one click away in the tree.

## Decision: help without information icons

The (i) icons that sat before every control are gone from the desktop layout. The same help text is shown:

- as a tooltip when the pointer rests on the control or keyboard focus reaches it;
- as the control's accessible description, so screen readers read it with the control;
- inline under every control while help mode is on (the **?** button; the choice is remembered on this PC).

The full explanation and the guided steps stay in the command palette as Explain and Guide commands. The website and
the browser extension still use the icons. See [Information icons](../../docs/features/interface/info-icon-guidance.md).

## Pages

| Page | What changed |
| --- | --- |
| Drive list (drive locked) | Every drive stays visible as a table row. The locked drive gets an inline unlock bar under its row: password or key file, unlock automatically, and one Unlock primary. **New ▾** offers New drive on this PC, New Docker Hub drive and Open drive from Docker Hub. |
| Home | A status dashboard: drives with one action each, recent activity, what needs attention with a Fix button, status and quick start. With no drive yet it offers the three ways to start. |
| Local tools | A dense list grouped by category or by name, with what each tool does and a details pane with Open and Open in new tab. |
| Settings | A category list with the settings search, and one category of dense label and control rows at a time. Backup and Updates are new categories. |
| Docker Hub backup | A toolbar with Back up all now, Restore, Refresh and Backup settings, and the drives grouped by repository with a row menu. The full storage panels stay below. |
| New Docker Hub drive | Sign in when needed, then one details screen with `<account>/material-file-encryptor-storage` preselected and Change repository. No step sidebar on this path. |
| Repository chooser | Each repository is listed once; the help is a caption; a **New repository** row creates a public repository with the drive. |
| Context menus | Actions on the thing clicked come first; panel layout and appearance tools fold into **Customize**. |

## What is not built yet

These appear in the design boards but need backend work, so they are shown disabled with "Coming in a later update" or
are not shown at all; nothing pretends to work:

- automatic backup after changes, backup on lock, background backup while the app is closed;
- per-drive snapshot retention, pruning, the tag count meter and moving a drive to its own repository;
- size, snapshot count and "last opened" figures per drive in the drive list;
- private repositories in the New repository row (the backend refuses private repositories today);
- the filter field and regex button inside context menus are unchanged (the boards remove them).

## Verification

- `node --test test/v2-frame.test.js test/info-icon-guidance.test.js test/docker-hub-drive-dialog.test.js test/docker-hub-repository-picker.test.js`
- Captures of the built app are listed in the README; see that section for the build they come from.
