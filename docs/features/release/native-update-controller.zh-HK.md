<a id="native-update-controller"></a>

# 原生更新控制器

`src/main/update-service.js` 實作主程序控制器，並有桌面來源整合。開發呢個模組期間冇測試已安裝應用程式、安裝程式、版本發佈或作業系統重新啟動。原生接納仍未驗證。

<a id="api-and-host-integration"></a>

## API 與主機整合

用 `createUpdateService({ app, autoUpdater, dialog, fetch, isActiveWork, acquireInstallLease, prepareRestart, getLanguage })` 建立服務。前三個物件係原生主程序 API；`fetch` 預設用內建實作，可注入作測試。唔需要新增相依套件。

控制器提供：

| 方法 | 行為 |
| --- | --- |
| `status()` | 回傳獨立快照，含狀態、原因、未簽署警告及更新中繼資料，唔公開本機路徑。 |
| `check()` | 讀取固定專案版本中繼資料、來源證明、來源標籤及套件索引；同時檢查共用一個操作。 |
| `download()` | 將選定完整套件下載至隔離應用程式資料快取，驗證大小、SHA-256 及 Squirrel SHA-1，唔呼叫原生更新器。 |
| `installWhenSafe(parentWindow)` | 原生更新前要求 ready、工作閒置、原生確認及獨佔安裝租約；要求應用程式重啟前驗證原生套件快取。 |
| `cancelSchedule()` | 停止未來排程檢查，唔取消已開始下載或原生交易。 |
| `dispose({ shutdown: false })` | 停止排程及所屬 HTTP／觀察工作。最終重啟準備已開始時，等該階段完成。部分收尾的復原租約會繼續保留，除非主機用 `shutdown: true` 明確確認最終關閉。唔聲稱取消 Squirrel 本身。 |
| `on('status', listener)` / `off(...)` | 訂閱狀態快照；初始快照可經 `status()` 取得。 |

主機必須提供 `isActiveWork`，涵蓋未儲存編輯、掛載磁碟活動、匯出、匯入、轉換及其他必須保留的工作；保守預設係忙碌。主機亦須提供 `acquireInstallLease`，以原子方式喺忙碌時拒絕，或回傳釋放函式並阻止新工作直至釋放。單純忙碌檢查唔能取代租約；缺少租約支援就禁止安裝。

主機須提供 `prepareRestart()`，鎖定儲存、驗證持久性、結束所屬輔助程序，並準備正常關閉路徑。原生快取驗證及最後忙碌檢查之後、要求原生重啟之前會等候佢完成。預設拋出 `RESTART_PREPARATION_REQUIRED`；準備失敗會阻止重啟要求，冇強制退出後備方法。

最終準備係不可中途放棄階段。進入 `preparing-restart` 前，控制器清除原生觀察計時器及監聽器。被動錯誤接收器避免遲到的原生錯誤變成未捕捉例外。準備成功後，逾時回呼、遲到錯誤及 dispose 都唔可以釋放租約或壓止已獲授權的重啟。dispose 等候準備 Promise；主機回呼唔可以等候呢個服務自己的 `dispose()`，因為 dispose 正等緊該回呼。

主機必須喺關閉配接器、功能服務或輔助程序前，完成可失敗的預檢，包括持久性檢查及工作階段標記移除。開始關閉後必須完成關閉準備、設置關閉旗標並 resolve。準備可能已部分關閉後拋出錯誤，控制器會回報 `manual-restart-required`、`recoveryRequired: true` 同 `admissionBlocked: true`，跳過原生重啟並保留租約。佢唔可以假設失敗回呼令主機仍可重用。檢查及新安裝嘗試唔能取代呢個最終復原狀態。主機須顯示失敗、保持變更被阻止，並指示手動重啟應用程式或已驗證最終關閉。只有最終關閉確定後，先可呼叫 `dispose({ shutdown: true })` 釋放復原租約；普通 dispose 保留租約。冇自動還原或強制退出。

原生確認經 `getLanguage()` 支援 `en`、`yue`、`zh-HK` 及 `bilingual`，預設安全的稍後按鈕。主機須顯示持續 ready 提示、手動檢查、確切版本及版本連結、本地化狀態／原因、未簽署警告、稍後動作，以及來源視窗焦點行為。桌面來源接線同本模組分開；已安裝接納仍待完成。

<a id="state-and-timing"></a>

## 狀態與時間

狀態包括 unavailable、idle、checking、current、available、downloading、ready、confirming、installing、preparing-restart、manual-restart-required、restart-requested、failed 及 disposed。稍後保留 ready。工作進行中保留已暫存套件並回報 `ACTIVE_WORK`。原生重啟要求唔係更新成功證明。

喺已封裝 Windows 安裝中，預期執行檔位於 `app-x.y.z` 目錄，旁邊有真實 `Update.exe`，預設啟用檢查。不支援及未封裝環境永不要求中繼資料。啟動即執行，只有 Squirrel 首次啟動等十秒避開安裝鎖。背景間隔限制十五分鐘至二十四小時，預設四小時。HTTP 期限三十秒，原生觀察期限十分鐘。中繼資料最多 1 MiB，套件最多 1,500 MiB。成功暫存保留等日後同意，失敗暫存移除。尚未實作按年齡清理快取。

