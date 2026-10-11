# 原生 Ollama 主程序邊界

`src/main/ollama-host.js` 為執行環境同設定轉接器提供原生對話框、信任、專屬目錄同外部連結回呼。佢唔負責 IPC 接線、修改全程序設定、下載檔案，亦唔會執行目標程式作信任探測。

```js
const host = createNativeOllamaHost({
  dialog, getWindow, openExternal, credentials, dataDirectory,
  reviewedManifests: [], publisherPolicies: [],
});
await host.initialize();
const runtime = createRuntimeController(host.runtimeOptions);
const service = createOllamaService({
  dataDir: path.join(dataDirectory, 'local-models'),
  ...host.serviceOptions,
  runtimeController: runtime,
});
```

工作目錄根位置固定係 `dataDirectory/local-models/profiles`。每次建立子目錄前都檢查現有父目錄。原生選擇拒絕重新導向路徑、符號連結、非目錄選項，同根位置之外嘅資料夾。執行檔選擇只接受真實普通 `ollama.exe`，然後套用實際信任規則；基本檔名唔等於信任。

## 預設信任限制

官方 Windows 文件說明安裝位置同支援啟動行為；官方發行版提供封存檔雜湊。兩者單獨都唔能夠證明精確 Authenticode 發佈者身分，或者解壓執行檔嘅雜湊。本實作刻意唔附帶猜測發佈者身分，亦冇虛構執行檔資訊清單。兩份信任清單都係空白時，即使偵測到安裝，執行仍然停用。

第一手來源：[官方 Windows 文件](https://docs.ollama.com/windows)、[官方發行版](https://github.com/ollama/ollama/releases)。絕不可以用封存檔摘要代替解壓成員摘要。

已建立發佈者規則包含精確憑證 subject、可選精確憑證 thumbprint，同官方來源 URL。主程序必須獨立取得同審閱來源，先可以提供。原生檢查器用固定系統 PowerShell 執行檔讀取 `Get-AuthenticodeSignature`，拒絕非 Valid 簽署，並逐字比較完整 subject。佢絕不執行被檢查檔案。

## 明確固定資訊清單路徑

只供主程序使用嘅已審閱資訊清單包含：

```json
{
  "sha256": "<exact extracted executable SHA-256>",
  "bytes": 123,
  "version": "<reviewed release version>",
  "sourceUrl": "https://github.com/ollama/ollama/releases/download/<tag>/<asset>",
  "artifactSha256": "<verified source archive SHA-256>",
  "member": "ollama.exe"
}
```

資訊清單係整合者提供嘅可信設定，唔係渲染程序上載內容，亦唔係執行檔自己嘅聲稱。佢必須根據已審閱官方來源，同獨立驗證封存檔解壓結果產生。單純加個似官方嘅 URL，唔能夠證明來源。建構器預設清單仍然空白。獨立匯出嘅 [已審閱發行常數](./release-provenance.md)，可以喺主程序整合審閱後明確傳入。

選定內容吻合已提供審閱清單時，原生確認會顯示精確路徑、執行檔摘要、來源封存檔摘要、版本同來源。預設係取消。確認後會再次計算執行檔雜湊；內容改變會阻止批准。受保護儲存用 `profile:ollama-trust:<manifest identity>` 記錄批准。之後每次驗證同啟動前檢查，都重新讀檔比較當前雜湊。單靠選取唔會批准。整合者必須保留 `profile:` 紀錄唔可以經渲染程序憑證讀取存取嘅邊界。

雜湊檢查收窄替換時間範圍，但唔係作業系統執行檔控制代碼鎖。原生套件安裝權限同主機檔案系統邊界仍然必要；本模組唔會聲稱能擊敗有能力喺驗證同建立程序之間替換路徑嘅同帳戶攻擊者。

## 外部導覽同驗證

## 本機端點設定

原生建構器接受 `loopbackPort`，必須係 1024 至 65535 嘅整數，預設 11434。唔接受渲染程序提供主機名稱、URL、環境映射或模型目錄路徑。`runtimeOptions` 同 `serviceOptions` 分別將該連接埠傳畀執行環境控制器同 API 用戶端。健康探測、固定啟動驗證同原生執行確認使用同一端點。設定指令亦使用該端點。

新嘅自有執行環境啟動會將 `OLLAMA_MODELS` 設為 `dataDirectory/local-models/runtime-models`。啟動前即時以同設定儲存相同嘅標準無重新導向邊界建立同檢查目錄。唔會遷移或修改現有外部執行環境嘅模型儲存。`host.managedModelDirectory` 同 `host.initializeModels()` 可供原生硬件量度同啟動準備使用。

執行環境狀態公開 `endpoint`、`managedModelStoreConfigured` 同 `managedModelStore`。最後一個欄位只喺此控制器擁有一次執行環境啟動後先係 true，唔會只因外部 API 有回應就變成 true。`runtime.dispose()` 只停止佢回傳嘅自有程序；服務銷毀會先取消並等待未完成 API 操作，再銷毀執行環境。外部執行環境唔會被停止。

每個建構實例嘅設定不可改變。桌面擁有者必須強制閒置狀態、顯示原生確認、銷毀舊服務同自有執行環境、原子保存選定數值連接埠，再重新建立兩個物件。渲染程序呼叫可選嘅 `services.ollama.configureRuntime({port})` 桌面橋接。瀏覽器轉接器唔可以公開呢項特權設定操作。介面顯示實際端點同受管理儲存狀態。有未完成請求時唔可以改設定。

執行環境啟動同每次設定執行，都要求原生確認，列明可信執行檔、固定動作同回送邊界。預設係取消，建立程序之前會拋出 `USER_CANCELLED`。渲染程序確認欄位唔可以代替此對話框。設定轉接器同服務啟動器匯出共用同一包裝。信任驗證保持唯讀，絕不顯示提示；底層啟動器喺執行確認後再次核對信任。

只接受精確 `https://ollama.com/download/windows`，開啟前會原生確認。唔會下載或執行安裝程式。測試使用合成、不可執行檔案同注入簽署回應，涵蓋缺失信任、明確批准、內容改動、資料夾範圍同固定 URL 確認。佢哋唔會建立真實 Ollama 發佈者身分，亦唔聲稱真實執行環境啟動。
