/** Lossless, UTF-8 record interchange. Consumers own selection and redaction. */
export const RECORD_EXPORT_FORMATS=Object.freeze([
 ['json','JSON','application/json'],['jsonl','JSON Lines','application/x-ndjson'],['yaml','YAML 1.2','application/yaml'],['toml','TOML','application/toml'],['xml','XML','application/xml'],['csv','CSV','text/csv'],['tsv','TSV','text/tab-separated-values'],['markdown','Markdown','text/markdown'],['html','HTML','text/html'],['sql','SQLite SQL','application/sql']
].map(([id,label,mime])=>Object.freeze({id,label,mime,extension:id==='markdown'?'md':id})));
const json=JSON.stringify;
const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function assertValue(value,seen=new Set(),depth=0){
 if(depth>64)throw Error('Export nesting exceeds 64 levels.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(!value||typeof value!=='object'||seen.has(value))throw Error('Export requires finite, acyclic JSON values.');
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Export requires plain records.');
 seen.add(value);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;if(typeof key!=='string'||!Object.getOwnPropertyDescriptor(value,key)?.enumerable||!('value' in Object.getOwnPropertyDescriptor(value,key)))throw Error('Export cannot discard hidden or computed fields.');assertValue(value[key],seen,depth+1);}if(Array.isArray(value)&&Object.keys(value).length!==value.length)throw Error('Export cannot discard sparse or named array fields.');seen.delete(value);
}
export function exportRecordSet({records,format='json',schema='records.v1',omissions=[]}={}){
 const info=RECORD_EXPORT_FORMATS.find(item=>item.id===format);if(!info)throw Error('Unsupported record export format.');
 if(!Array.isArray(records)||records.length>10000||typeof schema!=='string'||!schema||schema.length>160||/[\x00-\x1f]/.test(schema)||!Array.isArray(omissions)||omissions.some(item=>typeof item!=='string'))throw Error('Invalid record export request.');
 const envelope={version:1,schema,omissions,records};assertValue(envelope);const packed=json(envelope);if(new TextEncoder().encode(packed).length>16*1024*1024)throw Error('Record export exceeds 16 MiB.');
 let text;
 if(format==='json')text=json(envelope,null,2);
 // JSON is a strict YAML 1.2 subset and retains every scalar type.
 else if(format==='yaml')text=json(envelope,null,2);
 else if(format==='jsonl')text=[json({type:'manifest',version:1,schema,omissions}),...records.map(record=>json({type:'record',record}))].join('\n');
 else if(format==='toml')text=['version = 1','schema = '+json(schema),'omissions = '+json(omissions),'records_json = '+json(records.map(record=>json(record)))].join('\n');
 else if(format==='xml')text='<?xml version="1.0" encoding="UTF-8"?>\n<record-export version="1"><schema>'+escapeXml(schema)+'</schema><omissions-json>'+escapeXml(json(omissions))+'</omissions-json><records>'+records.map(record=>'<record-json>'+escapeXml(json(record))+'</record-json>').join('')+'</records></record-export>';
 else if(format==='csv'||format==='tsv'){
  const delimiter=format==='csv'?',':'\t',cell=value=>'"'+String(value).replaceAll('"','""')+'"';
  // JSON cells begin with JSON syntax, never spreadsheet formula prefixes.
  const rows=[['schema_json','omissions_json','record_json'],...records.map(record=>[json(schema),json(omissions),json(record)])];
  if(!records.length)rows.push([json(schema),json(omissions),'']);text=rows.map(row=>row.map(cell).join(delimiter)).join('\r\n');
 }else if(format==='markdown')text='# Record export\n\n<pre>'+escapeXml(packed)+'</pre>';
 else if(format==='html')text='<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; base-uri &apos;none&apos;"><title>Record export</title><body><h1>Record export</h1><pre>'+escapeXml(packed)+'</pre></body></html>';
 else{const literal=value=>"'"+value.replaceAll("'","''")+"'";text='BEGIN;\nCREATE TABLE record_export (ordinal INTEGER PRIMARY KEY, envelope_json TEXT NOT NULL);\nINSERT INTO record_export VALUES (0, '+literal(packed)+');\nCOMMIT;';}
 return{...info,format,count:records.length,text:text+'\n'};
}
