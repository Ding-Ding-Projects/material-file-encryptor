# Browser extension

The Material File Encryptor browser extension proposes downloads to the paired desktop application and gives a local workspace in Microsoft Edge and Google Chrome. It never opens a vault, mounts a drive or handles plaintext file contents.

## Getting it

The extension is not in a browser store and has no separate download. It ships inside the desktop installer: download `MaterialFileEncryptor-Setup.exe` from the [latest release](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/latest) and install it. The extension files are in the installed application's `resources\browser-extension` folder. Open the browser's extensions page, turn on developer mode, choose **Load unpacked** and select that folder. Load the folder again after each desktop update, because every update installs a new `app-<version>` folder. The installer and the extension are unsigned.

## Workspace tabs

- **Connection**: pairing with the desktop and download proposals. Pairing needs approval in the unlocked desktop, and every transfer is confirmed there.
- **Personalization**: language (English, Cantonese or bilingual), theme, accent colour and playfulness levels, stored only in the extension.
- **Changelog, Notes, Documentation and Support**: the bundled changelog, local notes, the complete offline documentation and local support tickets. Nothing is sent anywhere automatically.
- **Dim sum**: the public dim sum catalogue, loaded from GitHub only when requested.
- **Models**: a local model server on `127.0.0.1` (Ollama), after the optional loopback permission is granted. Installed models, pulls with progress, confirmed deletion and streamed chat rendered as safe rich text. Conversations stay in the page.
- **Status**: the staged version and source, the food code name of the published release (read from release notes on request), a verified desktop installer link, and the extension's feature coverage list.

## Limits

Features that need the desktop's authority, such as the authenticator, element locks, shared mode, server management and Status Hub enrollment, stay unavailable until an authenticated browser-to-desktop channel is approved and built. The proposal is in [docs/design/browser-desktop-channel.md](https://github.com/Ding-Ding-Projects/material-file-encryptor/blob/main/docs/design/browser-desktop-channel.md). The coverage list in the Status tab shows what the project records for each feature; a record is not proof of delivery.

Full articles: [Browser extension workspace](https://ding-ding-projects.github.io/material-file-encryptor/articles/docs--features--workflows--browser-extension-workspace.html) and [Browser extension local models](https://ding-ding-projects.github.io/material-file-encryptor/articles/docs--features--workflows--browser-extension-local-models.html).

## 繁體廣東話

Material File Encryptor 瀏覽器擴充功能會將下載建議交畀已配對嘅桌面程式，並喺 Microsoft Edge 同 Google Chrome 提供本機工作區。佢從來唔會開啟保險庫、掛載磁碟或者處理檔案明文內容。

**取得方法：**擴充功能冇上架瀏覽器商店，亦冇獨立下載檔，係跟住桌面安裝程式一齊派發。喺[最新發行版](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/latest)下載 `MaterialFileEncryptor-Setup.exe` 安裝，擴充功能檔案喺已安裝程式嘅 `resources\browser-extension` 資料夾。打開瀏覽器嘅擴充功能頁面，開啟開發人員模式，揀**載入未封裝項目**再揀嗰個資料夾。每次桌面更新都會裝新嘅 `app-<version>` 資料夾，所以更新之後要重新載入。安裝程式同擴充功能都冇簽署。

**工作區分頁：**連線（配對同下載建議，傳輸一定喺桌面確認）、個人化、更新記錄、筆記、說明文件、支援、點心目錄（只喺要求時由 GitHub 載入）、模型（只連 `127.0.0.1` 嘅本機模型伺服器，對話唔會儲存）同狀態（暫存版本、發行版代號、經核實嘅安裝程式連結同功能覆蓋清單）。

**限制：**驗證器、元素鎖、共享模式、伺服器管理同 Status Hub 登記等需要桌面授權嘅功能，要等經審批嘅已驗證瀏覽器至桌面通道建成先可以用。狀態分頁嘅覆蓋清單只係項目記錄，唔代表已經交付。
