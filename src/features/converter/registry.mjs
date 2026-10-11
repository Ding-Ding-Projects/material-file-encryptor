export const LIMITS = Object.freeze({ inputBytes: 64 * 1024 * 1024, outputBytes: 128 * 1024 * 1024, milliseconds: 30000, pages: 1000, queuePage: 50 });
export function detectFormat(bytes) {
 const b=Buffer.from(bytes); if(b.length>LIMITS.inputBytes) throw new Error('Input exceeds the 64 MiB safety limit.');
 const prefix=b.subarray(0,8192);
 if(prefix.subarray(0,5).toString()==='%PDF-') return 'pdf';
 if(prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
 if(prefix[0]===255&&prefix[1]===216&&prefix[2]===255) return 'jpeg';
 if(prefix.subarray(0,4).equals(Buffer.from([80,75,3,4]))||prefix.subarray(0,4).equals(Buffer.from([80,75,5,6]))) return b.includes(Buffer.from('xl/workbook.xml'))&&b.includes(Buffer.from('[Content_Types].xml'))?'xlsx':b.includes(Buffer.from('content.xml'))&&b.includes(Buffer.from('META-INF/manifest.xml'))?'ods':'zip';
 if(prefix.subarray(0,4).toString()==='RIFF') return prefix.subarray(8,12).toString()==='WAVE'?'wav':'riff';
 if(prefix.subarray(0,4).toString()==='fLaC')return 'flac';
 if(prefix.subarray(0,3).toString()==='ID3'||(prefix.length>=4&&prefix[0]===255&&(prefix[1]&224)===224&&(prefix[1]&24)!==8&&(prefix[1]&6)!==0&&(prefix[2]&240)!==0&&(prefix[2]&240)!==240&&(prefix[2]&12)!==12))return 'mp3';
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
 const archive=['list','extract','repack'].map(operation=>entry('zip-'+operation,'Archives','ZIP '+operation,['zip'],operation==='list'?'json':'zip',{enabled:true,operation,lossy:operation!=='list',metadata:'ZIP only: encrypted files, links, unsafe paths, ZIP64 and expansion over limits are rejected. Repacking removes comments, extra fields and permissions.',encoding:'UTF-8 names or ASCII names only',proof:'Built-in ZIP parser, CRC validator, and bundled zlib.'}));
 const data=[['csv-to-json','CSV to JSON',['text','json'],'json'],['tsv-to-json','TSV to JSON',['text','json'],'json'],['json-to-csv','JSON to CSV',['json'],'csv'],['json-to-tsv','JSON to TSV',['json'],'tsv'],['csv-to-tsv','CSV to TSV',['text','json'],'tsv'],['tsv-to-csv','TSV to CSV',['text','json'],'csv']].map(([id,name,sources,target])=>entry(id,'Structured Data/Spreadsheets',name,sources,target,{enabled:true,lossy:true,metadata:'Strings remain strings. Select a delimiter and formula policy. Spreadsheet programs may execute cells beginning with =, +, -, @, tab or carriage return. Escaping adds an apostrophe; rejecting stops the conversion.',proof:'Built-in bounded parser and round-trip validation.'}));
 const media=[['image-png','Images','Image to PNG',['png','jpeg'],'png'],['image-jpeg','Images','Image to JPEG',['png','jpeg'],'jpg'],['audio-wav','Audio','Audio to WAV',['wav','flac','mp3'],'wav'],['audio-flac','Audio','Audio to FLAC',['wav','flac','mp3'],'flac'],['audio-mp3','Audio','Audio to MP3',['wav','flac','mp3'],'mp3'],['video-mp4','Video','Video to MP4',['mp4'],'mp4']].map(([id,category,name,sources,target])=>entry(id,category,name,sources,target,{enabled:proof.media===true,disabledReason:proof.media===true?'':'Verified bundled FFmpeg 9.0.2 runtime is unavailable.',lossy:true,encoding:'Fixed codec settings; inspected and decoded after conversion.',metadata:(proof.mediaProfile==='minimal-v1'?'MP3 output requires 32, 44.1 or 48 kHz. Video uses MPEG-4 quality 3 and AAC 128 kbps. ':'Video uses H.264 CRF 23 and AAC 128 kbps. ')+'Embedded metadata and chapters are removed. JPEG removes transparency and is lossy. WAV uses 16-bit PCM; MP3 uses 192 kbps. Images: 8 megapixels, 4096 pixels per side; audio: 10 minutes, 1-2 channels, 8-48 kHz; video: 60 seconds, even dimensions up to 1920 by 1080. No animation or rotation metadata.'}));
 const tables=['xlsx','ods','csv','tsv','json'].flatMap(source=>['xlsx','ods','csv','tsv','json'].filter(target=>target!==source&&[source,target].some(x=>['xlsx','ods'].includes(x))).map(target=>entry(source+'-to-'+target,'Structured Data/Spreadsheets',source.toUpperCase()+' table to '+target.toUpperCase(),source==='csv'||source==='tsv'?['text','json']:[source],target,{enabled:true,lossy:true,metadata:'Single-sheet rectangular tables only, up to 8 MiB, 10,000 rows, 256 columns and 100,000 cells. Formatting and original types are removed. Formula cells, macros, external links and merged cells are rejected. Stored numeric, date and boolean values become strings. Choose formula-like text handling.',proof:'Bundled bounded ZIP/XML table adapter with output round-trip validation.'})));
 const unavailable=[['Archives','7z and RAR conversion','Bundled 7z/RAR adapters are not installed.']].map(([category,name,disabledReason],i)=>entry(`unavailable-${i}`,category,name,[],'',{enabled:false,bundled:false,disabledReason}));
 return [...pdf,...built,...archive,...data,...tables,...media,...unavailable];
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
