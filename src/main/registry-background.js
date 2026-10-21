import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const TASK = 'MaterialFileEncryptor.RegistrySync';
/** InteractiveToken needs no password and never wakes or signs into the host. */
export function createRegistryBackground({ root, executable, packaged, platform = process.platform, run = execute }) {
  const marker = path.join(root, 'registry-task-owned.json');
  return async function register(enabled) {
    if (platform !== 'win32' || !packaged) { if (enabled) throw Error('Background scheduling requires the installed Windows application.'); return; }
    const binary = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'schtasks.exe');
    const options = { windowsHide: true, shell: false, timeout: 30000, maxBuffer: 1024 * 1024 };
    let recorded;
    try { recorded = JSON.parse(await fs.readFile(marker, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let existing;
    try { existing = (await run(binary, ['/Query', '/TN', TASK, '/XML'], options)).stdout; }
    catch (error) { if (error.code !== 1) throw error; }
    if (!enabled && !existing && !recorded) return;
    const xmlValue = (xml, tag) => { const matches = [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))]; if (matches.length !== 1) return null; return matches[0][1]; };
    const enabledSchedule = xml => {
      const enabled = [...xml.matchAll(/<Enabled>([^<]*)<\/Enabled>/g)].map(match => match[1]);
      return enabled.length === 2 && enabled.every(value => value === 'true') &&
        (xml.match(/<TimeTrigger>/g) || []).length === 1 &&
        /<Triggers>\s*<TimeTrigger>[\s\S]*?<\/TimeTrigger>\s*<\/Triggers>/.test(xml) &&
        xmlValue(xml, 'Interval') === 'PT5M' && xmlValue(xml, 'StartWhenAvailable') === 'true' &&
        xmlValue(xml, 'MultipleInstancesPolicy') === 'IgnoreNew';
    };
    const principal = (await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], options)).stdout.match(/S-1-[0-9-]+/)?.[0];
    if (!principal) throw Error('The current signed-in account could not be verified.');
    if (existing && (!recorded || recorded.task !== TASK || recorded.principal !== principal ||
      xmlValue(existing, 'Command') !== escape(recorded.executable) || xmlValue(existing, 'UserId') !== principal ||
      xmlValue(existing, 'Arguments') !== '--registry-sync' || xmlValue(existing, 'LogonType') !== 'InteractiveToken' ||
      xmlValue(existing, 'RunLevel') !== 'LeastPrivilege' || xmlValue(existing, 'WakeToRun') !== 'false')) throw Error('A background task exists without matching ownership.');
    if (!enabled) {
      if (existing && recorded) await run(binary, ['/Delete', '/TN', TASK, '/F'], options);
      if (recorded) await fs.unlink(marker);
      return;
    }
    if (existing && recorded.executable === executable && !recorded.pending && enabledSchedule(existing)) return;
    const xml = `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><TimeTrigger><Repetition><Interval>PT5M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers><Principals><Principal id="Author"><UserId>${escape(principal)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><Enabled>true</Enabled><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT1H</ExecutionTimeLimit><WakeToRun>false</WakeToRun></Settings><Actions Context="Author"><Exec><Command>${escape(executable)}</Command><Arguments>--registry-sync</Arguments></Exec></Actions></Task>`;
    const filename = path.join(root, 'registry-task.xml');
    await fs.writeFile(filename, Buffer.from('\ufeff' + xml, 'utf16le'), { mode: 0o600 });
    await fs.writeFile(marker, JSON.stringify({ task: TASK, executable, principal, pending: true }), { mode: 0o600 });
    try {
      await run(binary, ['/Create', '/TN', TASK, '/XML', filename, ...(existing ? ['/F'] : [])], options);
      const readback = (await run(binary, ['/Query', '/TN', TASK, '/XML'], options)).stdout;
      if (xmlValue(readback, 'Command') !== escape(executable) || xmlValue(readback, 'Arguments') !== '--registry-sync' ||
          xmlValue(readback, 'UserId') !== principal || xmlValue(readback, 'LogonType') !== 'InteractiveToken' ||
          xmlValue(readback, 'RunLevel') !== 'LeastPrivilege' || xmlValue(readback, 'WakeToRun') !== 'false' || !enabledSchedule(readback)) throw Error('Background task readback did not match.');
      await fs.writeFile(marker, JSON.stringify({ task: TASK, executable, principal }), { mode: 0o600 });
    } finally { await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  };
}
