const terminal=new Set(['completed','cancelled','failed']);
export function operationNotification(record,{known=false}={}){
 const id=record?.operationId||record?.id,state=record?.state||record?.status;
 if(typeof id!=='string'||id.length>100||!['queued','running','cancelling',...terminal].includes(state)||(!known&&terminal.has(state)))return null;
 const total=Number(record.totalBytes),bytes=Number(record.bytesCompleted);
 const value=Number.isFinite(total)&&total>0&&Number.isFinite(bytes)?Math.max(0,Math.min(100,bytes/total*100)):state==='completed'?100:0;
 return {title:'File operation',message:state==='failed'?'The file operation failed. Open Operations for details.':state==='cancelled'?'Unfinished work was cancelled. Completed files were retained.':state==='completed'?'The file operation completed.':state==='cancelling'?'Cancellation is waiting for the current bounded block.':'File operation in progress.',level:state==='failed'?'error':state==='completed'?'success':'info',progress:{value,label:'Transfer progress'},recovery:[{id:'open-operations',label:'Open Operations'},...(!terminal.has(state)?[{id:'cancel-operation:'+id,label:'Cancel unfinished work'}]:[])]};
}
