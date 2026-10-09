import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('root build stages the public website through checked child execution',async()=>{
  const script=await readFile(new URL('../scripts/build.ps1',import.meta.url),'utf8');
  const entry=await readFile(new URL('../build.bat',import.meta.url),'utf8');
  assert.match(script,/Invoke-Checked\s*\{\s*node(?:\.exe)?\s+scripts\/build-site\.mjs\s*\}/);
  assert.match(script,/function Invoke-Checked[^\n]*LASTEXITCODE[^\n]*throw/);
  assert.match(entry,/exit \/b %BUILD_RESULT%/i);
});
