self.onmessage = ({ data }) => {
  try {
    const { pattern, flags, rows, sample, replacement } = data;
    if (pattern.length > 512 || !/^(?!.*(.).*\1)[gimsuy]*$/.test(flags) || flags.includes('y')) throw Error('Invalid pattern size or flags');
    const regex = new RegExp(pattern, flags);
    if (rows) {
      self.postMessage({ matches: rows.filter(row => { regex.lastIndex = 0; return regex.test(String(row.text).slice(0,4096)); }).map(row => row.id) });
      return;
    }
    const input = String(sample).slice(0,4096);
    const global = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
    const matches = []; let match;
    while ((match = global.exec(input)) && matches.length < 100) {
      matches.push({ index: match.index, text:match[0], captures: Array.from(match).slice(1), groups:match.groups ?? {} });
      if (match[0] === '') global.lastIndex += input.codePointAt(global.lastIndex) > 0xffff ? 2 : 1;
    }
    self.postMessage({ matches, replacement: input.replace(regex,String(replacement ?? '')) });
  } catch (error) { self.postMessage({ error: error.message }); }
};
