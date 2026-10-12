// Neutral, deterministic design fixtures. Never product records or acceptance.
// Tuple: title, Cantonese title, explanatory fact, Cantonese fact, control kind,
// control label, Cantonese label, next reference state.
export const scenarios = {
  popup: {
    checking:['Checking connection','檢查連線','Waiting for a bounded response. Pairing is not yet known.','等待有時限嘅回覆，配對狀態仍然不明。','busy','Checking','檢查中','unpaired']
  },
  transfers: {
    empty:['No handoffs yet','未有交接','A selected public HTTPS link enters native review only after pairing.','配對後揀選公開 HTTPS 連結先會進入原生檢閱。','empty','Preview a pending handoff','預覽待處理交接','awaiting-confirmation'],
    'bulk-preview':['Review selected records','檢閱所選記錄','Design selection: 2 transfer records. Clearing records does not cancel native transfers.','設計選取：2 筆傳輸記錄。清除記錄唔會取消原生傳輸。','selection','Include completed records','包括已完成記錄','empty'],
    'retry-unavailable':['Retry unavailable','重試不可用','The native connection has no valid paired session. Reconnect before deliberately proposing the link again.','原生連線未有有效配對。重新連線後先自行再次提出連結。','unavailable','Retry transfer','重試傳輸','unknown']
  },
  settings: {
    language:['Language and voice','語言與語氣','The language selection applies to both extension pages. Each voice level keeps message facts unchanged.','語言選擇會套用至兩個擴充功能頁面。各語氣級別保持訊息事實不變。','language','Language','語言','vocabulary-empty'],
    'vocabulary-empty':['No vocabulary loaded','未載入個人詞彙','Select a local JSON file. No built-in mappings or sample private entries are provided.','請揀選本機 JSON 檔案。唔會提供內置對照或私人示例。','file','Choose local JSON','揀選本機 JSON','vocabulary-validating'],
    'vocabulary-validating':['Validating the entire file','驗證整個檔案','No replacement is applied before schema, duplicate-key, size and depth checks finish.','完成結構、重複鍵、大小同深度檢查前唔會套用取代。','busy','Validation in progress','正在驗證','vocabulary-loaded'],
    'vocabulary-loaded':['Private vocabulary active','私人詞彙已啟用','Only generic loaded state is visible here. No payload or source-file metadata is displayed.','呢度只顯示一般載入狀態，唔會顯示內容或來源檔案資料。','choice','Replace or clear local vocabulary','取代或清除本機詞彙','vocabulary-replace'],
    'vocabulary-invalid-prior-valid':['File not applied','未套用檔案','The rejected file changed nothing. The previously validated local cache remains active.','未通過驗證嘅檔案冇改變任何內容，之前有效嘅本機快取繼續使用。','invalid','Choose a different file','揀選另一個檔案','vocabulary-replace'],
    'vocabulary-invalid-empty':['Original wording retained','保留原有用字','The file was rejected and no valid previous cache exists. Use a supported local JSON file.','檔案未通過驗證，而且冇有效舊快取。請使用受支援嘅本機 JSON 檔案。','invalid','Choose local JSON','揀選本機 JSON','vocabulary-empty'],
    'vocabulary-replace':['Replace local vocabulary','取代本機詞彙','Keep the current valid cache until the replacement passes every check. Cancel leaves it unchanged.','新檔案通過所有檢查前保留目前有效快取，取消唔會改變內容。','file','Choose replacement JSON','揀選取代用 JSON','vocabulary-loaded'],
    'vocabulary-cleared':['Original wording restored','已還原原有用字','The private cache and derived mappings are purged. No source filename is retained.','私人快取同衍生對照已清除，唔會保留來源檔名。','empty','Choose local JSON','揀選本機 JSON','vocabulary-empty'],
    'vocabulary-cache-corrupt':['Saved vocabulary unavailable','已存詞彙不可用','Cache revalidation failed. Original shipped wording is active; no partial entries are used.','快取重新驗證未通過。現正使用原有用字，唔會套用部分條目。','invalid','Replace the local cache','取代本機快取','vocabulary-empty'],
    'shared-mode-unavailable':['Shared mode unavailable','共用模式不可用','The current native protocol cannot read or watch the shared record. An independent switch would be misleading.','現有原生協定未能讀取或監察共用記錄，獨立開關會誤導使用者。','unavailable','Change shared mode','更改共用模式','shared-mode-active'],
    'shared-mode-active':['Shared mode active','共用模式已啟用','English-only reference. Hidden language, vocabulary and food features are absent. Native unlock remains unavailable.','此參考只顯示英文。隱藏嘅語言、詞彙同食物功能不存在，原生解鎖仍不可用。','unavailable','Unlock shared mode','解鎖共用模式','shared-mode-unavailable'],
    appearance:['Appearance inspector','外觀檢查器','Edit one selected extension element. A changed preview does not change package identity.','編輯一個已選擴充功能元素。更改預覽唔會改變套件身分。','appearance','Element appearance','元素外觀','logo-invalid'],
    'logo-invalid':['Logo conversion rejected','標誌轉換未通過','Keep the previous valid mark. The selected bytes failed bounded image validation; no partial result is applied.','保留之前有效標誌。所選內容未通過有限制圖片驗證，唔會套用部分結果。','invalid','Choose another image','揀選另一張圖片','appearance'],
    attention:['Attention preferences','專注偏好','Five independent modes are off by default. They change presentation without hiding outcomes or judging the user.','五個獨立模式預設關閉，只改變顯示方式，唔會隱藏結果或評價使用者。','attention','Attention modes','專注模式','language'],
    schedules:['Schedule appearance','排程外觀','Design timezone: UTC. End-exclusive local intervals; cross-midnight and daylight-saving choices require explicit review.','設計時區：UTC。本機時間區間唔包括結束時間，跨午夜同夏令時間選擇需要明確檢閱。','schedule','Schedule rule','排程規則','schedule-source-unavailable'],
    'schedule-source-unavailable':['External source unavailable','外部來源不可用','Direct network requests remain disabled. A validated native source adapter and credential-vault access are required.','直接網絡要求維持停用，需要有效原生來源介面同憑證儲存庫存取。','unavailable','Connect external source','連接外部來源','schedules'],
    'voice-unavailable':['Requested voice unavailable','所選語音不可用','Keep the saved voice identity. Explain the effective fallback or missing language voice; do not silently reset the choice.','保留已存語音身分。說明實際後備語音或缺少語言語音，唔會靜默重設選擇。','voice','Narration','語音導讀','language']
  },
  capabilities: {
    unavailable:['Native tool capabilities unavailable','原生工具能力不可用','The current broker only handles download handoff. No broader tool operation is permitted.','現有橋接只處理下載交接，唔容許更廣泛工具操作。','unavailable','Set up tool capabilities','設定工具能力','converter-empty'],
    'converter-empty':['Convert local files','轉換本機檔案','Choose files explicitly. Catalog categories remain visible; adapters need bundled offline proof before enabling.','請自行揀選檔案。目錄類別保持可見，轉換器需要隨附離線證據先可啟用。','converter','Choose files','揀選檔案','converter-category'],
    'converter-category':['Document conversion choices','文件轉換選擇','PDF operations: inspect, split, merge, extract, reorder, rotate and metadata. Native adapter currently unavailable.','PDF 操作：檢查、分割、合併、擷取、排序、旋轉及中繼資料。目前原生轉換器不可用。','converter','Conversion category','轉換類別','converter-invalid'],
    'converter-invalid':['Source cannot be converted','來源無法轉換','The source signature is unsupported or invalid. Keep it unchanged and show the adapter boundary.','來源簽章不受支援或無效，保留原檔不變並說明轉換器限制。','invalid','Choose another source','揀選另一個來源','converter-empty'],
    'converter-running':['Conversion progress','轉換進度','Design fixture: item 2 of the current chunk. No total queue size is assumed; persistent discovery is paged.','設計示例：目前批次第 2 項。唔假設佇列總量，持久探索會分頁進行。','progress','Pause conversion','暫停轉換','converter-partial-result'],
    'converter-partial-result':['Batch results','批次結果','Design fixture: converted, skipped and failed rows retain distinct outcomes. No output exists in this reference.','設計示例：已轉換、已略過同失敗記錄各自保留結果，呢份參考未有實際輸出。','results','Select result records','揀選結果記錄','converter-empty'],
    'models-empty':['Model store unavailable','模型商店不可用','No verified catalog or installed-model inventory is available. Do not seed example model names.','未有經驗證目錄或已安裝模型清單，唔會填入示例模型名稱。','unavailable','Refresh verified catalog','更新經驗證目錄','models-stale'],
    'models-stale':['Model catalog is stale','模型目錄已過時','Keep last verified entries with retrieval age and page completeness. Unknown hardware fit remains Unknown.','保留上次有效條目並顯示取得時間同分頁完整性，未知硬件適合度維持未知。','model','Catalog filters','目錄篩選','models-variant'],
    'models-variant':['Review model variant','檢閱模型版本','No variant selected. Family, capability, quantization, storage and context evidence must come from actual catalog metadata.','未揀選版本。系列、能力、量化、儲存同上下文證據必須來自實際目錄資料。','model','Variant configuration','版本設定','models-operation'],
    'models-operation':['Model operation unavailable','模型操作不可用','No model selected and no native operation adapter. Do not invent pull progress or generation output.','未揀選模型亦未有原生操作介面，唔會假設下載進度或生成輸出。','unavailable','Start model operation','開始模型操作','models-empty'],
    'servers-targets':['Choose a server target','揀選伺服器目標','Local process, local container, SSH process and SSH container are independently unavailable until their adapters pass readiness.','本機程序、本機容器、SSH 程序同 SSH 容器各自需要介面通過準備檢查先可用。','server','Execution target','執行目標','servers-version-unavailable'],
    'servers-version-unavailable':['Server distribution unavailable','伺服器發行版本不可用','No server distribution is verified for the selection. Client-only versions cannot be installed as servers.','所選項目未有經驗證伺服器發行版本，只有用戶端嘅版本唔可以當作伺服器安裝。','server','Edition and version','版本類別與版本','servers-targets'],
    'servers-config':['Server configuration','伺服器設定','Typed controls require an exact versioned descriptor. Unknown settings are preserved and never guessed.','有類型控制需要確切版本描述，未知設定會保留而唔會猜測。','server-config','Server configuration','伺服器設定','servers-backup'],
    'servers-backup':['Backup before changes','更改前備份','Choose the actual server and destination through the native picker. Restore needs compatibility and loss review.','透過原生選擇器揀選實際伺服器同目的地，還原前需要檢閱相容性同損失。','unavailable','Create verified backup','建立經驗證備份','servers-config'],
    'servers-connection-lost':['Server observation lost','伺服器觀察已中斷','Unknown is not stopped. Preserve the last observation timestamp without presenting it as current health.','未知唔等於已停止。保留上次觀察時間，但唔會當成目前健康狀態。','unavailable','Reconnect target','重新連接目標','servers-targets']
  },
  access: {
    locked:['Selected element is locked','所選元素已鎖定','This is a local experience lock. Activating the target opens authentication without executing the protected action.','呢個係本機體驗鎖。啟用目標會開啟驗證，唔會執行受保護操作。','lock','Unlock selected element','解鎖所選元素','unlock'],
    unlock:['Unlock selected element','解鎖所選元素','Use the exact configured factor set. This reference accepts no credential input.','使用確切已設定因素組合，呢份參考唔接受憑證輸入。','lock','Authentication factors','驗證因素','wrong-factor'],
    'wrong-factor':['Factor did not match','因素不符','The protected action remains unexecuted. Show bounded retry and the local recovery route.','受保護操作仍未執行，顯示有時限重試同本機復原路徑。','invalid','Review recovery','檢閱復原方法','ladder-wait'],
    'ladder-wait':['Waiting period','等待時段','A completed challenge shortens waiting only. It never signs in, grants a session or increases the attempt budget.','完成挑戰只縮短等待，唔會登入、授予工作階段或增加嘗試次數。','ladder','Wait recovery challenge','等待復原挑戰','unlock'],
    'authenticator-empty':['No authenticator entries','未有驗證器條目','The native credential-vault adapter is unavailable. Browser storage cannot substitute for credential protection.','原生憑證儲存庫介面不可用，瀏覽器儲存唔可以代替憑證保護。','unavailable','Add authenticator entry','新增驗證器條目','authenticator-register'],
    'authenticator-register':['Register authenticator','登記驗證器','URI, local QR image, clipboard, camera and manual input require bounded local parsing. No real secret or QR is rendered here.','URI、本機 QR 圖片、剪貼簿、相機同手動輸入需要有限制本機解析，呢度唔會顯示真實秘密或 QR。','authenticator','Registration method','登記方式','authenticator-empty'],
    'support-empty':['Local support tickets','本機支援單','Nothing is sent, no external ticket exists, and nobody receives the description. This is local recovery guidance.','唔會傳送任何資料，冇外部支援單，亦冇人接收描述。呢個只係本機復原指引。','support','Local ticket description','本機支援單描述','support-recovery-unavailable'],
    'support-recovery-unavailable':['Recovery folder unavailable','復原資料夾不可用','The extension cannot open its profile storage in a file manager. Show browser-managed extension-data recovery and consequences instead.','擴充功能無法喺檔案管理器開啟設定檔儲存，應顯示瀏覽器管理嘅資料復原方法同後果。','unavailable','Open data folder','開啟資料夾','support-empty']
  },
  history: {
    'credential-unavailable':['History protection unavailable','歷史保護不可用','No credential-vault or Git history adapter is exposed. Do not label a browser event list protected version history.','未有憑證儲存庫或 Git 歷史介面，唔可以將瀏覽器事件清單稱為受保護版本歷史。','unavailable','Unlock history','解鎖歷史','locked'],
    locked:['History is locked','歷史已鎖定','History access has its own factor and attempt budget. Another unlocked surface does not unlock this one.','歷史存取有自己嘅因素同嘗試限制，另一介面已解鎖唔會令呢度自動解鎖。','lock','Unlock history','解鎖歷史','empty'],
    empty:['No history recorded','未有歷史記錄','Never invent an initial revision. A first successful recorded mutation creates the first real row.','唔會假設初始版本。首次成功記錄嘅更改先會建立第一筆實際記錄。','empty','Preview history filters','預覽歷史篩選','filtered'],
    filtered:['History filters','歷史篩選','Date, action and text filters compose. Actions and counts come from recorded history, not a fixed fabricated list.','日期、操作同文字篩選會合併使用，操作同數目來自已記錄歷史，唔係固定假清單。','history','Filter revisions','篩選版本','diff'],
    diff:['Revision difference','版本差異','Neutral fixture: theme changes from light to dark. Secret and vocabulary fields are omitted before rendering.','中性示例：主題由淺色改為深色。顯示前已排除秘密同詞彙欄位。','diff','Review restoration','檢閱還原','restore-preview'],
    'restore-preview':['Restore as a new revision','還原為新版本','Preview exact affected fields. Preserve independent locks and append history; never rewrite the prior revision.','預覽確切受影響欄位。保留獨立鎖並新增歷史，唔會改寫之前版本。','selection','Restore selected presentation settings','還原所選顯示設定','write-failed'],
    'write-failed':['History receipt unavailable','歷史記錄證據不可用','Keep live data safe and show the failed recording separately. Do not claim a commit exists or erase the user action.','安全保留即時資料，分開顯示記錄失敗。唔會聲稱已有提交或抹走使用者操作。','invalid','Review recovery','檢閱復原方法','credential-unavailable']
  },
  notifications: {
    empty:['No notifications','未有通知','Operation outcomes appear here. No synthetic welcome success is inserted.','操作結果會喺呢度顯示，唔會插入假成功歡迎訊息。','empty','Preview an unread state','預覽未讀狀態','unread'],
    unread:['Unread operation notice','未讀操作通知','Neutral fixture: connection lost. Marking read does not change the underlying operation.','中性示例：連線已中斷。標記已讀唔會改變原有操作。','notification','Mark notice read','標記通知已讀','empty'],
    retry:['Retry at the originating action','喺原有操作重試','Retry rechecks connection and current admission. It never replays a stale proposal automatically.','重試會重新檢查連線同目前許可，唔會自動重播過時建議。','unavailable','Retry connection','重試連線','unread'],
    'bulk-preview':['Review notification selection','檢閱所選通知','Design selection: 1 notification. Clear applies only to selected records and never to live transfers.','設計選取：1 筆通知。清除只影響所選記錄，唔影響即時傳輸。','selection','Include selected notice','包括所選通知','empty']
  },
  documentation: {
    index:['Offline documentation','離線文件','Browse bundled articles and wiki sections without leaving the extension. No network is needed for installed content.','留喺擴充功能內瀏覽隨附文章同 wiki 章節，已安裝內容唔需要網絡。','docs','Find an article','搜尋文章','article'],
    article:['Pairing and download consent','配對與下載同意','Approve pairing in the unlocked desktop. A selected link still needs destination review and Start download confirmation.','喺已解鎖桌面批准配對。所選連結仍需檢閱目的地同確認開始下載。','article','Related: connection recovery','相關：連線復原','index'],
    'no-match':['No matching articles','未有符合文章','The active text and date filters exclude all available records. Clear filters deliberately; never discard input silently.','目前文字同日期篩選排除咗所有記錄。請自行清除篩選，唔會靜默丟棄輸入。','invalid','Clear article filters','清除文章篩選','index'],
    'changelog-empty':['Release history unavailable','發佈歷史不可用','No reviewed release records are bundled in this design fixture. Never invent dates, versions or change commits.','呢個設計示例未有隨附經審閱發佈記錄，唔會假設日期、版本或更改提交。','empty','Preview release filters','預覽發佈篩選','changelog-filtered'],
    'changelog-filtered':['Filter release history','篩選發佈歷史','Date and text filters compose. Export preserves the visible range and exact source commit references.','日期同文字篩選會合併使用，匯出保留可見範圍同確切來源提交參照。','history','Release date range','發佈日期範圍','changelog-empty']
  },
  status: {
    unavailable:['Status connection unavailable','狀態連線不可用','No authenticated enrollment or status capability exists in the current protocol. No delivery is claimed.','現有協定未有已驗證登記或狀態能力，並未聲稱已傳送。','unavailable','Connect status service','連接狀態服務','observed'],
    observed:['Observed capability details','已觀察能力詳情','Design fixture: download handoff only. Package version, source and observation time are unavailable.','設計示例：只有下載交接。套件版本、來源同觀察時間不可用。','status','Capability details','能力詳情','stale'],
    stale:['Observation is stale','觀察已過時','The last observation is retained as history, not current health. Refresh requires a valid paired capability.','上次觀察只會當作歷史保留，唔代表目前健康狀態。更新需要有效已配對能力。','unavailable','Refresh status','更新狀態','unavailable']
  },
  'shared-overlays': {
    palette:['Command palette','指令選單','Ctrl+Shift+F opens this bounded region. Results route to exact controls and preserve locks.','Ctrl+Shift+F 開啟呢個有界區域。結果會前往確切控制並保留鎖。','palette','Find a setting or destination','搜尋設定或目的地','guidance'],
    'regex-builder':['Search expression builder','搜尋運算式建立器','Plain text is the default. Pattern, flags, validation and sample results stay synchronized with this local search.','純文字係預設。模式、旗標、驗證同示例結果會同呢個本機搜尋同步。','regex','Search expression','搜尋運算式','context-menu'],
    'context-menu':['Transfer context menu','傳輸情境選單','Local menu search changes visible actions only. Display shortcuts and preserve the selected record identity.','本機選單搜尋只更改可見操作。顯示快捷鍵並保留所選記錄身分。','menu','Filter menu actions','篩選選單操作','group-picker'],
    'group-picker':['Move into a group','移入群組','Search existing groups or create a group. Moving into a collapsed group keeps it collapsed.','搜尋現有群組或建立群組。移入已收合群組後會維持收合。','group','Group name','群組名稱','tab-close-preview'],
    'tab-close-preview':['Review tabs to close','檢閱即將關閉分頁','Containing and not-containing modes use one predicate. Pinned, locked and unsaved tabs stay excluded unless explicitly reviewed.','包含同不包含模式使用同一判定。固定、已鎖定同未儲存分頁會排除，除非明確檢閱。','selection','Include matching unprotected tabs','包括符合而未受保護分頁','palette'],
    guidance:['Optional guidance','可選指引','The panel belongs above its originating control. Direct editing remains available; Back preserves valid input.','面板位於原有控制上方。仍可直接編輯，返回會保留有效輸入。','guide','Guided step','指引步驟','appearance-editor'],
    'appearance-editor':['Selected element appearance','所選元素外觀','Select state, then adjust typography, color, spacing and motion through typed controls with reset provenance.','揀選狀態後，透過有類型控制調整字型、顏色、間距同動態，並顯示重設來源。','appearance','Selected element style','所選元素樣式','element-lock'],
    'element-lock':['Lock this element','鎖定此元素','Choose one of six factor policies. Credentials are unique per target and unavailable without native storage.','揀選六種因素規則之一。每個目標有獨立憑證，未有原生儲存時不可用。','lock','Lock policy','鎖定規則','super-confirmation'],
    'super-confirmation':['Confirm destructive scope','確認破壞性操作範圍','Two independent confirmations protect the exact listed records. Cancel is the safe default; no data is deleted in this reference.','兩個獨立確認保護確切列出記錄。取消係安全預設，呢份參考唔會刪除資料。','confirmation','Confirm selected scope','確認所選範圍','export-preview'],
    'export-preview':['Review export','檢閱匯出','Choose a faithful format and range. Vocabulary, source-file metadata, credentials and private session data are excluded explicitly.','揀選忠實格式同範圍，明確排除詞彙、來源檔案資料、憑證同私人工作階段資料。','export','Export format','匯出格式','palette']
  }
};
