# 分散存放內部運作

呢篇係分散存放同鏡像備份嘅開發者筆記，使用指南另有文章。每個位置都只會放密文，即係主要儲存資料夾本身已有嘅 `parts/<id>.mfe`。

## 檔案

- `<storage>/placement.json` 係清單，記錄設定（`enabled`、`copies`、`safetyBackup`、`locations`、`rules`）、唔止喺主要資料夾嘅分段由邊啲位置持有（`parts`）、分段大小同 SHA-256、規則固定位置、儲存庫層參照、鏡像狀態同上一次工作。只有桌面程序會寫，每次都係原子寫入（暫存檔、fsync、改名）。冇列喺 `parts` 嘅分段就只喺主要資料夾。位置名稱係使用者文字，任何睇到儲存資料夾嘅人都睇到。
- 分擔資料夾：`<folder>/MaterialFileEncryptor-Split/<vaultId>/parts/`，另外放一份 `placement.json`。
- 鏡像資料夾：`<folder>/MaterialFileEncryptor-Mirror/<vaultId>/`，排法同儲存資料夾一樣，可以直接當現有磁碟開啟。
- 儲存庫分擔用儲存庫備份快照格式，每個分段係一層；`registryObjects` 記錄邊個清單摘要持有邊個分段。儲存庫鏡像會發佈一個完整快照。

## 讀取路徑（原生）

`SplitPlacement.cs` 有上限、嚴格咁解析清單，唔接受其他保管庫識別碼，亦唔接受同主要資料夾重疊嘅資料夾。`VaultEngine.Placement.cs`：

- 快取同主要資料夾都冇嘅分段，會由已接駁嘅分擔資料夾或鏡像資料夾抄入快取暫存檔，用保管庫金鑰驗證後先放入位。
- 儲存庫持有嘅分段要靠桌面程序。引擎喺命名空間鎖入面拋出原有嘅 `VaultHydrationRequiredException`，鎖外準備時呼叫 `FetchPlacedPartAsync`，由 `PartHydrationBridge.cs` 透過 `hydratePart` 管道事件實作，桌面程序用 `hydratePartResult` 回覆。限時五分鐘，可以取消（`hydratePartCancel`），同一時間只取一個。取回嘅位元組用之前一定先驗證。
- 冇任何副本接駁得到時，會拋出 `SplitLocationUnavailableException`，訊息會講明位置，例如「This file is stored on USB backup (E:), which is not connected.」。
- 已記錄嘅分擔副本喺中繼資料上算可用，拔咗碟檔案都仍然見到。發佈唔會將已搬走嘅分段抄返入主要資料夾。快取只會喺主要副本或者已接駁資料夾副本驗證成功之後先清走。
- 規劃指令 `splitStorageInventory` 同 `splitStorageAffected` 要磁碟已解鎖。

## 搬移（桌面程序）

- 只會喺磁碟已鎖定時，喺原生 `beginSnapshot` 鎖定資料夾租約（`storageOnly: true`）入面搬。
- 每個分段：讀來源副本（雜湊同記錄唔同就唔用），寫入目標並同步落碟，再讀返比較 SHA-256，之後先記錄。清單唔再列舊副本之後先刪；清單寫入失敗就保留舊記錄。
- 安全備份（預設開啟，舊清單冇呢個欄位都當開啟）：全部抄完、再逐個重新驗證，之後先釋放主要副本，釋放前每個目標再驗一次。釋放之前任何失敗、斷線或者取消，主要副本全部保留，並報告 `safetyHeld` 同 `safetyHeldReason`。重試會跳過已記錄嘅副本。
- 抄之前先檢查目標夠唔夠位。斷咗線嘅位置唔會寫亦唔會刪。全部搬返主要磁碟係同一個工作，只係目標全部設做主要位置。

## 鏡像備份

次序：先列中繼資料，再抄同驗證缺少嘅分段，然後 `commits/`、`activity/`，最後先係 `vault.json`，之後先清走冇位置參照嘅分段。有分段抄唔到就唔抄中繼資料，舊鏡像保持一致。鏡像會喺套用成功後、磁碟停咗兩分鐘冇活動後同按需要時更新，搬移期間唔會更新。關咗分散存放都照樣用得。同一隻碟嘅資料夾可以用，狀態會報 `sameDisk: true`。

## 限制同未完成項目

- 分段放咗喺其他位置時，鎖定資料夾嘅 Docker 映像或儲存庫備份會被拒絕；要先解鎖（暫存快照會取回分段）或者全部搬返主要磁碟。
- 儲存庫層不可變；由儲存庫分擔移除分段只係喺清單刪走。
- 可移除磁碟偵測係估算。
- 未喺封裝程式或者真實儲存庫驗證。
