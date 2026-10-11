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

忙碌卸載會清楚報錯，保持磁碟解鎖。關閉正在使用磁碟嘅應用程式同 Explorer 視窗，再重試。輔助程式唔會自動強制卸載。正常管道關閉期間會等活躍控制代碼關閉。突然終止程序無法執行正常卸載；已確認寫入保留喺加密日誌，供下一次解鎖使用。

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
| `create`, `unlock` | `storageDir`, `cacheDir`, `driveLetter`；`password` 同 `keyFilePath` 恰好一個；可選 `autoUnlock`, `partSizeBytes` |
| `autoUnlock` | `storageDir`, `cacheDir`, `driveLetter`；使用目前使用者保存嘅 DPAPI 金鑰 |
| `mount` | 可選 `driveLetter`；需要已解鎖保管庫同可用驅動 |
| `unmount` | 無；保留已解鎖引擎 |
| `lock` | 無；正常卸載、flush，同清除引擎金鑰 |
| `importFiles` | `paths`：使用者選定原檔路徑陣列 |
| `keepOffline`, `releaseOffline` | `path`：虛擬保管庫路徑 |
| `setPartSize` | `partSizeBytes`：新檔同之後編輯檔案嘅預設上限，最初 10 MiB |
| `resplit` | `path`, `partSizeBytes`：重寫該檔案加密分片 |
| `sync` | 無 |
| `setAutoUnlock` | `enabled`；啟用需要已解鎖保管庫 |
| `forgetSavedCredential` | 目前保管庫唔需要參數；未開啟保管庫時提供 `storageDir`, `cacheDir` |

Create 同 unlock 驗證保管庫；mount 係另一個請求。掛載後桌面經 Explorer 開啟 `driveLetter + "\\"`。

狀態包含 `locked`、`mounted`、`unmountBusy`、`driveLetter`、`storageDir`、`cacheDir`、`files`、`partSizeBytes`、`sync`、`driver`、`autoUnlock`、`availableDriveLetters` 同 `lastOfflineRelease`。成功離線釋放記錄虛擬 `path` 同實際 `bytesFreed`；零代表冇移除合適本機密文。針對性釋放會保留有修改、待處理、釘選、開啟同共享內容，刪除前驗證來源副本。每個檔案回報 `id`、虛擬 `path`、邏輯 `size`、`modified`、實際加密 `partCount`、其 `partSizeBytes` 同 `offline`。分片大小包括驗證記錄額外開銷，加密分片唔會超過上限。

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
