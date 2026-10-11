# 安裝解壓同更新版本修正

獨立下載嘅 v1.122.1 Setup 回傳零，並登記 0.2.0，但 Squirrel 解壓時漏咗 663 個內容檔案之中嘅 585 個。內含 FFmpeg 對應原始碼 ZIP 變咗零位元組，之後嘅 V8 啟動快照等檔案亦冇解出。已安裝程式記錄 Error loading V8 startup snapshot file，開始功能表捷徑亦未建立。CRC 通過唔等於安裝完整。

用同一個更新程式同不可壓縮巢狀 ZIP 樣本，可以重現問題。固定版本工具即使收到 Deflate 要求，仍然可能使用 Store。共用修復工具改用 .NET ZipArchive 最佳壓縮逐項串流重寫，保留名稱、次序、時間同內容，再經真正 Squirrel 支援嘅完整套件流程組裝 Setup。原有產出繼續保留。

新增檢查會用更新程式真正嘅解壓方法，逐個核對內容長度同 SHA-256，並核對套件描述、程式版本同內嵌來源版本。負面回歸必須拒絕有問題嘅儲存模式 ZIP，再接受修正版本。解壓檢查唔會代替真正安裝、啟動、更新同移除驗收。

PE 資源讀取器毋須執行 Setup，就可以核對內嵌完整封裝、更新器同發行索引。單靠零退出狀態或檔案存在唔算通過。重組逾時會留下隔離標記，直到原程序同子程序終止得到確認先可以重試。

以前發佈標籤不斷增加，但套件一直係 0.2.0，所以已安裝程式正確地判斷冇新版本。依家每次正式建置之前，會用工作流程次數同嘗試次數產生 1.<次數>.<嘗試>，同步寫入套件資料同鎖定檔案，發佈之前再核對實際封裝內容。大型下載有獨立十五分鐘期限，資料查詢維持三十秒。雜湊、大小、重新導向同重新啟動確認保護繼續生效。

建置仍然使用 build.bat /s 同 build-installer.bat /s，封裝使用現有受信任工具。原先編譯嘅轉接器被本機應用程式控制拒絕，現時流程已經唔需要佢，亦冇改任何保安設定。修正版本獨立下載後嘅真正安裝同更新，仍然要有各自嘅驗收紀錄。

## 精確技術參考

`Error loading V8 startup snapshot file`、`scripts/repair-squirrel-compression.ps1`、`scripts/squirrel-payload-check.ps1`、`1.<workflow run number>.<attempt>`、`build.bat /s`、`build-installer.bat /s`、`node --test test/release-version.test.js test/update-service.test.js`、`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-squirrel-extraction.ps1`
