# 加密 Explorer 磁碟

Windows 輔助程式透過真實 [WinFsp](https://github.com/winfsp/winfsp) 檔案系統驅動，將已驗證保管庫公開成磁碟。Explorer 同普通應用程式可以讀寫。加密儲存資料夾係同步目的地，唔係明文工作區。

掛載前安裝官方已簽署 WinFsp 2.1 驅動。應用程式會報告驅動缺失或不可用，並保持保管庫未掛載。未修改官方 .NET binding 固定喺 `native/vendor/WinFsp`，來源、校驗值同 GPLv3 授權隨附原始碼。框架相依建置執行輔助程式需要 .NET 8；Windows 套件可以包含執行環境。

WinFsp - Windows File System Proxy, Copyright (C) Bill Zissimopoulos.
https://github.com/winfsp/winfsp

## 資料處理

- 使用者讀取、編輯同匯入期間，明文存在於應用程式同輔助程式記憶體。輔助程式唔會喺儲存資料夾、快取資料夾或者另外工作區建立解密檔案。
- 快取包含經驗證加密內容、中繼資料同持久加密日誌，必須同同步儲存分開而且唔重疊。
- 成功檔案系統寫入，會先持久保存加密內容同加密日誌，再確認寫入。Flush、大小變更、重新命名同刪除亦會保存日誌。解鎖期間每 15 秒背景同步一次。
- 匯入直接將使用者選定原檔串流送入加密引擎。原檔留喺原位置。名稱衝突會用編號名稱匯入，絕不覆寫現有保管庫檔案。
- 密碼同金鑰檔位元組只用嚟解鎖。使用後清除憑證位元組緩衝區同主金鑰匯出。經繼承管道收到嘅 .NET 密碼字串仍然受垃圾回收管理；唔聲稱能可靠抹除受管理字串。
- 選用保存解鎖，會將 32-byte 主金鑰存於目前使用者 Windows DPAPI，並綁定保管庫身分。受保護檔案喺 `%LOCALAPPDATA%\\MaterialFileEncryptor-Data\\Credentials`，有受保護擁有人／System ACL，同 Squirrel 安裝目錄分開。唔會保存密碼或金鑰檔路徑。忘記保存解鎖會刪除此受保護憑證。移除應用程式仍保留憑證資料；需要移除時，請先用 Forget saved unlock 再解除安裝。
- WinFsp 強制 Windows 核心分享模式同位元組範圍鎖。開啟控制代碼參照穩定項目身分；重新命名、取代同刪除，會保留現有控制代碼對應內容直到最後描述符關閉，包括保留嘅記憶體映射。使用 POSIX 語義嘅擴充 Windows 重新命名請求，容許共享刪除下開啟取代；舊 `MoveFileEx` 請求跟隨 Windows 開啟控制代碼限制，相關控制代碼關閉前可能回傳拒絕存取。

## 鎖定、強制鎖定同重新啟動

**鎖定**會正常卸載磁碟、提交加密日誌並清除金鑰。只要仍然有程式開住磁碟上嘅檔案或資料夾，鎖定就會拒絕，因為喺嗰個程式底下硬卸載，等於將磁碟抽走。拒絕時磁碟保持解鎖，並且講出可以安全辨認嘅持有者類型，唔會洩露任何檔案名稱或程式路徑：仍然讀寫緊資料、Windows 檔案總管（有視窗或預覽窗格顯示緊磁碟）、Windows 搜尋或者安全掃描，或者其他程式。每則訊息都會指向強制鎖定。`unmountBusy` 為 true 期間，狀態會喺 `unmountHolders` 帶住同樣嘅類型。唔會記錄或者寫入任何檔案名稱。

**強制鎖定**係磁碟持續忙碌時嘅出路。佢唔會因為有工作進行緊，或者有程式開住檔案就拒絕。佢按以下次序進行：

1. 阻止新指令、傳輸同同步開始。
2. 取消進行緊嘅傳輸同同步，並最多等 15 秒（`timeoutMs`，最多 60 秒）等佢哋停低。取消傳輸會丟棄未完成嘅暫存檔案，已經安裝嘅檔案則保留。唔可以取消嘅指令會等佢完成，唔會中斷。
3. 短暫等候加密鎖。狀態更新每秒亦會短暫用到呢個鎖，以前就係因為呢個一瞬間嘅持有，令強制鎖定喺冇人使用磁碟嘅時候都報告忙碌。
4. 釋放其他程式仍然持有嘅所有檔案同資料夾描述符，提交加密日誌，透過 WinFsp 卸載磁碟，並清除金鑰。原本開住檔案嘅程式會失去磁碟存取；佢哋已經寫入嘅內容，係喺到達日誌之後先被確認。

如果喺限期內仍然有嘢停唔低，結果會係 `busy` 加一個代碼（`operations-active`、`crypto-active` 或者 `filesystem-handles-active`），磁碟保持掛載。成功嘅結果會用 `releasedHandles` 報告佢關閉咗幾多個描述符。

### 磁碟掛載緊時重新啟動會點

- **Windows 關機、重新啟動或登出（正常）。**Windows 宣布工作階段即將結束時，桌面應用程式會撤銷瀏覽器存取，用短限期（等候約三秒，合共四秒）強制鎖定磁碟，所以關機永遠唔會被拖慢，然後移除中斷工作階段標記並結束。喺呢個之前，Windows 先詢問工作階段可唔可以結束嗰陣，應用程式只會提交日誌，因為其他程式仍然可以取消關機，而當時鎖定會將磁碟從使用者繼續做緊嘅工作入面抽走。
- **如果鎖定未能及時完成。**標記會保留。每個已確認嘅寫入都已經喺加密日誌入面，所以唔會有損失；下次啟動會以鎖定狀態開啟，報告偵測到中斷嘅工作階段，並喺你解鎖時重播日誌。
- **睡眠或休眠。**磁碟保持掛載，等恢復後可以繼續工作。機器暫停時應用程式會提交日誌，所以睡眠期間斷電，亦會由已提交嘅狀態重播。
- **斷電或當機。**乜都唔會執行。寫入要等加密框同日誌項目都持久之後先會被確認，所以下次解鎖時，日誌會重播每一個已確認嘅寫入，並忽略撕裂嘅最後一個框。未確認嘅寫入可能唔存在；寫到一半嘅內容絕對唔會被暴露。
- **桌面應用程式先關閉。**輔助程式見到管道關閉，會等 30 秒畀程式關閉檔案，然後強制鎖定，因為已經冇任何嘢可以再解鎖或者鎖定磁碟。

突然終止程序無法執行正常卸載；已確認寫入保留喺加密日誌，供下一次解鎖使用。

較早開發建置保存喺 `%LOCALAPPDATA%\\MaterialFileEncryptor\\Credentials` 嘅憑證會被忽略，絕不自動移轉。手動解鎖再啟用保存解鎖，就會使用獨立資料目錄。現有開發建置憑證檔保持不變；忘記目前憑證唔會從舊位置還原。

硬連結、替代資料串流、重新解析點，同逐檔 ACL 修改未實作。磁碟只授權所屬 Windows 使用者同 System。外部應用程式可以將明文存到自己選定位置；本輔助程式控制唔到佢哋嘅臨時檔案或備份。

## 本機 JSONL 協定

父程序用繼承 stdin 同 stdout 管道啟動 `MaterialFileEncryptor.Host.exe`，冇監聽網絡伺服器。每個請求係一行 JSON：

```json
{"id":1,"method":"status","params":{}}
```

回應係 `{ "id": 1, "result": ... }` 或 `{ "id": 1, "error": "..." }`。輔助程式亦發出 `{ "event": "status", "status": ... }`。Stdout 只有協定 JSON；stderr 只有通用關閉診斷，唔含憑證或檔案內容。ID 必須係最多 64 字元嘅純量字串或者數字。請求上限 1 MiB，深度 32。

| 方法 | 參數 |
| --- | --- |
| `status` | 無 |
| `create`, `unlock` | `storageDir`, `cacheDir`, `driveLetter`；`password` 同 `keyFilePath` 恰好一個；可選 `driveName`, `autoUnlock`, `partSizeBytes` |
| `autoUnlock` | `storageDir`, `cacheDir`, `driveLetter`；使用目前使用者保存嘅 DPAPI 金鑰 |
| `mount` | 可選 `driveLetter`, `driveName`；需要已解鎖保管庫同可用驅動 |
| `unmount` | 無；保留已解鎖引擎 |
| `lock` | 無；正常卸載、flush，同清除引擎金鑰；仍然有程式開住磁碟時，會講出持有者類型並拒絕 |
| `forceLock` | 可選 `timeoutMs`（0 至 60000，預設 15000）；取消傳輸同同步、釋放其他程式開住嘅檔案、flush、卸載，同清除引擎金鑰 |
| `flushJournal` | 無；喺唔鎖定嘅情況下提交加密日誌，機器暫停前使用 |
| `importFiles` | `paths`：使用者選定原檔路徑陣列 |
| `keepOffline`, `releaseOffline` | `path`：虛擬保管庫路徑 |
| `setPartSize` | `partSizeBytes`：新檔同之後編輯檔案嘅預設上限，最初 10 MiB |
| `resplit` | `path`, `partSizeBytes`：重寫該檔案加密分片 |
| `sync` | 無 |
| `setAutoUnlock` | `enabled`；啟用需要已解鎖保管庫 |
| `forgetSavedCredential` | 目前保管庫唔需要參數；未開啟保管庫時提供 `storageDir`, `cacheDir` |

Create 同 unlock 驗證保管庫；mount 係另一個請求。掛載後桌面經 Explorer 開啟 `driveLetter + "\\"`。

保管庫對話框亦提供磁碟名稱，即係檔案總管喺磁碟代號旁邊顯示嘅磁碟標籤。預設係 `Material Files`，去除前後空白後必須係 1 至 32 個字元（NTFS 同 WinFsp 磁碟標籤上限），而且唔可以包含控制字元或者 `\ / : * ? " < > |` 當中任何一個。欄位會即時驗證，名稱無效時會阻止提交。可選嘅 `driveName` 請求欄位會由主程序同原生控制器再檢查一次；欠缺時原生控制器會用 `Material Files`。最後使用嘅名稱同磁碟代號一齊存放喺本機偏好設定檔，下次開啟對話框會自動填返。名稱喺掛載時套用，所以已掛載嘅磁碟要鎖定再解鎖先可以改名。

狀態包含 `locked`、`mounted`、`unmountBusy`、`unmountHolders`、`driveLetter`、`driveName`、`storageDir`、`cacheDir`、`files`、`partSizeBytes`、`sync`、`driver`、`autoUnlock`、`availableDriveLetters` 同 `lastOfflineRelease`。成功離線釋放記錄虛擬 `path` 同實際 `bytesFreed`；零代表冇移除合適本機密文。針對性釋放會保留有修改、待處理、釘選、開啟同共享內容，刪除前驗證來源副本。每個檔案回報 `id`、虛擬 `path`、邏輯 `size`、`modified`、實際加密 `partCount`、其 `partSizeBytes` 同 `offline`。分片大小包括驗證記錄額外開銷，加密分片唔會超過上限。

## 驗證

建置輔助程式：

```powershell
dotnet build native/MaterialFileEncryptor.Host/MaterialFileEncryptor.Host.csproj -c Release
```

喺已安裝官方驅動嘅 Windows 執行真實檔案系統測試：

```powershell
dotnet run --project native/MaterialFileEncryptor.Host/MaterialFileEncryptor.Host.csproj -c Release -- --self-test
```

測試掛載空閒磁碟代號，用普通 .NET／Win32 檔案系統 I/O 測試建立／讀取、跨記錄邊界範圍寫入、flush、補零擴展、截短、分享模式衝突、忙碌卸載拒絕（包括原檔控制代碼已關閉但記憶體映射仍保留）、舊目的地仍開啟時取代、子項仍開啟時重新命名目錄、列舉、鎖定／重開、讀取者仍開啟時刪除、空目錄刪除，同目前使用者 DPAPI 解鎖。佢使用可丟棄加密儲存／快取測試資料夾，發出一個 JSON 結果。結束碼 0 表示全部通過，1 表示失敗，2 表示需要 Windows。

Linux 驗證涵蓋 JSONL 協定、驗證、匯入、分片數量、釘選、重新分片、離線解鎖、只有密文嘅快取／儲存掃描，同有序 EOF。Linux 建置或協定測試唔驗證掛載 Windows 磁碟。聲稱 Explorer 工作流程已驗證前，必須喺 Windows 執行真實驅動測試。
