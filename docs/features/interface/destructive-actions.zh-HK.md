# 破壞性操作

桌面程式、瀏覽器擴充功能同說明網站入面每一個破壞性操作，執行之前都要先過雙鑰匙超級確認。破壞性操作包括刪除、清空、覆寫、重設、撤銷、中斷連線、停止、重新啟動、覆蓋現有檔案安裝，或者以其他方式令已儲存資料或運行中服務出現無法簡單還原嘅改變。

## 確認會做乜

- 確認介面建立喺每個介面自己嘅畫面層，以對話框顯示；控制項可以承載嘅話，就會喺該控制項隔籬以面板顯示（`anchor` 模式）。
- 會用登記咗嘅英文、廣東話或者雙語文字，講明確切操作同受影響嘅資料。趣味程度設定不會改寫呢啲安全事實。
- 兩個獨立操作嘅鑰匙都要開啟，全幅滑桿先會啟用。關掉任何一個鑰匙，滑桿會再停用並歸零。
- 兩個鑰匙都開啟同滑桿完成之後，操作先會執行。進度同完成都有動畫；`prefers-reduced-motion` 會移除動態，但狀態仍然會改變。
- 一定提供 `Emergency exit`，按 `Escape` 或者返回亦可以不作更改離開。之後焦點會回到發出要求嘅控制項。

## 位置

- 桌面同網站: `src/shared/surface/workflow-confirm.js`（`requestSuperConfirmation` 同 `confirmDestructiveAction`），面板內版本喺 `src/renderer/features/access/index.js`。
- 瀏覽器擴充功能工作區: `browser-extension/options.html` 入面嘅確認對話框，由 `browser-extension/options.js` 驅動。
- 瀏覽器擴充功能彈出視窗: `browser-extension/super-confirm.js`。
- 登記處: `src/shared/destructive-actions.js`。擴充功能副本係 `browser-extension/destructive-confirm.js`。

## 守衛

執行 `node scripts/audit-destructive-actions.mjs`。已登記操作失去確認呼叫或者處理程式標記、類似破壞性嘅要求／處理程式／頻道名稱既未登記又冇書面理由嘅豁免、登記項目格式錯誤，以及擴充功能副本同共用登記處不一致，守衛都會失敗。`test/destructive-actions-audit.test.js` 會逐一植入呢啲錯誤，並要求必須有發現。行為由 `test/destructive-confirmation-behaviour.test.js` 同 `test/extension-super-confirm.test.js` 涵蓋。

## 清單

已登記操作：合共 62 個。桌面程式 38 個、瀏覽器擴充功能 21 個、說明網站 26 個。共用模組會喺每個掛載佢嘅介面計算。

### 桌面程式

