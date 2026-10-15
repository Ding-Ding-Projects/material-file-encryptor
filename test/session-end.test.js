import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSessionEnd} from '../src/main/session-end.js';
import {cantonese} from '../src/renderer/i18n.js';

function fixture({mounted=true,lock={locked:true,busy:false},lockDelay=0,flush={flushed:true}}={}) {
  const calls=[];
  const sessionEnd=createSessionEnd({
    forceLock:async options=>{calls.push(['forceLock',options]);if(lockDelay)await new Promise(resolve=>setTimeout(resolve,lockDelay));if(lock instanceof Error)throw lock;return lock;},
    flushJournal:async()=>{calls.push(['flushJournal']);return flush;},
    isMounted:()=>mounted,
    clearMarker:async()=>{calls.push(['clearMarker']);},
    beforeLock:()=>calls.push(['beforeLock']),
    deadlineMs:200
  });
  return {sessionEnd,calls};
}

test('session end revokes authority, force locks within the deadline and clears the interrupted-session marker',async()=>{
  const f=fixture();
  const result=await f.sessionEnd.end();
  assert.deepEqual(result,{locked:true,reason:'locked'});
  assert.deepEqual(f.calls.map(call=>call[0]),['beforeLock','forceLock','clearMarker']);
  assert.ok(f.calls[1][1].timeoutMs<200,'The native wait must end before the outer deadline.');
  assert.equal(f.sessionEnd.ending,true);
});
test('session end is idempotent when Windows reports it twice',async()=>{
  const f=fixture();
  await Promise.all([f.sessionEnd.end(),f.sessionEnd.end()]);
  assert.equal(f.calls.filter(call=>call[0]==='forceLock').length,1);
});
test('an unconfirmed lock keeps the marker so the next start recovers locked',async()=>{
  for(const [name,options,reason] of [
    ['busy',{lock:{locked:false,busy:true}},'busy'],
    ['error',{lock:new Error('helper stopped')},'error'],
    ['slow',{lockDelay:1000},'deadline']
  ]) {
    const f=fixture(options);
    const started=Date.now();
    const result=await f.sessionEnd.end();
    assert.equal(result.locked,false,name);assert.equal(result.reason,reason,name);
    assert.ok(!f.calls.some(call=>call[0]==='clearMarker'),name);
    assert.ok(Date.now()-started<900,'Shutdown must never wait for a slow helper.');
  }
});
test('an already locked drive only clears the marker',async()=>{
  const f=fixture({mounted:false});
  assert.equal((await f.sessionEnd.end()).locked,true);
  assert.deepEqual(f.calls,[['clearMarker']]);
});
test('suspend commits the journal and keeps the drive mounted',async()=>{
  const f=fixture();
  assert.deepEqual(await f.sessionEnd.suspend(),{flushed:true,reason:'flushed'});
  assert.deepEqual(f.calls,[['flushJournal']]);
  assert.equal(f.sessionEnd.ending,false);
  assert.equal((await fixture({mounted:false}).sessionEnd.suspend()).flushed,false);
});
test('main process wires the definitive event to a lock and the query event only to a journal flush',async()=>{
  const main=await fs.readFile(new URL('../src/main/main.js',import.meta.url),'utf8');
  assert.match(main,/window\.on\('session-end',\(\)=>\{void sessionEnd\.end\(\);\}\)|window\.on\('session-end', \(\) => \{ void sessionEnd\.end\(\); \}\)/);
  assert.match(main,/window\.on\('query-session-end', \(\) => \{ void sessionEnd\.suspend\(\); \}\)/);
  assert.match(main,/powerMonitor\.on\('suspend', \(\) => \{ void sessionEnd\.suspend\(\); \}\)/);
  assert.match(main,/helper\.request\('forceLock', options\)/);
});
test('every ordinary-lock busy message in the native host has real Cantonese',async()=>{
  const source=await fs.readFile(new URL('../native/MaterialFileEncryptor.Host/DriveBusyException.cs',import.meta.url),'utf8');
  const messages=[...source.matchAll(/return "([^"]+)";/g)].map(match=>match[1]);
  assert.equal(messages.length,4);
  for(const message of messages) {
    assert.ok(cantonese[message],`Missing Cantonese for: ${message}`);
    assert.match(message,/Force lock/);
    assert.doesNotMatch(message,/[A-Za-z]:\\|\.exe/);
  }
  const controller=await fs.readFile(new URL('../native/MaterialFileEncryptor.Host/VaultController.cs',import.meta.url),'utf8');
  for(const message of [...controller.matchAll(/new InvalidOperationException\("((?:A transfer is active|A vault operation is retrieving|The drive is busy)[^"]*)"\)/g)].map(match=>match[1]))
    assert.ok(cantonese[message],`Missing Cantonese for: ${message}`);
});
