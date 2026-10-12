import '../shared/surface/search.js';
export function buildSearchPattern(query,mode) {
 const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return mode==='Custom expression'?query:mode==='Starts with'?`^${escaped}`:mode==='Ends with'?`${escaped}$`:mode==='Exact match'?`^${escaped}$`:escaped;
}
/** Every collection uses the same local, worker-bounded search composition. */
export function createScopedSearch(host,translate,changed){const search=document.createElement('mfe-search');search.setAttribute('label',translate('Search entries'));host.classList.add('scoped-search');host.append(search);search.addEventListener('search-change',changed);return{input:search,refresh(){search.setAttribute('label',translate('Search entries'));search.render();},async filter(rows){const matched=await search.filter(rows.map((row,index)=>({id:String(index),text:String(row.path)})));return matched===null?[]:matched.map(row=>rows[Number(row.id)]);},destroy(){search.removeEventListener('search-change',changed);search.remove();}};}