| 登記編號 | 操作 | 原始碼檔案 |
| --- | --- | --- |
| `desktop.force-lock` | 強制鎖定磁碟 | `src/renderer/app.js` |
| `desktop.empty-recycle-bin` | 清空資源回收筒 | `src/renderer/app.js` |
| `desktop.release-offline-copy` | 移除離線副本 | `src/renderer/app.js` |
| `desktop.resplit-files` | 重新分割所有檔案 | `src/renderer/app.js` |
| `desktop.forget-saved-credential` | 關閉自動解鎖 | `src/renderer/app.js` |
| `desktop.pack-storage` | 整合加密儲存 | `src/renderer/app.js` |
| `desktop.install-update` | 安裝更新並重新啟動 | `src/renderer/app.js` |
| `desktop.reset-vocabulary` | 重設個人用詞 | `src/renderer/app.js` |
| `desktop.import-vocabulary` | 匯入用詞覆蓋目前用詞 | `src/renderer/app.js` |
| `desktop.ollama-stop-runtime` | 停止本機模型執行環境 | `src/renderer/features/ollama/index.js` |
| `desktop.server-stop` | 停止伺服器 | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-restart` | 重新啟動伺服器 | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-change-setting` | 更改伺服器設定 | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.server-install-plugin` | 安裝伺服器外掛 | `src/renderer/features/server-manager/targets-panel.js` |
| `desktop.clear-schedule-credential` | 清除排程憑證 | `src/renderer/features/personalization/index.js` |

### 共用模組（桌面程式同網站工作區）

| 登記編號 | 操作 | 原始碼檔案 |
| --- | --- | --- |
| `desktop.restore-version` | 還原舊版本 | `src/renderer/app.js` |
| `desktop.replace-converter-output` | 取代輸出檔案 | `src/renderer/app.js` |
| `desktop.sign-out-account` | 登出揀選嘅帳戶 | `src/shared/surface/publication-panel.js` |
| `desktop.discard-unsaved-text` | 捨棄未儲存嘅文字 | `src/shared/surface/workflow-tools.js` |
| `desktop.ollama-delete-model` | 刪除已安裝嘅模型 | `src/renderer/features/ollama/index.js` |
| `desktop.ollama-delete-session` | 刪除已儲存嘅對話 | `src/renderer/features/ollama/index.js` |
| `desktop.access-remove-lock` | 移除鎖定 | `src/renderer/features/access/index.js` |
| `desktop.access-remove-authenticators` | 移除驗證器 | `src/renderer/features/access/index.js` |
| `desktop.access-remove-ticket` | 移除本機個案 | `src/renderer/features/access/index.js` |
| `desktop.access-remove-selected-tickets` | 移除揀選嘅本機個案 | `src/renderer/features/access/index.js` |
| `desktop.access-history-retention` | 更改記錄保留期 | `src/renderer/features/access/history-view.js` |
| `desktop.access-history-prune` | 清理過期記錄 | `src/renderer/features/access/history-view.js` |
| `desktop.access-history-restore` | 還原記錄項目 | `src/renderer/features/access/history-view.js` |
| `desktop.reset-settings` | 重設偏好設定 | `src/shared/local-ux/settings-reset.js` |
| `desktop.import-settings` | 匯入設定覆蓋目前設定 | `src/renderer/features/personalization/index.js` |
| `desktop.reset-display-name` | 重設顯示名稱 | `src/renderer/features/personalization/index.js` |
| `desktop.remove-schedule` | 移除排程規則 | `src/renderer/features/personalization/index.js` |
| `desktop.remove-local-snapshot` | 移除本機快照 | `src/renderer/features/personalization/index.js` |
| `desktop.history-prune` | 清理過期本機記錄 | `src/renderer/features/personalization/history.js` |
| `desktop.history-restore` | 還原記錄項目 | `src/renderer/features/personalization/history.js` |
| `desktop.reset-appearance` | 重設所有外觀 | `src/renderer/features/personalization/appearance.js` |
| `desktop.import-appearance` | 匯入外觀覆蓋目前外觀 | `src/renderer/features/personalization/appearance.js` |
| `desktop.reset-logo` | 重設標誌 | `src/renderer/features/personalization/logo.js` |

### 瀏覽器擴充功能

| 登記編號 | 操作 | 原始碼檔案 |
| --- | --- | --- |
| `extension.reset-settings` | 重設瀏覽器設定 | `browser-extension/options.js` |
| `extension.clear-history` | 清除記錄 | `browser-extension/options.js` |
| `extension.delete-notes` | 刪除筆記 | `browser-extension/options.js` |
| `extension.delete-ticket` | 刪除個案 | `browser-extension/options.js` |
| `extension.delete-model` | 刪除本機模型 | `browser-extension/options.js` |
| `extension.clear-chat` | 清除對話 | `browser-extension/options.js` |
| `extension.clear-wording` | 清除用詞 | `browser-extension/options.js` |
| `extension.import-wording` | 匯入用詞覆蓋已儲存用詞 | `browser-extension/options.js` |
| `extension.remove-logo` | 移除標誌 | `browser-extension/options.js` |
| `extension.discard-recording` | 捨棄錄影 | `browser-extension/options.js` |
| `extension.disconnect` | 同桌面程式中斷連線 | `browser-extension/options.js` |
| `extension.popup-disconnect` | 同桌面程式中斷連線 | `browser-extension/popup.js` |
| `extension.cancel-editor-request` | 取消要求並中斷連線 | `browser-extension/options.js` |
| `extension.converter-disconnect` | 停止等候並中斷連線 | `browser-extension/converter.js` |
| `extension.server-stop` | 停止伺服器 | `browser-extension/servers.js` |
| `extension.server-restart` | 重新啟動伺服器 | `browser-extension/servers.js` |
| `extension.server-change-setting` | 更改伺服器設定 | `browser-extension/servers.js` |
| `extension.server-install-plugin` | 安裝伺服器外掛 | `browser-extension/servers.js` |
| `extension.cancel-schedule` | 取消預定改動 | `browser-extension/options.js` |
| `extension.discard-operation` | 捨棄已儲存嘅操作 | `browser-extension/operations-panel.js` |
| `extension.discard-all-operations` | 捨棄所有已儲存嘅操作 | `browser-extension/operations-panel.js` |

### 說明網站

| 登記編號 | 操作 | 原始碼檔案 |
| --- | --- | --- |
| `site.clear-vocabulary` | 清除個人用詞 | `docs/site/site.js` |
| `site.clear-workspace-vocabulary` | 清除私人用詞 | `docs/site/workspace.js` |
| `site.reset-visitor-records` | 重設訪客記錄 | `docs/site/visitor-access.js` |

## 原生提示同豁免

原生同意提示保持原生，因為呢啲係擁有者對介面以外要求嘅同意：

- `native.browser-pairing` in `src/main/browser-native-host.js`: 桌面主程序入面嘅配對同確認提示。
- `native.quit-dialog` in `src/main/main.js`: 程式結束時停止伺服器，係擁有者已經揀咗嘅結束對話框嘅一部分。
- `native.driver-install` in `src/main/main.js`: 安裝檔案系統驅動程式會啟動原生安裝程式，由佢自己顯示提升權限同意；只會加入元件，不會移除任何嘢。
- `native.tray-menu` in `src/main/main.js`: 系統匣選單係作業系統選單，無法承載確認介面；其鎖定項目係一般鎖定、結束項目會打開結束對話框、取消項目只會取消進行中嘅工作。

睇落似破壞性但其實唔係嘅名稱，會連同理由列喺 `EXEMPT_ACTIONS` 同 `EXEMPT_IN_FILES`。包括取消進行中嘅工作、隱藏配對碼、還原已刪除項目、只改草稿嘅編輯，以及登記操作底下嘅低層呼叫。覆核呢啲理由係覆核此功能嘅一部分。

## 驗證

檢查係使用 DOM 替身嘅確定性原始碼同元件檢查，並非已安裝執行環境、已建置介面或輔助技術驗收，今次改動亦未有為新面板拍攝版面擷取。
