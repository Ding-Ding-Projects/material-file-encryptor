self.onmessage = ({data}) => {
 try { const re = new RegExp(data.pattern, data.flags); self.postMessage({ids:data.rows.filter(row => re.test(row.path.slice(0,32767))).map(row => row.id)}); }
 catch { self.postMessage({error:'Invalid regular expression.'}); }
};
