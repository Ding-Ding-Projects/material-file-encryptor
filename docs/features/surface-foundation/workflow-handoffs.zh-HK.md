# 文件流程同原生交接

可選 `workflow-tools.js` 介面係可操作文件編輯器，包含本機預設同原生檔案／編輯器／下載交接。佢掛載喺既有應用程式內，唔代替初始檔案工作區。

```js
import {mount} from './shared/surface/workflow-tools.js';
const view = mount(host, {
  translate,
  services: {
    storage: localStorage,
    getLanguage: () => currentLanguage,
    request: (action, payload) => nativeWorkflowRequest(action, payload),
    subscribe: callback => subscribeWorkflowEvents(callback),
  },
});
```

主程式將 `request` 對應至 `createWorkflowServices(...).dispatch(action, payload)`。瀏覽器配套只可經已配對、已驗證動作允許清單提供此橋接。元件絕不選擇 shell 命令、任意執行參數或特權瀏覽器路徑。`refresh()` 重新載入主程式清單而唔替換編輯器欄位；`refreshLabels()` 喺更改語言後更新已知標籤；`destroy()` 取消已開確認介面同訂閱。

## 原生服務合約

用 `createWorkflowServices({dataDirectory, dialog, getWindow, openExternal, openPath, emit, forgeAccounts, forgeOwners})` 建立後端。可選簽章檢查器預設使用既有原生 Authenticode 檢查器。可選傳輸、DNS 查詢同編輯器啟動介面只供確定性主程式測試，絕不可向渲染請求暴露。

| 動作 | 輸入同行為 |
| --- | --- |
| `documents`, `pickDocument`, `pickProject` | 列出工作階段授權，或透過原生檔案／資料夾選擇器產生不透明識別碼。渲染程序提供嘅路徑永不構成檔案系統授權。 |
| `readDocument` | `{id}` 傳回 `{id,name,text,revision}`，限最多 256 KiB 普通 UTF-8 檔案。 |
| `saveDocument` | `{id,text,revision}` 替換前核對原始版本；寫入使用同目錄暫存檔同原子改名。 |
| `createDocument` | `{name,text}` 由原生選擇目的地，建立新檔，唔覆寫現有檔案。 |
| `templates` | 傳回內附空白文字、Markdown 筆記同 JSON 物件起始內容。 |
| `editors`, `pickEditor` | 探測支援編輯器，或授權所選已簽署執行檔。支援 VS Code、VS Code Insiders 同 Notepad。啟動前驗證 Microsoft 發行者簽章同目前檔案雜湊。每次雜湊最多讀 64 KiB，驗證期間發現身份或內容大小改變會拒絕。 |
| `openEditor`, `openInCode` | 用固定參數建構、無 shell 方式開啟已授權文件或專案。Notepad 唔開專案資料夾；`openInCode` 特別要求 VS Code 或 Insiders。 |
| `editorDownload` | 使用者明確操作後，開啟固定官方 VS Code 下載頁。 |
| `downloads`, `prepareDownload` | 列出傳輸，或為 `{url}` 選擇原生目的地。準備唔會開始傳輸。 |
| `startDownload`, `cancelDownload` | `{id}` 啟動或取消真實佇列傳輸，同一時間只執行一個。 |
| `accounts`, `owners` | 從主程式已驗證帳戶服務讀取清理後帳戶／擁有者中繼資料，永不傳回憑證。 |
| `prepareHandoff` | `{documentId,accountId,ownerId,route}` 準備本機審閱文件。路徑為 `copy-push`，或所選擁有者支援時先可用 `fork`。 |
| `exportHandoff`, `openHandoff` | `{id}` 匯出至原生選擇新檔，或開啟私人本機交接。匯出傳回可經 `openInCode` 開啟嘅已授權文件 ID。兩者都唔會發布內容。 |

`emit('workflow', {type:'download', item})` 回報真實傳輸狀態、位元組、可選總量／速率／預計剩餘時間同錯誤。`pending` 計算未完成工作。`cancelAll()` 中止進行中傳輸；`close()` 阻止新派發、取消傳輸，等候自有工作結束，再清除授權。

