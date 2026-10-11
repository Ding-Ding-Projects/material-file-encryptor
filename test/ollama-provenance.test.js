import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEWED_OLLAMA_MANIFESTS,OLLAMA_PUBLISHER_POLICIES} from '../src/main/ollama-provenance.js';
import {createNativeOllamaHost} from '../src/main/ollama-host.js';
test('reviewed provenance conforms to native host configuration and is immutable',()=>{
  const host=createNativeOllamaHost({dataDirectory:process.cwd(),reviewedManifests:REVIEWED_OLLAMA_MANIFESTS,publisherPolicies:OLLAMA_PUBLISHER_POLICIES});
  assert.equal(host.trustStatus().reviewedManifests,1);
  assert.equal(host.trustStatus().establishedPublisherPolicies,1);
  for(const list of [REVIEWED_OLLAMA_MANIFESTS,OLLAMA_PUBLISHER_POLICIES])assert.ok(Object.isFrozen(list)&&Object.isFrozen(list[0]));
  const manifest=REVIEWED_OLLAMA_MANIFESTS[0];
  assert.notEqual(manifest.sha256,manifest.artifactSha256);
  assert.equal(manifest.bytes,27854728);
  assert.equal(manifest.member,'ollama.exe');
  assert.equal(OLLAMA_PUBLISHER_POLICIES[0].sourceUrl,manifest.sourceUrl);
});
