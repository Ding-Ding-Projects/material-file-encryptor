import {buildSurfaceInventory} from './info-icon-inventory.js';

/**
 * Information icons for the Docker Hub drive dialog (create a drive and open a drive from Docker Hub). The dialog renders
 * inside its own shadow root, so the icons are mounted on that root by src/renderer/features/docker-hub-drive/dialog.js.
 * Selectors are plain ids that the dialog assigns when it builds each control.
 */
const rows = [
  ['#hub-drive-name', 'text', 'Drive name', '磁碟名稱',
    'An optional label for this drive. It is saved with every encrypted snapshot so the drive can be recognized later when you open it from Docker Hub.', '呢部磁碟嘅選填標籤。每個加密快照都會附帶，之後由 Docker Hub 開啟時可以認得出係邊部。',
    'Anyone who can read a public repository can read the label, so do not put anything private in it. It is also the name shown for the drive in this app.', '任何人只要睇到公開儲存庫就睇到個標籤，所以唔好放私人內容；呢個名亦係程式入面顯示嘅磁碟名稱。',
    {sample: 'Work files', default: ['Drive', '磁碟']}],
  ['#hub-drive-letter', 'choice', 'Drive letter', '磁碟機代號',
    'The letter this drive gets in Windows Explorer once it is mounted.', '磁碟掛載後喺 Windows 檔案總管入面使用嘅代號。',
    'Only letters that are free on this computer are offered. The drive appears under that letter as soon as it is created or restored.', '只會提供呢部電腦未被佔用嘅代號；建立或還原完成後，磁碟即時以呢個代號出現。',
    {default: ['The first free letter', '第一個空閒代號']}],
  ['#hub-password', 'credential', 'Password', '密碼',
    'The password that protects this drive. It is used to derive the encryption key and is never sent anywhere.', '保護呢部磁碟嘅密碼，用嚟衍生加密密鑰，唔會傳送去任何地方。',
    'The repository is public and vault.json allows offline password guessing, so a long passphrase or a key file is strongly recommended. A forgotten password cannot be recovered.', '儲存庫係公開嘅，而 vault.json 可以離線估密碼，所以強烈建議用長密碼短語或者密鑰檔案；忘記密碼係無法復原嘅。'],
  ['#hub-advanced', 'button', 'Advanced: choose folder', '進階：自己揀資料夾',
    'Restores the snapshot into a parent folder you pick yourself instead of the app\'s own folder.', '將快照還原到你自己揀嘅上層資料夾，而唔係程式自己嘅資料夾。',
    'The restored storage folder is created inside the folder you choose. The local cache stays in the app\'s own data area.', '還原後嘅儲存資料夾會建立喺你揀嘅資料夾入面；本機快取仍然放喺程式自己嘅資料區。']
];

export const HUB_DRIVE_INFO_ICON_INVENTORY = buildSurfaceInventory('docker-hub-drive', rows, []);
