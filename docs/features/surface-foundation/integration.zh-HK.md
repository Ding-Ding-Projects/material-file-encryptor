# 基礎介面整合

從 `src/renderer/features/shell/index.js` 匯入 `mountSurfaceFoundation`。所有 Material Web 程式都喺本機 `src/shared/surface/material.js`，冇 CDN 匯入、遠端字型或執行時下載依賴。更改準確依賴後，用 `node scripts/build-surface-vendor.mjs` 重建已納入版本控制嘅套件。若冇快取，工具須透過 npm 取得固定版本 esbuild 0.25.11。呢個工具唔代替根目錄建置入口。

```js
import {mountSurfaceFoundation} from './features/shell/index.js';
const surface = mountSurfaceFoundation({
  host: document.querySelector('main'),
  before: document.querySelector('main > section'),
  storage: localStorage,
  language: 'en',
  provenance: {version: buildMetadata.version, builtAt: buildMetadata.builtAt},
  tabs: [{id:'drive',label:'My drive',labelYue:'我的磁碟'}],
  onActivate: id => showExistingView(id),
  onExport: ({name,mime,content}) => saveUserChosenExport({name,mime,content}),
  commands: [{id:'drive:refresh',label:{en:'Refresh drive',yue:'重新整理磁碟'},run:refreshDrive}]
});
surface.registerViews([{id:'converter',label:{en:'Converter',yue:'轉換工具'},root:converterRoot}]);
surface.registerCommands([{id:'preferences:theme',label:{en:'Dark theme',yue:'深色主題'},
  control:{type:'switch',get:()=>settings.dark,set:value=>saveDarkTheme(value)}}]);
```

範例刻意使用主程式擁有嘅函式。每個命令須呼叫原有控制同一個已驗證操作。登記 `switch`、`checkbox`、`range`、`number`、`select` 或 `text` 時，須提供真實 `get` 同 `set` 回呼，先可喺面板內編輯。數字控制接受 `min` 同 `max`。選擇控制接受 `options: [{value,label:{en,yue}}]`，並開啟有獨立表達式建立器嘅可搜尋內容選單。命令可包含本地化 `description`、`group`、`keywords` 同用於聚焦原有設定嘅 `reveal()`。搜尋涵蓋以上欄位同目前值。每項主程式功能、設定同目的地都須明確登記；元件無法安全地自動探索特權動作。

`registerViews` 接受已掛載檢視根節點，保留目前分頁同已儲存關閉選擇，啟用分頁時切換已登記根節點。新目的地預設開啟，之前關閉嘅目的地重新載入後仍保持關閉；由面板刻意選取會重新開啟。既有檢視仍由主程式 `onActivate` 負責。`setLanguage` 接受 `en`、`yue` 或 `bilingual`，只改元件外框，唔改主程式內容。`setProvenance` 需要綁定建置嘅中繼資料；缺少或無效時間顯示不可用，唔會改用啟動時間。`destroy` 只移除自有外框同監聽器。

分頁儲存於 `mfe.surface.tabs.v1`，最多 100 個已開項目、20 個復原項目同 100 個已儲存關閉目的地 ID。釘選分頁同最後一個已開分頁唔可關閉。內容動作支援釘選、關閉、恢復、移動、選取、關閉其他／右方分頁同選擇命名群組。Ctrl-click 或內容動作可選取多個分頁批次關閉。群組管理器可建立、改名、收合同移除群組，同時保留分頁。Ctrl+W 關閉符合條件嘅目前分頁，Ctrl+Shift+T 恢復一個，Ctrl+Shift+F 開啟面板。相同關閉／恢復快捷鍵亦顯示喺適用內容選單。可見 Tab actions 按鈕提供觸控入口；Shift+F10 同 Context Menu 鍵可從分頁開選單。分頁標籤同群組名稱會儲存，唔好用敏感檔名或秘密值作標籤。

此元件每個搜尋都有相鄰獨立表達式建立器、查詢、旗標同即時狀態。預設係純文字匹配。原始表達式喺專用模組 Worker 執行，150 ms 後終止；模式最多 512 字元，列／範例文字最多 4096 字元，最多 10,000 列。工作台支援引導項目、已跳脫字面插入、原始模式、Unicode 群組、替換預覽、安全處理零寬匹配嘅列舉、擷取值／索引、上一／下一個匹配、字面結構同風險診斷。能力矩陣會探測目前引擎，包括 Unicode 集合操作同行內修飾符。不支援項目仍可見。JavaScript 冇提供內部語法樹或回溯軌跡；可用替代資訊係字面註解、實測 Worker 時間同逾時診斷。

使用者可儲存最多 30 個片段、明確加入最多 20 筆表達式歷史、匯入／匯出片段同複製表達式。儲存按搜尋欄位分隔，鍵為 `mfe.regex.<scope>`；主程式應提供穩定而不同嘅 `scope`。範例永不持久儲存。測試集接受最多 50 個 `{text,match}` 物件，顯示實際同預期結果。無效語法同逾時顯示錯誤並清空結果。同步狀態模型只接受更嚴格安全子集，對不支援結構作回報，唔會喺介面執行緒直接執行。

通知最多 200 筆，本機保存已讀狀態同關閉狀態。使用 `notify({title,message,level})`，`level` 為 `info`、`success`、`warning` 或 `error`。重新載入會清理識別碼、時間同欄位，丟棄任意屬性。明顯憑證賦值會盡力遮蔽，但呼叫者絕不可傳入憑證、秘密金鑰或敏感值。中心可按級別、未讀同本機搜尋篩選，支援已讀／未讀、關閉，同經主程式回呼匯出 JSON 或 CSV。冇回呼時停用匯出。CSV 會跳脫欄位，並喺可能被試算表當公式嘅內容前加前綴。即時區域八秒後清空，但持久通知仍保留。儲存遭拒時仍可喺記憶體運作，但唔保證持久性。

所有元件樣式使用建構式樣式表同繼承 Material 色彩屬性。減少動態效果偏好會停用本機轉場。擁有者須設定主程式／文件主題屬性，並完成實際建置渲染驗證，先可聲稱視覺交付。
