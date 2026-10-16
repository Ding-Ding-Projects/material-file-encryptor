// Drop a personal wording file anywhere on the popup to store it. The popup itself shows only its original
// copy; the wording appears in the workspace, and only while the browser is paired with the desktop.
import {saveVocabulary} from './vocabulary.js';
import {readPreferences,acquireStorage} from './preferences.js';
import {installWordingDrop,createCelebration,createNotice} from './wording-drop.js';

const language=()=>readPreferences(acquireStorage()).value.language;
const text=pair=>{const chosen=language();return chosen==='yue'?pair[1]:chosen==='bilingual'?pair.join(' / '):pair[0];};
const notice=createNotice({doc:document});
const refusals={count:['Drop one wording file at a time. Nothing was changed.','一次只可以放一個用詞檔案，乜都冇改。'],type:['Only a .json wording file can be used. Nothing was changed.','只可以用 .json 用詞檔案，乜都冇改。'],size:['Use a wording file of 32 KB or less.','請用 32 KB 或以下嘅用詞檔案。'],unreadable:['The file could not be read.','讀取唔到檔案。'],invalid:['The wording file is not valid. Nothing was changed.','用詞檔案無效，乜都冇改。']};
async function paired(){try{const result=await chrome.runtime.sendMessage({type:'status'});return result?.paired===true;}catch{return false;}}

installWordingDrop({
  doc:document,maxBytes:32768,
  celebration:createCelebration({doc:document,neutral:()=>text(['Personal wording applied','已套用個人用詞']),reducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches}),
  overlayText:()=>text(['Drop your wording file to apply it','將用詞檔案放喺呢度即可套用']),
  apply:async source=>{
    const result=saveVocabulary(acquireStorage(),source);
    if(result.error)throw new Error(result.error);
    if(await paired())return {name:result.displayName};
    notice.show(text(['Wording saved. It applies after this browser is paired with the desktop.','用詞已儲存，瀏覽器同桌面配對後就會使用。']));
    return null;
  },
  refuse:code=>notice.show(text(refusals[code]||refusals.invalid)),
});