## 邊界同失敗行為

文字嚴格按 UTF-8 解碼。輸入同預設文字使用同一位元組限制。驗證、版本核對或暫存寫入失敗時，既有檔案保持原狀。建立新檔用獨佔硬連結安裝，避免覆寫同時建立嘅檔案；檔案系統唔支援時傳回真實錯誤，唔改用可能半完成寫入。

下載只限 HTTPS、最多 256 MiB、120 秒同三次重新導向。每次請求前解析目的地主機名稱；拒絕回送、私人、連結本機、多播同保留／測試位址範圍，重新導向會重複檢查。IPv6 分類使用數值前綴，等價補零或壓縮表示會有相同結果。過渡同特殊用途 IPv6 範圍保守排除。已檢查位址經請求 lookup 回呼固定。下載位元組唔會執行。完成傳輸只安裝喺新目的地；取消同失敗會移除同目錄暫存檔並保留原有檔案。暫停／繼續明確不可用，支援控制係取消同重試。

文件篩選器可收合並保存狀態；已收合但生效嘅篩選會喺摘要註明。可編輯文字欄位有專用清除控制，沿用相同輸入路徑。預設只喺使用者選擇後填入空白編輯器。替換未儲存內容須分別操作兩個確認鍵同全程滑桿，再按 Execute。Escape、Emergency exit 同擁有者銷毀會取消確認，完成狀態會喺關閉前顯示。

## 驗證同餘下範圍

聚焦測試涵蓋原生授權邊界、嚴格位元組限制、過時寫入保留、取消同單一傳輸、重新導向 DNS 拒絕、編輯器身份同固定參數、本機專用託管平台準備，以及真實確認回呼控制。DOM 固定資料用真實後端同暫存檔執行瀏覽、清除同儲存。呢啲唔係封裝執行時、原生選擇器互動或視覺證據。

元件唔實作託管平台登入／帳戶管理或自動發布，只消費既有已驗證主程式帳戶清單，產生可審閱交接。冇清單嘅主程式顯示明確不可用。原生編輯器同文件授權限於工作階段；偵測到嘅已安裝編輯器 ID 穩定，手動選擇可攜編輯器重新啟動後須再選。

瀏覽器擴充下載擷取合約另行處理：此元件冇瀏覽器擴充、跨應用程式置頂視窗，亦冇擴充發起開始／進度／完成介面嘅證據。整合後仍須完整原生版面、鍵盤、螢幕閱讀器、減少動態效果同多語執行時擷取。準備交接文字包含所選路徑並禁止破壞性版本庫復原，但唔證明任何版本庫已複製、分叉或發布。

## 主程式整合範例

登記一個可選文件檢視，並使用既有功能橋接：

```js
import {mount as mountWorkflow} from '../../shared/surface/workflow-tools.js';
const workflow = mountWorkflow(panel, {
  translate: canonicalTranslate,
  services: {
    storage: localStorage,
    getLanguage: () => language,
    request: (action, payload) => window.drive.featureRequest('workflow', action, payload),
    subscribe: callback => window.drive.onFeatureEvent('workflow', callback),
  },
});
// Call after language changes without recreating editor state.
workflow.refreshLabels();
// Call when the owning view is permanently disposed.
workflow.destroy();
```

主處理程序派發器須喺正常寄件者驗證後，只將列明 `workflow` 動作送往服務 `dispatch`。每個應用程式生命週期建立一個服務，經既有功能事件傳輸轉送 `emit(feature,event)`，喺進行中操作狀態包含 `pending`，明確取消全部時呼叫 `cancelAll()`，退出時等候 `close()`。只有真正已驗證託管平台整合先可提供帳戶中繼資料介面。空帳戶清單係受支援狀態，唔可用虛構已登入帳戶取代。

已配對瀏覽器介面須明確允許同一組動作名稱，並保留正常驗證要求。冇原生流程服務嘅純瀏覽器主程式保持未連線，唔可虛構原生選擇器授權，亦唔可將原始檔案系統路徑當授權。
