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

transport_failures = []
native_backend = None

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
        if not payload['client_ok']:
            transport_failures.append(payload)
        return payload

# Retain the installed versioned state, creation-time checks, process-tree checks,
# window ownership checks and teardown. Only tool transport changes.
policy_spec = importlib.util.spec_from_file_location('desktop_policy', Path(__file__).with_name('local-headless-desktop-check-policy.py'))
policy = importlib.util.module_from_spec(policy_spec)
policy_spec.loader.exec_module(policy)

def close_after_absence(client, state, processes):
    if not module._recorded_tree_absent(processes):
        raise SystemExit('Recorded owned processes remain.')
    execution_proof = dict(native_backend.proof.last_absence) if native_backend else {}
    windows = client.call_tool('list_headless_windows', {'name': state['desktop']})
    if policy.automatically_closed(windows, state['desktop'], processes, module._recorded_tree_absent):
        return {'automaticallyClosed': True, **execution_proof}
    if not windows.get('client_ok') or windows.get('windows'):
        raise SystemExit('Desktop is not proven empty after exit.')
    closed = client.call_tool('close_headless_desktop', {'name': state['desktop']})
    if module._desktop_close_confirmed(closed):
        return {'automaticallyClosed': False, **execution_proof}
    if policy.automatically_closed(closed, state['desktop'], processes, module._recorded_tree_absent):
        return {'automaticallyClosed': True, **execution_proof}
    raise SystemExit('Owned desktop close was not confirmed.')

module._connect = lambda endpoint, timeout: DirectClient(timeout)

# Query all recorded identities in one CIM snapshot. The installed helper's
# per-process query is safe but multiplies shell startup time for browser trees.
def recorded_tree_absent(tree):
    snapshot = module._powershell_json(r'''
$all = @(Get-CimInstance Win32_Process | ForEach-Object {
    [pscustomobject]@{
        pid = [int]$_.ProcessId
        parentPid = [int]$_.ParentProcessId
        creationDate = if ($null -eq $_.CreationDate) { $null } else { $_.CreationDate.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture) }
        executablePath = [string]$_.ExecutablePath
    }
})
ConvertTo-Json -InputObject $all -Compress -Depth 4
''', {})
    if not isinstance(snapshot, list):
        raise module.ClientFailure('PROCESS_PROOF_FAILED', 'Process snapshot was not an array.')
    current_by_pid = {item['pid']: item for item in snapshot}
    present = False
    for expected in tree:
        current = current_by_pid.get(expected['pid'])
        if current is None:
            continue
        if not module._same_process(expected, current):
            raise module.ClientFailure('PROCESS_IDENTITY_CHANGED', 'A recorded launch-tree PID was reused; cleanup stopped.')
        present = True
    return not present

module._recorded_tree_absent = recorded_tree_absent
backend_name = os.environ.get('MFE_RENDERER_PROCESS_BACKEND', 'cim')
if backend_name not in ['cim', 'native-v1']:
    raise SystemExit('Unknown renderer process backend.')
snapshot_spec = importlib.util.spec_from_file_location('renderer_snapshot', Path(__file__).with_name('renderer-process-snapshot.py'))
snapshot_module = importlib.util.module_from_spec(snapshot_spec)
snapshot_spec.loader.exec_module(snapshot_module)
if backend_name == 'native-v1' and len(sys.argv) > 1 and sys.argv[1] != 'preflight':
    state_arg = sys.argv[sys.argv.index('--state') + 1] if '--state' in sys.argv else sys.argv[2]
    native_backend = snapshot_module.RendererNativeBackend(module, state_arg, os.environ.get('MFE_RENDERER_SOURCE_COMMIT'), helper, fresh_launch=sys.argv[1] == 'launch').install()
elif backend_name == 'cim':
    if len(sys.argv) > 1 and sys.argv[1] == 'launch' and '--state' in sys.argv and snapshot_module.marker_path(sys.argv[sys.argv.index('--state') + 1]).exists():
        raise SystemExit('CIM launch cannot overwrite native provenance.')
    original_read_state = module._read_state
    def read_cim_state(path):
        if snapshot_module.marker_path(path).exists():
            raise module.ClientFailure('PROCESS_PROOF_FAILED', 'Native renderer receipt requires its explicit backend.')
        return original_read_state(path)
    module._read_state = read_cim_state
