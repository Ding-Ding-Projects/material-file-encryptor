# 本機模型

## 連線同復原

開啟「Local models」，揀 **Check runtime**。本功能只用已記錄 Ollama 端點連接 `http://127.0.0.1:11434`。成功版本回應只證明 API 可連線；不可用回應唔能夠分辨缺失安裝定服務停止。有需要可安裝官方桌面套件，或者經作業系統啟動器開啟已安裝 Ollama，再重新檢查。本功能絕不自動安裝或者啟動服務。

選用原生執行環境控制器喺 API 健康檢查之外，加入執行檔探索同原生程序檢查，可以分辨已偵測但停止嘅安裝、喺所檢查預設／選定位置缺失嘅執行環境、正在執行或有 HTTP 回應但唔健康嘅服務，同未知檢查結果。自訂安裝唔喺呢啲位置，可能要用 **Locate installed runtime**。單純偵測絕不啟動程序。

**Open official installation guide** 只會喺確認後開啟固定官方 Windows 下載頁。本應用程式唔下載或執行安裝程式。**Start verified local runtime** 只喺偵測到已停止執行檔、而且通過主程序信任規則時可用。佢只啟動 `ollama.exe serve`，使用 `OLLAMA_HOST=127.0.0.1:11434` 同 `OLLAMA_NO_CLOUD=1`，並檢查就緒。就緒失敗只停止本動作啟動嘅程序，唔會拉取模型。整合者必須提供執行檔信任規則，否則啟動保持停用。

官方安裝程式參考係 <https://ollama.com/download>。冇網絡仍可使用內置說明。桌面主程序必須以現有外部連結允許清單協調任何安裝導覽。

## 商店同本機清單

**Refresh official catalog** 讀取官方目錄連結嘅每個家族，同各家族標籤頁連結嘅每個已發佈標籤，並跟隨分頁。更新使用四個受限工作者，每頁 30 秒期限、8 MiB 上限，同 4,096 頁上限。每次成功更新記錄頁面雜湊、總體 SHA-256 身分、來源 URL、時間、家族同變體數量。Ollama 喺呢個 HTML 介面冇公佈獨立總數，所以完整性只代表所有已觀察官方頁面，唔係外部認證總數。標記改變或者某家族標籤缺失會令更新無效，保留上次完整快取。目錄唔能保證提供者冇漏掉未連結紀錄。

已安裝同執行中本機標籤會同目錄合併，唔會移除只喺本機存在嘅項目。搜尋支援純文字同隔離正則表達式模式。每條表達式喺可丟棄工作者執行，實際時間期限 150 ms、模式上限 128 字元、10,000 列上限、每列 32,767 字元，同總 UTF-8 文字 4 MiB 上限。新查詢或者介面拆除會終止之前工作者。無效或逾時搜尋會清除舊結果，避免舊列繼續可操作。篩選包括狀態、能力、家族、量化同硬件適用結果。結果視窗只渲染 200 列，但會篩選整個有上限清單；收窄搜尋可以見到其他列。

## 硬件同下載

原生主程序轉接器透過作業系統 API 量度 CPU 清單、RAM、可用 RAM 同架構。喺 Windows，佢執行一條固定、隱藏、非互動 PowerShell 查詢 `Win32_VideoController`，限制 10 秒同 1 MiB 輸出，回報 GPU 型號、驅動版本同裝置狀態。絕不根據渲染程序輸入組合命令。`AdapterRAM` 只保留作介面卡回報證據，唔當可用 VRAM，因為佢唔係可信可用記憶體測量。GPU 後端相容性喺獨立驗證前仍然未知。只有主程序提供已驗證絕對模型儲存目錄，先量度模型儲存剩餘空間；否則保持未知，唔用應用資料磁碟代替。

適用判斷需要精確大小、參數、量化同上下文記憶體證據。檢查已安裝模型後，回報架構尺寸可以估計 2,048-token 上下文嘅 F16 key/value 快取；尺寸、算式同假設會一齊列出。未知資料保持 Unknown，絕不由模型名稱虛構要求。儲存估算包括 20% 預留，唔保證同時下載或者其他應用程式仍有足夠空間。

拉取清單只係下載佇列。先審閱精確標籤、已知大小、額外儲存同可用空間，再確認網絡使用。可選一至三個同時拉取。只有 Ollama 提供位元組資料先顯示進度。已安裝模型會略過；部分失敗絕不將整批標為成功。可取消同重試個別失敗／中斷項目，唔會刪除已安裝模型。狀態保存喺私人應用資料目錄。

## 對話

選取已安裝模型，設定系統指示同有範圍參數，再發送訊息。回應喺本機串流，可以停止或重新生成。工作階段可選取、改名，並經明確確認刪除。圖片要求已驗證 `vision` 能力，最多四張、每張 1 MiB。上下文上限 128 訊息，個別文字最多 65,536 字元、請求 6 MiB、回應 16 MiB。每次只執行一個對話回應。

