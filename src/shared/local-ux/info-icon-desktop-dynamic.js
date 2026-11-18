import {buildSurfaceInventory} from './info-icon-inventory.js';

/**
 * Information icons for desktop controls that the renderer creates after start-up: the history and Recycle Bin
 * actions, and the retention choice. They are absent from the static markup, so the shell observes the document and mounts
 * each icon the moment its control appears. The selectors are plain ids that the renderer assigns when it builds
 * the control.
 */
const rows = [
  ['#drive-new-menu', 'button', 'New drive menu', '新增磁碟選單',
    'Open the menu of ways to get a drive: a new drive on this PC, a new Docker Hub drive, or a drive opened from Docker Hub.', '開啟取得磁碟嘅方法選單：喺呢部電腦新增磁碟、新增 Docker Hub 磁碟，或者從 Docker Hub 開啟磁碟。',
    'Only the menu opens. Each choice starts its own guided steps, and nothing is created until you confirm there.', '只會開啟選單。每個選擇都有自己嘅引導步驟，喺嗰度確認之前唔會建立任何嘢。'],
  ['#unlock-show-password', 'button', 'Show password', '顯示密碼',
    'Show the password you are typing in the unlock bar, or hide it again.', '顯示你喺解鎖列輸入緊嘅密碼，或者再隱藏佢。',
    'Only the field display changes. Nothing is saved and the drive stays locked until you press Unlock.', '只係改變欄位顯示，唔會儲存任何嘢，撳「解鎖」之前磁碟都會保持鎖定。'],
  ['#unlock-choose-storage', 'button', 'Choose storage folder', '選擇儲存資料夾',
    'Choose the encrypted storage folder of this drive when it does not have one yet, so it can be unlocked.', '呢個磁碟仲未有加密儲存資料夾時，揀返佢嘅資料夾，咁先可以解鎖。',
    'A dialog opens to pick the folder and enter the password. Nothing changes until you confirm there.', '會開一個對話框揀資料夾同輸入密碼，喺嗰度確認之前唔會改變任何嘢。'],
  ['#drive-list-settings', 'button', 'Drive settings', '磁碟設定',
    'Go to Settings for the options that apply to drives, such as unlocking at sign-in and the encrypted part size.', '去設定修改適用於磁碟嘅選項，例如登入時解鎖同埋加密分段大小。',
    'Only the page changes. No drive is locked, unlocked or changed.', '只會轉頁，唔會鎖定、解鎖或者更改任何磁碟。'],
  ['#save-version', 'button', 'Save version now', '立即儲存版本',
    'Record the current state of the drive as a version you can return to later.', '把磁碟目前嘅狀態記錄成一個版本，之後可以返轉頭。',
    'A new entry appears in the history list. Existing versions and files are not changed.', '歷史清單會多一個新項目，現有版本同檔案唔會改變。'],
  ['#history-retention', 'choice', 'Show history', '顯示歷史',
    'Choose how far back the history list reaches: forever, the last 30 or 90 days, or a custom number of days.', '揀歷史清單回溯幾耐：永遠、最近 30 日、最近 90 日，或者自訂日數。',
    'The choice is only a draft until you press Apply. Nothing is removed by choosing a period.', '喺你按「套用」之前，選擇只係草稿，揀時段唔會刪除任何嘢。'],
  ['#history-days', 'number', 'Custom days', '自訂日數',
    'Enter how many days of history to keep when you chose Custom days.', '揀咗「自訂日數」之後，輸入想保留幾多日嘅歷史。',
    'Only whole numbers from 1 to 36500 are accepted, and the number is applied after you press Apply.', '只接受 1 至 36500 嘅整數，按「套用」之後先會生效。',
    {min: 1, max: 36500, sample: 365, unit: ' days'}],
  ['#history-retention-apply', 'button', 'Apply history period', '套用歷史時段',
    'Save the chosen history period for this drive.', '儲存呢個磁碟所揀嘅歷史時段。',
    'Versions older than the period may be pruned by the drive. The period applies from now on.', '早過所揀時段嘅版本，磁碟可能會清理。時段由而家開始生效。'],
  ['#select-recycled', 'button', 'Select all visible deleted items', '選取所有可見嘅已刪除項目',
    'Tick every deleted item currently shown in the Recycle Bin list.', '剔選資源回收筒清單而家顯示嘅所有已刪除項目。',
    'Only the ticks change. Nothing is restored or removed until you choose Restore selected or Empty Recycle Bin.', '只會改變剔選狀態，喺你揀「還原所選」或者「清空資源回收筒」之前，唔會還原或者刪除任何嘢。'],
  ['#restore-recycled', 'button', 'Restore selected deleted items', '還原所選已刪除項目',
    'Put the ticked deleted items back into the drive.', '將已剔選嘅已刪除項目放返落磁碟。',
    'Restored items leave the Recycle Bin and return to their original place in My drive.', '已還原嘅項目會離開資源回收筒，返到「我嘅磁碟」入面原來嘅位置。'],
  ['#empty-recycle', 'button', 'Empty the Recycle Bin', '清空資源回收筒',
    'Permanently remove every deleted item from the Recycle Bin after you confirm.', '經你確認後，永久移除資源回收筒內所有已刪除項目。',
    'This cannot be undone. A confirmation dialog appears first and nothing is removed if you cancel it.', '此操作無法還原。會先出現確認對話框，取消嘅話就唔會移除任何嘢。']
];

export const DESKTOP_DYNAMIC_INFO_ICON_INVENTORY = buildSurfaceInventory('desktop', rows);
