// This worker is reusable between searches. Its owner enforces the wall-clock
// deadline on the match work and terminates it even if the native regular-expression
// engine does not return. It announces readiness so start-up is never counted as match time.
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
self.postMessage({ready:true});