歷史同附件係本機敏感資料。匯出保留訊息，但移除可辨識憑證指定、bearer 值、環境變數指定同私人路徑模式；唔包含圖片位元組。自動遮蔽唔可能識別每個秘密，分享前要喺本機審閱。本模組唔會將訊息正文或附件位元組送入遙測或記錄。單次回應生成使用同一有界本機模型選擇，但唔加入對話工作階段。已安裝模型可以複製到三個引導本機標籤目的地之一；刪除必須喺主確認控制輸入精確標籤。

## 設定同整合

內置 Local chat 同 Model inspection 設定唔需要外部程序。外部註冊只可由主程序透過執行檔選擇器同允許清單驗證器進行。參數有上限，拒絕 shell 特殊字元，亦拒絕環境變數值。啟用外部啟動之前，主程序必須提供程序啟動器同就緒驗證器。預檢列出精確執行檔、參數同目錄。工作目錄同必要檔案必須解析到整合者提供嘅專屬根目錄內。執行檔同參數必須通過整合者針對執行檔嘅精確結構。載入、預檢同還原時會重做檢查，包括真實路徑解析以拒絕根目錄之外路徑。

原生設定轉接器只提供版本、已安裝模型清單同模型檢查配方。原生選擇器選擇已驗證 `ollama.exe` 同專屬工作目錄。參數向量由選定配方固定，只用已驗證本機標籤替換被檢查模型佔位符。執行期限 15 秒，輸出上限 1 MiB。擷取輸出會丟棄；就緒代表真實命令成功結束，唔係假設執行中。失敗結束會啟動現有快照還原路徑。

每次啟動都喺呼叫啟動器之前，持久記錄快照同 starting 狀態。Ready、failed 同 restored 結果都會保存。程序中斷後重新載入會顯示 interrupted，絕不自動重啟。就緒失敗會停止回傳嘅專屬程序，還原設定快照。快照只涵蓋應用程式自己嘅設定；模組絕不修改 Ollama 環境或伺服器設定。設定狀態同目錄、拉取清單及工作階段一齊放喺私人應用資料檔。主程序啟動同就緒轉接器仍負責有界執行同專屬程序生命週期。

整合匯出：

```js
createOllamaService({ dataDir, fetchImpl, hardwareProbe, profileLauncher,
  verifyExecutable, validateProfile, profileHealthCheck, profileOwnedRoots });
mountOllama(root, { services: { ollama: { request, subscribe } }, translate, confirm });

// Main process only; the directory must come from a verified native grant.
createNativeHardwareProbe({ modelStoragePath, storagePathVerified: true });

const profiles = createNativeProfileAdapter({
  pickExecutable, pickOwnedDirectory, verifyExecutable,
});
const runtime = createRuntimeController({
  pickExecutable, verifyExecutable, openOfficialPage,
  launchVerified: createVerifiedRuntimeLauncher({ verifyExecutable }),
});
// Additional createOllamaService options:
// runtimeController: runtime, profilePicker: profiles.pickProfile,
// profileLauncher: profiles.launcher, profileHealthCheck: profiles.healthCheck,
// verifyExecutable: profiles.verifyExecutable, validateProfile: profiles.validateProfile
```

整合動作允許清單必須加入 `runtimeInstall`、`runtimeStart`、`chooseRuntimeExecutable` 同 `registerProfile`。只有 `registerProfile` 接受配方識別碼（`version`、`models`、`inspect`）；路徑來自原生對話框。安裝頁導覽同啟動都需要確認。執行環境控制器選定嘅自訂路徑只存在於工作階段，唔可以代替持久保存並重新驗證嘅外部設定。

主程序必須逐項驗證呼叫者身分、驗證回送轉接器、強制 origin 檢查、限制權限至應用資料目錄，並喺拆除時銷毀服務。`validateProfile` 必須按執行檔專屬結構批准精確執行檔、參數、工作目錄同必要檔案；單靠執行檔身分唔足夠，因為解譯器可以執行任意程式碼。渲染程序 `confirm` 回呼預設拒絕破壞性／下載動作。唔需要直接渲染程序網絡。`registerPickedProfile` 刻意唔喺渲染程序動作允許清單。掛載前將匯出嘅 `ollamaCantonese` 字典合併入主翻譯器；語言改變會重新掛載介面，但服務保留狀態。

## 驗證狀態

專項合成測試涵蓋端點同內容邊界、串流完成、分頁同過期快取保留、清單整合、所有適用結果、設定還原、持久設定重啟／還原、原生查詢參數上限、持久拉取結果同遮蔽。並行初始化回歸確認讀取同修改會加入同一次已保存狀態載入。相鄰標籤中繼資料回歸確保缺失值保持未知。真實可丟棄工作者測試驗證病態表達式終止時主事件迴圈仍繼續，並涵蓋取消、上限同無效語法。呢啲測試唔表示下載過模型、安裝或啟動過服務，亦唔表示擷取過已建置介面。原生探測亦曾喺開發主機唯讀執行；嗰個只係某一刻硬件結果，唔係模型執行證據。桌面橋接整合、全部語言文字覆蓋、完整視覺矩陣，同已驗證瀏覽器對等行為，仍需要主程序整合同驗證。

第一手參考：[Ollama API](https://docs.ollama.com/api/introduction)、[官方目錄](https://ollama.com/library)，同各家族連結嘅 `/tags` 頁面。HTML 目錄唔會被描述為穩定、版本化 API。
