# 功能文件

## 儲存同磁碟

- [加密儲存同離線快取](storage/native-vault.md)
- [歷史同資源回收筒](storage/history-and-recycle-bin.md)
- [所選檔案版本同加密活動](storage/file-history-activity.md)
- [受管理傳輸、日誌同安全生命週期](storage/transfer-lifecycle.md)
- [加密 Git 傳輸](storage/git-transport.md)
- [Windows Explorer 磁碟同原生協定](drive/README.md)

## 桌面工作流程

- [共用分頁、搜尋、命令列同通知](surface-foundation/README.md)
- [語言、旁白、排程同注意力模式](interface/local-personalization.md)
- [元素外觀編輯器同標誌自訂](interface/appearance-editor.md)
- [本機個人用語](interface/personal-vocabulary.md)
- [存取、驗證器同支援台](access/local-access.md)
- [本機檔案轉換器](converter/README.md)
- [已審閱精簡媒體元件](converter/minimal-component.md)
- [外部排程來源](schedules/external-sources.md)
- [本機模型套件](ollama/README.md)
- [離線文件、變更記錄、狀態同交付清單](platform/documentation-and-status.md)
- [現代介面同可清除欄位](interface/modern-fields.md)
- [啟動註冊讀回](interface/startup-registration.md)

## 驗證同交付

- [原生輔助程式測量同嚴格限制](performance/native-helper.md)
- [桌面封裝同驗證](desktop/README.md)
- [預覽驗證同交付](release/preview-verification.md)
- [目前整合狀態](platform/current-integration.md)
- [原生更新控制器同復原邊界](release/native-update-controller.md)
- [桌面更新工作區](surface-foundation/updates-panel.md)
- [介面設計](../../DESIGN.md)

每篇文章分清來源實作、專項檢查、主程序整合同真實執行驗收。功能交付清單將全部 208 個桌面／網站列保留為未驗證，直到完整證據存在。歷史畫面擷取同發行版保留原始來源邊界。

本應用程式冇引入公開 HTTP API。原生 JSONL 通道同有權限功能橋接都係本機協定，唔係公開網絡 API。本機模型服務使用 Ollama API，狀態模組使用已設定服務。呢啲模組唔適用新 Postman collection。
