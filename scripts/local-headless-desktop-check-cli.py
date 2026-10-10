"""Use the installed lifecycle safety checks with the documented direct tool CLI."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import contextlib
import io


def main():
    global module, policy, transport_failures
    helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
    cli = Path(os.environ['MFE_LOWLEVEL_CLI'])
    if not helper.is_file() or not cli.is_file():
        raise SystemExit('Installed lifecycle helper and direct CLI are required.')
    spec = importlib.util.spec_from_file_location('installed_lifecycle', helper)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    transport_failures = []

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
            policy.validate_exit_proof(module, state, proof)
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
            closed_proof = close_after_absence(DirectClient(20), state, proof['processes'])
            state['cleaned'] = True
            state_path.write_text(json.dumps(state), encoding='utf-8')
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
    details = details or {}
    for key, allowed in [('reasonCode', REASONS), ('stage', STAGES)]:
        if details.get(key) in allowed:
            result[key] = details[key]
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
