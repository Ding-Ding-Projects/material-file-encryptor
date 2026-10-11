<a id="package-integrity-and-local-installer-verification"></a>

# 套件完整性與本機安裝程式驗證

<a id="private-packaging-boundaries"></a>

## 私人封裝邊界

Forge 會喺任何深度排除完整、不分大小寫的 `.agent` 目錄區段；例如 `.agent-helper` 呢類相似名稱仍可納入。即使來源目錄包含被 Git 忽略的檔案，呢項措施仍會保護本機工作資料，因為 Git 忽略規則唔等於封裝工具的輸入政策。

Forge 的 `postPackage` hook 同正式建置都要求 `scripts/package-privacy.mjs` 接納產出的應用程式目錄，之後先可以封裝安裝程式。檢查器遍歷外部資源及真實 `resources/app.asar` 項目清單，拒絕 `.agent` 項目與連結，並讀取每個封存檔案以拒絕遺失或截斷資料。輸出遺失、空白或無法讀取，一律拒絕。檢查前會清除封存快取，替換封存檔後唔可以重用舊判斷。

診斷只包含中性結果代碼、項目／拒絕數量，以及獲接納封存檔的 SHA-256。唔會列印被拒絕項目名稱、檔案內容、封存中繼資料或底層例外訊息。呢個係目錄邊界保護，唔係通用秘密偵測器；機密資料仍須放喺獲批准封裝輸入以外。

執行 `node --test test/package-privacy.test.js` 作集中回歸測試。無害合成檔案會示範移除排除規則、拒絕含私人目錄的真實 ASAR、修復後接納、外部資源拒絕、損壞封存拒絕，以及正式 hook 傳遞失敗。測試唔用私人來源資料。正式輸出及安裝程式驗證仍係各自必需的證據。

`build-installer.bat /s` 會從上游版本取得官方 7-Zip 26.04，按 `dependencies.json` 驗證封存檔、解壓輔助工具及 x64 獨立執行檔，再暫存現有 Squirrel.Windows 供應版本。支援的 `vendorDirectory` 選項會選用呢個版本，並以已驗證的獨立寫入工具取代舊 ZIP 寫入器。Squirrel 更新器及安裝元件維持原樣，亦維持未簽署。

產出後，`scripts/package-integrity.ps1` 用固定版本讀取器對每個完整及差異 `.nupkg` 執行封存測試，驗證每個項目的解壓及儲存 CRC，包括執行期比較清單以外的項目。失敗會阻止封裝成功及預覽發佈。收據記錄讀取器摘要、來源提交、每個套件的摘要、大小、項目數及退出結果。選定執行期雜湊及 `RELEASES` 雜湊仍係分開檢查。

