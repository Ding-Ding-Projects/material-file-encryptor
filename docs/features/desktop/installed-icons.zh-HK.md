# 已安裝桌面圖示

桌面程式、Squirrel 安裝及更新啟動器、程式擁有嘅視窗同通知區圖示，全部沿用 `browser-extension/icons/icon.svg` 嘅綠色資料夾鎖標誌。今次只改外觀；執行檔名稱、程式識別碼、保管庫資料、啟動註冊同更新來源全部保持原有設定。

`assets/branding/app.ico` 係真正 ICO，包含 16、20、24、32、40、48、64、128 同 256 像素嘅透明 32 位元 PNG 圖格。`app.png` 提供 256 像素版本。清單記錄統一 LF 換行嘅來源摘要、繪圖工具版本同輸出雜湊；繪圖毋須字型或外部素材。

## 重建及驗證

喺儲存庫以外嘅臨時目錄安裝固定版本工具，再產生已提交素材：

```powershell
npm install --prefix <temporary-tool-directory> --save-exact --ignore-scripts --no-audit --no-fund @resvg/resvg-js@2.6.2
node scripts/desktop-icons.mjs generate <temporary-tool-directory>
node scripts/desktop-icons.mjs check
```

工具由官方 npm registry 下載，套件完整性值係 `sha512-xBaJish5OeGmniDj9cW5PRa/PtmuVU3ziqrbr5xJj901ZDN4TosrVaNZpEiLZAxdfnhAe7uQ7QFWfjPe9d9K2Q==`。保留臨時安裝鎖檔作為重建來源紀錄，唔好將工具安裝目錄複製入程式。一般建置只需 Node 驗證已提交檔案。檢查涵蓋雜湊、完整 ICO 目錄、尺寸、解壓後 RGBA 像素、透明部分同可見不透明圖案。根目錄建置路線及 Forge 封裝前步驟都會執行檢查。

## 封裝及執行路徑

Forge 將 ICO 嵌入 `MaterialFileEncryptor.exe`；Squirrel 嘅 `setupIcon` 使用同一檔案，供安裝及更新執行檔使用。`iconUrl` 指向已包含 ICO 嘅固定完整來源提交 SHA。更換圖案時，先提交並發佈素材，再更新網址；產生安裝程式前必須確認網址回傳完全相同嘅位元組。

最終壓縮修復亦會傳入 `--setupIcon`。Forge 喺 maker 完成後會刪除臨時程式目錄，所以重新組裝直接從完整套件讀取更新器，唔再假設獨立檔案仍然存在。套件必須只有一個不分大小階嘅 `lib/<framework>/squirrel.exe` 項目，包括 NuGet 產生嘅細階檔名；遺失項目、大小階重複項目，以及長度超出 1 位元組至 32 MiB 範圍都會被拒絕。擷取檔案嘅 SHA-256 同長度必須符合套件項目。

放入暫存工具目錄之前，只以資料及資源模式映射 PE，逐位元組核對一組 `RT_GROUP_ICON`、全部九款圖格描述，以及每個引用嘅 `RT_ICON` 內容，確保同核准 ICO 一致。呢個檢查唔會執行更新器。重新組裝會將原始工具複製到隔離目錄，只用已驗證嘅套件位元組取代暫存更新器，再次核對暫存檔案雜湊。最終安裝程式檢查仍要求內嵌更新器符合確切暫存執行檔，原有套件、更新索引同解壓檢查全部保留，原始工具目錄保持不變。呢啲來源檢查唔代表安裝程式已成功產生，亦唔代表已安裝外觀通過。

Forge 將 `assets/branding` 素材複製到 ASAR 以外嘅 `resources/branding`。已封裝版本從 `process.resourcesPath` 解析路徑；開發版本從主模組所在程式根目錄解析，唔依賴啟動目錄。Windows 視窗及通知區用 ICO，其他平台用 PNG。共用建構包裝函式回傳真正原生視窗，並為主視窗、Material 對話框同身分驗證視窗設定圖示，唔改視窗擁有權、權限或生命週期。

原有 Squirrel 安裝及更新流程繼續透過 `Update.exe --createShortcut` 重建捷徑，唔清除系統圖示快取、改寫無關捷徑、搬移用戶資料或更換程式身份。用戶已釘選嘅捷徑可能要等 Windows 更新快取先顯示新圖案。

## 驗證界線

針對性測試涵蓋錯誤二進位格式、損壞及截斷圖格、開發及封裝路徑、三種視窗路線、通知區設定、固定網址，以及原有對話框同安裝生命週期。來源測試唔代表已安裝外觀通過。發佈驗證仍須檢查封裝執行檔、安裝及更新執行檔、根目錄啟動器資源，再透過隔離路線檢視真實安裝後嘅開始功能表、桌面、工作列、通知區同對話框圖示。遺失檔案或圖示驗證失敗會停止封裝，唔會靜靜轉用通用圖示。素材冇私人路徑或用戶內容，執行時毋須網絡下載。
