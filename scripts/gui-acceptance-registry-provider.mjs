import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepareRegistryReviewFixture,inspectRegistryReviewFixture} from './gui-acceptance-registry-native-fixture.mjs';
import {REGISTRY_VERIFICATION_STATES} from './gui-acceptance-registry-states.mjs';
import {registryConfiguration, registryDraft, registryBusy} from '../src/renderer/features/storage-maintenance/registry-model.js';

const unavailable = reason => { throw Error('CAPABILITY_UNAVAILABLE: registry.' + reason); };
const transient = new Set(['registry-cancelling', 'conflicts-loading', 'conflicts-error']);
const reviewScenario = state => state.includes('rename') ? 'file-rename' : state.includes('deletion') ? 'delete-edit' : state === 'conflicts-unsupported' ? 'directory-rename' : ['conflicts-divergence-review', 'conflicts-recovery-paths'].includes(state) ? 'resolution-divergence' : state.startsWith('conflicts-') && !['conflicts-empty', 'conflicts-unavailable', 'conflicts-session-changed'].includes(state) ? 'file-edit' : 'empty';

// Only actual registered controls are written. No component state, service,
// native response, clock or operation result is injected by this producer.
export function registryProductionControl({panel, key, value, choice, conflictId}) {
  const host = document.querySelector('mfe-storage-maintenance');
  const p = host?.shadowRoot?.querySelector(panel);
  if (!p || !p.isConnected || !p.getClientRects().length) throw Error('Production storage panel unavailable');
  let node;
  if (conflictId) {
    const index = p.current()?.rows?.findIndex(row => row.conflictId === conflictId);
    if (!(index >= 0)) throw Error('Owned conflict absent');
    node = p.records.children[index];
  } else if (choice) node = p.choiceInputs?.get(choice);
  else node = value === undefined ? p.buttons?.[key] : p.fields?.[key];
  if (!node || node.disabled || node.hidden || !node.getClientRects().length) throw Error('Production storage control unavailable');
  if (value === undefined) node.click();
  else {
    if (node.readOnly) throw Error('Read-only storage control');
    if (typeof value === 'boolean') node.checked = value; else node.value = value;
    node.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
    node.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
  }
  return true;
}

/** Compose real encrypted native fixtures with an admitted packaged session.
 * A proxy is an owned real loopback server, never a replacement fetch function.
 * Native dialog drivers must operate the admitted hidden desktop and return
 * their actual observed HWND/process receipts. Missing drivers fail preflight.
 */