執行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-package-integrity.ps1` 作集中回歸測試。有效封存須通過；即使損壞項目冇被選中，都必須失敗。測試只移除自己確切的合成檔案。

本機安裝程式驗證要求 `MFE_LOWLEVEL_CLI` 指向已安裝的低成本隱藏桌面工具及生命週期輔助工具。`windows-installer-check.ps1 -Local -ExpectedCommit <full-sha>` 用 `local-installer-process.py` 執行 Setup 同 Update。經 Lowlevel 啟動的 Python worker 繼承獨有隱藏桌面、保留子程序控制代碼，並記錄建立時間及退出結果。父程序記錄程序身份、等候程序不存在，再只關閉已清空而由本次工作擁有的桌面。逾時會保留證據及運作中的程序，唔會終止安裝。

已安裝桌面檢查採用 `local-headless-desktop-check.mjs`，以及同本機封裝驗證一樣經獨立審閱的擷取及掛載執行期流程。仍須互動像素審閱。安裝、啟動登記、掛載操作、正常退出及解除安裝各須自己的成功收據；封裝成功唔證明其中任何結果。解除安裝會記錄安裝根目錄每個殘留項目，包括 Squirrel 標記或記錄，唔會聲稱目錄已消失。

<a id="failed-desktop-run-recovery"></a>

### 失敗桌面執行的復原

本機桌面執行失敗後，先重新驗證儲存的隔離視窗及完整程序祖先關係，再對確切 CDP 目標嘗試現有 `window.drive.verificationQuit()` 路徑。啟動狀態還原及已記錄程序不存在都必須確認。即使復原成功，原有執行失敗仍保留喺收據。

程序證明使用完整 UTC 建立時間、執行檔路徑及相連父程序身份。只有 `PROCESS_NOT_FOUND` 證明不存在；查詢失敗、身份變更、無效祖先關係及 `IDENTITY_BOUND_TERMINATION_UNAVAILABLE` 都會保留所屬程序並令復原失敗。冇只按 PID 終止的後備方法。較早失敗收據保持原樣，唔能夠提供新的有效身份證明。每個直接配接器入口喺失敗時都回傳經清理 JSON，保留確切生命週期代碼，但唔含 traceback 或私人路徑。無法證明祖先關係時，退出及清理復原都會停止。

離線回歸檢查係 `node --test test/ui-lifecycle-recovery.test.js test/ui-headless-route.test.js`、`python -B test/test_local_headless_lifecycle_policy.py` 同 `python -B test/test_local_headless_adapter_errors.py`。佢哋唔啟動或終止應用程式，測試復原次序、確切目標綁定、過期祖先關係、PID 重用及查詢失敗。

<a id="verified-updater-only-uninstall-residue"></a>

### 已驗證、只剩更新器的解除安裝殘留

固定的 Squirrel 更新器 `2.0.1+eef37460ae` 移除產品後，可能留下仍運作的根目錄 `Update.exe` 及封裝的受控 `app-<version>/squirrel.exe`。上游[完整解除安裝路徑](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/UpdateManager.ApplyReleases.cs)寫入只含一個空格的 `.dead` 標記；[盡力刪除](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/Utility.cs)會吞掉移除例外。[受控執行檔偵測器](https://github.com/Squirrel/Squirrel.Windows/blob/eef37460ae/src/Squirrel/SquirrelAwareExecutableDetector.cs)冇釋放 Cecil 組件物件。短暫偵測器控制代碼係有來源支持的解釋，唔係原有執行時直接量度到的鎖。

`squirrel-uninstall-residue.ps1` 接納不存在或空白根目錄、確切單空格標記，或可選根目錄 `Update.exe` 加上只含 `squirrel.exe` 的確切預期版本目錄。兩個輔助執行檔都必須符合解除安裝前可信更新器摘要，而輔助檔殘留必須伴隨標記。任何其他檔案、目錄、巢狀內容、版本、標記位元組、輔助檔摘要或重解析路徑都會失敗。唔會刪除輔助檔。生命週期仍要求更新器退出零、登記及啟動項不存在，以及冇已安裝程序。輔助目錄仍存在時，`applicationDirectoriesRemoved` 保持 false；`applicationPayloadRemoved` 記錄確切分類判斷，而 `installRetained` 描述產品內容保留狀態。

執行 `scripts/test-squirrel-uninstall-residue.ps1` 測試有效及刻意無效的合成案例。`diagnose-uninstall-residue.ps1` 另以唯讀方式重新分類保留殘留，將報告綁定原有失敗生命週期／程序收據及套件雜湊，記錄原有來源及目前檢查器版本，並驗證實際登記／啟動項／程序不存在。佢拒絕覆寫輸出。呢個診斷唔會重跑安裝或改寫原有失敗收據，亦唔係全新完整生命週期執行的證據。

預覽說明連結已驗證的公開點心目錄版本圖片。產品版本唔會附上複製的目錄圖片。發佈會喺寫入版本計劃前重新檢查套件完整性。現有來源擁有的圖片會保留，直到另獲授權遷移。

<a id="automatic-release-publication"></a>

## 自動版本發佈

每次獲授權的分支推送及手動派送都會建置、封裝並發佈一個獨有、正常而非草稿版本。冇 pull-request 觸發、只限 main 工作限制，亦冇只限手動派送的發佈條件。CI 唔執行測試、lint 或執行期檢查，所以本機品質驗證完成前，安裝程式可能已經發佈。說明會將執行期驗證列為待完成。

手動派送可選擇限制檢出至確切來源 SHA：

```powershell
gh workflow run windows.yml --repo Ding-Ding-Projects/material-file-encryptor --ref main -f source_commit=<expected-full-sha>
```

省略 `source_commit` 即發佈選定 ref，唔加額外限制。檢出及事件 SHA 仍須一致。提供的 SHA 唔符會以 `PUBLICATION_SOURCE_CHANGED` 失敗。

固定的 Windows runner 執行 `build.bat /s` 同 `build-installer.bat /s`，取得缺少工具，並發佈未簽署 Squirrel setup、完整套件、RELEASES 及建置來源證明。交付標籤用 `v1.<run_number>.<run_attempt>`，係單調遞增數字序列，同記錄的應用程式／套件版本分開；現有標籤及版本永不覆寫。已發佈附件會下載並比較雜湊。說明連結工作流程，記錄 UTC 首個工作開始、發佈完成及所需時間。建置或發佈失敗後，安全輸出仍會保留。
