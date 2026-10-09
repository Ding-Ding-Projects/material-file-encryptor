export function deletedDescendantCandidates(rows,selectedIds) {
 const selected=new Set(selectedIds);const referenced=new Set();
 for(const row of rows)if(selected.has(row.id)&&row.isDirectory&&Array.isArray(row.descendantIds))for(const id of row.descendantIds)if(typeof id==='string'&&!selected.has(id))referenced.add(id);
 return rows.filter(row=>referenced.has(row.id));
}
