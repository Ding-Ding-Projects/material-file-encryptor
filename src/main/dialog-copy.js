// Cantonese copy for main-process prompts. Prompts are written in English at
// their call sites; the dialog view is localised here for the interface
// language the user chose, so no call site has to carry its own translation.

const PHRASES = new Map([
  ['Unlock the encrypted drive', '解鎖加密磁碟'],
  ['Unlock the drive, then choose Copy to encrypted drive again.', '請先解鎖磁碟，然後再揀「複製到加密磁碟」。'],
  ['Copy to encrypted drive', '複製到加密磁碟'],
  ['Import the selected file into encrypted storage?', '將所揀檔案匯入加密儲存？'],
  ['The copy uses encrypted staging. Cancel from the workspace or tray to discard the unfinished file.', '複製過程會用加密暫存區。可以喺工作區或者系統匣取消，捨棄未完成嘅檔案。'],
  ['File could not be imported', '檔案未能匯入'],
  ['Exit is not complete', '離開未完成'],
  ['Safe shutdown could not finish. Work remains blocked. Retry Quit after the storage or service problem is resolved.', '安全關閉未能完成，工作仍然被阻擋。解決咗儲存或者服務問題之後，再試一次離開。'],
  ['What should happen to unfinished work?', '未完成嘅工作要點處理？'],
  ['Application is still running', '應用程式仍然運行緊'],
  ['Work is still running', '工作仍然進行緊'],
  ['Transfers are still active', '傳輸仍然進行緊'],
  ['Completed files remain available. The application exits only after pending work settles and the drive locks successfully.', '已完成嘅檔案仍然可用。待處理工作完成而且磁碟成功上鎖之後，應用程式先會離開。'],
  ['Still running:', '仍然進行緊：'],
  ['Pair browser tools', '配對瀏覽器工具'],
  ['Allow this browser to use local tools?', '允許呢個瀏覽器使用本機工具？'],
  ['Review server license', '檢視伺服器授權'],
  ['Accept the Minecraft End User License Agreement for this prepared server?', '為呢個已準備伺服器接受 Minecraft 使用者授權協議？'],
  ['Change local model connection', '更改本機模型連線'],
  ['Use the selected loopback port for local models?', '本機模型改用所揀嘅迴路埠？'],
  ['Only an application-owned runtime will be stopped. External processes and their model files remain untouched.', '只會停止由應用程式擁有嘅執行環境。外部程序同佢哋嘅模型檔案唔會受影響。'],
  ['Home Assistant credential', 'Home Assistant 憑證'],
  ['Store this credential for the selected schedule?', '為所揀排程儲存呢個憑證？'],
  ['Clear this schedule credential?', '清除呢個排程憑證？'],
  ['The credential is kept in operating-system protected storage and is never returned to the page.', '憑證會保存喺作業系統受保護儲存區，永遠唔會交返俾頁面。'],
  ['Executable remains untrusted', '執行檔仍未受信任'],
  ['No established publisher or reviewed executable hash matches this file.', '冇已確立嘅發行者或者已審核執行檔雜湊同呢個檔案相符。'],
  ['Selecting a file does not establish trust. Obtain a reviewed executable manifest from the official release provenance before retrying.', '揀選檔案唔等於建立信任。重試之前，請由官方發行來源取得已審核嘅執行檔清單。'],
  ['Review pinned executable trust', '檢視固定執行檔信任'],
  ['Trust only these exact reviewed executable bytes?', '只信任呢啲確實已審核嘅執行檔位元組？'],
  ['Open official Ollama installation page?', '開啟 Ollama 官方安裝頁面？'],
  ['Open the official Windows download page in your browser?', '喺瀏覽器開啟官方 Windows 下載頁面？'],
  ['This application will not download or execute an installer.', '呢個應用程式唔會下載或者執行安裝程式。'],
  ['OK', '確定'],
  ['Cancel', '取消'],
  ['Close', '關閉'],
  ['Keep running', '保持運行'],
  ['Copy file', '複製檔案'],
  ['Finish then quit', '完成後離開'],
  ['Cancel unfinished work then quit', '取消未完成工作後離開'],
  ['Reject', '拒絕'],
  ['Pair browser', '配對瀏覽器'],
  ['Accept this server license', '接受呢個伺服器授權'],
  ['Change port', '更改埠'],
  ['Store credential', '儲存憑證'],
  ['Clear credential', '清除憑證'],
  ['Trust exact bytes', '信任確實位元組'],
  ['Open official page', '開啟官方頁面'],
]);

// Labels that start a "Label: value" detail line; the value is data and stays as written.
const LABELS = new Map([
  ['Schedule', '排程'], ['Origin', '來源'], ['Address', '位址'], ['Server version', '伺服器版本'], ['Version', '版本'],
  ['File', '檔案'], ['Drive transfers', '磁碟傳輸'], ['Background requests', '背景請求'], ['File conversions', '檔案轉換'],
  ['Document and download tasks', '文件同下載工作'], ['Server preparation', '伺服器準備'], ['Local model operations', '本機模型操作'],
]);

const HAN = /[㐀-鿿]/;
const MODES = new Set(['en', 'yue', 'bilingual']);

/** One short string (title, message or button) in the chosen mode. */
function phrase(text, mode) {
  const split = /^(.+?) · (.+)$/.exec(text);
  if (split && HAN.test(split[2]) && !HAN.test(split[1])) return mode === 'en' ? split[1] : mode === 'yue' ? split[2] : text;
  const yue = PHRASES.get(text);
  if (!yue || mode === 'en') return text;
  return mode === 'yue' ? yue : `${text} · ${yue}`;
}

/** One detail line: whole sentences translate, labelled lines translate only their label. */
function detailLine(text, mode) {
  const yue = PHRASES.get(text);
  if (yue) return mode === 'yue' ? yue : `${text}\n${yue}`;
  const labelled = /^([A-Za-z][A-Za-z ]*): (.*)$/.exec(text);
  const label = labelled && LABELS.get(labelled[1]);
  if (!label) return text;
  return mode === 'yue' ? `${label}：${labelled[2]}` : `${labelled[1]} · ${label}: ${labelled[2]}`;
}

/** Returns the dialog view in the chosen interface language; unknown copy stays as written. */
export function localizeDialogView(view, language) {
  const mode = MODES.has(language) ? language : 'en';
  return {
    ...view,
    language: mode,
    title: phrase(view.title, mode),
    message: phrase(view.message, mode),
    buttons: view.buttons.map(label => phrase(label, mode)),
    detail: mode === 'en' ? view.detail : view.detail.split('\n').map(line => line ? detailLine(line, mode) : line).join('\n'),
  };
}