if len(sys.argv) == 3 and sys.argv[1] == 'bind-client':
    if native_backend is None:
        raise SystemExit('Client ancestry binding requires the native backend.')
    recovery_spec = importlib.util.spec_from_file_location('fresh_renderer_recovery', Path(__file__).with_name('supplemental-renderer-recovery.py'))
    recovery = importlib.util.module_from_spec(recovery_spec)
    sys.modules[recovery_spec.name] = recovery
    recovery_spec.loader.exec_module(recovery)
    request = module._read_json_source(None)
    if set(request) != {'clientPid'}:
        raise SystemExit('Exact client PID is required.')
    with recovery.owning_client(request['clientPid']) as (binding, chain):
        result = {'ok': True, 'client_ok': True, 'clientBinding': binding, 'clientLaunchChain': chain}
    print(json.dumps(result))
    raise SystemExit(0)
if len(sys.argv) == 3 and sys.argv[1] == 'prove-cdp':
    if native_backend is None:
        raise SystemExit('Native renderer target proof requires its explicit backend.')
    request = module._read_json_source(None, allow_empty=True)
    if set(request) - {'clientPid', 'targetId', 'clientBinding'}:
        raise SystemExit('Unexpected connected renderer proof fields.')
    client_pid = request.get('clientPid')
    target_id = request.get('targetId')
    if client_pid is not None:
        if type(client_pid) is not int or not 0 < client_pid <= 0xFFFFFFFF:
            raise SystemExit('Connected renderer client PID is invalid.')
        if not isinstance(target_id, str) or not re.fullmatch('[A-Za-z0-9._-]{1,128}', target_id):
            raise SystemExit('Connected renderer target identity is invalid.')
        recovery_spec = importlib.util.spec_from_file_location('fresh_renderer_recovery', Path(__file__).with_name('supplemental-renderer-recovery.py'))
        recovery = importlib.util.module_from_spec(recovery_spec)
        sys.modules[recovery_spec.name] = recovery
        recovery_spec.loader.exec_module(recovery)
        if not request.get('clientBinding'):
            raise SystemExit('Connected renderer requires pinned actual client ancestry.')
        with recovery.owning_client(client_pid, request['clientBinding']) as (binding, chain):
            result = snapshot_module.prove_renderer_target(native_backend, client_pid=client_pid, target_id=target_id)
            if result['clientIdentity'] != binding['clientIdentity']:
                raise SystemExit('Connected renderer socket client differs from held ancestry.')
            result['clientLaunchChain'] = chain
    else:
        result = snapshot_module.prove_renderer_target(native_backend)
    print(json.dumps(result))
    raise SystemExit(0)
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
        closed_proof = close_after_absence(client, state, proof['processes'])
        state['cleaned'] = True
        state_path.write_text(json.dumps(state), encoding='utf-8')
        print(json.dumps({'ok': True, 'client_ok': True, 'gracefulExit': True, 'recordedProcessesAbsent': True, 'desktopClosed': True, **closed_proof}))
    raise SystemExit(0)
if len(sys.argv) > 1 and sys.argv[1] == 'cleanup':
    args = module._parser().parse_args()
    state_path, state = module._read_state(args.state)
    proof_path = state_path.with_name('exit-processes.json')
    if not state['cleaned']:
        try:
            tree = module._process_tree(state['process'])
            proof_path.write_text(json.dumps({'root': state['process'], 'processes': tree}), encoding='utf-8')
        except module.ClientFailure as error:
            if error.code not in ['PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED']:
                raise
            if not proof_path.is_file():
                raise SystemExit('No recorded owned process tree exists after process-proof failure; root absence is unverified.')
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        if proof['root'] != state['process']:
            raise SystemExit('Cleanup process proof belongs to a different launch.')
    try:
        result = module._cmd_cleanup(args)
    except module.ClientFailure as error:
        result = {'ok': False, 'client_ok': False, 'code': error.code}
    if result.get('client_ok') is not True and not state['cleaned']:
        allowed = policy.automatically_closed(result, state['desktop'], proof['processes'], module._recorded_tree_absent) or result.get('code') in ['UNKNOWN_PROCESS_TREE', 'DESKTOP_NOT_CLOSED', 'PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED']
        other_transport_failure = any(not policy.automatically_closed(item, state['desktop'], proof['processes'], module._recorded_tree_absent) for item in transport_failures)
        if not allowed or other_transport_failure:
            print(json.dumps(result))
            raise SystemExit(1)
        closed_proof = close_after_absence(DirectClient(20), state, proof['processes'])
        state['cleaned'] = True
        state_path.write_text(json.dumps(state), encoding='utf-8')
        result = {'ok': True, 'client_ok': True, 'recordedProcessesAbsent': True, 'desktopClosed': True, **closed_proof}
    print(json.dumps(result))
    raise SystemExit(0 if result.get('client_ok') else 1)
raise SystemExit(module.main())
