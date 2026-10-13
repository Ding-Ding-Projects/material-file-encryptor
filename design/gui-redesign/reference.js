// Static design illustration only. No vault, network, product bridge or live data.
const q = new URLSearchParams(location.search);
const allowed = (key, values, fallback) => values.includes(q.get(key)) ? q.get(key) : fallback;
const bounded = (key, fallback, low, high) => { const n = Number(q.get(key)); return q.has(key) && Number.isFinite(n) ? Math.min(high, Math.max(low,n)) : fallback; };
const screen = allowed('screen',['drive','offline','history','recycle','tools','settings','help'],'drive');
const state = allowed('state',['locked','empty','populated','selected','busy','error','overflow','search','notifications','default','create-dialog','filtered-empty'],'populated');
const theme = allowed('theme',['light','dark'],'light');
const lang = allowed('lang',['en','yue','bilingual'],'en');
const W=bounded('width',1180,880,2560), H=bounded('height',850,650,1600), scale=bounded('scale',1,1,2);
const C=theme==='dark'?{frame:'#10140f',surface:'#141813',container:'#20261e',high:'#2b3328',primary:'#acd0a9',onPrimary:'#19351e',selected:'#304d33',text:'#e1e5da',muted:'#bcc5b5',line:'#3d4739',error:'#ffb4ab'}:{frame:'#f0f1e9',surface:'#fafaf5',container:'#e9ece2',high:'#e0e4d8',primary:'#455c46',onPrimary:'#ffffff',selected:'#c6e8c3',text:'#1a1d18',muted:'#535b50',line:'#d5dacd',error:'#ba1a1a'};
const nav=[['drive','My drive','我的磁碟'],['offline','Available offline','離線檔案'],['history','History','歷史記錄'],['recycle','Recycle Bin','資源回收筒'],['tools','Tools','工具'],['settings','Settings','設定'],['help','Help','說明']];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let parts=[];
const box=(x,y,w,h,fill=C.surface,r=0,stroke='none')=>parts.push('<rect x="'+x+'" y="'+y+'" width="'+Math.max(0,w)+'" height="'+Math.max(0,h)+'" rx="'+r+'" fill="'+fill+'" stroke="'+stroke+'"/>');
const text=(x,y,label,cls='body',fill=C.text)=>parts.push('<text x="'+x+'" y="'+y+'" class="'+cls+'" fill="'+fill+'">'+esc(label)+'</text>');
const label=(x,y,en,yue,cls='label')=>{text(x,y,lang==='yue'?yue:en,cls); if(lang==='bilingual')text(x,y+16,yue,'secondary',C.muted)};
const action=(x,y,w,en,yue,filled=false)=>{box(x,y,w,40,filled?C.primary:C.container,20); text(x+16,y+20,lang==='yue'?yue:en,'label',filled?C.onPrimary:C.text)};
const line=(x,y,w)=>box(x,y,w,1,C.line);
const helperIcon=(x,y,name)=>{const d=name==='clear'?'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12Z':'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5ZM9.5 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z';parts.push('<svg x="'+x+'" y="'+y+'" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="'+C.muted+'" d="'+d+'"/></svg>');};
const R=W<1000?176:220, X=R+28, CW=W-X-28, bodyY=178;
box(0,0,W,H,C.frame);box(R,42,W-R,H-42,C.surface,24);
text(20,21,'Material File Encryptor','label');text(W-132,21,'−    □    ×','body');
box(16,62,R-32,40,C.container,20);text(30,82,lang==='yue'?'加密工作區':'Encrypted workspace','secondary');
nav.forEach(([id,en,yue],i)=>{const y=i<5?126+i*64:H-160+(i-5)*64;box(12,y-22,R-24,lang==='bilingual'?56:48,id===screen?C.selected:C.frame,24);box(26,y-7,16,16,id===screen?C.primary:C.muted,4);label(52,y,en,yue);});
text(24,H-20,'DESIGN ONLY','micro',C.muted);
box(X,54,Math.max(220,CW-234),40,C.container,20);text(X+18,74,lang==='yue'?'搜尋工作區及指令':'Search workspace and commands','body',C.muted);
action(W-226,54,124,'Notifications','通知');action(W-92,54,64,'More','更多');
line(R,106,W-R);const tabY=116;action(X,tabY,40,'‹','‹');
box(X+48,tabY,156,40,C.selected,12);label(X+62,tabY+(lang==='bilingual'?12:20),nav.find(n=>n[0]===screen)[1],nav.find(n=>n[0]===screen)[2]);
const extra=state==='overflow'; if(CW>650){box(X+210,tabY,140,40,C.container,12);text(X+224,tabY+20,lang==='yue'?'歷史記錄':'History','label');}
action(W-196,tabY,40,'›','›');action(W-148,tabY,120,extra?'All tabs · 12':'All tabs','所有分頁');line(R,166,W-R);
parts.push('<defs><clipPath id="contentClip"><rect x="'+R+'" y="170" width="'+(W-R)+'" height="'+(H-208)+'"/></clipPath></defs><g clip-path="url(#contentClip)">');
text(X,bodyY+12,nav.find(n=>n[0]===screen)[lang==='yue'?2:1],'heading');
text(X,bodyY+43,lang==='yue'?'靜態設計示意，並非執行證據':'Static design illustration, not evidence of running behavior','secondary',C.muted);
let y=bodyY+76;
if(screen==='drive' && ['locked','create-dialog'].includes(state)){
 box(X,y,CW,154,C.container,20);label(X+24,y+30,'No drive is open','尚未開啟磁碟');text(X+24,y+64,lang==='yue'?'開啟現有加密儲存空間，或建立磁碟。':'Open encrypted storage or create a drive to begin.','body',C.muted);
 action(X+24,y+98,160,'Create a drive','建立磁碟',true);action(X+200,y+98,176,'Unlock existing','解鎖現有磁碟');
}else if(screen==='settings'){
 ['Appearance and language','Startup and unlocking','Local personal wording','Notifications and sound'].forEach((name,i)=>{let yy=y+i*100;box(X,yy,CW,84,C.container,16);text(X+20,yy+25,lang==='yue'?['外觀及語言','啟動及解鎖','本機個人用語','通知及聲音'][i]:name,'label');text(X+20,yy+53,lang==='yue'?'可搜尋的設定及個別重設':'Searchable settings with individual reset','secondary',C.muted);action(W-168,yy+22,112,'Configure','設定');});
}else if(screen==='tools'){
 box(X,y,CW,200,C.container,20);label(X+24,y+30,'Choose a tool','選擇工具');['File converter','Local model manager','Server management'].forEach((n,i)=>{label(X+24,y+72+i*42,n,['檔案轉換','本機模型管理','伺服器管理'][i]);text(W-62,y+72+i*42,'›','label');});
}else if(screen==='help'){
 box(X,y,CW,250,C.container,20);label(X+24,y+32,'Browse help','瀏覽說明');['Create and unlock a drive','Keep files available offline','Restore a previous version','Configure encrypted storage'].forEach((n,i)=>label(X+24,y+82+i*42,n,['建立及解鎖磁碟','保留離線檔案','還原舊版本','設定加密儲存空間'][i]));
}else if(['history','recycle'].includes(screen)&&state==='filtered-empty'){
 box(X,y,CW,64,C.container,16);
 if(screen==='history'){label(X+16,y+24,'Save version now','即時儲存版本');label(X+184,y+24,'Show history','顯示歷史');box(X+300,y+8,152,48,C.surface,12,C.muted);label(X+316,y+32,'Unavailable','不可用');helperIcon(X+472,y+20,'search');label(X+520,y+32,'Apply','套用');}
 else{label(X+16,y+32,'Select all visible','選取所有可見項目');label(X+210,y+32,'Restore selected','還原所選');label(X+414,y+32,'Empty Recycle Bin','清空資源回收筒');}
 y+=96;label(X+16,y-9,'Search entries','搜尋項目','secondary');box(X,y,CW-144,56,C.surface,12,C.primary);text(X+16,y+29,'Synthetic query');helperIcon(X+CW-184,y+16,'clear');action(X+CW-132,y+8,132,'Regex builder','正則建立器');y+=100;
 label(X,y,'No matching entries.','未有符合項目。');y+=24;box(X,y,CW,44,C.container,0);['Select','Name','Saved','Size','Availability','Actions'].forEach((name,index)=>text(X+12+index*(CW-24)/6,y+24,lang==='yue'?['選取','名稱','儲存時間','大小','可用狀態','操作'][index]:name,'secondary'));
 box(X,y+44,CW,116,C.surface,0,C.line);
}else{
 if(screen==='drive'){box(X,y,CW,68,C.container,16);label(X+18,y+24,'Drive open','磁碟已開啟');text(X+18,y+49,'Illustrative state · no real drive mounted','secondary',C.muted);action(W-202,y+14,146,'Open in Explorer','在檔案總管開啟');y+=84;}
 box(X,y,Math.max(220,CW-184),44,C.container,12);text(X+16,y+22,lang==='yue'?'搜尋檔案':'Search files','body',C.muted);action(W-202,y+2,146,screen==='recycle'?'Restore selected':'Import files',screen==='recycle'?'還原所選':'匯入檔案',true);y+=62;
 if(state==='selected'){box(X,y,CW,48,C.selected,12);text(X+16,y+24,lang==='yue'?'已選取 1 項':'1 item selected','label');text(X+CW-256,y+24,lang==='yue'?'開啟     匯出     保留離線':'Open     Export     Keep offline','body');y+=60;}
 box(X,y,CW,42,C.container,10);text(X+40,y+21,lang==='yue'?'名稱':'Name','label');text(X+CW-280,y+21,lang==='yue'?'可用狀態':'Availability','label');text(X+CW-112,y+21,lang==='yue'?'大小':'Size','label');y+=42;
 if(state==='empty'){box(X,y,CW,166,C.surface);label(X+24,y+46,'No files in this view','此檢視未有檔案');text(X+24,y+78,lang==='yue'?'使用上方的操作開始。':'Use the actions above to get started.','body',C.muted);}else{['Project notes.txt','Design brief.pdf','Research','Archive.zip'].forEach((n,i)=>{box(X,y+i*56,CW,56,i===0&&state==='selected'?C.selected:C.surface);box(X+16,y+i*56+20,16,16,i===0&&state==='selected'?C.primary:C.surface,3,C.muted);text(X+44,y+i*56+28,n);text(X+CW-280,y+i*56+28,lang==='yue'?'示例狀態':'Illustrative','secondary',C.muted);text(X+CW-112,y+i*56+28,['4 KiB','820 KiB','—','2 MiB'][i],'secondary',C.muted);line(X,y+(i+1)*56,CW);});}
 if(state==='busy'||state==='error'){let yy=Math.min(H-104,y+244);box(X,yy,CW,48,C.container,12);text(X+16,yy+24,state==='busy'?'Illustrative operation in progress':'Illustrative operation failed; retry remains available','secondary',state==='error'?C.error:C.text);}
}
parts.push('</g>');
box(W-12,180,4,H-224,C.container,2);box(W-12,180,4,120,C.muted,2);
if(screen==='drive'&&state==='create-dialog'){
 box(0,42,W,H-42,'#0005');const dw=Math.min(560,W-48),dh=Math.min(680,H-80),dx=(W-dw)/2,dy=(H-dh)/2,ix=dx+24,iw=dw-48;
 box(dx,dy,dw,dh,C.surface,28);label(ix,dy+44,'Create a drive','建立磁碟','heading');helperIcon(dx+dw-48,dy+24,'clear');
 const top=dy+94,bottom=dy+dh-84;parts.push('<defs><clipPath id="createContent"><rect x="'+ix+'" y="'+top+'" width="'+iw+'" height="'+(bottom-top)+'"/></clipPath></defs><g clip-path="url(#createContent)">');
 label(ix,top+16,'Encrypted storage transport','加密儲存傳輸');box(ix,top+36,iw-56,56,C.surface,12,C.muted);label(ix+16,top+64,'Local or cloud folder','本機或雲端資料夾');helperIcon(ix+iw-40,top+52,'search');
 for(const [offset,en,yue,value]of [[116,'Encrypted storage folder','加密儲存資料夾','Synthetic location'],[232,'Encrypted cache folder','加密快取資料夾','Synthetic cache']]){label(ix,top+offset,en,yue);box(ix,top+offset+20,iw-96,56,C.surface,12,C.muted);text(ix+16,top+offset+50,value);helperIcon(ix+iw-132,top+offset+36,'clear');action(ix+iw-84,top+offset+28,84,'Browse','瀏覽');}
 label(ix,top+354,'Drive letter','磁碟代號');box(ix,top+374,iw,56,C.surface,12,C.muted);label(ix+16,top+404,'Choose an available letter','揀選可用代號');label(ix,top+466,'Unlock method','解鎖方式');
 parts.push('</g>');line(ix,bottom,iw);action(dx+dw-272,bottom+24,96,'Cancel','取消');action(dx+dw-164,bottom+24,140,'Create & mount','建立並掛載',true);
}
if(state==='notifications'||state==='search'||state==='overflow'){
 const pw=Math.min(388,CW-16), px=W-pw-24, py=state==='overflow'?164:100;
 box(px,py,pw,280,C.high,20,C.line);label(px+20,py+28,state==='notifications'?'Notifications':state==='search'?'Search workspace':'All open tabs',state==='notifications'?'通知':state==='search'?'搜尋工作區':'所有已開啟分頁');
 box(px+16,py+56,pw-32,44,C.surface,12);text(px+28,py+78,'Search locally','body',C.muted);
 ['Current view','History','Settings'].forEach((n,i)=>{text(px+24,py+126+i*48,n,'label');line(px+16,py+151+i*48,pw-32);});
}
text(X,H-18,'DESIGN ONLY · '+screen+'/'+state+' · '+theme+' · '+lang+' · '+W+' × '+H+' · scale '+scale,'micro',C.muted);
document.documentElement.lang=lang==='en'?'en':'yue-Hant';
document.querySelector('#reference').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="'+W*scale+'" height="'+H*scale+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="title desc"><title id="title">Static desktop shell design reference</title><desc id="desc">Illustrative '+esc(screen+' '+state)+' state. All data and controls are drawn, not interactive product behavior.</desc>'+parts.join('')+'</svg>';
document.documentElement.dataset.referenceReady='true';
document.documentElement.dataset.referenceTuple=JSON.stringify({screen,state,theme,lang,width:W,height:H,scale});
