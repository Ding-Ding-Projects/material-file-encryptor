import assert from 'node:assert/strict';
import http from 'node:http';

// Owned loopback transport conditions for synthetic registry verification.
// No renderer state, credentials, request bodies or registry data are recorded.
export async function createRegistryVerificationProxy({upstream,port=0,timeoutMs=120000}) {
  const target=new URL(upstream);
  assert.equal(target.protocol,'http:');assert.equal(target.hostname,'127.0.0.1');
  assert.equal(target.pathname,'/');assert.equal(target.search,'');assert.equal(target.hash,'');
  assert.equal(target.username,'');assert.equal(target.password,'');
  assert.ok(Number.isInteger(Number(target.port))&&Number(target.port)>=1024&&Number(target.port)<=65535);
  assert.ok(Number.isInteger(port)&&(port===0||port>=1024&&port<=65535));
  assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=120000);
  let mode='pass',endpoint,closing=false;
  const active=new Set(),sockets=new Set(),counts={accepted:0,forwarded:0,completed:0,failed:0,cancelled:0};
  const server=http.createServer((request,response)=>{
    if(closing){response.writeHead(503).end();return;}
    counts.accepted++;
    if(request.headers.authorization||request.headers.cookie||!request.url?.startsWith('/v2/')||request.url.startsWith('//')) {
      counts.failed++;response.writeHead(403).end();request.resume();return;
    }
    const destination=new URL(request.url,target);
    if(destination.origin!==target.origin||!destination.pathname.startsWith('/v2/')){counts.failed++;response.writeHead(400).end();request.resume();return;}
    const declared=request.headers['content-length'];
    if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>1024**3)){counts.failed++;response.writeHead(413).end();request.resume();return;}
    const record={request,response,upstream:null,held:false,settled:false,timer:null,forward:null};active.add(record);
    const finish=kind=>{if(record.settled)return;record.settled=true;clearTimeout(record.timer);active.delete(record);counts[kind]++;};
    const fail=()=>{if(record.settled)return;record.upstream?.destroy();finish('failed');if(!response.headersSent)response.writeHead(503);response.end();request.resume();};
    response.once('close',()=>{if(!response.writableFinished){record.upstream?.destroy();finish('cancelled');}});
    response.once('finish',()=>finish('completed'));
    request.once('error',()=>{record.upstream?.destroy();finish('cancelled');response.destroy();});
    record.timer=setTimeout(fail,timeoutMs);record.timer.unref();
    record.forward=()=>{
      if(record.settled)return;record.held=false;
      if(mode==='error'){fail();return;}
      if(mode==='hold'){record.held=true;return;}
      counts.forwarded++;
      const headers={...request.headers,host:target.host};delete headers.connection;
      const outgoing=http.request(destination,{method:request.method,headers},incoming=>{
        const headers={...incoming.headers};delete headers.connection;delete headers['set-cookie'];
        if(headers.location){
          const location=new URL(headers.location,target);
          if(location.origin!==target.origin||!location.pathname.startsWith('/v2/')){incoming.destroy();fail();return;}
          headers.location=endpoint+location.pathname+location.search;
        }
        incoming.once('error',fail);response.writeHead(incoming.statusCode,headers);incoming.pipe(response);
      });
      record.upstream=outgoing;outgoing.once('error',fail);
      let bytes=0;request.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024**3)fail();});
      request.pipe(outgoing);
    };
    record.forward();
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  endpoint='http://127.0.0.1:'+server.address().port;
  return {
    endpoint,
    setMode(value){assert.ok(['pass','hold','error'].includes(value));assert.equal(closing,false);mode=value;for(const record of [...active])if(record.held)record.forward();},
    observe(){return{mode,...counts,active:active.size,held:[...active].filter(record=>record.held).length};},
    async waitForPending({minimum=1,timeoutMs=10000}={}){
      assert.ok(Number.isInteger(minimum)&&minimum>0);assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
      const deadline=Date.now()+timeoutMs;
      while(active.size<minimum){if(closing||Date.now()>=deadline)throw Error('REGISTRY_PROXY_PENDING_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,25));}
      return this.observe();
    },
    async close(){
      if(closing)return{closed:true,active:active.size};closing=true;
      const stopped=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      for(const record of [...active]){clearTimeout(record.timer);record.upstream?.destroy();record.response.destroy();}
      for(const socket of sockets)socket.destroy();await stopped;
      return{closed:true,active:active.size};
    }
  };
}
