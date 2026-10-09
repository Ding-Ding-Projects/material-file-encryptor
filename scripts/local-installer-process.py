"""Run reviewed Squirrel operations on a cheap hidden desktop without killing installers."""
import ctypes
from ctypes import wintypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid


def write_json(path, value):
    temporary = path.with_suffix('.partial')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(path)


def process_times(handle):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    values = [wintypes.FILETIME() for _ in range(4)]
    if not kernel.GetProcessTimes(wintypes.HANDLE(handle), *(ctypes.byref(v) for v in values)):
        raise OSError(ctypes.get_last_error(), 'Process creation proof unavailable.')
    return (values[0].dwHighDateTime << 32) | values[0].dwLowDateTime


def worker(request_path):
    request = json.loads(request_path.read_text(encoding='utf-8'))
    result_path = Path(request['workerResult'])
    # Inherit the desktop selected by Lowlevel; retain Popen's process handle until exit.
    process = subprocess.Popen([request['executable'], *request['arguments']], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    identity = {'pid': process.pid, 'creationFileTime': process_times(int(process._handle)), 'executablePath': request['executable']}
    write_json(result_path, {'started': True, 'workerPid': os.getpid(), 'process': identity})
    code = process.wait(timeout=request['seconds'])
    write_json(result_path, {'started': True, 'finished': True, 'workerPid': os.getpid(), 'process': identity, 'exitCode': code})
    # Keep the known worker alive until its parent has recorded the operation result.
    deadline = time.monotonic() + 30
    while not Path(request['ack']).exists() and time.monotonic() < deadline:
        time.sleep(0.1)


def run(request):
    if os.name != 'nt':
        raise RuntimeError('Windows is required.')
    executable = Path(request['executable'])
    arguments = request['arguments']
    seconds = request['seconds']
    receipt_path = Path(request['receipt'])
    if not executable.is_absolute() or not executable.is_file() or not receipt_path.is_absolute():
        raise ValueError('Absolute executable and receipt paths are required.')
    if not isinstance(arguments, list) or arguments not in [['--silent'], ['--uninstall', '--silent']]:
        raise ValueError('Only reviewed Squirrel install and uninstall operations are allowed.')
    if executable.name.lower() not in ['materialfileencryptor-setup.exe', 'update.exe'] or not isinstance(seconds, int) or not 1 <= seconds <= 300:
        raise ValueError('Reviewed Squirrel executable and bounded timeout required.')
    cli = Path(os.environ['MFE_LOWLEVEL_CLI'])
    helper = Path(os.environ.get('MFE_LOWLEVEL_CLIENT', str(Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')))
    if not cli.is_file() or not helper.is_file():
        raise RuntimeError('Installed cheap Lowlevel CLI and lifecycle helper required.')
    spec = importlib.util.spec_from_file_location('installed_lifecycle', helper)
    lifecycle = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = lifecycle
    spec.loader.exec_module(lifecycle)
    policy_spec = importlib.util.spec_from_file_location('desktop_policy', Path(__file__).with_name('local-headless-desktop-check-policy.py'))
    policy = importlib.util.module_from_spec(policy_spec)
    policy_spec.loader.exec_module(policy)

    def call(name, params):
        result = subprocess.run([str(cli), name, '--json', json.dumps(params)], capture_output=True, text=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
        payload = json.loads(result.stdout)
        payload['client_ok'] = result.returncode == 0 and payload.get('ok') is True and payload.get('timed_out') is not True
        return payload

    run_root = receipt_path.parent / ('installer-run-' + uuid.uuid4().hex)
    run_root.mkdir(parents=True)
    request = {**request, 'workerResult': str(run_root / 'operation.json'), 'ack': str(run_root / 'ack')}
    request_path = run_root / 'request.json'
    write_json(request_path, request)
    desktop = 'mfe-installer-' + uuid.uuid4().hex
    receipt = {'schemaVersion': 1, 'route': 'cheap-lowlevel-headless', 'desktop': desktop, 'passed': False, 'desktopClosed': False, 'recordedProcessesAbsent': False}
    recorded = []
    try:
        launch = call('launch_on_headless_desktop', {'name': desktop, 'command': subprocess.list2cmdline([sys.executable, str(Path(__file__).resolve()), '--worker', str(request_path)])})
        if not launch.get('client_ok') or not isinstance(launch.get('pid'), int):
            raise RuntimeError('Headless launch failed.')
        identity = lifecycle._process_identity(launch['pid'])
        receipt['worker'] = identity
        deadline = time.monotonic() + seconds + 20
        operation_path = Path(request['workerResult'])
        while True:
            for row in lifecycle._process_tree(identity):
                if not any(lifecycle._same_process(row, existing) for existing in recorded):
                    recorded.append(row)
            if operation_path.exists():
                operation = json.loads(operation_path.read_text(encoding='utf-8'))
                if operation.get('workerPid') != launch['pid']:
                    raise RuntimeError('Operation belongs to another worker.')
                if operation.get('finished'):
                    receipt.update({'operation': operation, 'exitCode': operation['exitCode']})
                    Path(request['ack']).touch()
                    break
            if time.monotonic() >= deadline:
                raise TimeoutError('Installer timeout; processes and evidence retained without termination.')
            time.sleep(0.5)
        deadline = time.monotonic() + 30
        while not lifecycle._recorded_tree_absent(recorded):
            if time.monotonic() >= deadline:
                raise RuntimeError('Recorded installer processes remain; desktop retained.')
            time.sleep(0.25)
        receipt['recordedProcessesAbsent'] = True
        windows = call('list_headless_windows', {'name': desktop})
        if policy.automatically_closed(windows, desktop, recorded, lifecycle._recorded_tree_absent):
            receipt['desktopClosed'] = True
        elif windows.get('client_ok') and not windows.get('windows'):
            closed = call('close_headless_desktop', {'name': desktop})
            receipt['desktopClosed'] = lifecycle._desktop_close_confirmed(closed) or policy.automatically_closed(closed, desktop, recorded, lifecycle._recorded_tree_absent)
        if not receipt['desktopClosed']:
            raise RuntimeError('Empty owned desktop close unverified.')
        receipt['passed'] = True
    except Exception as error:
        receipt['failure'] = str(error)
        raise
    finally:
        receipt['recordedProcesses'] = recorded
        write_json(receipt_path, receipt)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        worker(Path(sys.argv[2]))
    else:
        run(json.load(sys.stdin))
