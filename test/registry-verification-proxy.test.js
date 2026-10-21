import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRegistryVerificationProxy} from '../scripts/gui-acceptance-registry-proxy.mjs';

async function fixture(t){
  let requests=0;const upstream=http.createServer((_request,response)=>{requests++;response.writeHead(200,{Location:`http://127.0.0.1:${upstream.address().port}/v2/verification/vault/blobs/uploads/one`});response.end('{}');});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const proxy=await createRegistryVerificationProxy({upstream:`http://127.0.0.1:${upstream.address().port}`});
  t.after(async()=>{await proxy.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));});
  return{proxy,requests:()=>requests};
}
test('loopback proxy preserves actual responses and rebases upload locations',async t=>{
  const f=await fixture(t),result=await fetch(f.proxy.endpoint+'/v2/verification/vault/tags/list');
  assert.equal(result.status,200);assert.equal(await result.text(),'{}');assert.equal(result.headers.get('location'),f.proxy.endpoint+'/v2/verification/vault/blobs/uploads/one');assert.equal(f.requests(),1);
  const denied=await fetch(f.proxy.endpoint+'/v2/verification/vault/tags/list',{headers:{authorization:'synthetic-test-only'}});assert.equal(denied.status,403);assert.equal(f.requests(),1);
});
test('held requests resume against the upstream and controlled outage is observable',async t=>{
  const f=await fixture(t);f.proxy.setMode('hold');const response=fetch(f.proxy.endpoint+'/v2/verification/vault/tags/list');
  assert.equal((await f.proxy.waitForPending()).held,1);assert.equal(f.requests(),0);f.proxy.setMode('pass');assert.equal((await response).status,200);assert.equal(f.requests(),1);
  f.proxy.setMode('error');const unavailable=await fetch(f.proxy.endpoint+'/v2/verification/vault/tags/list');assert.equal(unavailable.status,503);assert.equal(f.requests(),1);assert.equal(f.proxy.observe().failed,1);
});
test('client cancellation releases an owned held request without forwarding it',async t=>{
  const f=await fixture(t),abort=new AbortController();f.proxy.setMode('hold');
  const response=fetch(f.proxy.endpoint+'/v2/verification/vault/tags/list',{signal:abort.signal});const rejected=assert.rejects(response,{name:'AbortError'});
  await f.proxy.waitForPending();abort.abort();await rejected;
  const deadline=Date.now()+2000;while(f.proxy.observe().active&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.proxy.observe().active,0);assert.equal(f.proxy.observe().cancelled,1);assert.equal(f.requests(),0);
});
