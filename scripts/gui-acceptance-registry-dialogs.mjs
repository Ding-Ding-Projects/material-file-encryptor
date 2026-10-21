import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

function invoke(python,helper,input,env) {
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[helper],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('REGISTRY_DIALOG_TIMEOUT'));},60000);
    child.stdout.on('data',part=>{output+=part;if(output.length>4*1024*1024){child.kill();finish(Error('REGISTRY_DIALOG_OUTPUT_LIMIT'));}});
    child.stderr.resume();child.on('error',()=>finish(Error('REGISTRY_DIALOG_LAUNCH_FAILED')));
    child.on('close',code=>{try{const value=JSON.parse(output);assert.equal(code,0);assert.equal(value.ok,true);finish(null,value);}catch{finish(Error('REGISTRY_DIALOG_OPERATION_UNVERIFIED'));}});
    child.stdin.on('error',()=>finish(Error('REGISTRY_DIALOG_INPUT_FAILED')));child.stdin.end(JSON.stringify(input));
  });
}

/** Review is an explicit pause for the actual PNG and native inventory. It must
 * return a selected control or client-coordinate action after pixel inspection.
 * No default button, coordinate, label translation or consent is inferred.
 */
export function createRegistryDialogDriver({opened,review,pauseTimeoutMs=300000}) {
  assert.equal(opened.connectionOwned,true);assert.equal(opened.target.kind,'extracted-packaged-runtime');
  assert.equal(typeof review,'function','CAPABILITY_UNAVAILABLE: actual modal pixel-review callback');
  assert.ok(Number.isSafeInteger(pauseTimeoutMs)&&pauseTimeoutMs>0&&pauseTimeoutMs<=3600000);
  const cli=process.env.MFE_LOWLEVEL_CLI;assert.ok(cli,'CAPABILITY_UNAVAILABLE: installed cheap Lowlevel CLI');
  const python=process.env.MFE_LOWLEVEL_PYTHON||path.join(path.dirname(cli),'python.exe');
  const helper=fileURLToPath(new URL('./gui-acceptance-registry-dialogs.py',import.meta.url));
  const env={...process.env,MFE_LOWLEVEL_CLIENT:path.join(os.homedir(),'.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py'),MFE_LOWLEVEL_CLI:cli};delete env.MFE_LOWLEVEL_URL;
  async function drive(kind,context) {
    assert.equal(context.sourceCommit,opened.target.sourceCommit);assert.equal(context.runRoot,opened.runRoot);assert.equal(context.statePath,opened.statePath);
    if(kind==='folder') {
      assert.ok(path.isAbsolute(context.parent));assert.equal(await fs.realpath(context.parent),context.parent);assert.equal(path.basename(context.parent),'restores');
      const root=path.dirname(context.parent);assert.match(path.basename(root),/^mfe-registry-fixture-review-[a-f0-9]{32}$/);
      assert.equal(await fs.readFile(path.join(root,'.registry-fixture-owner'),'utf8'),'MaterialFileEncryptor synthetic registry fixture v1\n'+root+'\n');
    }
    const base={kind,runRoot:opened.runRoot,statePath:opened.statePath,verifierSourceCommit:opened.receipt.verifierSourceCommit,executableSha256:opened.target.hashes.executable,parent:context.parent};
    const actions=[];let last;
    for(let step=0;step<6;step++) {
      const inspection=await invoke(python,helper,{...base,phase:'inspect',allowClosed:actions.length>0},env);
      if(inspection.closed) {
        assert.ok(last&&actions.length);
        return {completed:true,sourceCommit:context.sourceCommit,hiddenDesktop:true,ownerVerified:true,evidence:{hwnd:last.hwnd,processId:last.processId,desktop:last.desktop,actions,modalClosed:true}};
      }
      let timer;
      const verdict=await Promise.race([review({kind,step,...inspection,expected:{conflictId:context.conflictId,restoreParent:context.parent}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('REGISTRY_DIALOG_REVIEW_PENDING')),pauseTimeoutMs);})]).finally(()=>clearTimeout(timer));
      assert.equal(verdict?.inspected,true,'Actual modal pixel inspection remains pending');
      assert.equal(verdict?.imageSha256,inspection.imageSha256,'Review belongs to another image');
      assert.ok(verdict.action&&['folder-text','click'].includes(verdict.action.kind));
      last=await invoke(python,helper,{...base,phase:'apply',review:inspection,action:verdict.action},env);
      actions.push({image:inspection.image,imageSha256:inspection.imageSha256,action:verdict.action,applied:last.applied});
    }
    throw Error('REGISTRY_DIALOG_INPUT_LIMIT');
  }
  return {pickFolder:context=>drive('folder',context),confirmConflict:context=>drive('conflict',context)};
}
