// A close response is advisory; independent process-exit proof remains mandatory.
export async function closeWithExitProof({sendClose,confirmExit,requireClosureProof,recordResponse,timeoutMs=3000}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>3000)throw TypeError('Invalid close response timeout.');
 let timer;
 const response=await Promise.race([
  Promise.resolve().then(sendClose).then(()=>({closeResponse:'acknowledged'}),()=>({closeResponse:'unknown',closeResponseReason:'rejected'})),
  new Promise(resolve=>{timer=setTimeout(()=>resolve({closeResponse:'unknown',closeResponseReason:'timeout'}),timeoutMs);})
 ]).finally(()=>clearTimeout(timer));
 const errors=[];let closure;
 try{await recordResponse(response);}catch(error){errors.push(error);}
 try{closure=await confirmExit();requireClosureProof(closure);}catch(error){errors.push(error);}
 if(errors.length){
  const failure=new AggregateError(errors,'Retained close response recording or independent exit proof failed: '+errors.map(error=>String(error?.message??error)).join('; '));
  failure.closeResponseObservation=response;
  throw failure;
 }
 return {...response,closure};
}
