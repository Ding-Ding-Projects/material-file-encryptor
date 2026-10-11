import {control} from '../../../shared/surface/controls.js';

// Selection is local presentation state. Only the separate restore control can
// invoke the supplied mutation callback.
export function createHistorySelection({host,translate=value=>value,formatDate=String,formatBytes=String,onRestore=()=>{},isBusy=()=>false}) {
 const doc=host.ownerDocument, bindings=new Map();let selectedId=null, records=[], visibleIds=[], restoreFocusId=null;
 const summary=doc.createElement('section');summary.dataset.historyDetails='true';summary.setAttribute('aria-live','polite');
 const title=doc.createElement('h2'), details=doc.createElement('dl'), notice=doc.createElement('p');
 const restore=control('button',{type:'button'},[],doc);restore.dataset.historyRestoreSelected='true';
 summary.append(title,details,notice,restore);host.append(summary);
 const selected=()=>records.find(row=>row.id===selectedId)||null;
 function refresh() {
  const record=selected();summary.hidden=!record;
  if(restoreFocusId&&(!doc.activeElement?.isConnected||doc.activeElement===doc.body))bindings.get(restoreFocusId)?.radio.focus();restoreFocusId=null;
  for(const [id,{row,radio}] of bindings){const active=id===selectedId;row.setAttribute('aria-selected',String(active));row.dataset.historySelected=String(active);radio.checked=active;radio.tabIndex=id===(visibleIds.includes(selectedId)?selectedId:visibleIds[0])?0:-1;radio.setAttribute('aria-label',translate('Select')+' '+(records.find(item=>item.id===id)?.path||''));}
  if(!record){details.replaceChildren();delete summary.dataset.versionId;restore.disabled=true;return;}
  summary.dataset.versionId=record.id;title.textContent=translate('Selected version');details.replaceChildren();
  for(const [label,value] of [['Name',record.path],['Saved',formatDate(record.timestampUtc)],['Size',record.isDirectory?translate('Folder'):formatBytes(record.length)],['Availability',translate(record.isAvailable?'Available':'Encrypted data unavailable')],['Version ID',record.id],['Entry ID',record.entryId]]){const term=doc.createElement('dt'),description=doc.createElement('dd');term.textContent=translate(label);description.textContent=String(value??'');details.append(term,description);}
  notice.textContent=visibleIds.includes(selectedId)?translate('Selecting a version does not restore it.'):translate('The selected version is outside the current filter.');
  restore.textContent=translate('Restore as new version');restore.disabled=isBusy()||!record.isAvailable;
 }
 function select(id,{focus=false}={}){if(!visibleIds.includes(id)||!records.some(row=>row.id===id))return false;selectedId=id;refresh();if(focus)bindings.get(id)?.radio.focus();return true;}
 restore.addEventListener('click',()=>{const record=selected();if(!record||!record.isAvailable||isBusy())return;onRestore(record.id);});
 return {
  setRecords(rows){records=rows;if(!selected())selectedId=null;refresh();},
  beginRows(rows){restoreFocusId=[...bindings].find(([,binding])=>binding.radio===doc.activeElement)?.[0]||null;bindings.clear();visibleIds=rows.map(row=>row.id);},
  bindRow(row,record,cell){row.dataset.historyVersion=record.id;const radio=control('input',{type:'radio',name:'history-version-selection',value:record.id},[],doc);radio.dataset.historySelect='true';radio.addEventListener('change',()=>{if(radio.checked)select(record.id);});radio.addEventListener('keydown',event=>{let index=visibleIds.indexOf(record.id);if(event.key==='Home')index=0;else if(event.key==='End')index=visibleIds.length-1;else if(['ArrowDown','ArrowRight'].includes(event.key))index=(index+1)%visibleIds.length;else if(['ArrowUp','ArrowLeft'].includes(event.key))index=(index-1+visibleIds.length)%visibleIds.length;else if(event.key===' '||event.key==='Enter'){event.preventDefault();select(record.id);return;}else return;event.preventDefault();select(visibleIds[index],{focus:true});});bindings.set(record.id,{row,radio});cell.append(radio);},
  refresh,select,get selectedId(){return selectedId;},
  clear(){selectedId=null;records=[];visibleIds=[];bindings.clear();refresh();},
  destroy(){bindings.clear();summary.remove();}
 };
}
