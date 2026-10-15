/** English and Cantonese copy for the multi-target server manager panel.
 * The Cantonese is written Cantonese, not transliterated English. Bilingual mode shows "English / Cantonese". */
export const TARGETS_COPY = Object.freeze({
  'Servers on every target': '各種目標上嘅伺服器',
  'Create and manage Minecraft servers as a local process, a local container, an SSH process or an SSH container.': '可以用本機進程、本機容器、SSH 進程或者 SSH 容器建立同管理 Minecraft 伺服器。',
  'Create a server': '建立伺服器',
  'Target': '目標', 'Local process': '本機進程', 'Local container': '本機容器', 'SSH process': 'SSH 進程', 'SSH container': 'SSH 容器',
  'Available': '可用', 'Unavailable': '未能使用', 'Checking targets': '正在檢查目標', 'Refresh targets': '重新檢查目標',
  'Flavor': '伺服器類型', 'Minecraft version': 'Minecraft 版本', 'Load versions': '載入版本', 'Loading versions': '正在載入版本', 'Choose a version': '揀一個版本',
  'Server name': '伺服器名稱', 'Port': '連接埠', 'Memory': '記憶體', 'Container mode': '容器模式', 'Official image': '官方映像', 'Mounted verified jar': '掛載已驗證 jar',
  'SSH host': 'SSH 主機', 'SSH port': 'SSH 連接埠', 'SSH user': 'SSH 使用者', 'Choose SSH key file': '選擇 SSH 金鑰檔案', 'Key file chosen': '已揀金鑰檔案',
  'No key chosen. The ssh-agent will be used.': '未揀金鑰，會使用 ssh-agent。',
  'Passwords are never used. The host key must already be trusted by ssh.': '永遠唔會用密碼，主機金鑰必須已經由 ssh 信任。',
  'Create server': '建立伺服器', 'Servers': '伺服器', 'No servers yet.': '暫時未有伺服器。',
  'Server created. Preparation is running.': '伺服器已建立，正在準備。',
  'The server manager could not be reached.': '連接唔到伺服器管理員。', 'The action was not completed.': '操作未完成。',
  'Enter a valid port between 1024 and 65535.': '請輸入 1024 至 65535 之間嘅連接埠。', 'Choose a flavor and load its versions first.': '請先揀伺服器類型並載入版本。',
  'preparing': '準備中', 'prepared': '已準備', 'starting': '啟動中', 'running': '運行中', 'stopping': '停止中', 'stopped': '已停止', 'failed': '失敗',
  'Start': '啟動', 'Stop': '停止', 'Restart': '重新啟動', 'Cancel': '取消', 'Refresh state': '更新狀態',
  'Accept server license': '接受伺服器授權', 'License accepted': '已接受授權', 'License not accepted': '未接受授權',
  'Overview': '概覽', 'Logs': '日誌', 'Settings': '設定', 'Plugins and mods': '插件同模組',
  'Integrity': '完整性', 'License': '授權', 'Build': '建置', 'Flavor and version': '類型同版本',
  'Verified against the published SHA-256': '已對照發佈嘅 SHA-256 驗證',
  'Verified against the published SHA-1': '已對照發佈嘅 SHA-1 驗證',
  'Verified against a published MD5 only (weak)': '只對照過發佈嘅 MD5（較弱）',
  'The source publishes no digest; the received bytes are pinned by their own SHA-256': '來源冇發佈雜湊；已收檔案以自身 SHA-256 固定',
  'The container image downloads the server; the desktop did not verify it': '由容器映像下載伺服器，桌面程式冇驗證過',
  'Refresh logs': '更新日誌', 'Showing the most recent lines.': '顯示最近嘅行數。', 'No log lines yet.': '暫時未有日誌。',
  'Apply': '套用', 'Restart required': '需要重新啟動', 'Applies on the next start.': '下次啟動時生效。', 'Applies after a restart.': '重新啟動後生效。', 'Load settings': '載入設定',
  'motd': '伺服器訊息', 'server-port': '伺服器連接埠', 'max-players': '最多玩家', 'difficulty': '難度', 'gamemode': '遊戲模式', 'online-mode': '正版驗證', 'view-distance': '視野距離',
  'simulation-distance': '模擬距離', 'pvp': '玩家對戰', 'hardcore': '極限模式', 'white-list': '白名單', 'allow-flight': '允許飛行', 'allow-nether': '允許下界',
  'spawn-protection': '出生點保護', 'spawn-monsters': '生成怪物', 'spawn-animals': '生成動物', 'spawn-npcs': '生成村民', 'enable-command-block': '啟用指令方塊', 'force-gamemode': '強制遊戲模式',
  'Search Modrinth': '搜尋 Modrinth', 'Search': '搜尋', 'Install': '安裝', 'Install from a file': '由檔案安裝', 'Installed': '已安裝',
  'Verified against the publisher SHA-512': '已對照發佈者 SHA-512 驗證', 'Local file, not verified against a publisher': '本機檔案，未對照發佈者驗證',
  'Stop the server before installing.': '安裝之前請先停止伺服器。', 'This flavor has no plugins or mods.': '呢種伺服器冇插件或者模組。', 'Nothing installed yet.': '暫時未有安裝。',
  'Installed. Start the server to load it.': '已安裝，啟動伺服器就會載入。',
});

export function targetsTranslator(getLanguage = () => 'en') {
  return source => {
    const yue = TARGETS_COPY[source];
    const language = getLanguage();
    return language === 'yue' ? (yue || source) : language === 'bilingual' && yue ? source + ' / ' + yue : source;
  };
}
