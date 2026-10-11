const status=document.querySelector('#status');
const render=result=>{status.textContent=result.error|| (result.paired?'Paired. Use the link context menu to propose a download.':'Not paired. Open and unlock the installed desktop first.');};
chrome.runtime.sendMessage({type:'status'}).then(render);
for(const type of ['pair','disconnect'])document.querySelector('#'+type).addEventListener('click',async()=>{status.textContent=type==='pair'?'Waiting for desktop pairing approval…':'Disconnecting…';try{render(await chrome.runtime.sendMessage({type}));}catch{render({error:'The extension connection is unavailable.'});}});
