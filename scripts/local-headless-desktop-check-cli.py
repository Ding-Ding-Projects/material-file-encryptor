"""Use the installed lifecycle safety checks with the documented direct tool CLI."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
cli = Path(os.environ['MFE_LOWLEVEL_CLI'])
if not helper.is_file() or not cli.is_file():
    raise SystemExit('Installed lifecycle helper and direct CLI are required.')
spec = importlib.util.spec_from_file_location('installed_lifecycle', helper)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class DirectClient:
    def __init__(self, timeout):
        self.timeout = timeout
    def list_tools(self):
        result = subprocess.run([str(cli), '--help'], capture_output=True, text=True, timeout=self.timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode != 0:
            raise module.ClientFailure('CLI_CATALOG_FAILED', 'Direct tool catalog was unavailable.')
        return [{'name': name} for name in re.findall(r'^  ([a-z][a-z_]+)$', result.stdout, re.M)]
    def call_tool(self, name, params):
        result = subprocess.run([str(cli), name, '--json', json.dumps(params)], capture_output=True, text=True, timeout=self.timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            payload = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise module.ClientFailure('CLI_INVALID_RESULT', 'Direct tool did not return JSON.')
        if not isinstance(payload, dict):
            raise module.ClientFailure('CLI_INVALID_RESULT', 'Direct tool result must be an object.')
        payload['client_ok'] = result.returncode == 0 and payload.get('ok') is True and payload.get('timed_out') is not True and payload.get('returncode', 0) == 0
        return payload

# Retain the installed versioned state, creation-time checks, process-tree checks,
# window ownership checks and teardown. Only tool transport changes.
module._connect = lambda endpoint, timeout: DirectClient(timeout)
if len(sys.argv) == 3 and sys.argv[1] in ['prepare-exit', 'confirm-exit']:
    state_path, state = module._read_state(sys.argv[2])
    proof_path = state_path.with_name('exit-processes.json')
    client = DirectClient(20)
    if sys.argv[1] == 'prepare-exit':
        tree = module._process_tree(state['process'])
        proof_path.write_text(json.dumps({'root': state['process'], 'processes': tree}), encoding='utf-8')
        print(json.dumps({'ok': True, 'client_ok': True, 'recordedProcesses': len(tree)}))
    else:
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        if proof['root'] != state['process']:
            raise SystemExit('Exit process proof belongs to a different launch.')
        deadline = time.monotonic() + 20
        while not module._recorded_tree_absent(proof['processes']):
            if time.monotonic() >= deadline:
                raise SystemExit('Recorded processes did not exit gracefully.')
            time.sleep(0.25)
        windows = client.call_tool('list_headless_windows', {'name': state['desktop']})
        if not windows.get('client_ok') or windows.get('windows'):
            raise SystemExit('Desktop is not proven empty after exit.')
        closed = client.call_tool('close_headless_desktop', {'name': state['desktop']})
        if not module._desktop_close_confirmed(closed):
            raise SystemExit('Owned desktop close was not confirmed.')
        state['cleaned'] = True
        state_path.write_text(json.dumps(state), encoding='utf-8')
        print(json.dumps({'ok': True, 'client_ok': True, 'gracefulExit': True, 'recordedProcessesAbsent': True, 'desktopClosed': True}))
    raise SystemExit(0)
raise SystemExit(module.main())
