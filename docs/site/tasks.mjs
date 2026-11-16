// Task model for the documentation site: what a visitor wants to do, mapped onto the existing article categories.
// Every string is paired English and Cantonese so generated pages can switch language without a rebuild.
export const TASKS = Object.freeze([
 {id:'setup',en:'Set up your drive',yue:'設定你嘅加密磁碟機',blurb:{en:'Pick a storage folder, create a vault and see it as a drive in File Explorer.',yue:'揀儲存資料夾、建立保險庫，喺檔案總管入面當磁碟機用。'},
  intro:{en:'Start here if you have not created a vault yet. These articles explain what a vault is, where its encrypted parts live and how several vaults sit side by side.',yue:'未建立保險庫就由呢度開始。呢啲文章解釋保險庫係乜、加密分段放喺邊度，同埋點樣同時用幾個保險庫。'}},
 {id:'unlock',en:'Unlock and stay in control',yue:'解鎖同掌握存取權',blurb:{en:'Passwords, key files, waiting periods and who can open what.',yue:'密碼、金鑰檔案、等候時間，同誰可以開啟乜。'},
  intro:{en:'How access works: unlocking, protected resets and the host that checks credentials. Nothing here can be bypassed by the website.',yue:'存取係點樣運作：解鎖、受保護嘅重設，同驗證憑證嘅主機。網站本身繞唔過任何一項。'}},
 {id:'offline',en:'Work offline',yue:'離線使用',blurb:{en:'Pin files so their encrypted bytes stay on this computer.',yue:'釘選檔案，令加密位元組留喺呢部電腦。'},
  intro:{en:'Offline access needs either a reachable stored copy or a complete cached copy. These articles explain what pinning does and what it cannot do.',yue:'離線存取需要可連線嘅儲存副本，或者完整嘅快取副本。呢啲文章解釋釘選做到乜、做唔到乜。'}},
 {id:'parts',en:'Choose part sizes',yue:'揀加密分段大小',blurb:{en:'Control how large each encrypted part is and what that means for sync.',yue:'控制每個加密分段嘅大小，同對同步有乜影響。'},
  intro:{en:'Files are split into fixed-size encrypted parts. Smaller parts suit sync services with upload limits; larger parts mean fewer files.',yue:'檔案會切成固定大小嘅加密分段。細啲嘅分段適合有上載限制嘅同步服務，大啲就檔案少啲。'}},
 {id:'recover',en:'Recover and look back',yue:'還原同回顧',blurb:{en:'File history, the recycle bin and getting an earlier version back.',yue:'檔案紀錄、資源回收筒，同攞返舊版本。'},
  intro:{en:'History and the recycle bin keep earlier states recoverable. See how they are stored and how to restore.',yue:'紀錄同資源回收筒令舊狀態可以還原。睇睇佢哋點儲存、點還原。'}},
 {id:'tools',en:'Connect other tools',yue:'連接其他工具',blurb:{en:'Browser extension, converter, local models and server tools.',yue:'瀏覽器擴充功能、轉換器、本機模型同伺服器工具。'},
  intro:{en:'Optional companions that work next to the drive: the browser extension, file converter, local model suite and server manager.',yue:'同磁碟機並行嘅選用工具：瀏覽器擴充功能、檔案轉換器、本機模型套件同伺服器管理。'}},
 {id:'custom',en:'Make it yours',yue:'自訂畫面同動畫',blurb:{en:'Appearance, motion, sizing, schedules and the shared interface.',yue:'外觀、動畫、大小、排程同共用介面。'},
  intro:{en:'Everything about how the app looks and feels, from colour and fonts to animation and notifications.',yue:'應用程式嘅外觀同感覺，由顏色、字型到動畫同通知。'}},
 {id:'verified',en:'Check what is verified',yue:'睇已驗證嘅項目',blurb:{en:'Release status, packaging, performance and evidence.',yue:'發行狀態、打包、效能同證據。'},
  intro:{en:'What has been built, packaged and measured, and what is still unverified. Evidence is tied to exact source and installer bytes.',yue:'邊啲已經建置、打包同量度過，邊啲仲未驗證。證據同確切原始碼同安裝程式位元組掛鉤。'}}
]);
export const REFERENCE_TASK = Object.freeze({id:'reference',en:'Reference and wiki',yue:'參考資料同維基',blurb:{en:'Project reference, documentation index and wiki.',yue:'專案參考、文件索引同維基。'},intro:{en:'Index pages, design notes and the wiki snapshot.',yue:'索引頁、設計筆記同維基快照。'}});

