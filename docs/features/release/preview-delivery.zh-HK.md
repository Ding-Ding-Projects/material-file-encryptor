<a id="preview-delivery"></a>

# 預覽版本交付

每次推送及手動 Windows 工作流程，都經 `build.bat /s` 建置，再經 `build-installer.bat /s` 封裝。呢啲正式指令唔跑測試或 lint。真正未簽署 Squirrel.Windows 輸出包含 Setup.exe、RELEASES、一個完整套件及任何產生的差異套件。

同一工作會發佈名為 `v1.<run_number>.<run_attempt>` 的正常、非草稿、非預發佈版本。發佈前檢查套件名稱、RELEASES SHA-1 及位元組數、Setup 未簽署狀態，以及受追蹤點心圖片。發佈用 GitHub CLI，拒絕已有標籤或版本，將標籤綁定來源提交，並下載每個附件比較 SHA-256。上載或驗證失敗會令工作失敗並保留安全證據；現有版本永不覆寫。

`release-output/build-provenance.json` 記錄來源、套件版本、執行身份、UTC 開始／完成時間、附件雜湊及大小。執行期驗證明確等候獨立本機收據。正式產出成功唔代表測試、GUI 行為、安裝程式執行、驅動掛載或更新器行為通過。已停用的手動提升工作流程永不發佈。

<a id="independent-local-verification"></a>

## 獨立本機驗證

建置後，執行 `powershell -NoProfile -File scripts/verify-local.ps1` 作原生、掛載檔案系統、單元及封裝桌面檢查。驅動安裝須明確選用 `-InstallDriver`，並要原生管理員同意。

安裝程式驗證分開進行。喺所需隱藏桌面，使用確切乾淨提交及全新目前使用者目的地，執行：

```powershell
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Mode Snapshot -Local -ExpectedCommit <40-character-source-commit>
powershell -NoProfile -File scripts/windows-installer-check.ps1 -Local -ExpectedCommit <40-character-source-commit>
```

驗證器唔改變 LOCALAPPDATA，亦唔假裝喺 CI 執行。佢要求相符封裝桌面收據、比較選定套件／已安裝位元組、拒絕已存在安裝根、應用程式程序及登記，並檢查兩個目前使用者登錄視圖。佢最多等三十秒 Squirrel 登記。安全診斷列明視圖、鍵及相符欄位，唔複製無關登記資料。只有確切雜湊驗證更新器，先可喺正常應用程式清理後解除安裝本次新安裝。現有憑證資料獨立保留。真實安裝及 UI 操作必須經支援的隱藏桌面路徑。

<a id="dependency-and-scope-notes"></a>

## 相依套件與範圍說明

安裝程式產出使用完整真正 Squirrel 供應目錄，並明確固定兩個工具：封存寫入器及 NuGet 7.9.0。啟動安裝從版本化官方 HTTPS URL 下載 NuGet，驗證 SHA-256 及確切 PE 檔案版本，重用相符快取並拒絕唔符資料。封裝複製佢至暫時供應目錄，原有 maker 執行前再核對摘要。呢個取代喺本機壓縮失敗兩次的內附 NuGet 2.8.3 程序，唔會改用其他安裝技術或放鬆最終套件完整性檢查。正式復原要求真實根入口通過，同集中選取／版本／摘要回歸分開。

啟動安裝提供固定 Node、.NET 及 WinFsp，另有完整已驗證可攜 MinGit 與 GitHub CLI。執行期 ZIP 按固定 SHA-256 核對，每個解壓檔案都同封存比較，並用絕對路徑檢查執行檔版本。重用有效快取；替換時保留先前快取。唔需要管理員權限或已安裝系統 Git，亦唔需要簽署憑證或付費證書。應用程式封裝前，`build.bat` 將完整工具樹及附帶聲明暫存至 `out/tools/git` 同 `out/tools/gh`。啟動安裝匯出絕對 `MFE_GIT_EXECUTABLE` 及 `MFE_GH_EXECUTABLE` 路徑供本機原生驗證。封裝資源解析及傳輸行為仍由負責實作獨立驗證。`scripts/bootstrap.ps1 -RuntimeToolsOnly` 只啟用及驗證呢兩個可攜工具，唔建置應用程式。
