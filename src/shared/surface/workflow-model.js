export const WORKFLOW_FIELDS=Object.freeze(['document-filter','document-name','document-content','editor-choice','download-destination','forge-account','forge-owner','forge-route']);
export function validateDocument({name,text}){
 if(typeof name!=='string'||!name.trim()||name.length>200||/[\\/\u0000-\u001f]/.test(name))throw new Error('Use a file name of 1 to 200 characters without path separators.');
 if(typeof text!=='string'||new TextEncoder().encode(text).length>262144)throw new Error('Document text must not exceed 256 KiB in UTF-8.');
 return{name:name.trim(),text};
}
export function canConfirm({firstKey,secondKey,amount}){return firstKey===true&&secondKey===true&&Number(amount)===100;}
export function downloadProgress(item){const received=Math.max(0,Number(item.received)||0),total=Number(item.total);return{received,total:Number.isFinite(total)&&total>0?total:null,value:Number.isFinite(total)&&total>0?Math.min(1,received/total):null};}
export function validCollection(value,label){if(!Array.isArray(value)||value.length>10000)throw new Error(`${label} could not be loaded.`);return value.filter(item=>item&&typeof item.id==='string'&&item.id.length<=256);}
