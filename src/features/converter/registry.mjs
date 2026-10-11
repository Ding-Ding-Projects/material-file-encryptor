export const LIMITS = Object.freeze({ inputBytes: 64 * 1024 * 1024, outputBytes: 128 * 1024 * 1024, milliseconds: 30000, pages: 1000, queuePage: 50 });
export function detectFormat(bytes) {
 const b=Buffer.from(bytes); if(b.length>LIMITS.inputBytes) throw new Error('Input exceeds the 64 MiB safety limit.');
 const prefix=b.subarray(0,8192);
 if(prefix.subarray(0,5).toString()==='%PDF-') return 'pdf';
 if(prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
 if(prefix[0]===255&&prefix[1]===216&&prefix[2]===255) return 'jpeg';
 if(prefix.subarray(0,4).equals(Buffer.from([80,75,3,4]))) return 'zip';
 if(prefix.subarray(0,4).toString()==='RIFF') return prefix.subarray(8,12).toString()==='WAVE'?'wav':'riff';
 if(prefix.subarray(4,8).toString()==='ftyp') return 'mp4';
 if(prefix.includes(0)) return 'binary';
 try { new TextDecoder('utf-8',{fatal:true}).decode(prefix,{stream:b.length>prefix.length}); } catch { return 'binary'; }
 const text=prefix.toString('utf8').replace(/^\uFEFF/,'').trimStart();
 if(text.startsWith('{')||text.startsWith('['))return 'json';
 try { JSON.parse(text); return 'json'; } catch { return 'text'; }
}
const entry=(id,category,name,sources,target,extra={})=>({id,category,name,sources,target,bundled:true,lossy:false,metadata:'No embedded metadata is copied unless explicitly supported.',encoding:'UTF-8',limits:LIMITS,sandbox:'Isolated bounded worker; no network or child process APIs.',validator:'Reparse and compare output.',...extra});
export function catalog(proof={}) {
 const pdf=['inspect','split','merge','extract','reorder','rotate','metadata'].map(op=>entry(`pdf-${op}`,'Documents/PDF',`PDF ${op}`,['pdf'],'pdf',{enabled:proof.pdfLib===true,disabledReason:proof.pdfLib===true?'':'Bundled pdf-lib 1.17.1 verification is missing.',operation:op,metadata:'PDF rewriting can remove signatures and unsupported structures. Signed and encrypted sources are rejected.',lossy:op!=='inspect',encoding:'PDF objects'}));
 const built=[entry('json-format','Structured Data/Spreadsheets','JSON pretty print',['json'],'json'),entry('text-utf8','Code/Text','Normalize UTF-8 text',['text','json'],'txt',{lossy:true,metadata:'Normalizes line endings to LF and removes a UTF-8 BOM.'}),entry('base64','Binary Encodings','Encode Base64',['*'],'txt',{encoding:'ASCII Base64',metadata:'Exact source bytes are recoverable by Base64 decoding.'}),entry('hex','Binary Encodings','Encode hexadecimal',['*'],'txt',{encoding:'ASCII hexadecimal',metadata:'Exact source bytes are recoverable by hexadecimal decoding.'})].map(x=>({...x,enabled:true,proof:'Built-in runtime adapter; shipped source and round-trip validator.'}));
 const unavailable=[['Images','Image transcoding','Bundled image codec is not installed.'],['Audio','Audio transcoding','Bundled audio codec is not installed.'],['Video','Video transcoding','Bundled video codec is not installed.'],['Archives','Archive extraction/repacking','Bundled archive adapter is not installed.'],['Structured Data/Spreadsheets','Spreadsheet conversion','Bundled spreadsheet adapter is not installed.']].map(([category,name,disabledReason],i)=>entry(`unavailable-${i}`,category,name,[],'',{enabled:false,bundled:false,disabledReason}));
 return [...pdf,...built,...unavailable];
}
export function convertBuiltin(id,bytes) {
 const b=Buffer.from(bytes); let out;
 if(id==='base64') {out=Buffer.from(b.toString('base64'));if(!Buffer.from(out.toString(),'base64').equals(b))throw new Error('Base64 validation failed.');}
 else if(id==='hex'){out=Buffer.from(b.toString('hex'));if(!Buffer.from(out.toString(),'hex').equals(b))throw new Error('Hexadecimal validation failed.');}
 else if(id==='json-format'){const parsed=JSON.parse(b.toString('utf8'));out=Buffer.from(JSON.stringify(parsed,null,2)+'\n');if(JSON.stringify(JSON.parse(out))!==JSON.stringify(parsed))throw new Error('JSON validation failed.');}
 else if(id==='text-utf8'){out=Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'));new TextDecoder('utf-8',{fatal:true}).decode(out);}
 else throw new Error('Unsupported adapter.');
 if(out.length>LIMITS.outputBytes)throw new Error('Output exceeds the safety limit.');
 return {outputs:[{name:`converted.${id==='json-format'?'json':'txt'}`,bytes:out}],details:{bytes:out.length}};
}
