# Installed icon repair continuation

Objective: repair installed product icons, update the installed copy, verify remote main and release delivery, then perform the requested preservation/integration and archive-backed cleanup.

Baseline main was 2caa5e404f0df75139e4476fa37097e80ba0172c. Implementation commits a15eac0a7dffc3e32763153b2ad2670999b8355e, a9d706f3212a9238f98f00d866346ae5d131d059 and 8846e1942143e160040cf17cb06b710bf88fe3ae are preserved on origin/codex/installed-logo-repair and fast-forwarded into local main. They cover reproducible icon assets, runtime/packaging wiring and final Squirrel Setup/updater preservation.

Focused checks: 23 implementation tests, 12 independent runtime-review tests, six reassembly tests. These overlap and are not an aggregate unique-test count. Root build, installer production, downloaded package validation and installed appearance remain pending.

The existing installed application independently changed from 1.607.1 to 1.810.1 during preparation and is running. Do not overwrite it until the current state and active work are accounted for. No installer has been run by this task yet.

Next: run exact build.bat /s and build-installer.bat /s against the recorded candidate, inspect final native icon resources, verify the normal release and update the installed copy safely. Retain genuine evidence and distinguish fresh-install and rendered shell-tray gaps. Track issue #14 and Discussion #15.

Cleanup inventory: four pre-existing linked checkouts are clean and their tips are ancestors of baseline main. Of 87 initial remote heads, 85 non-main heads are ancestors, and fix/renderer-runtime-identity-20261014 at cc874090956d4ffc16f81389bc07511bf136be61 is divergent and retained. Archive all working trees and Git administrative state before deleting only inactive, authorized, fully preserved and ancestor-proven candidates. Keep unrelated unfinished acceptance work out of this icon task.
