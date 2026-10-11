self.onmessage = ({ data }) => {
  try {
    const started=performance.now();
    const { pattern, flags, rows, sample, replacement, cases=[] } = data;
    if (pattern.length > 512 || !/^(?!.*(.).*\1)[dgimsuv]*$/.test(flags)) throw Error('Invalid pattern size or flags');
    const regex = new RegExp(pattern, flags);
    if (rows) {
      self.postMessage({ matches: rows.filter(row => { regex.lastIndex = 0; return regex.test(String(row.text).slice(0,4096)); }).map(row => row.id) });
      return;
    }
    const input = String(sample).slice(0,4096);
    const global = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
    const matches = []; let match;
    while ((match = global.exec(input)) && matches.length < 100) {
      matches.push({ index: match.index, text:match[0], captures: Array.from(match).slice(1), groups:match.groups ?? {},indices:match.indices??null });
      if (match[0] === '') global.lastIndex += input.codePointAt(global.lastIndex) > 0xffff ? 2 : 1;
    }
    if(!Array.isArray(cases)||cases.length>50)throw Error('Too many test cases');
    const results=cases.map((entry,index)=>{if(typeof entry.text!=='string'||entry.text.length>4096||typeof entry.match!=='boolean')throw Error('Invalid test case');regex.lastIndex=0;const actual=regex.test(entry.text);return{index,expected:entry.match,actual,passed:actual===entry.match};});
    regex.lastIndex=0;
    self.postMessage({ matches, replacement: input.replace(regex,String(replacement ?? '')),cases:results,elapsedMs:Math.round((performance.now()-started)*100)/100,truncated:matches.length===100 });
  } catch (error) { self.postMessage({ error: error.message }); }
};
