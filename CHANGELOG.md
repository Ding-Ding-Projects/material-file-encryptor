# Release package re-proof fixes, 2026-10-16

- The Lock an element panel (and the unlock panel) now enters the browser top layer, so the reveal animation transform and the scrolling content region of the Local access view can no longer crop it at the default window size. Cancel and Create lock sit in a sticky action row and the panel body scrolls inside its own bounds.
- The local mutation journal trusts exactly its own directory through command-line configuration, allows a cold Git start 60 seconds, and tags failures with their stage and reason. The credential rollback keeps the underlying cause instead of replacing it with a generic message. The original failure behind the profile setup message on the release package was not reproduced on a source-run profile and is still unconfirmed.
- A refused personal wording file is reported as a transient status message and notification centre entry instead of a persistent banner. The banner also clears on every view change and after a successful apply or reset, and the extension options page clears its refusal text after the notice expires.
- Information icons are compact: an 18 pixel glyph in a 28 pixel control in the on-surface-variant colour, with an invisible 44 by 44 pixel hit area and an 8 pixel gap to their control. Explanations, keyboard access and localization are unchanged.
- The setup guide look step names the chosen language or appearance instead of its stored value.

呢批修正：Lock an element 面板搬上瀏覽器頂層，唔會再被截走，Create lock 掣固定喺底部；本機變更日誌嘅 Git 只信自己個資料夾，失敗會講明步驟同原因；無效用詞檔案改做短暫通知，轉畫面就清走；資訊圖示縮細、淡色，但點擊範圍維持 44 像素；設定指南嘅外觀步驟會講出所揀嘅名，唔再顯示內部值。

# Inventory: wording drop and private delivery, 2026-10-16

- The required-feature inventory now tracks two more identifiers (109 families per surface, 327 rows): dropping a personal wording file anywhere on a window to apply it, and packaged offline delivery of the documentation site for private repositories.
- Wording drop applies to the desktop app and the browser extension and is recorded as unverified and partial: a built-app drop, refusal of an invalid drop, reduced motion, screen reader announcement and restart persistence are not yet proven on an installed build. The documentation site row is not applicable under a new applications-only rule.
- Packaged private delivery does not apply because this repository is public and its documentation site is hosted. All three rows are not applicable, with the reason recorded.

把兩個要求登記入必備功能清單（每個介面 109 項，共 327 行）：喺視窗任何位置放低個人用語檔即時套用，同埋私人倉庫將文件網站打包成離線程式。放低檔案套用適用於桌面程式同瀏覽器擴充功能，如實記錄為「未驗證、部分完成」，網站按新嘅「只限應用程式」規則記為不適用；私人打包派發因為本倉庫係公開，三個介面都記為不適用並寫明原因。

# Information icons and setup guide, 2026-10-16

- Every capable control in the desktop shell markup, on the website home page and preferences dialog, and in the browser extension popup and workspace now has its own compact information icon immediately before it. It opens a control-specific explanation, guided steps and an isolated sample, and never starts the real operation or reads a live value.
- The desktop app gained a first-run setup guide: language and appearance, a read-only WinFsp and server runtime check, naming a drive and opening the existing create or unlock dialog, and showing the browser pairing code. It saves progress, can be skipped, works from the keyboard and reopens from Help or the command palette.
- The required-feature inventory now tracks the information icons and the setup wizard (107 families per surface). The wizard is recorded as not applicable on the website and the extension.
- Not covered yet: controls that feature modules create after start-up, and any built-app capture of the new surfaces.

每個有功能嘅控制項前面而家都有自己嘅資訊圖示，會開專屬說明、逐步指引同獨立樣本，唔會真係執行操作。桌面程式新增首次使用設定指南，可以略過、儲存進度同用鍵盤操作。啟動後先建立嘅控制項同已建置程式嘅畫面證據仍然未做。

# Installed pairing fixes, 2026-10-15