const CATEGORY_TASK = {drive:'setup',storage:'setup',access:'unlock',appearance:'custom',interface:'custom','surface-foundation':'custom',schedules:'custom',browser:'tools',workflows:'tools',converter:'tools',ollama:'tools','server-manager':'tools',release:'verified',platform:'verified',desktop:'verified',performance:'verified'};
// Keyword overrides, tested against the article source path, move an article to the task that names its subject.
const OVERRIDES = [[/offline|cache|pinn/i,'offline'],[/part|packing|chunk|resplit/i,'parts'],[/history|recycle|recover/i,'recover'],[/unlock|local-access|visitor-local|protected-reset|access-host/i,'unlock']];
export function taskIdFor(article) {
 if (article.category === 'reference' || article.category === 'moved') return REFERENCE_TASK.id;
 const name = article.source.replace(/\.zh-HK\.md$/, '.md');
 for (const [pattern, id] of OVERRIDES) if (pattern.test(name)) return id;
 return CATEGORY_TASK[article.category] || REFERENCE_TASK.id;
}
export const CATEGORY_INTROS = Object.freeze({
 access:{en:'Unlocking, waiting periods, protected resets and the privileged host that checks credentials.',yue:'解鎖、等候時間、受保護重設，同驗證憑證嘅特權主機。'},
 appearance:{en:'Image placement, raster workflows and the appearance editor.',yue:'圖片擺放、點陣圖工作流程同外觀編輯器。'},
 browser:{en:'Reading files safely in the browser workspace, external editors and file conversion.',yue:'喺瀏覽器工作區安全閱讀檔案、外部編輯器同檔案轉換。'},
 converter:{en:'The file converter: archives, media plans and the runtime that performs them.',yue:'檔案轉換器：壓縮檔、媒體計劃同執行嘅運行環境。'},
 desktop:{en:'The Windows app itself: icons, exit handling, package integrity and runtime evidence.',yue:'Windows 應用程式本身：圖示、結束處理、套件完整性同執行證據。'},
 drive:{en:'Encrypted folder images and how several vaults coexist.',yue:'加密資料夾映像同多個保險庫並存。'},
 interface:{en:'Shared interface behaviour: fonts, colour, animation, tabs, search and personalization.',yue:'共用介面行為：字型、顏色、動畫、分頁、搜尋同個人化。'},
 ollama:{en:'Local models: managed runtime, native host and release provenance.',yue:'本機模型：受管運行環境、原生主機同發行來源。'},
 performance:{en:'Native helper and lifecycle performance.',yue:'原生輔助程式同生命週期效能。'},
 platform:{en:'Integration, documentation currency and packaged documentation cache.',yue:'整合、文件更新狀態同打包文件快取。'},
 release:{en:'Installer repair, native updates, preview delivery and verification.',yue:'安裝程式修復、原生更新、預覽發行同驗證。'},
 schedules:{en:'Scheduled settings, customization and external sources.',yue:'排程設定、自訂同外部來源。'},
 'server-manager':{en:'Server preparation, native supervision and file leases.',yue:'伺服器準備、原生監督同檔案租約。'},
 storage:{en:'The native vault, physical packing, file history and Git transport.',yue:'原生保險庫、實體打包、檔案紀錄同 Git 傳輸。'},
 'surface-foundation':{en:'Layout, notifications, updates panel and workflow handoffs shared by every surface.',yue:'每個畫面共用嘅版面、通知、更新面板同工作流程交接。'},
 workflows:{en:'Browser download handoff, extension evidence and the native browser host.',yue:'瀏覽器下載交接、擴充功能證據同原生瀏覽器主機。'}
});
export const minutesToRead = markdown => Math.max(1, Math.ceil((markdown.replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length / 200));
export const categoryName = category => category.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
