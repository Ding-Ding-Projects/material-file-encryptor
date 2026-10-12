import '../../src/shared/surface/material.js';
import '../../src/shared/surface/search.js';
import {scenarios} from './scenarios.js';
import {captureFocusKey,restoreReferenceFocus} from './focus.js';

// All content is an explicitly labelled design fixture. No production API calls.
const params = new URLSearchParams(location.search);
const allowedScreens = ['popup', 'transfers', 'settings', 'capabilities', 'access', 'history', 'notifications', 'documentation', 'status', 'shared-overlays'];
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
Object.assign(copy,{access:['Access','存取'],history:['History','歷史'],notifications:['Notifications','通知'],documentation:['Documentation','文件'],status:['Status','狀態'],'shared-overlays':['Contextual controls','情境控制']});
class ExtensionReference extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode: 'open'});
    this.screen = allowedScreens.includes(params.get('screen')) ? params.get('screen') : 'popup';
    const requested=params.get('state');
    this.state = scenarios[this.screen]?.[requested] || allowedStates.includes(requested) ? requested : (this.screen==='popup'?'unpaired':Object.keys(scenarios[this.screen]||{})[0]);
    this.connection = ['unpaired','pairing','paired','unavailable','checking'].includes(params.get('connection')) ? params.get('connection') : null;
    this.language = ['en', 'yue', 'bilingual'].includes(params.get('language')) ? params.get('language') : 'en';
    this.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  }
  connectedCallback() { this.render(); }
  t(en, yue) { return this.language === 'yue' ? yue : this.language === 'bilingual' ? `${en}\u2063${yue}` : en; }
  text(pair) { return this.t(...pair); }
  button(en, yue, action, kind = 'md-outlined-button', focusKey = `action:${en}:${yue}`) {
    const button = node(kind, this.t(en, yue), {type: 'button','data-focus-key':focusKey});
    button.addEventListener('click',event=>{this.initiatingFocusKey=focusKey;try{action(event);}finally{this.initiatingFocusKey=null;}});return button;
  }
  unavailable(en, yue) {
    const button = this.button(en, yue, () => {}); button.disabled = true; return button;
  }
  go(screen, state, focusKey) { this.screen = screen; this.state=state || (screen==='popup'||screen==='transfers'?'unpaired':Object.keys(scenarios[screen]||{})[0]); this.render(focusKey); }
  paragraph(en, yue, className = '') { return node('p', this.t(en, yue), {class: className}); }
  section(en, yue) {
    const region = node('section', '', {class: 'surface'});
    region.append(node('h2', this.t(en, yue))); return region;
  }
  render(requestedFocusKey) {
    const focusKey=requestedFocusKey||this.initiatingFocusKey||captureFocusKey(this.shadowRoot);
    const renderGeneration=this.renderGeneration=(this.renderGeneration||0)+1;
    const savedLanguage=this.language;
    if(this.screen==='settings'&&this.state==='shared-mode-active')this.language='en';
    document.documentElement.lang = this.language === 'yue' ? 'zh-HK' : 'en';
    const dark = this.theme === 'dark';
    const style = node('style'); style.textContent = `
      :host{--md-sys-color-primary:${dark?'#b5c4ff':'#405d9b'};--md-sys-color-on-primary:${dark?'#08275f':'#fff'};--md-sys-color-surface:${dark?'#121318':'#f8f9ff'};--md-sys-color-on-surface:${dark?'#e3e2e9':'#1a1b20'};--md-sys-color-outline:${dark?'#91929d':'#747780'};--md-sys-color-surface-container:${dark?'#202128':'#eff0f7'};display:block;color:var(--md-sys-color-on-surface);background:var(--md-sys-color-surface);font:400 14px/1.5 system-ui,sans-serif;min-height:100vh}
      *{box-sizing:border-box}main{padding:20px;max-width:1320px;margin:auto;min-width:0}main.popup{max-width:440px;padding:16px}.reference{padding:12px 20px;border-bottom:1px solid var(--md-sys-color-outline);font-size:12px}h1{font-size:24px;line-height:1.25;margin:0;overflow-wrap:anywhere}h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:0}p{margin:8px 0;overflow-wrap:anywhere}.muted{opacity:.78}.eyebrow{font-size:12px;font-weight:600}header{display:flex;gap:16px;justify-content:space-between;align-items:start;flex-wrap:wrap;margin-bottom:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.surface{padding:20px;border-radius:20px;background:var(--md-sys-color-surface-container);margin:14px 0;min-width:0}.popup .surface{padding:16px}.grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,1fr);gap:20px}.status{font-size:18px;font-weight:600;margin:6px 0}.rows{display:grid;gap:0}.row{padding:16px 0;border-bottom:1px solid var(--md-sys-color-outline)}.row:last-child{border:0}.field{display:grid;gap:10px;margin:20px 0}md-tabs{max-width:100%}.tabs{overflow-x:auto}md-primary-tab{min-width:100px}md-outlined-button,md-filled-button,md-text-button{min-height:44px;max-width:100%}md-outlined-text-field{width:100%;min-width:0}md-slider{width:100%;max-width:440px}a{color:var(--md-sys-color-primary)}:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:3px}.progress{padding:12px 0}footer{padding-top:12px;font-size:12px}.design-tools{margin-top:24px;border-top:1px solid var(--md-sys-color-outline);padding-top:12px}.design-tools .actions{margin-top:8px}@media(max-width:680px){.grid{grid-template-columns:minmax(0,1fr);gap:0}main{padding:12px}.surface{padding:16px}h1{font-size:22px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    style.textContent+=' .primary,.secondary{display:block;white-space:normal;overflow-wrap:anywhere}.secondary{font-size:.85em;opacity:.8}.inspector{max-width:720px}.field md-switch{justify-self:start}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail{padding:12px;border:1px solid var(--md-sys-color-outline);border-radius:12px}.fixture-list{display:grid;gap:8px;margin:12px 0}.item{display:flex;gap:12px;align-items:center;min-height:48px}.item p{flex:1;min-width:0}code{white-space:pre-wrap;overflow-wrap:anywhere}.overlay-surface{border:2px solid var(--md-sys-color-outline);box-shadow:0 4px 16px #0002}@media(max-width:420px){.pair{grid-template-columns:1fr}}';
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
      const destinations=['transfers','settings','capabilities','access','history','notifications','documentation','status'];
      for (const screen of destinations) { const tab=node('md-primary-tab',this.text(copy[screen]),{id:`tab-${screen}`,'data-focus-key':`tab-${screen}`,'aria-controls':`panel-${screen}`,'aria-selected':String(this.screen===screen),tabindex:this.screen===screen?'0':'-1'});tab.active=this.screen===screen;tab.addEventListener('click',()=>this.go(screen));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=destinations.indexOf(screen);const next=event.key==='Home'?0:event.key==='End'?destinations.length-1:(index+(event.key==='ArrowRight'?1:-1)+destinations.length)%destinations.length;this.go(destinations[next],undefined,`tab-${destinations[next]}`);});tabs.append(tab); }
      bar.append(tabs);main.append(bar);
    }
    const standalone=['popup','shared-overlays'].includes(this.screen);
    const content=node('div','',{id:`panel-${this.screen}`,role:standalone?'region':'tabpanel',...(standalone?{'aria-label':this.text(copy[this.screen])}:{'aria-labelledby':`tab-${this.screen}`}),tabindex:'0'});
    if(scenarios[this.screen]?.[this.state])this.renderScenario(content,scenarios[this.screen][this.state]);
    else if(['popup','transfers'].includes(this.screen))this.renderTransfers(content);
    main.append(content);
    if(this.screen!=='popup')for(const screen of ['transfers','settings','capabilities','access','history','notifications','documentation','status'])if(screen!==this.screen)main.append(node('div','',{id:`panel-${screen}`,role:'tabpanel','aria-labelledby':`tab-${screen}`,hidden:''}));
    const tools=node('section','',{class:'design-tools','aria-label':this.t('Design preview controls','設計預覽控制')});
    tools.append(node('h2',this.t('Reference controls','參考控制')));
    const languages=node('div','',{class:'actions'});
    for(const [id,label] of [['en','English'],['yue','廣東話'],['bilingual','English · 廣東話']])languages.append(this.button(label,label,()=>{this.language=id;this.render();},this.language===id?'md-filled-tonal-button':'md-text-button',`reference-language:${id}`));
    if(this.state!=='shared-mode-active')tools.append(languages);
    tools.append(this.button(dark?'Preview light theme':'Preview dark theme',dark?'預覽淺色主題':'預覽深色主題',()=>{this.theme=dark?'light':'dark';this.render();},'md-outlined-button','reference-theme'));
    const states=node('div','',{class:'actions'});
    const currentStates=[...new Set([...(['popup','transfers'].includes(this.screen)?allowedStates:[]),...Object.keys(scenarios[this.screen]||{})])];
    for(const state of currentStates){if(this.state==='shared-mode-active'&&state!=='shared-mode-unavailable'&&state!=='shared-mode-active')continue;const label=scenarios[this.screen]?.[state]?.slice(0,2)||copy[state];states.append(this.button(...label,()=>{this.state=state;this.render();},this.state===state?'md-filled-tonal-button':'md-text-button',`reference-state:${this.screen}:${state}`));}
    const screens=node('div','',{class:'actions'});for(const screen of allowedScreens)screens.append(this.button(...copy[screen],()=>this.go(screen),'md-text-button'));
    tools.append(states,screens);main.append(tools,node('footer',this.t('Design state only. No operation, storage, pairing or release acceptance is claimed.','僅屬設計狀態。並未聲稱操作、儲存、配對或發佈已通過驗收。')));this.shadowRoot.append(main);
    const walker=document.createTreeWalker(this.shadowRoot,NodeFilter.SHOW_TEXT);const pending=[];while(walker.nextNode())if(walker.currentNode.textContent.includes('\u2063'))pending.push(walker.currentNode);
    for(const textNode of pending){const parts=textNode.textContent.split('\u2063');const fragment=document.createDocumentFragment();parts.forEach((part,index)=>fragment.append(node('span',part,{class:index?'secondary':'primary',lang:index?'zh-HK':'en'})));textNode.replaceWith(fragment);}
    for(const el of this.shadowRoot.querySelectorAll('*'))for(const attr of [...el.attributes])if(attr.value.includes('\u2063'))el.setAttribute(attr.name,attr.value.replaceAll('\u2063',', '));
    this.language=savedLanguage;
    this.focusRestored=restoreReferenceFocus(this.shadowRoot,focusKey,()=>this.renderGeneration===renderGeneration);
  }
  renderTransfers(main) {
    const connection=this.section('Browser connection','瀏覽器連線');
    const connectionState=this.connection||(['unpaired','pairing','unavailable','checking'].includes(this.state)?this.state:this.state==='unknown'?'unavailable':'paired');
    connection.append(node('p',this.text(copy[connectionState]||['Checking connection','檢查連線']),{class:'status',role:'status'}));
    connection.append(this.paragraph('Pairing requires approval in the unlocked desktop. Approval does not start a download.','配對需要喺已解鎖桌面批准。批准配對唔會開始下載。'));
    const actions=node('div','',{class:'actions'});actions.append(this.unavailable('Pair browser','配對瀏覽器'),this.unavailable('Disconnect','中斷連線'));
    connection.append(actions,this.paragraph('Native actions are disabled in this reference.','呢份參考已停用原生操作。','muted'));
    const transfer=this.section('Latest handoff','最新交接');
    transfer.append(node('p',this.text(copy[this.state]),{class:'status'}));
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
  renderScenario(main, scenario) {
    const [en,yue,fact,factYue,kind,label,labelYue,next]=scenario;
    const region=this.section(en,yue);region.classList.add('inspector');
    if(this.screen==='shared-overlays')region.classList.add('overlay-surface');
    region.append(this.paragraph(fact,factYue));
    const status=node('p',this.t('Design controls are temporary. No live operation will run.','設計控制只係暫時狀態，唔會執行實際操作。'),{role:'status',class:'muted'});
    const field=(en,yue,value='',disabled=false)=>{
      const box=node('div','',{class:'field'}),input=node('md-outlined-text-field','',{label:this.t(en,yue)});input.value=value;input.disabled=disabled;
      const clear=this.button(`Clear ${en}`,`清除${yue}`,()=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();},'md-text-button');clear.disabled=disabled;
      box.append(input,clear);region.append(box);return input;
    };
    const choices=(pairs,{disabled=false}={})=>{const row=node('div','',{class:'actions'});for(const pair of pairs){const button=this.button(...pair,()=>{for(const sibling of row.children)sibling.setAttribute('aria-pressed','false');button.setAttribute('aria-pressed','true');status.textContent=this.t('Preview selection changed only.','只更改咗預覽選擇。');},'md-outlined-button');button.setAttribute('aria-pressed','false');button.disabled=disabled;row.append(button);}region.append(row);};
    const toggle=(en,yue)=>{const row=node('div','',{class:'item'}),control=node('md-switch','',{'aria-label':this.t(en,yue)});row.append(control,this.paragraph(en,yue));region.append(row);};
    const range=(en,yue,min,max,value)=>{const box=node('div','',{class:'field'});box.append(node('h3',this.t(en,yue)));const slider=node('md-slider','',{min:String(min),max:String(max),value:String(value),step:'1',labeled:'','aria-label':this.t(en,yue)});box.append(slider);region.append(box);};
    const search=()=>{const control=node('mfe-search','',{label:this.t('Search this collection','搜尋此清單')});control.setLanguage?.(this.language);region.append(control);return control;};
    const list=pairs=>{const query=search(),rows=node('div','',{class:'fixture-list'});for(const pair of pairs){const row=node('div','',{class:'item'});row.dataset.search=this.text(pair);row.append(this.paragraph(...pair));rows.append(row);}query.addEventListener('search-change',async()=>{const all=[...rows.children],result=await query.filter(all.map((row,id)=>({id,text:row.dataset.search})));if(result===null)return;const found=new Set(result.map(row=>row.id));all.forEach((row,id)=>row.hidden=!found.has(id));});region.append(rows);};
    if(kind==='busy')region.append(node('md-linear-progress','',{indeterminate:''}),this.paragraph('Waiting state. No percentage can be inferred.','等待狀態，無法推算百分比。'));
    if(kind==='unavailable'||kind==='invalid'){region.append(this.unavailable(label,labelYue));if(kind==='invalid')region.append(this.paragraph('The previous valid state is preserved. Review the exact reason above.','保留之前有效狀態。請檢閱上方確切原因。'));}
    if(kind==='empty')region.append(this.paragraph('This collection has no real records in the design reference.','呢份設計參考冇實際記錄。'));
    if(kind==='file')region.append(this.unavailable(label,labelYue),this.paragraph('Reference file access is disabled. Production uses the shared semantic local file picker.','參考已停用檔案存取。產品會使用共用語意本機選檔控制。'));
    if(kind==='choice')choices([['Replace local JSON','取代本機 JSON'],['Clear local cache','清除本機快取']]);
    if(kind==='language'){choices([['English','英文'],['Cantonese','廣東話'],['Bilingual','雙語']]);range('English voice level','英文語氣級別',1,5,5);range('Cantonese voice level','廣東話語氣級別',1,5,5);toggle('Show emojis in dialogs','喺對話框顯示表情圖示');}
    if(kind==='attention')for(const pair of [['Focus','專注'],['Low stimulation','低刺激'],['Time awareness','時間意識'],['One thing at a time','一次一件事'],['Momentum','持續動力']])toggle(...pair);
    if(kind==='appearance'){field('Selected element','所選元素','Transfer status',true);choices([['Normal','一般'],['Hover','懸停'],['Focus','焦點'],['Disabled','停用']]);range('Text size','文字大小',12,32,16);range('Corner radius','圓角半徑',0,32,20);field('Color value','顏色值','#405d9b');toggle('Respect reduced motion','遵從減少動態設定');choices([['Reset selected property','重設所選屬性'],['Preview contrast guidance','預覽對比指引']]);}
    if(kind==='schedule'){field('Rule label','規則標籤');field('Start date (ISO)','開始日期（ISO）');field('End date (ISO)','結束日期（ISO）');field('Start time','開始時間','18:00');field('End time','結束時間','22:00');toggle('Every day','每日');choices([['Local value','本機值'],['HTTPS source unavailable','HTTPS 來源不可用'],['Home Assistant unavailable','Home Assistant 不可用']]);region.append(this.paragraph('Production requires anchored calendar pickers, timezone and DST validation. These are editable reference text controls only.','產品需要錨定日曆選擇器、時區同夏令時間驗證。呢度只係可編輯參考文字控制。'));}
    if(kind==='voice'){toggle('Enable narration','啟用語音導讀');choices([['Choose automatically','自動選擇']],{disabled:true});range('Speech rate','語速',1,20,10);range('Pitch','音高',0,20,10);region.append(this.paragraph('Reference scale is visual only; production uses documented platform ranges and stable voice identities.','參考刻度只供視覺用途。產品使用平台規定範圍同固定語音身分。'));}
    if(kind==='converter'){list([['Documents / PDF','文件 / PDF'],['Images','圖片'],['Audio','音訊'],['Video','影片'],['Archives','壓縮檔'],['Structured data / spreadsheets','結構資料 / 試算表'],['Code / text','程式碼 / 文字'],['Binary encodings','二進位編碼']]);region.append(this.unavailable(label,labelYue));}
    if(kind==='progress'){region.append(node('md-linear-progress','',{indeterminate:''}));choices([['Pause preview','暫停預覽'],['Resume preview','繼續預覽'],['Cancel preview','取消預覽']]);}
    if(kind==='results')list([['Fixture row A: converted','示例 A：已轉換'],['Fixture row B: skipped','示例 B：已略過'],['Fixture row C: failed','示例 C：失敗']]);
    if(kind==='model'){search();choices([['All families','所有系列'],['Installed','已安裝'],['Running','執行中'],['Hardware fit unknown','硬件適合度未知']]);field('Context limit from verified metadata','由有效資料提供上下文限制','Unavailable',true);region.append(this.unavailable('Select verified variant','揀選有效版本'));}
    if(kind==='server'){list([['Local process','本機程序'],['Local container','本機容器'],['SSH process','SSH 程序'],['SSH container','SSH 容器']]);choices([['Java','Java'],['Bedrock','Bedrock']],{disabled:true});region.append(this.unavailable('Choose a verified server distribution','揀選經驗證伺服器發行版本'));}
    if(kind==='server-config'){field('Server version descriptor','伺服器版本描述','Unavailable',true);region.append(this.paragraph('No descriptor means no guessed bounds, defaults or writable configuration. Controls below show control types only.','未有描述就唔會猜測範圍、預設或可寫設定。以下只顯示控制類型。'));const sw=node('md-switch','',{'aria-label':this.t('Boolean setting unavailable','布林設定不可用')});sw.disabled=true;region.append(sw);field('Numeric setting unavailable','數值設定不可用','',true);region.append(this.unavailable('Edit permission matrix','編輯權限矩陣'));}
    if(kind==='lock'){list([['PIN','PIN'],['Password','密碼'],['PIN plus password','PIN 加密碼'],['Password plus TOTP','密碼加 TOTP'],['PIN plus TOTP','PIN 加 TOTP'],['Password plus PIN plus TOTP','密碼加 PIN 加 TOTP']]);choices([['This surface only','只限此介面'],['For a set duration','指定時段'],['Until page closes','直至頁面關閉']]);region.append(this.unavailable('Configure native credential','設定原生憑證'),this.paragraph('No credential entry is enabled in this design reference.','呢份設計參考未啟用憑證輸入。'));}
    if(kind==='ladder'){region.append(this.paragraph('Design remaining wait: 30 seconds, frozen. Challenge generation and grading need the authoritative local service.','設計剩餘等待：30 秒，已固定。挑戰產生同評分需要具權威嘅本機服務。'));choices([['Food challenge','食物挑戰'],['Arithmetic','算術'],['Timed activity','限時活動'],['Wait','等待']],{disabled:true});}
    if(kind==='authenticator'){list([['Authenticator URI','驗證器 URI'],['Local QR image','本機 QR 圖片'],['Clipboard image','剪貼簿圖片'],['Camera','相機'],['Manual entry','手動輸入']]);region.append(this.unavailable('Begin registration','開始登記'));}
    if(kind==='support'){field('Local ticket category','本機支援單類別');field(label,labelYue);region.append(this.paragraph('Fixture only. Nothing is saved or submitted. The disclosure remains literal at every voice level.','只屬示例，唔會儲存或提交任何資料。所有語氣級別都保留同一披露事實。'));}
    if(kind==='history'){search();field('From date (ISO)','起始日期（ISO）');field('To date (ISO)','結束日期（ISO）');choices([['All dates','所有日期'],['Last seven days','最近七日'],['Custom range','自訂範圍']]);region.append(this.paragraph('No real action counts available. Production derives action filters from actual history.','未有實際操作數目。產品會由實際歷史產生操作篩選。'));}
    if(kind==='diff'){const pair=node('div','',{class:'pair'});pair.append(node('code','Before: { "theme": "light" }',{class:'detail'}),node('code','After: { "theme": "dark" }',{class:'detail'}));region.append(pair,this.paragraph('Credentials, private vocabulary and source-file metadata omitted.','已排除憑證、私人詞彙同來源檔案資料。'));}
    if(kind==='selection'){const item=node('md-checkbox','',{'aria-label':this.t(label,labelYue)});region.append(item,this.paragraph(label,labelYue));toggle('Include pinned records','包括固定記錄');toggle('Include locked records after review','檢閱後包括已鎖定記錄');}
    if(kind==='notification'){list([['Connection lost: retry requires pairing','連線中斷：重試需要配對']]);choices([['Mark read','標記已讀'],['Keep unread','保留未讀']]);}
    if(kind==='docs')list([['Pairing and download consent','配對與下載同意'],['Connection recovery','連線復原'],['Local privacy and storage','本機私隱與儲存'],['Capability limitations','能力限制']]);
    if(kind==='article'){region.append(node('h3',this.t('Review before transfer','傳輸前檢閱')),this.paragraph('1. Pair with explicit consent. 2. Propose a public HTTPS link. 3. Review the destination. 4. Confirm Start download in the desktop.','1. 明確同意配對。2. 提出公開 HTTPS 連結。3. 檢閱目的地。4. 喺桌面確認開始下載。'));}
    if(kind==='status')list([['Observed capability: download handoff','已觀察能力：下載交接'],['Package version: unavailable','套件版本：不可用'],['Source identity: unavailable','來源身分：不可用'],['Observed at: unavailable','觀察時間：不可用']]);
    if(['palette','menu','group'].includes(kind)){search();list(kind==='palette'?[['Personalize: language','個人化：語言'],['Transfers: connection','傳輸：連線'],['Privacy: local vocabulary','私隱：本機詞彙']]:kind==='menu'?[['Inspect record','檢查記錄'],['Export selection','匯出所選內容'],['Move into group…','移入群組…']]:[['No groups yet','未有群組']]);if(kind==='group')field(label,labelYue);}
    if(kind==='regex'){search();region.append(this.paragraph('Use the adjacent builder on the shared search control above. It runs against the local reference only.','使用上方共用搜尋控制旁嘅建立器，只會喺本機參考運作。'));}
    if(kind==='guide'){region.append(node('h3',this.t('Step 1 of 3: choose scope','第 1 步，共 3 步：揀選範圍')));choices([['This element','此元素'],['Selected elements','所選元素']]);choices([['Back','返回'],['Cancel guidance','取消指引'],['Next preview step','下一個預覽步驟']]);field('Direct value remains available','仍可直接輸入值');}
    if(kind==='confirmation'){toggle('The listed selection is correct','列出嘅選取範圍正確');toggle('The documented consequences are understood','已了解所述後果');region.append(this.unavailable('Confirm destructive operation','確認破壞性操作'));}
    if(kind==='export'){search();choices([['JSON','JSON'],['JSONL','JSONL'],['YAML','YAML'],['TOML','TOML'],['XML','XML'],['CSV','CSV'],['TSV','TSV'],['Markdown','Markdown'],['HTML','HTML']]);toggle('Export only selected records','只匯出所選記錄');region.append(this.unavailable('Export reviewed selection','匯出已檢閱內容'));}
    region.append(status);
    const actions=node('div','',{class:'actions'});actions.append(this.button('Preview next state','預覽下一個狀態',()=>this.go(this.screen,next),'md-filled-tonal-button'),this.button('Return to transfers','返回傳輸',()=>this.go('transfers'),'md-text-button'));region.append(actions);main.append(region);
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