- The Squirrel hooks now run from the first import of the main module, bound each registry call, and exit under a watchdog, so an update no longer leaves the native host manifest naming the removed version. Every normal start repairs a stale manifest.
- The browser extension keeps "Pairing expired" across worker restarts, learns about a lock or exit within a few seconds, serializes desktop requests so the first Refresh after an idle worker succeeds, and no longer promises a recovery the desktop will not honor.
- The New tab popover filter field keeps room for its bilingual label. The New tab popover captures are replaced by captures of the installed v1.683.1 release.

更新之後原生主機登記會即時刷新，配對過期狀態喺背景程序重啟之後都保留，鎖定同離開幾秒內就會顯示，閒置後第一次重新整理亦唔會失敗。

# Website navigation and reading, 2026-10-15

- Grouped secondary destinations under Explore and existing toolbar/tab controls under Page tools, preserving every capability and shortcut.
- Added a direct documentation action while retaining source access; improved responsive navigation and article reading rhythm.
- Fixed repeated section links and English/Cantonese settings search, including missing translated labels.
- Preserved a compact-grid correction awaiting rebuilt verification. Palette focus restoration and the remaining layout checks are explicitly unfinished in HANDOFF.md.

網站導覽同工具整理成清楚分組，功能同快捷鍵全部保留；文件更易搵，文章更易讀。窄畫面修正已保存但未重新驗證，指令面板關閉後嘅焦點修復仍待完成。

# Material layout, motion and extension workspace, 2026-10-14

- Fixed layout defects found in captures: legend inside its card, full-width table headers, full-width workflow fields, buttons at their own width and help buttons beside the control they explain.
- Completed the Material colour roles from the theme, so focus rings and dialogs no longer fall back to the baseline purple scheme.
- The navigation rail, table rows and help panels now animate between states; reduced motion turns this off.
- Application dialogs follow the interface language in English, Cantonese and bilingual modes.
- The browser extension workspace gained Material tabs, an offline changelog, build source details and a Ctrl+K command palette, then validated exports, setting explanations, a deliberate reset confirmation and tab shortcuts, then a local product name, a contrast-checked accent colour, recent changes with restore and collapsible filters, then its own icon, a local logo, attention modes and a documentation link, then local notes with a guided side-sheet form and bulk export and delete, then scheduled theme and language changes, personal wording and a bundled font, then the complete documentation readable offline, then narration, local support tickets and reviewed screen recording, then safe links in notes and a plain price statement, then the public dim sum catalogue loaded from GitHub on request.

版面、色彩同動態再執一輪：說明掣企返控制項隔籬，焦點框唔再變紫，對話框識講廣東話；瀏覽器擴充功能多咗離線更新記錄、組建來源同 Ctrl+K 指令面板。

# Material conversion sweep, 2026-10-14

- Converted generic controls found in hidden-desktop captures to Material components: tabs, in-field clear buttons, labelled selects, linear progress, disclosure buttons, chevron icon buttons, a navigation-style documentation index and a disabled list for unavailable server targets.
- Message boxes now render as Material dialogs in main-owned windows. Only the dialog window, with its one-time value and a valid button, can answer; closing it cancels; the native message box remains the fallback.
- Added Material easing and duration tokens with entrance motion for views, tab panels, cards, rows and disclosures. Reduced-motion settings turn it off.
- Update reasons are explained in English and Cantonese, and read-only requests no longer hold the application open at exit.
- The shutdown prompt names the unfinished work it waits for, and workflow reads no longer count as unfinished work, so an idle application closes without asking.

介面入面嘅舊式控制項同系統彈窗，換晒做 Material 元件同對話框，並加入順滑動畫。暗色主題、廣東話、雙語同縮放擷取仍待完成。

# Context action targeting and startup readiness, 2026-10-11