<a id="durable-ready-state"></a>

## 持久 ready 狀態

套件雜湊驗證後，成功暫存以原子方式喺應用程式自己的資料目錄寫入 `update-staging/ready.json`。呢個小型版本化記錄只含相對暫存資料夾基本名稱、套件基本名稱、版本、標籤、來源提交、大小及雜湊。暫存記錄以獨佔方式建立、flush、關閉並重新命名至目標，唔儲存絕對路徑、任意 URL、指令、憑證或安裝指示。

全新服務從 idle 開始。下一次啟動或手動檢查先驗證目前固定遠端版本及來源證明，再讀最多 4 KiB ready 記錄。必須通過確切結構、相對基本名稱、目錄類型、目前中繼資料一致性、套件大小、SHA-256 及 SHA-1，先還原 ready。快照之後回報 `restoredFromCache: true`。快取中繼資料本身永不授權安裝；離線中繼資料唔可以還原 ready，版本改變亦唔可以重用過期記錄。

記錄遺失、格式錯誤、過大、唔符或損壞，都保持剛驗證的 available／current 狀態，唔會自動安裝、取消或恢復原生交易。日後明確下載可替換記錄。孤立快取資料夾保留；檢查 ready 時唔會刪除無關或之前工作階段資料夾。

<a id="fixed-release-and-integrity-boundary"></a>

## 固定版本與完整性邊界

中繼資料來源係 `https://api.github.com/repos/Ding-Ding-Projects/material-file-encryptor`。附件必須用相應確切 GitHub 版本下載 URL。只接納 HTTPS GitHub 版本附件 CDN 重新導向，最多三次。公開 API 唔容許呼叫方提供 feed URL、套件名稱、執行指令或版本儲存庫。

控制器拒絕草稿／預發佈中繼資料、無效版本、重複附件、格式錯誤索引、過大中繼資料、來源標籤唔符及套件大小／雜湊唔符。來源證明提交須符合直接提交標籤，同目前發佈器一致。套件索引須符合來源證明 SHA-256，並列出一個記錄套件版本的完整套件。隔離暫存及原生 Squirrel 快取中的選定套件，都須符合來源證明 SHA-256 及索引 SHA-1。來源及標籤驗證只建立固定專案內部一致性，唔係程式碼簽署或發佈者身份保證。

發佈器獨立於 `package.json` 遞增版本標籤。較新標籤包含同一套件版本時，正確回報 current。目前候選將應用程式套件版本升至 `0.2.0`；之後更新候選亦須提高套件版本。

<a id="why-native-downloading-waits-for-consent"></a>

## 原生下載點解要等同意

即使冇呼叫 `quitAndInstall()`，原生更新器都可能喺下次啟動套用已下載 Squirrel 更新。因此普通背景下載用隔離快取；明確確認及取得閒置租約後，先開始原生 `checkForUpdates()`。原生更新會從已驗證固定 feed 再下載。控制器呼叫 `quitAndInstall()` 前會檢查原生快取。

原生 Squirrel 更新一旦開始，API 冇取消或還原機制。最終重啟準備前，dispose 或逾時會停止控制器觀察，阻止之後回呼要求重啟，但唔能撤回原生工作或保證未來普通啟動行為。最終準備開始後，該階段會完成，而新工作保持被阻止。原生快取唔符或觀察逾時會回報失敗，永不當成還原成功；UI 須喺原生失敗後說明限制。本模組永不呼叫 shell、任意指令、安裝程式執行檔、作業系統關機或重啟。

<a id="verification-and-remaining-acceptance"></a>

## 驗證與未完成接納

桌面 Updates 工作區將狀態、檢查、暫存及明確安裝接駁本控制器。安裝租約阻止新工作區變更，並要求普通磁碟鎖定成功。最終準備回呼只會喺快取套件驗證後關閉所屬服務及原生輔助程序。瀏覽器配對控制唔可以要求原生安裝。以上係來源整合事實；已安裝接納另行驗證。

`node --test test/update-service.test.js` 使用模擬原生 API 及暫存不可執行套件測試資料，涵蓋固定來源中繼資料、套件版本不變、損壞套件、離線回應、過大中繼資料、延後及忙碌狀態、租約要求、明確確認、重啟準備、原生快取唔符、同時要求、排程邊界、dispose、遲到原生事件，以及依全新來源證明恢復新實例 ready。負面快取案例包括損壞、遺失／格式錯誤記錄、過大記錄、路徑穿越、未知欄位及版本改變。呢啲只證明控制器行為。

未完成接納包括真實已安裝未簽署 Squirrel 應用程式、套件版本遞增的真實附件、端到端原生快取布局及套件命名、重啟進入新版本、全部語言模式正確 UI／焦點、忙碌工作整合及外部失敗復原。冇已測試還原、原生取消或完成更新的聲稱。
