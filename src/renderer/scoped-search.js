import '../shared/surface/search.js';
export function buildSearchPattern(query,mode) {
 const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return mode==='Custom expression'?query:mode==='Starts with'?`^${escaped}`:mode==='Ends with'?`${escaped}$`:mode==='Exact match'?`^${escaped}$`:escaped;
}
/** Every collection uses the same local, worker-bounded search composition. */
export function createScopedSearch(host,translate,changed){
 const search=document.createElement('mfe-search');let sequence=0,disposed=false;
 search.setAttribute('label',translate('Search entries'));host.classList.add('scoped-search');host.append(search);search.addEventListener('search-change',changed);
 const indexed=rows=>rows.map((row,index)=>({id:String(index),text:String(row.path)}));
 return{input:search,refresh(){search.setAttribute('label',translate('Search entries'));search.render();},
 async filter(rows){const matched=await search.filter(indexed(rows));return matched===null?[]:matched.map(row=>rows[Number(row.id)]);},
 async filterWithOutcome(rows){const request=++sequence,generation=search.generation;let result;
 try{result=await search.filter(indexed(rows),{reportOutcome:true});}catch{result={rows:[],outcome:'failed'};}
 if(disposed)return{rows:[],outcome:'disposed'};
 if(request!==sequence||generation!==search.generation)return{rows:[],outcome:'superseded'};
 if(!result||!['ready','failed','unavailable','superseded'].includes(result.outcome))return{rows:[],outcome:'failed'};
 return{rows:Array.isArray(result.rows)?result.rows.map(row=>rows[Number(row.id)]):[],outcome:result.outcome};},
 destroy(){disposed=true;sequence++;search.removeEventListener('search-change',changed);search.remove();}};
}
