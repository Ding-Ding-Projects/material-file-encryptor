import {control} from '../../../shared/surface/controls.js';
import {textQrMatrix} from '../access/qr.js';

const SVG='http://www.w3.org/2000/svg';
const grouped=code=>code.length===8?`${code.slice(0,4)} ${code.slice(4)}`:code;

function qrElement(code,label){
  const matrix=textQrMatrix(code),size=matrix.length+8;let path='';
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])path+=`M${x+4},${y+4}h1v1h-1z`;
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox',`0 0 ${size} ${size}`);svg.setAttribute('width',String(size*6));svg.setAttribute('height',String(size*6));svg.setAttribute('role','img');svg.setAttribute('aria-label',label);svg.setAttribute('class','browser-pairing-qr');
  const background=document.createElementNS(SVG,'rect');background.setAttribute('width',String(size));background.setAttribute('height',String(size));background.setAttribute('fill','#fff');
  const modules=document.createElementNS(SVG,'path');modules.setAttribute('d',path);modules.setAttribute('fill','#000');
  svg.append(background,modules);return svg;
}

/**
 * Shows the one-time browser pairing code the main process issued. The code is
 * held only in this view's memory, cleared on hide, expiry and destroy, and
 * never written to storage, a log or a notification.
 */
export function mountBrowserPairing(host,{translate=value=>value,request,now=Date.now,setInterval:interval=globalThis.setInterval,clearInterval:stop=globalThis.clearInterval,subscribeLanguage=null}={}){
  host.replaceChildren();
  const title=document.createElement('h2');title.textContent=translate('Pair a browser');
  const help=document.createElement('p');help.textContent=translate('Show a one-time code here, then type it or scan it in the browser extension. You still approve the pairing on this desktop.');
  // The status line is stored as a source phrase (plus an optional detail) so it can be translated again when the language changes.
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  let statusSource='',statusDetail=null,validSeconds=null,qrCode=null;
  const setStatus=(source='',detail=null)=>{statusSource=source;statusDetail=detail;status.textContent=source?(detail===null?translate(source):`${translate(source)}: ${translate(detail)}`):'';};
  const display=document.createElement('div');display.className='browser-pairing-display';display.hidden=true;
  const text=document.createElement('p');text.className='browser-pairing-code';
  const remaining=document.createElement('p');
  const qr=document.createElement('div');
  display.append(text,qr,remaining);
  const actions=document.createElement('div');actions.className='actions';
  const show=control('button',{type:'button'});show.textContent=translate('Show pairing code');
  const hide=control('button',{type:'button'});hide.textContent=translate('Hide pairing code');hide.hidden=true;
  actions.append(show,hide);host.append(title,help,status,display,actions);
  let expires=0,timer=null,generation=0,disposed=false;
  function clearDisplay(){if(timer!==null){stop(timer);timer=null;}expires=0;validSeconds=null;qrCode=null;text.textContent='';text.removeAttribute('aria-label');qr.replaceChildren();remaining.textContent='';display.hidden=true;hide.hidden=true;}
  const renderRemaining=()=>{if(validSeconds!==null)remaining.textContent=`${translate('Valid for')} ${validSeconds} ${translate('seconds')}`;};
  function tick(){
    const seconds=Math.ceil((expires-now())/1000);
    if(seconds<=0){clearDisplay();setStatus('The code expired. Show a new one.');return;}
    validSeconds=seconds;renderRemaining();
  }
  /** Re-applies every visible label in the currently selected interface language. The code itself is never touched. */
  function relabel(){
    if(disposed)return;
    title.textContent=translate('Pair a browser');
    help.textContent=translate('Show a one-time code here, then type it or scan it in the browser extension. You still approve the pairing on this desktop.');
    show.textContent=translate('Show pairing code');hide.textContent=translate('Hide pairing code');
    setStatus(statusSource,statusDetail);renderRemaining();
    if(qrCode!==null&&!display.hidden)qr.replaceChildren(qrElement(qrCode,translate('Browser pairing QR code')));
  }
  const unsubscribe=typeof subscribeLanguage==='function'?subscribeLanguage(relabel):null;
  show.addEventListener('click',async()=>{
    const own=++generation;show.disabled=true;clearDisplay();setStatus('');
    try{
      const issued=await request('issue');
      if(disposed||own!==generation){void request('clear').catch(()=>{});return;}
      if(!issued||typeof issued.code!=='string'||!Number.isSafeInteger(issued.expiresAt))throw new Error('Invalid pairing code response.');
      expires=issued.expiresAt;text.textContent=grouped(issued.code);text.setAttribute('aria-label',issued.code.split('').join(' '));
      qrCode=issued.code;qr.replaceChildren(qrElement(issued.code,translate('Browser pairing QR code')));
      display.hidden=false;hide.hidden=false;setStatus('Enter this code in the extension, or scan it. Approve the request when this desktop asks.');
      tick();timer=interval(tick,1000);
    }catch(error){clearDisplay();if(!disposed&&own===generation)setStatus('Pairing code unavailable',String(error?.message||'Unavailable'));}
    finally{if(!disposed&&own===generation)show.disabled=false;}
  });
  hide.addEventListener('click',()=>{generation++;clearDisplay();setStatus('Pairing code hidden and cleared.');show.disabled=false;void request('clear').catch(()=>{});});
  return{
    get visible(){return !display.hidden;},
    relabel,
    destroy(){disposed=true;if(typeof unsubscribe==='function')unsubscribe();generation++;const wasShown=!display.hidden;clearDisplay();host.replaceChildren();if(wasShown)void request('clear').catch(()=>{});},
  };
}
