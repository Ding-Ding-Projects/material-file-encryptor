// This worker is disposable. Its owner enforces the wall-clock deadline and
// terminates it even if the native regular-expression engine does not return.
self.onmessage=({data})=>{
  try {
    const {pattern,anchor,rows}=data;
    const source=anchor==='start'?`^(?:${pattern})`:anchor==='exact'?`^(?:${pattern})$`:pattern;
    const expression=new RegExp(source,'i');
    const matches=[];
    for(let i=0;i<rows.length;i++)if(expression.test(rows[i]))matches.push(i);
    self.postMessage({matches});
  }catch{self.postMessage({error:'The regular expression is invalid.'});}
};
