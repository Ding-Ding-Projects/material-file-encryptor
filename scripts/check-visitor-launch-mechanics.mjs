import assert from 'node:assert/strict';
import {launchAdmittedBrowser,launchDiagnostic} from './capture-visitor-evidence.mjs';
const admitted='/synthetic/admitted/chrome';let actual;
const sentinel={kind:'synthetic server'};assert.equal(await launchAdmittedBrowser({async launchServer(options){actual=options;return sentinel;}},admitted),sentinel);
assert.equal(actual.executablePath,admitted);assert.equal(actual.chromiumSandbox,true);assert.equal(actual.headless,true);assert.equal(actual.timeout,30000);assert.equal(actual.args.some(value=>value.includes('no-sandbox')),false);
const original=Error('Synthetic launch failure');await assert.rejects(launchAdmittedBrowser({async launchServer(){throw original;}},admitted),error=>error===original);
for(const [message,expected]of [['Executable does not exist','unclassified-launch-error'],["Executable doesn\'t exist at /private/host/path",'requested-executable-missing'],['No usable sandbox!','sandbox-rejection'],['error while loading shared libraries: libfixture.so','shared-library-loader-error'],['Timeout 30000ms exceeded.','launch-timeout']]){const value=launchDiagnostic(Error(message));assert.ok(value.observedPatterns.includes(expected));assert.equal(value.rawMessageUploaded,false);assert.equal(JSON.stringify(value).includes('/private/host/path'),false);}
assert.deepEqual(launchDiagnostic(Error('<process did exit: exitCode=127, signal=null>')).observedExit,{code:127,signal:null});assert.doesNotThrow(()=>launchDiagnostic({get message(){throw Error('unreadable diagnostic');}}));
console.log('PASS: actual launch wrapper binds the admitted executable and sandbox, preserves rejection, and emits bounded diagnostic facts without raw messages. No browser launched.');
