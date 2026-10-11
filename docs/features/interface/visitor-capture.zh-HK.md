# 訪客偏好設定原始畫面證據

[English](visitor-capture.md) | [繁體廣東話](visitor-capture.zh-HK.md)

## 用途與界線

手動工作流程只會為首頁訪客偏好設定產生真實 PNG 同計算樣式量度，唔會判斷介面品質、執行測試或 lint、提供無障礙結論，亦唔會限制版本發佈。下載輸出後先獨立檢閱。產生證據成功唔等於 Material Design 3 驗收成功。

## 精確生產輸入

輸入指定完整來源識別碼、成功嘅 main 說明網站部署 run、確實 github-pages artifact ID 同 ZIP SHA-256。准入會經 GitHub CLI 核對記錄、下載位元組、拒絕不安全路徑同連結，並將網站及工作區來源記錄同指定來源比對。每個解開嘅靜態檔案都會記錄大小同 SHA-256。工作流程只喺專用 loopback 來源提供呢份固定生產輸出，唔會重建或者假設即時網站仍係同一份內容。

初始例子指定來源 befcc57f53796f8c496336edbe3bb0ed14688a3c、部署 run 38135624365、artifact 11700663249 同摘要 8eacaebd4792ad45a9e665071c5cc56c6dd26e0b8534a3d0fad3d657c2d401d2。呢啲係歷史預設輸入，唔代表之後即時部署仍用呢啲位元組。

## 瀏覽器與場景

獨立依賴清單固定 Node.js、Python、GitHub CLI、Playwright 1.64.0 同 Chromium revision 1248。瀏覽器必須以非 root 身份啟用 sandbox，冇不安全後備路線。Linux 共用套件經固定 Playwright 安裝器取得，但套件來源本身唔係不可變二進位固定版本。實際雲端套件版本、瀏覽器版本同執行檔摘要會保留。

首個場景係 320 × 844 CSS 像素、英文、device scale 1 同模擬觸控。全新設定檔同 context 冇帳戶、私人詞彙、憑證或者用戶資料。控制器按真正偏好設定掣、記錄初始畫面，再選共用 Appearance 分頁，經原本主題控制要求 dark。唔會用隱藏舊控制、注入儲存或者直接改根元素。控制缺失會記錄為未執行，PNG 唔會標示已驗收或者必然係深色。

## 量度與私隱

原始量度包括外層對話框、共用內容、分頁、主題欄位同開放 guidance shadow：幾何、捲動界限、生效顏色／字體／佈局值同 Material custom properties。亦會觀察元件登記、頁面目標、本機資源結果、封鎖外部請求、程序身份同關閉結果。Console 文字只記類型同摘要，唔會複製到上載輸出。開頁之前會經固定瀏覽器 routing API 封鎖 loopback 以外嘅頁面 HTTP 請求同全部頁面 WebSocket，呢個唔係作業系統出口防火牆。版本資料等內容可能同即時網站不同，記錄會明確交代。HTTP 同 socket callback 共用 2,000 項上限記錄，明確計算被省略同截短狀態；console 另外有 200 項上限同相同計數。

只上載證據目錄，唔包括來源樹、設定檔、下載輸入、快取、除錯端點或者憑證。畫面只含公開嘅全新設定檔介面；公開重用前仍要檢閱像素同中繼資料。瀏覽器畫面唔證明原生輸入、實體裝置或者 Windows 執行。

## 擁有權與關閉

控制器記錄確實瀏覽器映像、建立 ticks、觀察到嘅子程序同新設定檔識別碼，以有上限等候關閉 context、browser server 同連線，關閉自己嘅 loopback server，並如實報告已記錄程序同設定檔是否仍然存在。唔會遞迴刪除設定檔。只有 ENOENT 先代表程序觀察為不存在；EACCES／EIO 讀取失敗仍屬未知。建立身份不同可以證明原本已記錄程序離開。子程序讀取失敗、單次或累積樹形上限、未觀察瀏覽器樹都唔可以聲稱完整關閉。未知或未完成關閉會保留明確狀態，唔會為 Linux 捏造 Windows desktop 或 HWND。

## 驗證狀態

本機控制器檢查會執行真正路徑界線同靜態位元組准入，包括修改位元組被拒絕及還原後成功；唔啟動瀏覽器，雲端工作流程亦唔會執行呢啲檢查。全新雲端依賴安裝、sandbox 可用性、真正畫面產生、像素檢閱同 Material Design 3 驗收仍等候真實記錄。本文章唔提供已完成畫面。

## 工作流程工作清單

手寫總清單列出 windows/windows、windows/promote、capture-evidence/evidence、pages/deploy 同已停用 publisher/explain，重用各工作流程嘅依賴記錄。只有確實已停用嘅 shell echo 工作可以註明額外 bootstrap 不適用。本機檢查會發現實際工作，拒絕遺漏、未知工作、缺少依賴清單或者 bootstrap 標記。Pages 明確安裝固定 Node 同鎖定靜態套件。全新主機安裝驗證仍然獨立等待；畫面工作流程唔會執行本機檢查。

## 首次雲端啟動與有限修正

工作 38140563614 已核實指定靜態產物並完成依賴安裝，但瀏覽器啟動喺記錄身份或者像素之前失敗。保留嘅訊息雜湊唔足以確定實際執行原因。工作流程以 `--no-shell` 安裝完整 Chromium，原本無指定執行檔嘅 headless 啟動卻會由 Playwright 預設選擇 headless-shell。控制器而家明確啟動同一個已核實位元組嘅完整 Chromium，sandbox 仍然啟用。仍須用修正後來源執行新工作。

啟動前會儲存階段同有限選項；啟動被拒絕時只記錄訊息摘要、固定診斷分類，以及有提供時嘅退出碼或 signal，唔上傳原始訊息、私人路徑或端點。本機注入式 wrapper 檢查只證明選項傳遞同拒絕處理，唔構成瀏覽器、像素或視覺驗收證據。

## 第二次啟動後嘅受支援主機路線

工作 38141498203 使用來源 4cd6b8b2547d9a18fe34e71484d5ecc7132e4022，喺瀏覽器身份建立前記錄 sandbox-rejection 模式同 SIGABRT，冇產生 PNG。底層 namespace 原因仍未證實。專用畫面工作改用受支援 hosted Ubuntu 22.04，保留同一個已核實 Chromium 執行檔、非 root 執行、sandbox、獨立設定檔同靜態輸入。呢個係更換受支援主機路線，唔代表已修好 Ubuntu 24.04 原因。唔會修改 AppArmor、sysctl 或 confinement 設定。

記錄會唯讀觀察平台、kernel、發行版 ID／版本同三項 user-namespace 設定。缺少設定標示 unavailable；讀取失敗保留 unknown 同有限錯誤碼。新執行同視覺驗收仍然等待。官方參考：[Playwright 支援平台](https://playwright.dev/docs/intro) 同 [Chromium namespace 限制](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)。
