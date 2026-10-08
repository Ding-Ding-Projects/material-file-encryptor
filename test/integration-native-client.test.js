import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NativeClient } from '../src/main/native-client.js';

test('private JSONL transport correlates replies and rejects sanitized errors', { skip: process.platform === 'win32' ? 'Unix executable protocol fixture; Windows uses the real native host checks.' : false }, async () => {
  // A protocol fixture exercises transport behavior, not filesystem mounting.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-pipe-'));
  const executable = path.join(root, 'helper');
  await fs.writeFile(executable, `#!/usr/bin/env node\nconst r=require('node:readline').createInterface({input:process.stdin});r.on('line',line=>{const q=JSON.parse(line);process.stdout.write(JSON.stringify(q.method==='fail'?{id:q.id,error:{message:'Safe failure'}}:{id:q.id,result:{echo:q.params.value}})+'\\n');});`, { mode: 0o700 });
  const client = new NativeClient(executable);
  try {
    assert.deepEqual(await client.request('status', { value: 42 }), { echo: 42 });
    await assert.rejects(client.request('fail'), /Safe failure/);
    const values = await Promise.all([client.request('one', { value: 1 }), client.request('two', { value: 2 })]);
    assert.deepEqual(values, [{ echo: 1 }, { echo: 2 }]);
  } finally { client.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});
