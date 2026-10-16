# 文件瀏覽器同狀態整合

## 文件

### 每個畫面獨立記錄驗收

`contracts/surface-registry.json` 補充舊有 `contracts/feature-delivery.json` 兩個表面嘅評估，唔會改變其結論或來源綁定。具體登記表包括公開首頁、文件庫、wiki、圖片庫、生成文章同分類索引；每頁出版偏好設定；瀏覽器工作區畫面同內置文件；桌面畫面、對話框同內置文件；以及擴充功能彈出視窗。每個畫面承接同一份 105 項語義聲明，但唔承接完成結論。空白獨立證據表展開後一律係未驗證評估。

`discoverFeatureSurfaces(root)` 讀取出版目錄及其實際文章路由函數、工作區聲明、桌面聲明，同遞迴文件目錄。`validateSurfaceRegistry(registry, expectedSurfaces)` 必須收到呢份權威探索結果，並拒絕遺漏路由、路由／元件身分不符、重複畫面、遺漏類別、承接完成結論同借用證據。已實作評估需要自己嘅精確路由同選擇器、來源提交、建置雜湊，以及聲明嘅畫面與互動證據。呢啲只係結構聲明，唔等於證據存在或執行檢查通過。清單係驗收待辦，唔係所有必要行為已交付嘅聲稱。

執行 `node --test test/feature-delivery-surfaces.test.js test/documentation-platform.test.js` 可檢查清單邊界。新增、移除或改名文章之後，要重新產生清單。實際建置及公開部署仍然需要另外驗收。

獨立手寫必要畫面清單要求精確嘅保險庫同確認對話框身分、動態還原子項對話框、全部五個個人化面板及其 Home Assistant 憑證對話框，並要求桌面同瀏覽器工作區主機嘅存取設定檔、鎖、驗證器、支援、歷史、解鎖、等候、精靈、確認同 QR 預覽子畫面。描述啟用狀態嘅動態選擇器係語義擁有權描述，唔聲稱 DOM 有固定 CSS ID。引號包住嘅 HTML ID 只會喺單一有界開始標籤內解析。專用回歸檢查同時喺登記表及擷取結果移除保險庫，因此兩者一齊遺漏仍然唔會通過。

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

## Wiki頁面識別

整合wiki用每頁已驗證來源檔案嘅基本名稱建立章節識別，包括 `wiki-Home` 同 `wiki-CLOSEOUT_PROMPT`。內層標題ID同同頁片段連結使用同一個頁面前綴。兩頁完整內容可以同名，而唔會衝突或遺失內容。原始Markdown標題同原始位元組來源雜湊保持不變。回歸測試實際產生兩頁同名標題，核對獨立ID、每個本地片段目標，以及兩個完整標題都仍然存在。

## 誠實收費審核

產品係免費，而 `scripts/audit-monetization.mjs` 負責守住呢點。`node scripts/audit-monetization.mjs` 會掃描桌面轉譯程序、主程序同共用程式碼、瀏覽器擴充功能同文件網站原始碼，並略過內置第三方目錄、字型、圖示同授權文字。佢會報告付款 SDK 同付款主機、似信用卡號碼嘅欄位同付款表單、購買同升級字眼、授權金鑰同權益檢查、試用計時、捐款同評分請求，以及價錢標籤。審核亦會拒絕 `package.json` 內嘅付款相依項目、擴充功能資訊清單內嘅付款權限同付款主機，以及任何內容安全政策內嘅付款主機。只有清楚講明產品免費嘅句子先可以例外。審核仲要求桌面（說明頁，用 Material 清單控制項，並跟共用 Material 動畫進場）、擴充功能選項頁同網站首頁，各自用英文同粵語清楚列明價錢。

`test/monetization-audit.test.js` 會對真實檔案樹執行審核，要求零項發現。測試亦會喺記憶體同臨時目錄種入每一類違規，要求全部被報告，所以審核唔會因為乜都搵唔到而靜靜雞通過。圖樣清單同程式碼一樣係規則嘅文件：出現新付款機制就要擴闊，亦要令允許嘅免費聲明同各介面嘅字句保持一致。

## README 分頁同人手撰寫時間估算

README 開頭有精簡索引（專案係乜、安裝一行、價錢聲明同目錄），然後將每個長參考章節收埋入 `<details>` 區塊，並配上描述性 `<summary>`。第一次睇嘅人要知嘅嘢永遠唔會收埋，畫面截圖圖庫保留自己嘅分組。`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md` 同 `LICENSE` 保持係真實檔案，等 GitHub 喺 README 上面顯示成分頁。

README 入面「Project size and human-time estimate」呢節由 `scripts/human-time-estimate.mjs` 產生。佢用 `git ls-files` 列出受追蹤檔案，將人手撰寫程式碼嘅非空白行數分五組計算（應用程式原始碼、原生引擎、樣式同標記、測試，以及建置同工具腳本），並略過內置同打包目錄、字型、鎖定檔、壓縮檔、二進位檔、JSON 資料、設計參考原型同 Markdown 文字，而且逐項列明。原生引擎按 1.5 倍計。結果除以每個工作天 25 至 50 行同每月 20 個工作天，得出一個範圍，標明係估算並列出算式。`node scripts/human-time-estimate.mjs --write` 會更新該節，而 `node scripts/human-time-estimate.mjs --check` 會喺同目前檔案樹相差超過百分之十或者算式錯誤時失敗。`test/readme-tabs-and-estimate.test.js` 同時把關 README 結構同估算。
