# 文件瀏覽器同狀態整合

## 文件

`buildDocumentationCatalog(root)` 讀取 `docs/` 下每個 Markdown 檔，包括維基，以及可用嘅根目錄專案文章。每份文件記錄完整來源文字、穩定路徑 ID、分類、標題同內容雜湊。符號連結會排除。封裝期間執行 `node src/features/documentation/build-catalog.mjs <repository-root> <output.json>`，再將解析後套件傳畀 `mountDocumentation`。

`mountDocumentation(host, { catalog, translate, onExport, initialId })` 提供文章導覽、使用現有有限工作者正則表達式建構器嘅全文搜尋、標題錨點、內部 Markdown 連結同 Markdown 匯出。只用 DOM 嘅渲染器支援表格、圍欄程式碼、強調、清單同工作清單、引文、本機點陣圖片，以及專案文章使用嘅精確無屬性 details／summary 容器。任意來源 HTML 只會當文字顯示，唔會執行。外部連結只接受 HTTP 同 HTTPS，並有明確標示。缺失內部文章同錨點會顯示，但冇可啟動連結。文件改動後必須重建目錄；封裝整合仍然有需要。

圖片參照按所屬文章解析，只有落喺儲存庫內嘅本機 PNG、JPEG、GIF 或 WebP 檔案先會以 data URL 加入。每檔上限 5 MiB。SVG、遠端圖片、路徑逃逸、未支援檔案同缺失圖片會顯示不可用，唔會發出意外網絡請求。每個接受資產記錄原始路徑同 SHA-256。

`parseChangelog(markdown)` 公開有日期嘅版本章節。獨立 `mountChangelog(host, { entries, translate, onExport })` 模組加入日期同分類篩選、有限正則搜尋，同篩選後 Markdown 匯出。如果來源變更記錄有分類，就由主程序提供。冇日期章節喺冇日期篩選時可見；啟用日期界限時會排除。

## 狀態

`createApplicationStatus` 係包住指定官方狀態用戶端工廠嘅可信程序轉接器，本身唔實作傳輸或者憑證儲存。主程序必須匯入隨附用戶端，提供程序設定，有實質更新時呼叫 `checkpoint`，結束時呼叫 `finish`，並只透過 IPC 公開 `snapshot()`。快照用允許清單，排除憑證、工作階段金鑰、儲存庫路徑同原始伺服器診斷。`mountStatus` 接受 `getStatus` 回呼，顯示已設定、不可用同讀取失敗狀態，唔會聲稱已設定用戶端已成功發佈。

渲染程序唔收集註冊秘密。缺失工廠顯示 `CLIENT_NOT_CONFIGURED`。即時發佈、驗證、啟動／結束接線、回覆互動同完整狀態用戶端合約驗證，喺主程序整合轉接器之前仍然未驗證。

## 交付清單

`contracts/feature-delivery.json` 為桌面同網站獨立列出正式功能識別碼。缺失列會明確保留，唔代表完成。`implemented` 列要求現存實作、文件、本地化、測試同證據路徑。`validateFeatureDelivery` 拒絕遺漏或重複列，同唔完整嘅已實作聲稱。獨立納入版本控制嘅必要識別碼清單，防止探索過程靜靜地隱藏遺漏功能。

## 驗證同剩餘工作

專項測試執行真實文件探索、標題衝突、連結路徑穿越、安全外部連結拒絕、日期變更記錄解析同篩選、狀態遮蔽，以及遺漏回歸檢查。主翻譯器有廣東話資源對照表。選用 `test/documentation-browser.test.js` 經設定低層桌面 CLI 啟動隔離 Edge，實際操作文章導覽、錨點、表格、圖片、搜尋同匯出。需要 `DOCS_LOWLEVEL_CLI` 同 `DOCS_PLAYWRIGHT`，可選 `DOCS_EDGE`；冇設定會明確略過。佢唔聲稱正式套件或視覺驗證。產品掛載、翻譯文字互動、視覺證據、套件生成同網站接線仍然有未完成工作。本模組唔建立視覺符合性，亦唔代表任何通用功能完整交付。

## 強制清單驗證

`validateFeatureDelivery(manifest, exists?)` 係離線結構檢查，強制獨立必要 ID 清單、每個 ID 恰好一個桌面同網站列、聲明範圍語義、有長度限制而非空原因、安全而有上限路徑陣列（包括持久化），同每條參照路徑嘅完整提交 ID。實作缺失絕不構成範圍豁免。可選存在性回呼可以檢查本機檔案；冇回呼唔代表已檢查 Git 物件。

`verifyFeatureDeliveryReferences(manifest, { repositoryPath, timeoutMs, totalTimeoutMs })` 另外用 Git CLI 要求每個記錄提交／路徑解析為 blob。每條命令最多十秒，整次最多六十秒。冇儲存庫存取或者總期限屆滿，回傳 `referenceVerification: unverified`；記錄檔案缺失則回傳 `failed`。離線套件應用結構驗證，同保留呢個來源存在性未驗證邊界。淺層複製可能要先取得所記錄審閱提交，先可以通過儲存庫感知檢查。兩種結果都唔證明已建置行為或者視覺證據。
