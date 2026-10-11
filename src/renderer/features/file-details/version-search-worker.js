self.onmessage = ({ data }) => {
 try {
  const expression = new RegExp(data.pattern, 'iu');
  self.postMessage({ indices: data.rows.filter(row => expression.test(row.text)).map(row => row.index) });
 } catch { self.postMessage({ error: 'Invalid regular expression.' }); }
};
