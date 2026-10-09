export function buildSearchPattern(query,mode) {
 const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return mode==='Custom expression'?query:mode==='Starts with'?`^${escaped}`:mode==='Ends with'?`${escaped}$`:mode==='Exact match'?`^${escaped}$`:escaped;
}
export function createScopedSearch(host, translate, changed) {
 const input = document.createElement('input'); input.type = 'search'; input.maxLength = 256;
 const panel = document.createElement('details'); panel.className = 'regex-builder';
 const summary = document.createElement('summary'); const label = document.createElement('label');
 const enabled = document.createElement('input'); enabled.type = 'checkbox';
 const mode = document.createElement('select');
 for (const value of ['Contains','Starts with','Ends with','Exact match','Custom expression']) { const option = document.createElement('option'); option.value=value; option.textContent=translate(value); mode.append(option); }
 const insensitive = document.createElement('input'); insensitive.type='checkbox'; insensitive.checked=true;
 const flagsLabel=document.createElement('label'); flagsLabel.append(insensitive,document.createTextNode(translate('Ignore case')));
 label.append(enabled,document.createTextNode(translate('Use regular expression'))); panel.append(summary,label,mode,flagsLabel);
 const error=document.createElement('p'); error.className='field-error'; error.setAttribute('role','status'); host.classList.add('scoped-search'); host.append(input,panel,error);
 let worker, timer, cancel;
 const refresh=()=>{ input.setAttribute('aria-label',translate('Search entries')); input.placeholder=translate('Search entries'); summary.textContent=translate('Regex builder'); };
 for (const control of [input,enabled,mode,insensitive]) control.addEventListener(control===input?'input':'change',changed);
 refresh();
 return { refresh, async filter(rows) {
  cancel?.(); worker?.terminate(); clearTimeout(timer); error.textContent='';
  const query=input.value; if (!query) return rows;
  if (!enabled.checked) return rows.filter(row=>String(row.path).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pattern=buildSearchPattern(query,mode.value);
  if (rows.length>10000) {error.textContent=translate('Too many entries for regex. Use plain search.');return [];}
  return new Promise(resolve=>{ worker=new Worker(new URL('./search-worker.js',import.meta.url));
   const ownedWorker=worker; const finish=(result,message)=>{ownedWorker.terminate();clearTimeout(timer);cancel=undefined;error.textContent=message?translate(message):'';resolve(result);}; cancel=()=>finish([]);
   worker.onmessage=({data})=>finish(data.error?[]:rows.filter(row=>data.ids.includes(row.id)),data.error);
   worker.onerror=()=>finish([],'Search could not be completed.');
   timer=setTimeout(()=>finish([],'Regex took too long. Use a simpler expression.'),150);
   worker.postMessage({pattern,flags:insensitive.checked?'iu':'u',rows:rows.map(row=>({id:row.id,path:String(row.path)}))});
  });
 }};
}
