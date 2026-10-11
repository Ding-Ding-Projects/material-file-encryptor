export const APPEARANCE_UNDO_BUDGET=16*1024*1024;
export const snapshotBytes=value=>new TextEncoder().encode(value).byteLength;
/** Bound the combined undo/redo payload, preserving the nearest available revision. */
export function trimSnapshotHistory(undo,redo,budget=APPEARANCE_UNDO_BUDGET){
 while(undo.length>50)undo.shift();while(redo.length>50)redo.shift();
 let bytes=[...undo,...redo].reduce((sum,s)=>sum+snapshotBytes(s),0);
 while(bytes>budget&&undo.length+redo.length>1){const list=undo.length>1?undo:redo.length>1?redo:redo.length?redo:undo;bytes-=snapshotBytes(list.shift());}
 if(bytes>budget){undo.length=0;redo.length=0;bytes=0;}return bytes;
}