- Preserve each context action provider’s resolved target while retaining the original menu anchor, focus and admission checks.
- Paint the explicit initial PIN fields while Material select initializes; disable creation until the current policy is valid and revalidate on submission.
- Correct four platform fixtures without weakening authentication or operation checks.
- Retain the successful 375373a production package separately from these newer source repairs and the incomplete visual/combined verification.

右鍵操作各自保留正確目標，選單遲到亦唔會借錯地方開門。鎖定選项未準備好前唔准建立，提交時再核對。新源碼仍待重新建置及實機驗證。

# Source integration, 2026-10-11

- Admit automatic update candidates through immutable main ancestry before staging or cached-ready restoration. Create normal branch downloads without default promotion, then serialize verified main promotion separately from builds.
- Wire typed image fit, crop, focal points and transforms through current-layer locks and the original persistence, rollback/retry and Undo consumers. Preserve historical rendering defaults until explicit fit selection.
- Add explicit versioned transition-property endpoints, ordered portable rows and a shared preview resolver. Per-property timing, full timelines and rendered interpolation remain unfinished.
- Require pure Material Design 3 on every visible surface. Source/component evidence does not claim current pixels, installed lifecycle or full feature completion.

更新候選版本先核對主線祖先，分支下載和主線預設發布分開處理。圖片控制沿用原有鎖定、儲存及歷史；轉場屬性保留獨立端點和可攜資料。全部可見介面仍須符合完整 Material Design 3，真實畫面及安裝驗收未完成便不冒認過關。

# Typed keyframe inspector and current-layer locks, 2026-10-11

- Added registered Material keyframe controls with explicit time modes, typed numeric units, strict selected-frame movement and19 optional guidance concepts.
- Corrected layer Lock after a rejected motion save: actions now resolve the current row, so history cannot record an ornamental lock on a detached layer.
- 65 focused motion/translation/color/typography checks pass. Real rendering, full motion authoring and installed acceptance remain pending.
- 新增清楚時間模式及數值單位嘅關鍵影格編輯。儲存失敗後鎖定會搵返目前圖層，唔再鎖住舊影子。65項 focused checks通過，真正畫面、完整動畫編輯及安裝驗收仍未完成。

# Color editor and registered server preparation source, 2026-10-11

- Added Material color controls, bidirectional color representations, explicit gamut checks, atomic palette/history changes and optional guidance.
- Added official Java server preparation with bounded host-owned metadata/downloads, cancellation and read-only license review. Corrected retained search and concurrent resolution admission. Server execution remains unavailable.
- 新增色彩編輯同完整色值表示方式；色彩及最近清單一齊保存，失敗會一齊回復。新增官方版本探索同受限準備流程，修正重新顯示時搜尋失效及並行請求超額。未完成真正畫面及安裝驗收，伺服器執行仍不可用。

# Typed typography and workbench guidance, 2026-10-11

