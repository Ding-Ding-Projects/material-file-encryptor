"""Read-only admission for a retained partial launch, never a launch receipt."""
import ctypes
from ctypes import wintypes as W
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from contextlib import ExitStack, contextmanager


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


snapshot = load('supplemental_snapshot', Path(__file__).with_name('renderer-process-snapshot.py'))
Error = snapshot.SnapshotError


def digest(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path or not path.is_file():
        raise Error('Evidence paths must be canonical absolute regular files.')
    for part in [path, *path.parents]:
        if part.is_symlink() or part.is_junction():
            raise Error('Redirected recovery evidence is unsupported.')
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            result.update(chunk)
    return result.hexdigest()


class NativeBinding:
    """Query only the held root command and the specified desktop HWND."""
    def command(self, handle):
        class STRING(ctypes.Structure):
            _fields_ = [('Length', W.USHORT), ('MaximumLength', W.USHORT), ('Buffer', ctypes.c_void_p)]
        query = ctypes.WinDLL('ntdll').NtQueryInformationProcess
        query.argtypes = [W.HANDLE, W.ULONG, ctypes.c_void_p, W.ULONG, ctypes.POINTER(W.ULONG)]
        query.restype = ctypes.c_long
        length = W.ULONG()
        query(handle, 60, None, 0, ctypes.byref(length))
        if not ctypes.sizeof(STRING) <= length.value <= 131072:
            raise Error('Held process command size is unavailable.')
        buffer = ctypes.create_string_buffer(length.value)
        if query(handle, 60, buffer, length, ctypes.byref(length)) != 0:
            raise Error('Held process command is unavailable.')
        value = ctypes.cast(buffer, ctypes.POINTER(STRING)).contents
        start, end = ctypes.addressof(buffer), ctypes.addressof(buffer) + len(buffer)
        if value.Length % 2 or not start <= (value.Buffer or 0) <= end - value.Length:
            raise Error('Held process command buffer is invalid.')
        return ctypes.wstring_at(value.Buffer, value.Length // 2)

    def window(self, desktop, hwnd):
        user = ctypes.WinDLL('user32', use_last_error=True)
        callback_type = ctypes.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
        user.OpenDesktopW.argtypes, user.OpenDesktopW.restype = [W.LPCWSTR, W.DWORD, W.BOOL, W.DWORD], W.HANDLE
        user.EnumDesktopWindows.argtypes = [W.HANDLE, callback_type, W.LPARAM]
        user.GetWindowThreadProcessId.argtypes = [W.HWND, ctypes.POINTER(W.DWORD)]
        user.CloseDesktop.argtypes = [W.HANDLE]
        handle = user.OpenDesktopW(desktop, 0, False, 0x41)
        if not handle:
            raise Error('Exact recovery desktop is unavailable.')
        found = []
        def visit(window, _):
            if int(window) == hwnd:
                pid = W.DWORD()
                thread = user.GetWindowThreadProcessId(window, ctypes.byref(pid))
                found.append({'hwnd': hwnd, 'pid': pid.value, 'threadId': thread})
            return True
        try:
            callback = callback_type(visit)
            if not user.EnumDesktopWindows(handle, callback, 0) or len(found) != 1 or not found[0]['threadId']:
                raise Error('Exact HWND is not uniquely observed on the recorded desktop.')
            return found[0]
        finally:
            if not user.CloseDesktop(handle):
                raise Error('Recovery desktop observation handle closure failed.')


class Recovery:
    """Separate supplemental backend, with no fresh-launch marker or state writes."""
    def __init__(self, lifecycle, request, receipt_path, proof=None, binding=None, source=None):
        self.lifecycle, self.request, self.path = lifecycle, request, Path(receipt_path)
        self.proof, self.binding = proof or snapshot.Proof(lifecycle), binding or NativeBinding()
        keys = {'version', 'kind', 'verifierSourceCommit', 'root', 'desktop', 'hwnd', 'profile', 'port', 'target', 'originals'}
        if not isinstance(request, dict) or set(request) != keys or request['version'] != 1 or request['kind'] != 'supplemental-partial-launch-recovery':
            raise Error('Explicit supplemental recovery request schema is required.')
        if not re.fullmatch('[a-f0-9]{40}', request['verifierSourceCommit']):
            raise Error('Exact recovery verifier source is required.')
        actual_source = source if source is not None else subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True, timeout=5, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.strip()
        if request['verifierSourceCommit'] != actual_source:
            raise Error('Recovery verifier source differs from the actual checkout.')
        lifecycle._validate_process_identity(request['root'])
        if not re.fullmatch('[A-Za-z0-9._-]{1,64}', request['desktop']) or type(request['hwnd']) is not int or request['hwnd'] <= 0:
            raise Error('Exact desktop and HWND binding is required.')
        if type(request['port']) is not int or not 1 <= request['port'] <= 65535 or not Path(request['profile']).is_absolute():
            raise Error('Exact profile and loopback port are required.')
        if Path(request['profile']).resolve() != Path(request['profile']):
            raise Error('Recovery profile must be canonical.')
        target = request['target']
        if not isinstance(target, dict) or set(target) != {'sourceCommit', 'version', 'files', 'hashes', 'expectedUrl'} or not re.fullmatch('[a-f0-9]{40}', target['sourceCommit']) or not re.fullmatch(r'\d+\.\d+\.\d+', target['version']):
            raise Error('Exact product source and version binding is required.')
        if set(target['files']) != {'executable', 'asar', 'nativeHost'} or set(target['hashes']) != set(target['files']):
            raise Error('All packaged byte identities are required.')
        exe = Path(target['files']['executable'])
        if request['root']['executablePath'] != str(exe) or Path(target['files']['asar']) != exe.parent / 'resources/app.asar' or Path(target['files']['nativeHost']) != exe.parent / 'resources/native/MaterialFileEncryptor.Host.exe':
            raise Error('Recovery root or packaged resource paths differ.')
        if target['expectedUrl'] != (Path(target['files']['asar']) / 'src/renderer/index.html').as_uri():
            raise Error('Recovery expected URL differs from the packaged entry.')
        originals = request['originals']
        if not isinstance(originals, dict) or set(originals) != {'prepared', 'outcome', 'failure'}:
            raise Error('All original failed attempt hashes are required.')
        for item in [*originals.values(), *({'path': target['files'][k], 'sha256': v} for k, v in target['hashes'].items())]:
            if not isinstance(item, dict) or set(item) != {'path', 'sha256'} or not re.fullmatch('[a-f0-9]{64}', item['sha256']):
                raise Error('Exact original and target SHA-256 bindings are required.')
        self.state = {'process': request['root'], 'desktop': request['desktop'], 'hwnd': request['hwnd'], 'cdp': {'port': request['port'], 'expectedUrl': target['expectedUrl']}}
        self.source_files = [Path(__file__), Path(snapshot.__file__), Path(lifecycle.__file__)]
        self.source_hashes = {p.name: digest(p) for p in self.source_files}

    def files(self):
        request = self.request
        for item in request['originals'].values():
            if digest(item['path']) != item['sha256']:
                raise Error('Original failed receipt bytes changed.')
        prepared, outcome, failure = [json.loads(Path(request['originals'][key]['path']).read_bytes()) for key in ['prepared', 'outcome', 'failure']]
        target = request['target']
        for original in [prepared, failure]:
            old = original.get('target', {})
            if original.get('verifierSourceCommit') != '42ac12712b3aa8fd49765adcf14399c0cbee1e63' or any(old.get(key) != value for key, value in target.items()):
                raise Error('Original attempt product binding differs.')
        if outcome.get('launchAttempted') is not True or outcome.get('stateAvailable') is not False or outcome.get('closure', {}).get('resourcesAbsent') is not False:
            raise Error('Original partial-launch unknown state differs.')
        if Path(request['profile']) != Path(outcome.get('runRoot', '')) / 'profile':
            raise Error('Recovery profile differs from the original attempt.')
        if failure.get('runnerAttempted') is not True or failure.get('connectionOwned') is not False:
            raise Error('Original failed connection state differs.')
        for key, file in target['files'].items():
            if digest(file) != target['hashes'][key]:
                raise Error('Packaged bytes changed during recovery.')
        if self.source_hashes != {p.name: digest(p) for p in self.source_files}:
            raise Error('Recovery verifier bytes changed.')

    def observe(self):
        self.files()
        root = self.request['root']
        with self.proof.api.handle(root['pid']) as handle:
            before = self.proof.api.observe(handle, root['pid'], root['parentPid'])
            if before != root:
                raise Error('Recovery root identity differs.')
            command = self.binding.command(handle)
            expected = subprocess.list2cmdline([root['executablePath'], '--desktop-check', '--verification-profile=' + self.request['profile'], '--remote-debugging-port=' + str(self.request['port']), '--remote-debugging-address=127.0.0.1'])
            if command != expected:
                raise Error('Recovery command, profile or port differs.')
            tree = self.proof.tree(root)
            window = self.binding.window(self.request['desktop'], self.request['hwnd'])
            if window['pid'] not in {p['pid'] for p in tree}:
                raise Error('Recovery HWND lacks exact native ancestry.')
            self.files()
            if self.binding.command(handle) != command or self.binding.window(self.request['desktop'], self.request['hwnd']) != window or self.proof.api.observe(handle, root['pid'], root['parentPid']) != before:
                raise Error('Recovery command, desktop or root changed around observation.')
        return {'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), 'root': root, 'command': command, 'window': window, 'nativeProcesses': tree}

    def read(self, path):
        if Path(path) != self.path:
            raise Error('Recovery cannot read another receipt.')
        self.observe()
        return self.path, self.state

    def tree(self, root):
        if root != self.request['root']:
            raise Error('Recovery tree root differs.')
        self.files()
        return self.proof.tree(root)

    def prepare(self, run=None, fetch=None):
        before = self.observe()
        target = snapshot.prove_renderer_target(self, run=run, fetch=fetch)
        after = self.observe()
        if before['root'] != after['root'] or before['window'] != after['window'] or before['command'] != after['command'] or sorted(before['nativeProcesses'], key=lambda p: p['pid']) != sorted(after['nativeProcesses'], key=lambda p: p['pid']):
            raise Error('Recovery ancestry changed around target admission.')
        receipt = {'version': 1, 'kind': self.request['kind'], 'request': self.request, 'sourceHashes': self.source_hashes, 'before': before, 'after': after, 'targetProof': target, 'originalResourcesAbsent': False, 'connectionOwned': False, 'pageActionsAllowed': False}
        self.lifecycle._reject_link_components(self.path)
        with self.path.open('x', encoding='utf-8') as stream:
            json.dump(receipt, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        return receipt

    @classmethod
    def from_receipt(cls, lifecycle, receipt_path, observe=True, **kwargs):
        data = Path(receipt_path).read_bytes()
        if len(data) > 262144:
            raise Error('Supplemental recovery receipt exceeds bound.')
        receipt = json.loads(data)
        if set(receipt) != {'version', 'kind', 'request', 'sourceHashes', 'before', 'after', 'targetProof', 'originalResourcesAbsent', 'connectionOwned', 'pageActionsAllowed'} or receipt['originalResourcesAbsent'] is not False or receipt['connectionOwned'] is not False or receipt['pageActionsAllowed'] is not False:
            raise Error('Supplemental recovery receipt schema differs.')
        backend = cls(lifecycle, receipt['request'], receipt_path, **kwargs)
        if receipt['sourceHashes'] != backend.source_hashes or receipt['kind'] != backend.request['kind'] or receipt['version'] != 1:
            raise Error('Supplemental recovery source binding differs.')
        if observe:
            backend.observe()
        else:
            backend.files()
        return backend

    def confirm_exit(self, tree, timeout=15, run=None, desktop_observer=None):
        """Observe only; never terminate a process or close a desktop."""
        self.lifecycle._validate_process_tree(self.request['root'], tree)
        original = json.loads(self.path.read_bytes())['after']['nativeProcesses']
        if sorted(tree, key=lambda p: p['pid']) != sorted(original, key=lambda p: p['pid']):
            raise Error('Closure snapshot differs from the admitted native tree.')
        deadline = time.monotonic() + timeout
        last = {'resourcesAbsent': False}
        def listeners_now():
            result = (run or subprocess.run)(['netstat.exe', '-ano', '-p', 'tcp'], capture_output=True, text=True, check=True, timeout=5, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if len(result.stdout) > 2097152:
                raise Error('Closure listener inventory exceeds bound.')
            rows = [line.split() for line in result.stdout.splitlines()]
            return [row for row in rows if len(row) == 5 and row[0] == 'TCP' and row[3] == 'LISTENING' and row[1].rsplit(':', 1)[-1] == str(self.request['port'])]
        while True:
            self.files()
            exited = self.proof.absent(tree)
            listeners = listeners_now()
            if desktop_observer:
                handle, error = desktop_observer(self.request['desktop'])
            else:
                user = ctypes.WinDLL('user32', use_last_error=True)
                user.OpenDesktopW.argtypes, user.OpenDesktopW.restype = [W.LPCWSTR, W.DWORD, W.BOOL, W.DWORD], W.HANDLE
                user.CloseDesktop.argtypes = [W.HANDLE]
                handle = user.OpenDesktopW(self.request['desktop'], 0, False, 0x41)
                error = ctypes.get_last_error() if not handle else None
                if handle and not user.CloseDesktop(handle):
                    raise Error('Closure desktop observation handle closure failed.')
            after_listeners = listeners_now()
            exited = self.proof.absent(tree) and exited
            self.files()
            last = {'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), 'recordedProcessesExited': exited, 'processVerdicts': self.proof.last_absence, 'selectedPortAbsent': not listeners and not after_listeners, 'selectedPortListenerCount': max(len(listeners), len(after_listeners)), 'desktopAbsent': not handle and error == 2, 'desktopOpenError': error, 'originalResourcesAbsent': False}
            last['resourcesAbsent'] = exited and last['selectedPortAbsent'] and last['desktopAbsent']
            if last['resourcesAbsent'] or time.monotonic() >= deadline:
                return last
            time.sleep(0.2)


def configured_base_interpreter(values, launcher, actual_base):
    """Resolve stdlib or uv venv metadata against this executing interpreter."""
    home = Path(values.get('home', ''))
    if not home.is_absolute() or launcher.parent.name.lower() != 'scripts' or values.get('include-system-site-packages') != 'false':
        raise Error('Supported isolated Python launcher configuration is required.')
    executable = values.get('executable')
    if executable:
        base = Path(executable)
    elif values.get('implementation') == 'CPython' and values.get('uv'):
        base = home / 'python.exe'
    else:
        raise Error('Base interpreter metadata is unavailable.')
    if launcher.name.lower() == 'pythonw.exe':
        base = base.with_name('pythonw.exe')
    elif launcher.name.lower() != 'python.exe':
        raise Error('Unsupported interpreter launcher name.')
    if not base.is_absolute() or base.parent != home or base != Path(actual_base):
        raise Error('Configured base interpreter differs from the executing interpreter.')
    return base


@contextmanager
def owning_client(client_pid, expected=None, api=None, binding=None, configuration=None):
    """Hold exact self/optional venv launcher/Node identities across proof."""
    api, binding = api or snapshot.Native(), binding or NativeBinding()
    if type(client_pid) is not int or client_pid <= 0:
        raise Error('Actual client identity is required.')
    if configuration is None:
        launcher = Path(os.environ['MFE_LOWLEVEL_PYTHON'])
        node = Path(os.environ['MFE_RENDERER_NODE_EXECUTABLE'])
        cfg = launcher.parent.parent / 'pyvenv.cfg'
        values = dict(line.split(' = ', 1) for line in cfg.read_text().splitlines() if ' = ' in line)
        base = configured_base_interpreter(values, launcher, sys._base_executable)
        # CPython's Windows venv redirector replaces argv[0] with a quoted
        # base executable. The intermediate launcher retains the original.
        configuration = {'launcher': str(launcher), 'base': str(base), 'node': str(node), 'files': {str(p): digest(p) for p in [launcher, base, cfg, node]}, 'command': subprocess.list2cmdline([os.environ['MFE_LOWLEVEL_PYTHON'], *sys.argv]), 'baseCommand': '"' + str(base) + '" ' + subprocess.list2cmdline(sys.argv), 'selfPid': os.getpid()}
    rows, chain = api.inventory(), []
    current = configuration['selfPid']
    with ExitStack() as stack:
        for _ in range(3):
            if current not in rows:
                raise Error('Client launcher ancestry is unavailable.')
            handle = stack.enter_context(api.handle(current))
            identity = api.observe(handle, current, rows[current])
            command = binding.command(handle)
            chain.append((identity, command, handle))
            if current == client_pid:
                break
            current = rows[current]
        else:
            raise Error('Client is not a direct parent or one supported launcher ancestor.')
        if len(chain) not in (2, 3) or chain[-1][0]['pid'] != client_pid or chain[-1][0]['executablePath'] != configuration['node']:
            raise Error('Actual Node client ancestry differs.')
        if chain[0][0]['executablePath'] != configuration['base'] or chain[0][1] != configuration.get('baseCommand', configuration['command']):
            raise Error('Actual Python execution image or command differs.')
        if len(chain) == 3 and (chain[1][0]['executablePath'] != configuration['launcher'] or chain[1][1] != configuration['command']):
            raise Error('Intermediate Python launcher image or command differs.')
        if any(chain[i][0]['creationDate'] < chain[i+1][0]['creationDate'] for i in range(len(chain)-1)):
            raise Error('Client launcher creation ancestry differs.')
        observed = {'clientIdentity': chain[-1][0], 'clientCommand': chain[-1][1], 'routeFiles': configuration['files']}
        if expected is not None and observed != expected:
            raise Error('Pinned client or Python route identity changed.')
        yield observed, [{'identity': identity, 'command': command} for identity, command, _ in chain]
        for identity, command, handle in chain:
            if api.observe(handle, identity['pid'], api.inventory().get(identity['pid'])) != identity or binding.command(handle) != command:
                raise Error('Client launcher identity changed around proof.')
        if configuration.get('selfPid') == os.getpid() and any(digest(file) != value for file, value in configuration['files'].items()):
            raise Error('Client launcher bytes changed around proof.')


def main():
    lifecycle = load('recovery_lifecycle', os.environ['MFE_LOWLEVEL_CLIENT'])
    operation, receipt = sys.argv[1:3]
    if operation == 'prepare':
        request = json.load(sys.stdin)
        result = Recovery(lifecycle, request, receipt).prepare()
    elif operation == 'bind-client':
        request = json.load(sys.stdin)
        if set(request) != {'clientPid'}:
            raise Error('Actual client PID is required.')
        with owning_client(request['clientPid']) as (client, chain):
            result = {'clientBinding': client, 'clientLaunchChain': chain}
    elif operation in ('prove-connected', 'prepare-close'):
        request = json.load(sys.stdin)
        if set(request) != {'clientPid', 'targetId', 'clientBinding'}:
            raise Error('Recovery requires pinned actual owning client identity.')
        backend = Recovery.from_receipt(lifecycle, receipt)
        with owning_client(request['clientPid'], request['clientBinding']) as (client, chain):
            result = snapshot.prove_renderer_target(backend, client_pid=request['clientPid'], target_id=request['targetId'])
            if result['clientIdentity'] != client['clientIdentity']:
                raise Error('Socket client differs from the held launcher ancestor.')
            observation = backend.observe()
            result['clientLaunchChain'] = chain
        if operation == 'prepare-close':
            admitted = json.loads(Path(receipt).read_bytes())['after']['nativeProcesses']
            if sorted(admitted, key=lambda p: p['pid']) != sorted(observation['nativeProcesses'], key=lambda p: p['pid']):
                raise Error('Native tree changed since supplemental admission.')
            result['exitProcesses'] = observation['nativeProcesses']
            result['exitObservedAt'] = observation['observedAt']
    elif operation == 'confirm-exit':
        request = json.load(sys.stdin)
        if set(request) != {'exitProcesses'}:
            raise Error('Exact recorded closure snapshot is required.')
        result = Recovery.from_receipt(lifecycle, receipt, observe=False).confirm_exit(request['exitProcesses'])
    else:
        raise Error('Unsupported supplemental recovery operation.')
    print(json.dumps({'ok': True, 'client_ok': True, **({'recovery': result} if operation == 'prepare' else result)}))


if __name__ == '__main__':
    main()