export function createRegistryFixtures({opened, nativeFixtureOptions, proxy, dialogs} = {}) {
  assert.equal(opened?.connectionOwned, true);
  assert.equal(opened.target.kind, 'extracted-packaged-runtime');
  const {page, target} = opened;
  assert.match(target.sourceCommit, /^[a-f0-9]{40}$/);
  if(proxy) {
    const endpoint=new URL(proxy.endpoint);
    assert.equal(endpoint.protocol,'http:');assert.equal(endpoint.hostname,'127.0.0.1');
    assert.equal(opened.receipt.registryTestEndpoint,endpoint.origin,'Package launch must attest the exact owned verification endpoint');
  }
  let active = null;
  const proof = extra => ({ownedSyntheticFixture:true, sourceCommit:target.sourceCommit, productionUi:true, rendererInjection:false, route:'supported-native-service', ...extra});
  const control = (key, value, conflict = false) => page.evaluate(registryProductionControl, {panel:conflict ? 'mfe-registry-conflicts-panel' : 'mfe-registry-storage-panel', key, value});
  const choose = choice => page.evaluate(registryProductionControl, {panel:'mfe-registry-conflicts-panel', choice});
  const selectConflict = () => page.evaluate(registryProductionControl, {panel:'mfe-registry-conflicts-panel', conflictId:active.conflictId});
  async function navigate() {
    if(await page.evaluate(()=>{const node=document.querySelector('#view-storage');return Boolean(node&&!node.hidden&&node.getClientRects().length);})) return;
    await page.evaluate(()=>{const rail=document.querySelector('mfe-navigation-rail');const node=rail?.shadowRoot?.querySelector('[data-destination="tools"]');if(!node||node.disabled)throw Error('Storage navigation unavailable');node.click();});
    await page.waitForFunction(()=>[...document.querySelectorAll('mfe-context-menu')].some(menu=>!menu.hidden&&menu.getClientRects().length),undefined,{timeout:10000});
    await page.evaluate(()=>{const menu=[...document.querySelectorAll('mfe-context-menu')].find(menu=>!menu.hidden&&menu.getClientRects().length);const index=menu?.items.findIndex(item=>item.id==='storage');const node=menu?.itemsHost.querySelectorAll('md-menu-item')[index];if(!(index>=0)||!node||node.disabled)throw Error('Storage destination unavailable');node.click();});
  }
  const waitIdle = () => page.waitForFunction(() => {
    const host=document.querySelector('mfe-storage-maintenance');
    return ['mfe-registry-storage-panel','mfe-registry-conflicts-panel'].every(tag => {const p=host?.shadowRoot?.querySelector(tag); return p && !p.current()?.pending;});
  }, undefined, {timeout:30000});
  async function changeOwnedSession(method,id) {
    assert.ok(['selectSession','removeSession'].includes(method));
    assert.ok([active?.sessionId,active?.extraSessionId,active?.originalSessionId].includes(id));
    assert.ok(method!=='removeSession'||id!==active?.originalSessionId,'Original session is not a cleanup target');
    const deadline=Date.now()+10000;
    for(;;) {
      const before=await page.evaluate(()=>window.drive.status());
      if(before.operation){if(Date.now()>=deadline)throw Error('Owned session operation did not settle');await new Promise(resolve=>setTimeout(resolve,100));continue;}
      try{return await page.evaluate(({method,id})=>window.drive[method](id),{method,id});}
      catch(error){
        if(!String(error.message).endsWith('Wait for the current action before switching vaults.')||Date.now()>=deadline)throw error;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
  }
  async function identity(context) {
    assert.equal(context.binding.sourceCommit, target.sourceCommit);
    assert.equal(page.url(), target.expectedUrl);
    assert.equal(await fs.realpath(opened.runRoot), path.resolve(opened.runRoot));
    const profile=await page.evaluate(() => window.drive.featureRequest('access','dataFolder'));
    assert.equal(path.resolve(profile), path.join(path.resolve(opened.runRoot),'profile'));
    if (active) {
      assert.equal(await fs.realpath(active.fixtureRoot), active.fixtureRoot);
      assert.equal(await fs.readFile(path.join(active.fixtureRoot,'.registry-fixture-owner'),'utf8'), 'MaterialFileEncryptor synthetic registry fixture v1\n'+active.fixtureRoot+'\n');
      const state=await page.evaluate(() => window.drive.status());
      assert.equal(state.sessionId, active.sessionId);
      // A fresh blank session has no source until its first explicit unlock.
      if (active.unlocked) for (const key of ['storageDir','cacheDir']) assert.equal(state[key],active[key]);
      return state;
    }
    return page.evaluate(() => window.drive.status());
  }
  function assertCapabilities(state) {
    assert.ok(REGISTRY_VERIFICATION_STATES.some(row => row.id === state));
    if(state==='registry-unavailable') unavailable('this packaged target always provides registry methods for a valid session');
    if (transient.has(state)) unavailable(state+' requires a reproducible supported native timing/failure route');
    if (!nativeFixtureOptions) unavailable('native build-bound fixture options');
    if (state.startsWith('registry-') && !['registry-unavailable','registry-unconfigured','registry-invalid','registry-session-changed'].includes(state) && !proxy) unavailable('owned loopback transport');
    if (['registry-revisions','registry-restoring'].includes(state) && typeof dialogs?.pickFolder !== 'function') unavailable('native folder picker driver');
    if (REGISTRY_VERIFICATION_STATES.find(row=>row.id===state).actions.some(id=>['apply-conflict','settle-resolution'].includes(id)) || ['conflicts-resolved','conflicts-recovery-paths','conflicts-stale'].includes(state)) {
      if (typeof dialogs?.confirmConflict !== 'function') unavailable('owned modal confirmation driver');
    }
  }
  async function unlock(context) {
    await identity(context); assert.ok(active);
    const result=await page.evaluate(options => window.drive.unlock(options), {storageDir:active.storageDir,cacheDir:active.cacheDir,keyFilePath:active.keyFilePath,driveLetter:active.driveLetter,transport:'folder',autoUnlock:false});
    assert.equal(result.locked,false); active.unlocked=true;
    const observed=await identity(context); assert.equal(observed.locked,false);
    return proof({completed:true,evidence:{sessionId:observed.sessionId,locked:false,source:observed.storageDir}});
  }
  async function settle(context) {
    await identity(context);
    if (proxy) proxy.setMode('pass');
    await page.waitForFunction(async()=>{const value=await window.drive.registryStorageStatus();return ['idle','ready','completed','verified','incomplete','cancelled','failed','error','unverified','disabled','unconfigured'].includes(value.state);},undefined,{timeout:30000});
    await waitIdle();
    return proof({completed:true,evidence:{status:await page.evaluate(()=>window.drive.registryStorageStatus()),transport:proxy?.observe()||null}});
  }
  async function modal(context, method) {
    await identity(context);
    if (typeof dialogs?.[method] !== 'function') unavailable(method);
    if (context.activate) await context.activate();
    else assert.equal(context.alreadyActivated,true);
    const expected={sourceCommit:target.sourceCommit,runRoot:opened.runRoot,statePath:opened.statePath,sessionId:active.sessionId,conflictId:active.conflictId};
    const result=await dialogs[method]({...expected, parent:active.restoreParent});
    assert.equal(result.completed,true); assert.equal(result.sourceCommit,target.sourceCommit);
    assert.equal(result.hiddenDesktop,true); assert.equal(result.ownerVerified,true);
    assert.ok(result.evidence?.hwnd && result.evidence?.processId,'Native dialog identity evidence required');
    await waitIdle();
    let restoredFiles;
    if(method==='pickFolder') {
      const roots=await fs.readdir(active.restoreParent);
      assert.equal(roots.length,1,'Exactly one owned restored copy required');assert.match(roots[0],/^restored-vault-[a-f0-9-]+$/);
      const root=path.join(active.restoreParent,roots[0]);assert.equal(await fs.realpath(root),root);
      const header=await fs.readFile(path.join(root,'vault.json'));assert.ok(header.length>0);
      restoredFiles={destination:root,encryptedHeaderPresent:true};
    }
    return proof({completed:true,evidence:{dialog:result,restoredFiles,observation:await observeNative(context)}});
  }
  async function observeNative(context) {
    if(context.action==='add-vault') {
      assert.equal(context.binding.sourceCommit,target.sourceCommit);assert.equal(page.url(),target.expectedUrl);
      const added=await page.evaluate(()=>window.drive.status());
      assert.notEqual(added.sessionId,active.sessionId);assert.ok(!added.storageDir&&added.locked===true);
      assert.ok(added.sessions.some(row=>row.sessionId===active.sessionId));active.extraSessionId=added.sessionId;
      return proof({verified:true,evidence:{addedSessionId:added.sessionId,locked:true,sourceEmpty:true}});
    }
    const native=await identity(context), status=await page.evaluate(()=>window.drive.registryStorageStatus());
    assert.equal(status.sessionId,active.sessionId);
    if(active.unlocked) assert.equal(status.source,active.storageDir);
    const conflicts=native.locked===false&&!registryBusy(status) ? await page.evaluate(()=>window.drive.listRegistryConflicts({limit:1000})) : null;
    if(conflicts) { assert.ok(Array.isArray(conflicts.items)); assert.equal(conflicts.nextCursor,null,'Fixture conflict inventory must be complete'); }
    const action=context.action;
    if(['configure-calendar','correct-destination'].includes(action)) assert.equal(status.configuration?.repository,active.repository);
    if(action==='run-sync') {assert.equal(status.lastResult?.verified,true);assert.match(status.lastResult.digest,/^sha256:[a-f0-9]{64}$/);}
    if(['apply-conflict','settle-resolution'].includes(action)) assert.ok(!conflicts.items.some(row=>row.conflictId===active.conflictId),'Reviewed conflict remains unresolved');
    if(action==='unlock-owned-vault') assert.equal(native.locked,false);
    return proof({verified:true,evidence:{sessionId:native.sessionId,locked:native.locked,status,conflicts,transport:proxy?.observe()||null}});
  }
  async function restore(context) {
    if(!active) return proof({restored:true,operationsSettled:true,evidence:{neverPrepared:true}});
    if(active.extraSessionId) {
      assert.equal(context.binding.sourceCommit,target.sourceCommit);assert.equal(page.url(),target.expectedUrl);
      const extra=await page.evaluate(()=>window.drive.status());assert.equal(extra.sessionId,active.extraSessionId);assert.equal(extra.locked,true);assert.ok(!extra.storageDir);
      await changeOwnedSession('removeSession',active.extraSessionId);active.extraSessionId=null;
      await changeOwnedSession('selectSession',active.sessionId);
    }
    await identity(context); if(proxy) proxy.setMode('pass');
    const status=await page.evaluate(()=>window.drive.registryStorageStatus());
    if(registryBusy(status)) await page.evaluate(()=>window.drive.cancelRegistryStorage());
    await settle(context);
    const locked=await page.evaluate(()=>window.drive.lock()); assert.equal(locked.locked,true);assert.equal(locked.mounted,false);
    const removed=await changeOwnedSession('removeSession',active.sessionId);
    assert.ok(!removed.sessions.some(row=>row.sessionId===active.sessionId));
    const selected=await changeOwnedSession('selectSession',active.originalSessionId); assert.equal(selected.sessionId,active.originalSessionId);
    const retained=active.fixtureRoot; active=null;
    return proof({restored:true,operationsSettled:true,evidence:{originalSessionId:selected.sessionId,ownedFixtureRetained:retained}});
  }
  async function prepare(context) {
    assertCapabilities(context.state);
    if(active) await restore(context);
    const original=await identity(context);
    assert.equal(original.operation,null);
    const fixture=await prepareRegistryReviewFixture({...nativeFixtureOptions,sourceCommit:target.sourceCommit,scenario:reviewScenario(context.state)});
    const driveLetter=original.availableDriveLetters?.find(value=>/^[D-Z]:$/.test(value)&&value!=='M:'&&value!==original.driveLetter);
    if(!driveLetter) unavailable('unreserved drive letter');
    const added=await page.evaluate(()=>window.drive.addSession()); assert.notEqual(added.sessionId,original.sessionId);
    active={...fixture,sessionId:added.sessionId,originalSessionId:original.sessionId,driveLetter,unlocked:false,
      repository:'verification/vault-'+randomUUID().replaceAll('-',''),draftRepository:'verification/unsaved-'+randomUUID().replaceAll('-',''),conflictId:(context.state==='conflicts-unsupported'?fixture.expectedConflicts.find(row=>row.unsupportedReason&&(row.current?.isDirectory||row.preserved?.isDirectory)):fixture.expectedConflicts[0])?.conflictId};
    if(context.state!=='registry-unavailable') await unlock(context);
    // Navigate through the existing shell before operating the production controls.
    await navigate();
    await waitIdle();
    if(context.state==='conflicts-unavailable') {const locked=await page.evaluate(()=>window.drive.lock());assert.equal(locked.locked,true);}
    if(context.state.startsWith('registry-') && !['registry-unavailable','registry-unconfigured','registry-invalid','registry-session-changed'].includes(context.state)) {
      proxy.setMode('pass');
      await control('repository',active.repository); await control('save'); await waitIdle();
      const saved=await page.evaluate(()=>window.drive.registryStorageStatus());assert.deepEqual(saved.configuration,registryConfiguration({...registryDraft(),repository:active.repository}));
      if(['registry-running','registry-error'].includes(context.state)) {
        proxy.setMode(context.state==='registry-running'?'hold':'error');await control('sync');
        if(context.state==='registry-running') await proxy.waitForPending({minimum:1,timeoutMs:10000}); else await waitIdle();
      } else if(['registry-revisions','registry-restoring'].includes(context.state)) {
        await control('sync');await settle(context);await control('list');await waitIdle();
        const revisions=await page.evaluate(()=>window.drive.listRegistrySnapshots());assert.ok(revisions.length);active.digest=revisions[0].digest;
        active.restoreParent=path.join(active.fixtureRoot,'restores');await fs.mkdir(active.restoreParent,{mode:0o700});
        if(context.state==='registry-restoring') {
          await page.evaluate(digest=>{const p=document.querySelector('mfe-storage-maintenance').shadowRoot.querySelector('mfe-registry-storage-panel');p.revision.value=digest;p.revision.dispatchEvent(new Event('change',{bubbles:true}));},active.digest);
          await control('restore');
        }
      } else if(context.state==='registry-empty') {await control('list');await waitIdle();}
    }
    if(['conflicts-choice-review','conflicts-resolving','conflicts-resolved','conflicts-recovery-paths','conflicts-stale'].includes(context.state)) {
      await control('refresh',undefined,true);await waitIdle();await selectConflict();await choose('keep-both');
      if(context.state==='conflicts-stale') {await inspectRegistryReviewFixture(active,{...nativeFixtureOptions,sourceCommit:target.sourceCommit,advance:true});await page.evaluate(()=>window.drive.sync());}
      if(context.state==='conflicts-resolving') await control('apply',undefined,true);
      if(['conflicts-resolved','conflicts-recovery-paths','conflicts-stale'].includes(context.state)) await modal({...context,activate:()=>control('apply',undefined,true)},'confirmConflict');
    }
    return proof({...active,prepared:true,evidence:{nativeFixture:fixture,selectedSessionId:active.sessionId,transport:proxy?.observe()||null}});
  }
  async function switchSession(context) {
    await identity(context);const selected=await changeOwnedSession('selectSession',active.originalSessionId);assert.equal(selected.sessionId,active.originalSessionId);
    const returned=await changeOwnedSession('selectSession',active.sessionId);assert.equal(returned.sessionId,active.sessionId);
    await waitIdle();return proof({completed:true,evidence:{visited: selected.sessionId,returned:returned.sessionId}});
  }
  return {assertCapabilities,prepare,observeNative,restore,settle,unlock,switchSession,
    pickRestore:context=>modal(context,'pickFolder'),confirmResolution:context=>modal(context,'confirmConflict')};
}