Integrated in source `7271108f98e12be41281c0e8e0d5c40a88cd29b3`, delivered as normal `v1.205.1`. Exact-root production passed [run 38131720855](https://github.com/Ding-Ding-Projects/material-file-encryptor/actions/runs/38131720855). Independent downloaded-package and live-content checks are separate from the source checks below; none proves installed execution or rendered interface acceptance.

- Added typed typography and font controls using registered Material components, existing validation, lock, mutation, history and storage routes, plus optional guidance above the original controls.
- Corrected font-size stepping to start from the effective inherited value. Exposed typography and font rows to the actual scoped enhanced search rather than leaving them outside its consumer.
- Added optional drawing, guide and state-preview workbench guidance. After rejected storage replaces the model, retained selection and guide callbacks resolve the current owned layer, so retry updates the live layer instead of a detached object. Rejected writes retain the draft; original actions remain the sole execution route.
- Verified 60 focused source/component checks covering inherited stepping, enhanced search, font admission, draft clearing, guidance and rollback/retry. Complete English/Cantonese articles and category links are registered for [typography](docs/features/interface/typography-inspector.md) and [workbench guidance](docs/features/interface/workbench-guidance.md).
- Pure Material Design 3 rendered conformance, assistive technology, actual font identity, installed startup/update/restart and full editor/server behavior remain pending. All 105 feature IDs and 210 complete-surface rows remain unverified. Historical captures remain historical; no replacement current capture is claimed.

已整合至原始碼 `7271108f98e12be41281c0e8e0d5c40a88cd29b3`，並以正式版本 `v1.205.1` 交付。根目錄建置同封裝通過上述工作流程；下載套件同網站內容另有獨立驗證，唔代表安裝後執行或畫面已驗收。

- 字體同字型控制改用已註冊 Material 元件，沿用原本驗證、鎖定、修改、歷史同儲存路線，並提供控制項上方嘅可選指引。
- 修正字級加減由有效繼承值開始，並將字體同字型列接入真實範圍搜尋，唔再喺搜尋門外排隊。
- 加入繪圖、輔助線同狀態預覽指引。儲存被拒後模型換咗，重試會重新取得目前擁有嘅圖層，唔會繼續寫舊物件；草稿保留，原本操作仍然係唯一執行入口。
- 60 項聚焦原始碼／元件檢查通過，涵蓋繼承字級、搜尋、字型准入、清除草稿、指引同回復重試。兩組完整中英文章同分類連結已登記。
- 純 Material Design 3 畫面一致性、輔助技術、真實字型識別、安裝後啟動／更新／重新啟動同完整編輯器／伺服器功能仍待驗收。105 個功能 ID、210 個完整介面列全部仍未驗證；歷史截圖唔會扮目前畫面。

# Native sharing lease and cloud delivery continuation, 2026-10-11

Added an explicitly admitted native sharing lease and separately delivered verification DLL. Independent review corrected junction child lifetime, PowerShell receipt encoding and expected-source admission. The first admitted cloud DLL execution passed eight synthetic boundaries; trusted product IPC and a usable provider remain pending. Production uses exact root entrypoints on GitHub Actions. Main 10bfb081 normal v1.192.1 publication and live content are verified separately from complete v1.190.1 downloaded package acceptance. Wiki sections now use validated source names, preserving distinct anchors when page titles match. Current installed updating and full interface acceptance remain unfinished.

# Installation and update repair continuation

Replaced the blocked compiled archive adapter with supported .NET streaming recompression, verified the real Squirrel extractor against an incompressible nested archive, and added exact Setup embedded-package inspection. Updated the bilingual publication inventory. Current corrective installation, real updating and full-product acceptance remain pending.

The verifier now uses native ASAR paths and framework digests in child Windows PowerShell. A real archive fixture rejects mismatched version and source metadata and verifies fixed SHA-1/SHA-256 values without relying on the unavailable hash command. Retained-handle force-lock safety and missing history localization are integrated; their current packaged acceptance remains separate.

# Changelog

## Integrated feature workspace - 2026-10-11

Source integration is in progress. This entry does not identify a released build.

- Added format 3 encrypted blocks and an incremental journal, managed import/export operations, cancellation and selected-file activity interfaces.
- Added shared tabs, grouped navigation, scoped regex search, command palette and notification-center modules.
- Added local access, authenticator, support, language, narration, scheduling, attention, appearance and local-history modules with explicit capability limits.
- Added a bounded local conversion queue and operating-system sandbox contract; unsupported adapters remain unavailable.
- Added official local-model catalog/cache, installed inventory, pull cart, chat and profile integration contracts.
- Added bundled documentation/wiki navigation, safe Markdown, local raster images, changelog filtering and export, plus an official status-client adapter.
- Recorded 208 independent desktop/site feature-delivery rows as unverified rather than inferring full delivery from source modules.
- Added helper-only native status measurements with binary hashes and no current-source, throughput, mounted-drive or GUI claim.

Current packaged runtime, full localization/visual coverage, native mounted workflows, downloaded installation, live status authentication and documentation deployment remain subject to separate verification. Historical release and capture claims are retained under their original source records.
