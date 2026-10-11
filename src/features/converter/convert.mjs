import {convertBuiltin} from './registry.mjs';
export async function convertRequest(id,inputs,options={}){
 if(/^(xlsx|ods)-to-|^(csv|tsv|json)-to-(xlsx|ods)$/.test(id))return(await import('./table.mjs')).convertTable(id,inputs,options);
 if(id.startsWith('pdf-'))return(await import('./pdf.mjs')).convertPdf(inputs,{...options,operation:id.slice(4)});
 if(id.startsWith('zip-'))return(await import('./archive.mjs')).convertArchive(id,inputs,options);
 if(['csv-to-json','tsv-to-json','json-to-csv','json-to-tsv','csv-to-tsv','tsv-to-csv'].includes(id))return(await import('./data.mjs')).convertData(id,inputs,options);
 return convertBuiltin(id,inputs[0]);
}
