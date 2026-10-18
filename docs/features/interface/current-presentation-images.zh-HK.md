# 目前畫面擷圖替換清單

`contracts/current-presentation-images.json` 明確列出來源基線正在展示嘅 24 張原圖：十張 README／公開圖片項目，同十四張首頁／圖集項目。圖集嘅 445 次出現係合成去重測試，唔係真實擷圖清單。錄影、流程圖，同兩張早前被排除嘅圖片，唔屬於今次替換範圍。

每列最初都係 pending，記錄舊路徑同雜湊、目前使用位置、計劃採用嘅 Windows 狀態、語言／主題／視窗大小、說明同去重識別碼。計劃設定唔係已觀察證據。舊 Linux 圖格會對應現時支援嘅 Windows 狀態，並使用真實新說明，唔代表新增 Linux 支援。只有狀態、設定同說明完全相同先可以共用新圖。只屬歷史嘅畫面可以寫明 unavailable，但仍然係未完成，唔會當成功。

## 保留同接受證據

保留舊圖片原始位元組同來源證據，唔改日期或者來源聲稱。目前畫面唔再顯示舊圖，即使圖格以前標明歷史亦一樣。歷史或者封存可以保留原圖，但目前產生嘅展示內容唔可以繼續帶舊圖。唔好覆寫歷史原圖去令雜湊檢查通過。

透過支援嘅隱藏桌面路線擷取真實組建畫面，接受之前檢查原始像素同私隱。唔可以生成、重建、修圖或者用模擬圖片代替。依照維護者已安裝嘅證據接受程序，將 version-1 收據保存在私人證據根目錄，唔公開機器路徑或者程序身份。今次驗證器另需 `state.language` 同 `capture.timeZone`，因為清單記錄咗呢兩項。私人證據根目錄內嘅組建路徑必須係受限相對路徑；原組建喺其他位置時，先放入已驗證副本。

accepted 列嘅 `replacement` 提供儲存庫相對 `path`、`sha256`、證據根目錄相對 `receipt` 同 `receiptSha256`。收據必須綁定起止來源、組建位元組同組建收據、原始同接受 PNG 一致性、尺寸、設定組合、檢查／私隱聲明、互動／私隱旁證、真實擷取時間同已完成嘅自有程序清理。清單記錄身份使用共同 `dedupKey`。驗證器核對聲明同位元組，唔能夠證明操作者真係睇過像素，或者收據本身真實；獨立檢查同產生者來源證據仍然必須保留。

組建收據必須證明精確 `build.bat /s` 成功、來源起止一致、兩端都冇未提交改動，並提供執行檔、介面封裝同原生主機雜湊。正規化收據必須追溯到雜湊驗證過嘅原始根目錄組建收據，唔可以隨便提供一份雜湊正確嘅 JSON。擷取收據 `source` 另需 `rendererAsarPath`、`rendererAsarSha256`、`nativeHostPath` 同 `nativeHostSha256`，作獨立位元組核對。各使用位置清單由獨立定義固定，唔受可編輯清單控制。首頁／圖集／README 路由同說明、圖集中繼資料、桌面 README 同擴充功能文件內容，都要保留已接受替換。

驗證器解碼非交錯 8-bit RGB／RGBA PNG 掃描列，核對每個區塊 CRC、以有界精確輸出長度解壓 IDAT，並還原五種掃描列濾鏡。未支援 PNG 格式唔通過，唔可以重新壓縮真實擷圖去改證據位元組。舊圖片雜湊獨立固定喺基線 `96ea35e`，改清單雜湊唔會重新定義舊內容。產生嘅 HTML／CSS／JavaScript／JSON 同交付文件亦會檢查以資料網址內嵌嘅舊 PNG 位元組。

執行收據必須引用獨立雜湊嘅 `geometryReceiptPath` 同 `geometryReceiptSha256`。觀察旁證使用 `schemaVersion: 1`、精確 `sourceCommit` 同 `hwnd`、`method: "observed-native-client-and-browser-geometry"`、`observedAt`、`viewportCss`、`devicePixelRatio`、`rendererZoom`、`nativeClientPixels` 同 `capturePixels`。寬高物件必須係獨立觀察幾何資料，擷取尺寸要同解碼 PNG 相符。頁面擷取等於原生用戶區像素，視窗擷取可以包括邊框。`scaleKind` 只可以係 `device-pixel-ratio` 或者 `physical-display`，後者另需獨立觀察嘅 `physicalDisplayScale` 同 `physicalDisplayScaleObserved: true`。介面縮放唔能夠代替實體縮放或者 DPR。缺少量度就保留驗收缺口，唔可以由圖片標頭抄數字補上。

## 交付檢查同回歸測試

只喺產生程序完成、公開輸出已備妥之後執行：

```text
node scripts/check-current-presentation.mjs --repo-root <repository> --expected-source <capture-source-commit> --evidence-root <private-run-root> --presentation-root <generated-site-root> --desktop-root <unpacked-application-root> --extension-root <staged-extension-root>
```

必須明確指定預期來源。驗證器使用正式圖集／公開圖片讀取器，檢查獨立必需身份清單、pending／unavailable 狀態、舊來源引用同雜湊、實際輸出、受限路徑、收據雜湊、PNG 結構／尺寸／中繼資料、來源同設定綁定、時效同相容去重。缺少產生輸出或者解包桌面／擴充功能內容就唔通過，亦會核對 PNG 檔同內嵌 PNG 資料網址嘅舊雜湊。呼叫者必須提供實際交付內容，唔可以用空目錄或者來源代替。實際 HTTP 交付同已安裝執行畫面仍要另外驗收，網站輸出檢查唔能夠代替。

```text
node --test test/current-presentation-images.test.js
```

回歸測試刻意刪除／重複身份、更換來源／路徑、使用唔相容去重、喺歷史標籤下顯示舊圖，以及提供唔完整或偽造證據。負面測試通過只代表拒絕機制有效，唔代表 24 張新圖已存在。清單仍係 pending 時，實際交付檢查必須唔通過。今次增量唔改目前圖片或者公開清單。
