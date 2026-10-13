export function confirmationLanguage(value='en'){if(!['en','yue','bilingual'].includes(value))throw new Error('Unsupported confirmation language.');return value;}
export function ollamaConfirmation(kind,language='en'){
 confirmationLanguage(language);const install=kind==='install';
 const en=install?['Install managed Ollama runtime','Download and install the verified official CLI runtime for this application?','Install managed runtime','Cancel']:['Confirm local Ollama execution','Run this trusted executable for the displayed action?','Run local action','Cancel'];
 const yue=install?['安裝受管理嘅 Ollama 執行環境','下載並安裝已驗證嘅官方 CLI 執行環境俾呢個應用程式？','安裝受管理執行環境','取消']:['確認本機 Ollama 執行','執行呢個受信任檔案，進行畫面顯示嘅操作？','執行本機操作','取消'];
 return Object.fromEntries(['title','message','accept','cancel'].map((key,i)=>[key,language==='en'?en[i]:language==='yue'?yue[i]:en[i]+' / '+yue[i]]));
}

export function ollamaConfirmationDetail(kind,data,language='en'){
 confirmationLanguage(language);
 const en=kind==='install'?`Version: ${data.version}\nArchitecture: ${data.architecture}\nDownload bytes: ${data.bytes}\nExisting installations and model stores remain untouched. No system PATH, startup setting, elevation or restart is needed. Runtime startup is a separate action.`:`Executable: ${data.executable}\nAction: ${data.action}\nNetwork boundary: ${data.endpoint} only; cloud disabled.\nManaged model directory: ${data.directory}`;
 const yue=kind==='install'?`版本：${data.version}\n架構：${data.architecture}\n下載位元組：${data.bytes}\n現有安裝同模型儲存位置唔會改動。唔需要改系統 PATH、啟動設定、提升權限或者重新啟動。啟動執行環境係另一個操作。`:`執行檔：${data.executable}\n操作：${data.action}\n網絡範圍：只限 ${data.endpoint}，雲端功能已停用。\n受管理模型目錄：${data.directory}`;
 return language==='en'?en:language==='yue'?yue:en+'\n\n'+yue;
}
