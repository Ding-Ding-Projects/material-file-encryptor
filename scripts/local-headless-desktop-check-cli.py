"""Use installed lifecycle checks with persistent loopback MCP or direct CLI transport."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import stat
import hashlib
import uuid
from datetime import datetime, timezone

import contextlib
import io


def configure_transport(lifecycle, endpoint, direct_factory, failures):
    # Capture before overriding: native MCP retains its validation and response bounds.
    original_connect = lifecycle._connect
    if endpoint:
        lifecycle._validate_endpoint(endpoint)

    class ObservedClient:
        def __init__(self, client): self.client = client
        def list_tools(self): return self.client.list_tools()
        def call_tool(self, name, params):
            result = self.client.call_tool(name, params)
            if result.get('client_ok') is not True:
                failures.append(result)
            return result

    def connect(saved_endpoint, timeout):
        if endpoint:
            lifecycle._validate_endpoint(saved_endpoint)
            if saved_endpoint != endpoint:
                raise lifecycle.ClientFailure('ENDPOINT_MISMATCH', 'Saved lifecycle endpoint differs from configured transport.')
            return ObservedClient(original_connect(saved_endpoint, timeout))
        return direct_factory(timeout)
    lifecycle._connect = connect
    return connect


def validated_rejected_edge(lifecycle, error):
    edge = getattr(error, 'rejected_edge', None)
    keys = {'reasonCode', 'stage', 'childIdentity', 'claimedParentPid', 'parentIdentity', 'parentPresent', 'childCreationTicks', 'parentCreationTicks', 'ordering'}
    if not isinstance(edge, dict) or set(edge) != keys:
        raise ValueError('Unsupported rejected edge')
    if error.code != 'UNPROVEN_PROCESS_ANCESTRY' or edge['reasonCode'] not in {'MISSING_PARENT', 'CHILD_PREDATES_PARENT'} or edge['stage'] != 'ancestry' or getattr(error, 'stage', None) != 'ancestry':
        raise ValueError('Unsupported rejection')
    if getattr(error, 'reason_code', getattr(error, 'reasonCode', None)) != edge['reasonCode']:
        raise ValueError('Mismatched rejection reason')
    child = edge['childIdentity']; lifecycle._validate_process_identity(child)
    if type(edge['claimedParentPid']) is not int or edge['claimedParentPid'] != child['parentPid'] or type(edge['childCreationTicks']) is not int or edge['childCreationTicks'] != lifecycle._creation_ticks(child['creationDate']):
        raise ValueError('Mismatched child identity')
    if edge['reasonCode'] == 'MISSING_PARENT':
        if edge['parentPresent'] is not False or edge['parentIdentity'] is not None or edge['parentCreationTicks'] is not None or edge['ordering'] != 'PARENT_ABSENT':
            raise ValueError('Invalid parent absence')
    else:
        parent = edge['parentIdentity']; lifecycle._validate_process_identity(parent)
        if edge['parentPresent'] is not True or parent['pid'] != child['parentPid'] or type(edge['parentCreationTicks']) is not int or edge['parentCreationTicks'] != lifecycle._creation_ticks(parent['creationDate']) or edge['childCreationTicks'] >= edge['parentCreationTicks'] or edge['ordering'] != 'CHILD_PREDATES_PARENT':
            raise ValueError('Invalid parent ordering')
    encoded = json.dumps(edge, separators=(',', ':'), allow_nan=False).encode('utf-8')
    if len(encoded) > 65536:
        raise ValueError('Rejected edge exceeds bound')
    return json.loads(encoded)


def checked_path(path, directory=False):
    path = Path(path)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError('Unresolved evidence path')
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('Linked evidence path')
    info = path.lstat()
    if not directory and getattr(info, 'st_nlink', 1) != 1:
        raise ValueError('Hard-linked evidence path')
    if not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)):
        raise ValueError('Wrong evidence path kind')
    return path


@contextlib.contextmanager
def pinned_directories(root, state_path):
    # On Windows, deny delete sharing while writing so checked ancestors cannot
    # be renamed or replaced by a junction between validation and exclusive create.
    handles = []
    if os.name != 'nt':
        checked_path(root, directory=True)
        yield
        return
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    try:
        for directory in [*reversed(root.parents), root]:
            handle = kernel.CreateFileW(str(directory), 0x80, 3, None, 3, 0x02200000, None)
            if handle == ctypes.c_void_p(-1).value:
                raise ValueError('Evidence directory cannot be pinned')
            handles.append(handle)
            checked_path(directory, directory=True)
        handle = kernel.CreateFileW(str(state_path), 0x80, 1, None, 3, 0x00200000, None)
        if handle == ctypes.c_void_p(-1).value:
            raise ValueError('Lifecycle file cannot be pinned')
        handles.append(handle)
        checked_path(state_path)
        yield
    finally:
        for handle in reversed(handles): kernel.CloseHandle(handle)


def persist_rejected_edge(lifecycle, context, root_identity, error, original_read_state):
    edge = validated_rejected_edge(lifecycle, error)
    raw_path, saved = context
    state_path = checked_path(raw_path)
    root = checked_path(Path(saved['runRoot']), directory=True)
    if state_path.parent != root or state_path.name != 'lifecycle.json' or saved.get('created') is not True or saved.get('cleaned') is not False or saved.get('process') != root_identity or Path(saved['outputRoot']) != root / 'output':
        raise ValueError('Unowned lifecycle evidence destination')
    with pinned_directories(root, state_path):
        checked_path(state_path)
        _, current = original_read_state(str(state_path))
        if current != saved:
            raise ValueError('Lifecycle changed before evidence write')
        record = {'version': 1, 'recordedAt': datetime.now(timezone.utc).isoformat(), 'code': error.code,
                  'lifecycleSha256': hashlib.sha256(state_path.read_bytes()).hexdigest(), 'rootIdentity': root_identity, 'rejectedEdge': edge}
        encoded = json.dumps(record, separators=(',', ':'), allow_nan=False).encode('utf-8')
        if len(encoded) > 131072:
            raise ValueError('Evidence record exceeds bound')
        destination = root / ('rejected-edge-' + uuid.uuid4().hex + '.json')
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
        descriptor = os.open(destination, flags, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(encoded); output.flush(); os.fsync(output.fileno())
        checked_path(destination)
        if destination.read_bytes() != encoded:
            raise ValueError('Evidence readback mismatch')


def install_private_edge_recorder(lifecycle):
    original_read_state = lifecycle._read_state
    original_validate = lifecycle._validate_process_tree
    context = None
    counts = {'saved': 0, 'unavailable': 0}
    def read_state(value):
        nonlocal context
        result = original_read_state(value)
        context = (Path(value), json.loads(json.dumps(result[1])))
        return result
    def validate(root, processes):
        try:
            return original_validate(root, processes)
        except lifecycle.ClientFailure as error:
            if error.code == 'UNPROVEN_PROCESS_ANCESTRY' and hasattr(error, 'rejected_edge'):
                try:
                    if context is None: raise ValueError('No saved lifecycle context')
                    persist_rejected_edge(lifecycle, context, root, error, original_read_state)
                    counts['saved'] += 1
                except Exception:
                    counts['unavailable'] += 1
            raise
    lifecycle._read_state = read_state
    lifecycle._validate_process_tree = validate
    return counts


def main():
    global module, policy, transport_failures, private_evidence_counts
    helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
    endpoint = os.environ.get('MFE_LOWLEVEL_URL')
    cli = Path(os.environ['MFE_LOWLEVEL_CLI']) if os.environ.get('MFE_LOWLEVEL_CLI') else None
    if endpoint and cli:
        raise SystemExit('Select exactly one lifecycle transport.')
    if not helper.is_file() or (not endpoint and (cli is None or not cli.is_file())):
        raise SystemExit('Installed lifecycle helper and selected transport are required.')
    spec = importlib.util.spec_from_file_location('installed_lifecycle', helper)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    receipt_spec = importlib.util.spec_from_file_location('direct_receipt', Path(__file__).with_name('direct-cli-receipt.py'))
    receipt_adapter = importlib.util.module_from_spec(receipt_spec)
    receipt_spec.loader.exec_module(receipt_adapter)
    verify_transport = receipt_adapter.install_receipt_transport(module, endpoint=endpoint, cli=cli if not endpoint else None)
    if len(sys.argv) == 2 and sys.argv[1] == 'transport-provenance':
        print(json.dumps({'ok': True, 'client_ok': True, 'transport': 'persistent-http-adapter' if endpoint else receipt_adapter.DIRECT_TRANSPORT,
                          **({'endpoint': endpoint} if endpoint else {'transportProvenance': verify_transport()})}))
        raise SystemExit(0)

    transport_failures = []
    private_evidence_counts = install_private_edge_recorder(module)

    class DirectClient:
        def __init__(self, timeout):
            self.timeout = timeout
        def list_tools(self):
            verify_transport()
            result = subprocess.run([str(cli), '--help'], capture_output=True, text=True, timeout=self.timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode != 0:
                raise module.ClientFailure('CLI_CATALOG_FAILED', 'Direct tool catalog was unavailable.')
            return [{'name': name} for name in re.findall(r'^  ([a-z][a-z_]+)$', result.stdout, re.M)]
        def call_tool(self, name, params):
            verify_transport()
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
        windows = client.call_tool('list_headless_windows', {'name': state['desktop']})
        if policy.automatically_closed(windows, state['desktop'], processes, module._recorded_tree_absent):
            return {'automaticallyClosed': True}
        if not windows.get('client_ok') or windows.get('windows'):
            raise SystemExit('Desktop is not proven empty after exit.')
        closed = client.call_tool('close_headless_desktop', {'name': state['desktop']})
        if module._desktop_close_confirmed(closed):
            return {'automaticallyClosed': False}
        if policy.automatically_closed(closed, state['desktop'], processes, module._recorded_tree_absent):
            return {'automaticallyClosed': True}
        raise SystemExit('Owned desktop close was not confirmed.')

    connect = configure_transport(module, endpoint, DirectClient, transport_failures)
    if len(sys.argv) == 3 and sys.argv[1] in ['prepare-exit', 'confirm-exit']:
        state_path, state = module._read_state(sys.argv[2])
        proof_path = state_path.with_name('exit-processes.json')
        client = connect(state['endpoint'], 20)
        if sys.argv[1] == 'prepare-exit':
            tree = module._process_tree(state['process'])
            proof_path.write_text(json.dumps({'root': state['process'], 'processes': tree}), encoding='utf-8')
            print(json.dumps({'ok': True, 'client_ok': True, 'recordedProcesses': len(tree)}))
        else:
            proof = json.loads(proof_path.read_text(encoding='utf-8'))
            policy.validate_exit_proof(module, state, proof)
            deadline = time.monotonic() + 20
            while not module._recorded_tree_absent(proof['processes']):
                if time.monotonic() >= deadline:
                    raise SystemExit('Recorded processes did not exit gracefully.')
                time.sleep(0.25)
            closed_proof = close_after_absence(client, state, proof['processes'])
            state['cleaned'] = True
            module._atomic_write_json(state_path, state)
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
                if not policy.missing_root_proof_allowed(error.code):
                    raise
                if not proof_path.is_file():
                    raise SystemExit('No recorded owned process tree exists for absent-root cleanup.')
            proof = json.loads(proof_path.read_text(encoding='utf-8'))
            policy.validate_exit_proof(module, state, proof)
        try:
            result = module._cmd_cleanup(args)
        except module.ClientFailure as error:
            result = sanitized_failure(error.code, vars(error))
        if result.get('client_ok') is not True and not state['cleaned']:
            allowed = policy.automatically_closed(result, state['desktop'], proof['processes'], module._recorded_tree_absent) or policy.cleanup_absence_recovery_allowed(result)
            other_transport_failure = any(not policy.automatically_closed(item, state['desktop'], proof['processes'], module._recorded_tree_absent) for item in transport_failures)
            if not allowed or other_transport_failure:
                print(json.dumps(result))
                raise SystemExit(1)
            closed_proof = close_after_absence(connect(state['endpoint'], 20), state, proof['processes'])
            state['cleaned'] = True
            module._atomic_write_json(state_path, state)
            result = {'ok': True, 'client_ok': True, 'recordedProcessesAbsent': True, 'desktopClosed': True, **closed_proof}
        print(json.dumps(result))
        raise SystemExit(0 if result.get('client_ok') else 1)
    raise SystemExit(module.main())


REASONS = {'ROOT_IDENTITY_CHANGED', 'DUPLICATE_PID', 'INVALID_NODE_IDENTITY', 'ROOT_CYCLE', 'CYCLE_OR_MISSING_PARENT', 'MISSING_PARENT', 'CHILD_PREDATES_PARENT', 'LIVE_IDENTITY_UNAVAILABLE', 'LIVE_IDENTITY_CHANGED', 'UNSPECIFIED_ANCESTRY_FAILURE'}
STAGES = {'process-snapshot', 'ancestry', 'listener-query', 'owner-revalidation', 'native-observation'}

def sanitized_failure(code, details=None):
    if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code):
        code = 'ADAPTER_FAILED'
    result = {'ok': False, 'client_ok': False, 'code': code, 'error': 'Owned lifecycle verification failed; processes and evidence are retained.'}
    details = dict(details or {})
    if 'reasonCode' not in details and 'reason_code' in details:
        details['reasonCode'] = details['reason_code']
    for key, allowed in [('reasonCode', REASONS), ('stage', STAGES)]:
        if details.get(key) in allowed:
            result[key] = details[key]
    counts = globals().get('private_evidence_counts', {})
    if counts.get('saved', 0) or counts.get('unavailable', 0):
        result['privateEvidenceCount'] = counts.get('saved', 0)
        result['privateEvidenceUnavailableCount'] = counts.get('unavailable', 0)
    return result


def run():
    output = io.StringIO()
    exit_code = 0
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
            main()
    except SystemExit as error:
        exit_code = error.code if type(error.code) is int else 1
        if exit_code != 0 and not output.getvalue().strip():
            print(json.dumps(sanitized_failure('ADAPTER_FAILED')))
            return exit_code
    except Exception as error:
        lifecycle = globals().get('module')
        code = error.code if lifecycle and isinstance(error, lifecycle.ClientFailure) else 'ADAPTER_FAILED'
        print(json.dumps(sanitized_failure(code, vars(error))))
        return 1
    try:
        result = json.loads(output.getvalue())
        if not isinstance(result, dict):
            raise ValueError('Expected an object.')
    except (ValueError, TypeError):
        print(json.dumps(sanitized_failure('ADAPTER_INVALID_RESULT')))
        return 1
    if result.get('client_ok') is False or result.get('ok') is False:
        result = sanitized_failure(result.get('code', 'ADAPTER_FAILED'), result)
        exit_code = exit_code or 1
    print(json.dumps(result))
    return exit_code


if __name__ == '__main__':
    raise SystemExit(run())
