import {buildSurfaceInventory} from './info-icon-inventory.js';

/**
 * Information icons for the share dialog (share a file through Docker Hub, receive a shared file, and the list of
 * shared files). The dialog renders inside its own shadow root, so the icons are mounted on that root by
 * src/renderer/features/share/dialog.js. Selectors are plain ids the dialog assigns when it builds each control.
 */
const rows = [
  ['#share-passphrase-switch', 'toggle', 'Also require a passphrase', '另外要求密碼短語',
    'Adds a passphrase that is needed together with the share command to open the file.', '加一個密碼短語，要同分享指令一齊先開到個檔案。',
    'When it is on, the command carries a key wrapped with your passphrase, so someone who only sees the command cannot open the file. Send the passphrase another way.', '開啟之後，指令入面嘅密鑰會用你嘅密碼短語包住，淨係睇到指令嘅人開唔到檔案；請用另一個途徑傳密碼短語。',
    {default: ['Off', '關閉']}],
  ['#share-passphrase', 'credential', 'Passphrase', '密碼短語',
    'The passphrase the recipient must type to open this share.', '收件人開啟呢個分享時要輸入嘅密碼短語。',
    'It is stretched with scrypt and never uploaded or stored. A forgotten passphrase cannot be recovered; share the file again instead.', '佢會經 scrypt 加強，唔會上載亦唔會儲存。忘記咗就救唔返，請重新分享檔案。'],
  ['#share-passphrase-confirm', 'credential', 'Confirm passphrase', '確認密碼短語',
    'Type the same passphrase again so a typing mistake does not lock the recipient out.', '再輸入一次同一個密碼短語，避免打錯字令收件人開唔到。',
    'Sharing stays unavailable until both fields match and the passphrase has at least 8 characters.', '兩欄一樣而且最少 8 個字元，先可以分享。'],
  ['#share-command', 'text', 'Share command', '分享指令',
    'The command that downloads and opens the shared file. It includes the key, unless a passphrase was set.', '用嚟下載同開啟分享檔案嘅指令；除非設定咗密碼短語，否則入面包含密鑰。',
    'Anyone with this command can open the file, so send it privately. Copy it again later from Shared files, until you revoke the share.', '任何人有呢個指令都開到檔案，請私下傳送；撤回之前，可以喺「已分享嘅檔案」再複製。',
    {sample: 'mfe-share:v1:registry-1.docker.io/example/material-file-encryptor-shares@sha256:…#…'}],
  ['#receive-command', 'text', 'Share command or link', '分享指令或連結',
    'Paste the command or link you were sent. A whole command line that contains it also works.', '貼上你收到嘅指令或連結；包含佢嘅整行命令列都得。',
    'The file is downloaded from Docker Hub without signing in and checked before anything is saved. A command that is damaged or points anywhere but Docker Hub is refused.', '檔案會唔使登入咁由 Docker Hub 下載，儲存之前會先檢查；損壞或者指去 Docker Hub 以外嘅指令會被拒絕。',
    {sample: 'mfe-share:v1:registry-1.docker.io/example/material-file-encryptor-shares@sha256:…#…'}],
  ['#receive-passphrase', 'credential', 'Passphrase for the share', '分享嘅密碼短語',
    'The passphrase the sender set for this share.', '寄件人為呢個分享設定嘅密碼短語。',
    'It is used only on this computer to unwrap the key. A wrong passphrase is refused and nothing is downloaded or saved.', '佢只會喺呢部電腦用嚟解開密鑰；密碼短語錯誤就會被拒絕，唔會下載或者儲存任何嘢。'],
  ['#share-revoke-all', 'button', 'Revoke all shares', '撤回所有分享',
    'Removes every active share from Docker Hub so their commands stop working.', '將所有有效分享由 Docker Hub 移除，令佢哋嘅指令失效。',
    'Each removal is confirmed with Docker Hub before its command is forgotten. Copies already downloaded cannot be recalled.', '每個移除都會先向 Docker Hub 確認，先至忘記指令；已經下載嘅副本收唔返。']
];

export const SHARE_INFO_ICON_INVENTORY = buildSurfaceInventory('share', rows, []);
