import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('release selection skips deleted refs without restricting ordinary pushes or manual dispatch',async()=>{
  const workflow=(await fs.readFile('.github/workflows/windows.yml','utf8')).replaceAll('\r\n','\n');
  const verify=text=>{
    assert.match(text,/push:\r?\n    branches: \['\*\*'\]/);
    assert.match(text,/  workflow_dispatch:/);
    assert.match(text,/  select-runner:\r?\n    if: github\.event\.deleted != true\r?\n/);
    assert.match(text,/  windows:\r?\n    needs: select-runner\r?\n/);
  };
  assert.throws(()=>verify(workflow.replace('    if: github.event.deleted != true\n','')),assert.AssertionError);
  verify(workflow.replaceAll('\r\n','\n'));
});
