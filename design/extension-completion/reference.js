import '../../src/shared/surface/material.js';

// All content is an explicitly labelled design fixture. No production API calls.
const params = new URLSearchParams(location.search);
const allowedScreens = ['popup', 'transfers', 'settings', 'capabilities'];
const allowedStates = ['unpaired', 'pairing', 'paired', 'awaiting-confirmation', 'downloading', 'completed', 'failed', 'cancelled', 'unavailable', 'unknown'];
const copy = {
  popup: ['Popup', '彈出視窗'], transfers: ['Transfers', '傳輸'], settings: ['Personalize', '個人化'], capabilities: ['Tools', '工具'],
  unpaired: ['Not paired', '未配對'], pairing: ['Waiting for desktop approval', '等待桌面批准'], paired: ['Paired', '已配對'],
  'awaiting-confirmation': ['Awaiting desktop confirmation', '等待桌面確認'], downloading: ['Downloading', '下載中'], completed: ['Completed', '已完成'],
  failed: ['Transfer failed', '傳輸失敗'], cancelled: ['Cancelled', '已取消'], unavailable: ['Native connection unavailable', '原生連線不可用'], unknown: ['Current transfer state unknown', '目前傳輸狀態不明']
};
const node = (tag, text, attrs = {}) => {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
  return result;
};
class ExtensionReference extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode: 'open'});
    this.screen = allowedScreens.includes(params.get('screen')) ? params.get('screen') : 'popup';
    this.state = allowedStates.includes(params.get('state')) ? params.get('state') : 'unpaired';
    this.language = ['en', 'yue', 'bilingual'].includes(params.get('language')) ? params.get('language') : 'en';
    this.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  }
  connectedCallback() { this.render(); }
  t(en, yue) { return this.language === 'yue' ? yue : this.language === 'bilingual' ? `${en} · ${yue}` : en; }
  text(pair) { return this.t(...pair); }
  button(en, yue, action, kind = 'md-outlined-button') {
    const button = node(kind, this.t(en, yue), {type: 'button'});
    button.addEventListener('click', action); return button;
  }
  unavailable(en, yue) {
    const button = this.button(en, yue, () => {}); button.disabled = true; return button;
  }
  go(screen) { this.screen = screen; this.render(); this.shadowRoot.querySelector('h1')?.focus(); }
  paragraph(en, yue, className = '') { return node('p', this.t(en, yue), {class: className}); }
  section(en, yue) {
    const region = node('section', '', {class: 'surface'});
    region.append(node('h2', this.t(en, yue))); return region;
  }
  render() {
    document.documentElement.lang = this.language === 'yue' ? 'zh-HK' : 'en';
    const dark = this.theme === 'dark';
    const style = node('style'); style.textContent = `
      :host{--md-sys-color-primary:${dark?'#b5c4ff':'#405d9b'};--md-sys-color-on-primary:${dark?'#08275f':'#fff'};--md-sys-color-surface:${dark?'#121318':'#f8f9ff'};--md-sys-color-on-surface:${dark?'#e3e2e9':'#1a1b20'};--md-sys-color-outline:${dark?'#91929d':'#747780'};--md-sys-color-surface-container:${dark?'#202128':'#eff0f7'};display:block;color:var(--md-sys-color-on-surface);background:var(--md-sys-color-surface);font:400 14px/1.5 system-ui,sans-serif;min-height:100vh}
      *{box-sizing:border-box}main{padding:20px;max-width:1320px;margin:auto;min-width:0}main.popup{max-width:440px;padding:16px}.reference{padding:12px 20px;border-bottom:1px solid var(--md-sys-color-outline);font-size:12px}h1{font-size:24px;line-height:1.25;margin:0;overflow-wrap:anywhere}h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:0}p{margin:8px 0;overflow-wrap:anywhere}.muted{opacity:.78}.eyebrow{font-size:12px;font-weight:600}header{display:flex;gap:16px;justify-content:space-between;align-items:start;flex-wrap:wrap;margin-bottom:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.surface{padding:20px;border-radius:20px;background:var(--md-sys-color-surface-container);margin:14px 0;min-width:0}.popup .surface{padding:16px}.grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,1fr);gap:20px}.status{font-size:18px;font-weight:600;margin:6px 0}.rows{display:grid;gap:0}.row{padding:16px 0;border-bottom:1px solid var(--md-sys-color-outline)}.row:last-child{border:0}.field{display:grid;gap:10px;margin:20px 0}md-tabs{max-width:100%}.tabs{overflow-x:auto}md-primary-tab{min-width:100px}md-outlined-button,md-filled-button,md-text-button{min-height:44px;max-width:100%}md-outlined-text-field{width:100%;min-width:0}md-slider{width:100%;max-width:440px}a{color:var(--md-sys-color-primary)}:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:3px}.progress{padding:12px 0}footer{padding-top:12px;font-size:12px}.design-tools{margin-top:24px;border-top:1px solid var(--md-sys-color-outline);padding-top:12px}.design-tools .actions{margin-top:8px}@media(max-width:680px){.grid{grid-template-columns:minmax(0,1fr);gap:0}main{padding:12px}.surface{padding:16px}h1{font-size:22px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    this.shadowRoot.replaceChildren(style);
    this.shadowRoot.append(node('div', this.t('DESIGN REFERENCE • No live connection • Controls below change the preview only', '設計參考 • 未連接實際服務 • 以下控制只會更改預覽'), {class:'reference',role:'note'}));
    const main = node('main', '', {class:this.screen === 'popup' ? 'popup' : ''});
    const header = node('header'); const identity = node('div');
    identity.append(node('div','Material File Encryptor',{class:'eyebrow'}), node('h1',this.screen === 'popup' ? this.t('Download handoff','下載交接') : this.text(copy[this.screen]),{tabindex:'-1'}),this.paragraph('Version unavailable · Updated at unavailable','版本資料不可用 · 更新時間不可用','muted'));
    header.append(identity);
    if (this.screen === 'popup') header.append(this.button('Open workspace','開啟工作區',()=>this.go('transfers'),'md-filled-button'));
    main.append(header);
    if(this.screen !== 'popup') {
      const bar=node('div','',{class:'tabs'}),tabs=node('md-tabs','',{'aria-label':this.t('Reference workspace destinations','參考工作區目的地')});
      for (const screen of ['transfers','settings','capabilities']) { const tab=node('md-primary-tab',this.text(copy[screen]));tab.active=this.screen===screen;tab.addEventListener('click',()=>this.go(screen));tabs.append(tab); }
      bar.append(tabs);main.append(bar);
    }
    if(['popup','transfers'].includes(this.screen))this.renderTransfers(main);
    if(this.screen==='settings')this.renderSettings(main);
    if(this.screen==='capabilities')this.renderCapabilities(main);
    const tools=node('section','',{class:'design-tools','aria-label':this.t('Design preview controls','設計預覽控制')});
    tools.append(node('h2',this.t('Reference controls','參考控制')));
    const languages=node('div','',{class:'actions'});
    for(const [id,label] of [['en','English'],['yue','廣東話'],['bilingual','English · 廣東話']])languages.append(this.button(label,label,()=>{this.language=id;this.render();},this.language===id?'md-filled-tonal-button':'md-text-button'));
    tools.append(languages,this.button(dark?'Preview light theme':'Preview dark theme',dark?'預覽淺色主題':'預覽深色主題',()=>{this.theme=dark?'light':'dark';this.render();}));
    const states=node('div','',{class:'actions'});
    if(['popup','transfers'].includes(this.screen))for(const state of allowedStates)states.append(this.button(...copy[state],()=>{this.state=state;this.render();},this.state===state?'md-filled-tonal-button':'md-text-button'));
    tools.append(states);main.append(tools,node('footer',this.t('Design state only. No operation, storage, pairing or release acceptance is claimed.','僅屬設計狀態。並未聲稱操作、儲存、配對或發佈已通過驗收。')));this.shadowRoot.append(main);
  }
  renderTransfers(main) {
    const connection=this.section('Browser connection','瀏覽器連線');
    connection.append(node('p',this.text(copy[this.state]),{class:'status',role:'status'}));
    connection.append(this.paragraph('Pairing requires approval in the unlocked desktop. Approval does not start a download.','配對需要喺已解鎖桌面批准。批准配對唔會開始下載。'));
    const actions=node('div','',{class:'actions'});actions.append(this.unavailable('Pair browser','配對瀏覽器'),this.unavailable('Disconnect','中斷連線'));
    connection.append(actions,this.paragraph('Native actions are disabled in this reference.','呢份參考已停用原生操作。','muted'));
    const transfer=this.section('Latest handoff','最新交接');
    if(['unpaired','pairing','paired','unavailable'].includes(this.state))transfer.append(this.paragraph('No transfer to show. After pairing, right-click a public HTTPS link and choose the download handoff action.','未有傳輸可顯示。配對後右按公開 HTTPS 連結，再揀下載交接操作。'));
    else {
      transfer.append(node('h3',this.t('Design fixture: selected download','設計示例：已選下載')),this.paragraph(this.state==='unknown'?'Connection lost. The last observation is not current status.':'The destination and source stay in the desktop review surface.',this.state==='unknown'?'連線已中斷。上次觀察唔代表目前狀態。':'目的地同來源只會喺桌面檢閱介面顯示。'));
      if(this.state==='downloading')transfer.append(this.paragraph('Received 4 MiB · Total unknown · No estimated completion time','已接收 4 MiB · 總量不明 · 未有預計完成時間','progress'));
      if(this.state==='completed')transfer.append(this.paragraph('Completion must come from the correlated native event.','完成狀態必須來自對應嘅原生事件。'));
      if(this.state==='failed')transfer.append(this.paragraph('Keep the source unchanged. Review the exact failure and retry in the desktop.','保留來源不變。喺桌面檢閱實際錯誤後重試。'));
    }
    transfer.append(this.paragraph('No transfer starts here. Destination selection and Start download remain separate desktop decisions.','呢度唔會開始傳輸。揀目的地同開始下載仍然係兩個獨立桌面決定。','muted'));
    if(this.screen==='popup'){main.append(connection,transfer,this.button('Personalize extension','個人化擴充功能',()=>this.go('settings')));return;}
    const grid=node('div','',{class:'grid'}),left=node('div'),right=this.section('Review and recovery','檢閱與復原');left.append(connection,transfer);
    right.append(this.paragraph('Closing the popup does not cancel a desktop transfer. Reopen and refresh its correlated status. Never infer completion from a submitted proposal.','關閉彈出視窗唔會取消桌面傳輸。重新開啟後更新對應狀態。唔可以因為已提交建議就當作完成。'),this.paragraph('Pairing lost or expired? Pair again, then submit the link deliberately. No automatic replay.','配對已失效或過期？重新配對後再自行提交連結，唔會自動重播。'));grid.append(left,right);main.append(grid);
  }
  renderSettings(main) {
    const grid=node('div','',{class:'grid'}),settings=this.section('Language and reading','語言與閱讀'),privacy=this.section('Local personal vocabulary','本機個人詞彙');
    settings.append(this.paragraph('English and Cantonese voice levels default to 5. They style every message while preserving facts.','英文同廣東話語氣級別預設為 5。所有訊息會按級別調整語氣，事實保持不變。'));
    for(const [en,yue] of [['English voice level','英文語氣級別'],['Cantonese voice level','廣東話語氣級別']]){const field=node('div','',{class:'field'}),slider=node('md-slider','',{min:'1',max:'5',value:'5',step:'1',labeled:'','aria-label':this.t(en,yue)});slider.disabled=true;field.append(node('h3',this.t(en,yue)),slider,this.paragraph('Design default: 5. Persistence and message consumers require implementation.','設計預設值：5。持久儲存同訊息連接仍待實作。','muted'));settings.append(field);}
    privacy.append(node('p',this.t('No file loaded','未載入檔案'),{class:'status'}),this.paragraph('Choose a local JSON file. Validate the entire file before applying it. Replacing or clearing changes only private extension text.','揀選本機 JSON 檔案。套用前先驗證整個檔案。取代或清除只會改變私人擴充功能文字。'),this.unavailable('Choose local JSON','揀選本機 JSON'),this.paragraph('Picker is disabled in this reference. File contents and file metadata never enter exports, history, diagnostics or native messages.','呢份參考已停用選檔。檔案內容同資料唔會進入匯出、歷史、診斷或原生訊息。','muted'));
    const mode=this.section('Shared mode connection','共用模式連線');mode.append(this.paragraph('Unavailable: the current native protocol does not expose shared mode read, watch, rename or unlock actions. Do not substitute an independent switch.','不可用：目前原生協定未提供共用模式讀取、監察、改名或解鎖操作。唔可以用獨立開關代替。'));
    const left=node('div');left.append(settings,mode);grid.append(left,privacy);main.append(grid);
  }
  renderCapabilities(main) {
    const region=this.section('Tool workspaces','工具工作區');region.append(this.paragraph('Each tool owns its controls here. Native execution stays unavailable until a reviewed capability adapter is installed and paired.','每個工具喺呢度都有自己嘅控制。安裝同配對經審閱嘅能力介面之前，原生執行維持不可用。'));
    for(const [en,yue,reason,reasonYue] of [
      ['File converter','檔案轉換器','Browser-safe adapters need bundled proof. Native PDF/media adapters are not exposed by the current handoff protocol.','瀏覽器安全轉換器需要隨附驗證。現有交接協定未提供原生 PDF 或媒體轉換器。'],
      ['Local model manager','本機模型管理','No direct loopback fetch. The current protocol provides no model catalog, health, model operations or hardware evidence.','唔會直接存取本機網絡。現有協定未提供模型目錄、健康狀態、操作或硬件證據。'],
      ['Server manager','伺服器管理','All four targets need typed, permission-checked native adapters. No process, container or SSH operation is currently available.','四個目標都需要有類型同權限檢查嘅原生介面。目前未提供程序、容器或 SSH 操作。'],
      ['Authenticator and protected history','驗證器與受保護歷史','The extension has no operating-system credential vault or local Git history adapter. Browser storage must not be presented as either.','擴充功能未有作業系統憑證儲存庫或本機 Git 歷史介面。唔可以將瀏覽器儲存當成兩者。']
    ]){const row=node('div','',{class:'row'});row.append(node('h3',this.t(en,yue)),this.paragraph(reason,reasonYue),this.unavailable('Set up native capability','設定原生能力'));region.append(row);}main.append(region);
  }
}
customElements.define('mfe-extension-reference',ExtensionReference);
