"""Read-only Windows process proof for renderer fixture lifecycle verification."""
import ctypes
from ctypes import wintypes as W
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
import os
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.request import urlopen
from urllib.parse import urlparse


class SnapshotError(RuntimeError):
    pass


class DescendantMembershipChanged(SnapshotError):
    code = 'NATIVE_DESCENDANT_MEMBERSHIP_CHANGED'
    def __init__(self, evidence):
        super().__init__('Native descendant membership changed around renderer target proof.')
        self.evidence = evidence


class ProcessAbsent(SnapshotError):
    pass


def creation_date(ticks):
    seconds, fraction = divmod(ticks, 10_000_000)
    value = datetime(1601, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=seconds)
    return value.strftime('%Y-%m-%dT%H:%M:%S') + f'.{fraction:07d}Z'


class ENTRY(ctypes.Structure):
    _fields_ = [('dwSize', W.DWORD), ('cntUsage', W.DWORD), ('th32ProcessID', W.DWORD),
                ('th32DefaultHeapID', ctypes.c_size_t), ('th32ModuleID', W.DWORD),
                ('cntThreads', W.DWORD), ('th32ParentProcessID', W.DWORD),
                ('pcPriClassBase', W.LONG), ('dwFlags', W.DWORD), ('szExeFile', W.WCHAR * 260)]


class ProcessImageIdentityUnavailable(SnapshotError):
    code = 'NATIVE_PROCESS_IMAGE_UNAVAILABLE'
    def __init__(self, evidence):
        super().__init__('Process executable identity is unavailable.')
        self.evidence = evidence


class Native:
    def __init__(self):
        if os.name != 'nt':
            raise SnapshotError('Native process proof requires Windows.')
        self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        signatures = {
            'CreateToolhelp32Snapshot': ([W.DWORD, W.DWORD], W.HANDLE),
            'Process32FirstW': ([W.HANDLE, ctypes.POINTER(ENTRY)], W.BOOL),
            'Process32NextW': ([W.HANDLE, ctypes.POINTER(ENTRY)], W.BOOL),
            'OpenProcess': ([W.DWORD, W.BOOL, W.DWORD], W.HANDLE),
            'GetProcessId': ([W.HANDLE], W.DWORD),
            'GetExitCodeProcess': ([W.HANDLE, ctypes.POINTER(W.DWORD)], W.BOOL),
            'GetProcessTimes': ([W.HANDLE] + [ctypes.POINTER(W.FILETIME)] * 4, W.BOOL),
            'QueryFullProcessImageNameW': ([W.HANDLE, W.DWORD, W.LPWSTR, ctypes.POINTER(W.DWORD)], W.BOOL),
            'WaitForSingleObject': ([W.HANDLE, W.DWORD], W.DWORD),
            'CloseHandle': ([W.HANDLE], W.BOOL),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.k, name)
            function.argtypes, function.restype = args, result

    @contextmanager
    def handle(self, pid):
        handle = self.k.OpenProcess(0x00101000, False, pid)
        if not handle:
            # ERROR_INVALID_PARAMETER is the documented nonexistent PID result.
            # Access denial and every other status remain unknown.
            if ctypes.get_last_error() == 87:
                yield None
                return
            raise SnapshotError('Process handle identity is unavailable.')
        try:
            yield handle
        finally:
            if not self.k.CloseHandle(handle):
                raise SnapshotError('Process proof handle closure failed.')

    def inventory(self):
        handle = self.k.CreateToolhelp32Snapshot(2, 0)
        if handle == ctypes.c_void_p(-1).value:
            raise SnapshotError('Process inventory is unavailable.')
        try:
            entry = ENTRY()
            entry.dwSize = ctypes.sizeof(entry)
            rows = {}
            success = self.k.Process32FirstW(handle, ctypes.byref(entry))
            while success:
                pid, parent = int(entry.th32ProcessID), int(entry.th32ParentProcessID)
                if pid in rows:
                    raise SnapshotError('Duplicate process inventory identity.')
                rows[pid] = parent
                if len(rows) > 32768:
                    raise SnapshotError('Process inventory exceeds bound.')
                success = self.k.Process32NextW(handle, ctypes.byref(entry))
            if ctypes.get_last_error() != 18 or not rows:
                raise SnapshotError('Process inventory is incomplete.')
            return rows
        finally:
            if not self.k.CloseHandle(handle):
                raise SnapshotError('Inventory handle closure failed.')

    def exited(self, handle):
        result = self.k.WaitForSingleObject(handle, 0)
        if result not in (0, 258):
            raise SnapshotError('Process liveness is unavailable.')
        return result == 0

    def exit_record(self, handle):
        if handle is None or not self.exited(handle):
            raise SnapshotError('Held process has not signaled exit.')
        pid = self.k.GetProcessId(handle)
        if not pid:
            raise SnapshotError('Held process ID is unavailable.')
        created, ended, kernel, user = (W.FILETIME() for _ in range(4))
        if not self.k.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(ended), ctypes.byref(kernel), ctypes.byref(user)):
            raise SnapshotError('Held process creation time is unavailable.')
        code = W.DWORD()
        if not self.k.GetExitCodeProcess(handle, ctypes.byref(code)) or not self.exited(handle):
            raise SnapshotError('Held process exit result is unavailable.')
        return {'pid': int(pid), 'creationDate': creation_date((created.dwHighDateTime << 32) | created.dwLowDateTime), 'exitCode': int(code.value)}

    def observe(self, handle, pid, parent, allow_exited=False):
        if handle is None:
            raise SnapshotError('Selected process disappeared during proof.')
        if self.exited(handle) and not allow_exited:
            raise SnapshotError('Selected process is not proven running.')
        created, exited, kernel, user = (W.FILETIME() for _ in range(4))
        if not self.k.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(kernel), ctypes.byref(user)):
            raise SnapshotError('Process creation time is unavailable.')
        path, length = ctypes.create_unicode_buffer(32768), W.DWORD(32768)
        ctypes.set_last_error(0)
        image_available = self.k.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(length))
        image_error = ctypes.get_last_error()  # Retain before any other native call.
        if not image_available or not path.value:
            before_creation = creation_date((created.dwHighDateTime << 32) | created.dwLowDateTime)
            diagnostic = {'version': 1, 'stage': 'QueryFullProcessImageNameW', 'selectedPid': int(pid),
                'claimedParentPid': int(parent), 'querySucceeded': bool(image_available),
                'win32Error': int(image_error), 'creationDateBefore': before_creation,
                'creationDateAfter': None, 'creationIdentityStable': None,
                'heldPid': None, 'heldState': 'unknown', 'waitResult': None,
                'livenessWin32Error': None, 'exitCode': None}
            # These are observations on the still-held handle, never permission
            # to accept the missing image or omit this selected process.
            try:
                held_pid = self.k.GetProcessId(handle)
                if held_pid: diagnostic['heldPid'] = int(held_pid)
                ctypes.set_last_error(0)
                wait = self.k.WaitForSingleObject(handle, 0)
                wait_error = ctypes.get_last_error()
                diagnostic['waitResult'] = int(wait)
                diagnostic['heldState'] = 'exited' if wait == 0 else 'running' if wait == 258 else 'unknown'
                if wait not in (0, 258): diagnostic['livenessWin32Error'] = int(wait_error)
                code = W.DWORD()
                if self.k.GetExitCodeProcess(handle, ctypes.byref(code)): diagnostic['exitCode'] = int(code.value)
                later, ended, later_kernel, later_user = (W.FILETIME() for _ in range(4))
                if self.k.GetProcessTimes(handle, ctypes.byref(later), ctypes.byref(ended), ctypes.byref(later_kernel), ctypes.byref(later_user)):
                    later_creation = creation_date((later.dwHighDateTime << 32) | later.dwLowDateTime)
                    diagnostic['creationDateAfter'] = later_creation
                    diagnostic['creationIdentityStable'] = later_creation == before_creation
            except (OSError, ValueError, AttributeError):
                # Keep the original image failure even when diagnostics are partial.
                pass
            raise ProcessImageIdentityUnavailable(diagnostic)
        if self.exited(handle) and not allow_exited:
            raise SnapshotError('Process exited during identity observation.')
        return {'pid': pid, 'parentPid': parent, 'creationDate': creation_date((created.dwHighDateTime << 32) | created.dwLowDateTime), 'executablePath': path.value}


def validate_exit_record(expected, record):
    if not isinstance(record, dict) or set(record) != {'pid', 'creationDate', 'exitCode'}:
        raise SnapshotError('Held exit record is incomplete.')
    if record['pid'] != expected['pid'] or record['creationDate'] != expected['creationDate']:
        raise SnapshotError('Held process execution identity changed.')
    if type(record['exitCode']) is not int or not 0 <= record['exitCode'] <= 0xFFFFFFFF:
        raise SnapshotError('Held process exit status is invalid.')
    return record


def descendants(rows, root):
    if root not in rows:
        raise SnapshotError('Root is absent from process inventory.')
    selected = {root}
    while True:
        expanded = selected | {pid for pid, parent in rows.items() if parent in selected and pid != parent}
        if expanded == selected:
            return {pid: rows[pid] for pid in selected}
        if len(expanded) > 512:
            raise SnapshotError('Owned process tree exceeds bound.')
        selected = expanded


class Proof:
    def __init__(self, lifecycle, api=None):
        self.lifecycle, self.api = lifecycle, api or Native()

    def identity(self, pid):
        with self.api.handle(pid) as handle:
            rows = self.api.inventory()
            if handle is None:
                if pid not in rows:
                    raise ProcessAbsent('Exact process PID is absent.')
                raise SnapshotError('Process changed during identity inventory.')
            if pid not in rows:
                raise SnapshotError('Running process missing from identity inventory.')
            before = self.api.observe(handle, pid, rows[pid])
            after_rows = self.api.inventory()
            if after_rows.get(pid) != rows[pid]:
                raise SnapshotError('Process parent changed during identity proof.')
            after = self.api.observe(handle, pid, rows[pid])
            self.lifecycle._validate_process_identity(before)
            if not self.lifecycle._same_process(before, after):
                raise SnapshotError('Process identity changed during identity proof.')
            return before

    def tree(self, root):
        self.lifecycle._validate_process_identity(root)
        with ExitStack() as stack:
            root_handle = stack.enter_context(self.api.handle(root['pid']))
            if root_handle is None:
                if root['pid'] not in self.api.inventory():
                    raise ProcessAbsent('Exact root PID is absent.')
                raise SnapshotError('Root changed during process proof.')
            first = self.api.observe(root_handle, root['pid'], root['parentPid'])
            if not self.lifecycle._same_process(root, first):
                raise SnapshotError('Root identity changed before inventory.')
            selected = descendants(self.api.inventory(), root['pid'])
            if selected[root['pid']] != root['parentPid']:
                raise SnapshotError('Root parent differs from recorded identity.')
            handles = {root['pid']: root_handle}
            for pid in selected:
                if pid != root['pid']:
                    handles[pid] = stack.enter_context(self.api.handle(pid))
            observed = [self.api.observe(handles[pid], pid, parent) for pid, parent in selected.items()]
            self.lifecycle._validate_process_tree(root, observed)
            if descendants(self.api.inventory(), root['pid']) != selected:
                raise SnapshotError('Process ancestry changed during inventory.')
            for expected in observed:
                current = self.api.observe(handles[expected['pid']], expected['pid'], expected['parentPid'])
                if not self.lifecycle._same_process(expected, current):
                    raise SnapshotError('Process identity changed during inventory.')
            return observed

    def absent(self, tree):
        self.last_absence = None
        if not isinstance(tree, list) or not tree or len(tree) > 512:
            raise SnapshotError('Recorded process inventory is invalid.')
        ids = set()
        present = False
        verdicts = []
        rows = self.api.inventory()
        for expected in tree:
            self.lifecycle._validate_process_identity(expected)
            pid = expected['pid']
            if pid in ids:
                raise SnapshotError('Duplicate recorded process identity.')
            ids.add(pid)
            with self.api.handle(pid) as handle:
                if handle is None:
                    if pid in rows:
                        raise SnapshotError('Process inventory changed during absence proof.')
                    verdicts.append({'pid': pid, 'verdict': 'pid-absent'})
                    continue
                exited = self.api.exited(handle)
                if pid not in rows and not exited:
                    raise SnapshotError('Running process appeared during absence proof.')
                if exited:
                    record = validate_exit_record(expected, self.api.exit_record(handle))
                    if pid in rows and rows[pid] != expected['parentPid']:
                        raise SnapshotError('Recorded process parent identity changed.')
                    verdicts.append({'pid': pid, 'verdict': 'exited-object-observed', 'exitCode': record['exitCode'], 'identityBasis': 'recorded-image-and-parent-plus-current-kernel-pid-and-creation'})
                else:
                    current = self.api.observe(handle, pid, rows[pid])
                    if not self.lifecycle._same_process(expected, current) or current['parentPid'] != expected['parentPid']:
                        raise SnapshotError('Recorded process identity changed.')
                    present = True
                    verdicts.append({'pid': pid, 'verdict': 'execution-present'})
        self.last_absence = {
            'recordedProcessesExited': not present,
            'recordedExecutionVerdicts': verdicts,
            'exitedObjectCount': sum(item['verdict'] == 'exited-object-observed' for item in verdicts),
            'pidAbsentCount': sum(item['verdict'] == 'pid-absent' for item in verdicts),
            'legacyAbsenceMeaning': 'No recorded execution remains; exited kernel objects may still exist.',
        }
        return not present


def marker_path(state_path):
    state_path = Path(state_path)
    return state_path.with_name(state_path.name + '.native-v1.json')


class RendererNativeBackend:
    """Explicit fresh-launch renderer backend; never reinterprets old receipts."""
    def __init__(self, lifecycle, state_path, source_commit, lifecycle_helper, fresh_launch=False, api=None):
        if not re.fullmatch('[a-f0-9]{40}', source_commit or ''):
            raise SnapshotError('Native renderer source binding is required.')
        self.lifecycle = lifecycle
        self.path = Path(os.path.abspath(state_path))
        self.marker = marker_path(self.path)
        lifecycle._reject_link_components(self.path)
        lifecycle._reject_link_components(self.marker)
        self.binding = {
            'version': 1, 'backend': 'native-v1', 'sourceCommit': source_commit,
            'helperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'lifecycleHelperSha256': hashlib.sha256(Path(lifecycle_helper).read_bytes()).hexdigest(),
        }
        self.proof = Proof(lifecycle, api)
        self.original_read = lifecycle._read_state
        self.original_write = lifecycle._atomic_write_json
        self.fresh_launch = fresh_launch
        self.launch_identity = None
        if fresh_launch and (self.path.exists() or self.marker.exists()):
            raise SnapshotError('Native backend requires a fresh state and sidecar.')

    def verify(self, state):
        self.lifecycle._reject_link_components(self.marker)
        data = self.marker.read_bytes()
        if len(data) > 65536:
            raise SnapshotError('Native provenance exceeds bound.')
        marker = json.loads(data)
        if not isinstance(marker, dict) or set(marker) != set(self.binding) | {'rootIdentity'}:
            raise SnapshotError('Native provenance schema is invalid.')
        if any(marker.get(key) != value for key, value in self.binding.items()):
            raise SnapshotError('Native provenance binding differs.')
        if marker['rootIdentity'] != state['process']:
            raise SnapshotError('Native provenance root differs from lifecycle.')
        self.lifecycle._validate_process_identity(marker['rootIdentity'])

    def read(self, path):
        self.lifecycle._reject_link_components(self.path)
        if Path(path).resolve(strict=False) != self.path:
            raise SnapshotError('Native backend cannot read a different lifecycle.')
        state_path, state = self.original_read(path)
        self.verify(state)
        return state_path, state

    def write(self, path, state):
        self.lifecycle._reject_link_components(self.path)
        if Path(path).resolve(strict=False) != self.path:
            raise SnapshotError('Native backend cannot write a different lifecycle.')
        if self.fresh_launch:
            if state['process'] != self.launch_identity or self.path.exists():
                raise SnapshotError('Fresh native state identity does not match launch.')
            self.marker.parent.mkdir(parents=True, exist_ok=True)
            self.lifecycle._reject_link_components(self.marker)
            # Write provenance first. A partial launch never becomes an
            # unmarked native receipt that the default CIM route could read.
            with self.marker.open('x', encoding='utf-8') as stream:
                json.dump({**self.binding, 'rootIdentity': self.launch_identity}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            self.original_write(path, state)
            self.fresh_launch = False
        else:
            self.verify(state)
            self.original_write(path, state)

    def identity(self, pid):
        if not self.fresh_launch:
            self.read(self.path)
        identity = self.proof.identity(pid)
        if self.fresh_launch:
            self.launch_identity = identity
        return identity

    def tree(self, root):
        _, state = self.read(self.path)
        if root != state['process']:
            raise SnapshotError('Requested tree differs from native provenance.')
        return self.proof.tree(root)

    def absent(self, tree):
        self.read(self.path)
        return self.proof.absent(tree)

    def install(self):
        def checked(function):
            def invoke(*args):
                try:
                    return function(*args)
                except ProcessAbsent as error:
                    raise self.lifecycle.ClientFailure('PROCESS_NOT_FOUND', str(error)) from error
                except (SnapshotError, OSError, ValueError) as error:
                    raise self.lifecycle.ClientFailure('PROCESS_PROOF_FAILED', str(error)) from error
            return invoke
        for name, function in [('_read_state', self.read), ('_atomic_write_json', self.write), ('_process_identity', self.identity), ('_process_tree', self.tree), ('_recorded_tree_absent', self.absent)]:
            setattr(self.lifecycle, name, checked(function))
        return self


def prove_renderer_target(backend, run=None, fetch=None, client_pid=None, target_id=None):
    """Exact loopback listener and page proof for this renderer-only backend."""
    _, state = backend.read(backend.path)
    cdp = state['cdp']
    if not cdp:
        raise SnapshotError('Renderer target proof requires a recorded CDP binding.')
    before = backend.tree(state['process'])
    run = run or subprocess.run
    address = f"127.0.0.1:{cdp['port']}"
    def observe_tcp(tree):
        output = run(['netstat.exe', '-ano', '-p', 'tcp'], capture_output=True, text=True, timeout=10, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
        if len(output.encode('utf-8')) > 2_097_152:
            raise SnapshotError('Listener inventory exceeds bound.')
        rows = [line.split() for line in output.splitlines()]
        rows = [parts for parts in rows if len(parts) == 5 and parts[0] == 'TCP']
        selected = [int(parts[4]) for parts in rows if parts[1] == address and parts[3] == 'LISTENING']
        if len(selected) != 1 or selected[0] not in {item['pid'] for item in tree}:
            raise SnapshotError('Exact loopback listener lacks one native tree owner.')
        pair = None
        if client_pid is not None:
            clients = [parts for parts in rows if parts[1].startswith('127.0.0.1:') and parts[2] == address and parts[3] == 'ESTABLISHED' and int(parts[4]) == client_pid]
            if len(clients) != 1:
                raise SnapshotError('Connected client lacks one exact established loopback peer.')
            local = clients[0][1]
            peers = [parts for parts in rows if parts[1] == address and parts[2] == local and parts[3] == 'ESTABLISHED' and int(parts[4]) == selected[0]]
            if len(peers) != 1:
                raise SnapshotError('Established client peer lacks the exact native listener owner.')
            pair = {'clientAddress': local, 'serverAddress': address, 'clientPid': client_pid, 'serverPid': selected[0]}
        return selected[0], pair
    client_before = None
    client_handles = ExitStack()
    if client_pid is not None:
        client_handles.enter_context(backend.proof.api.handle(client_pid))
        try:
            client_before = backend.proof.identity(client_pid)
        except BaseException:
            client_handles.close()
            raise
    endpoint = f"http://{address}/json/list"
    try:
        root_handle = client_handles.enter_context(backend.proof.api.handle(state['process']['pid']))
        held_root = backend.proof.api.observe(root_handle, state['process']['pid'], state['process']['parentPid'])
        if held_root != state['process']:
            raise SnapshotError('Root identity changed before target proof.')
        owner_before, pair_before = observe_tcp(before)
        server_before = next(item for item in before if item['pid'] == owner_before)
        server_handle = client_handles.enter_context(backend.proof.api.handle(owner_before))
        held_server_before = backend.proof.api.observe(server_handle, owner_before, server_before['parentPid'])
        if held_server_before != server_before:
            raise SnapshotError('Listener process changed before held-handle proof.')
        if fetch is None:
            with urlopen(endpoint, timeout=5) as response:
                data = response.read(65537)
        else:
            data = fetch(endpoint)
        if len(data) > 65536:
            raise SnapshotError('Renderer target response exceeds bound.')
        targets = json.loads(data)
        if not isinstance(targets, list) or len(targets) != 1 or not isinstance(targets[0], dict):
            raise SnapshotError('Renderer target inventory is not exactly one page.')
        target = targets[0]
        websocket = urlparse(target.get('webSocketDebuggerUrl', ''))
        if target.get('type') != 'page' or target.get('url') != cdp['expectedUrl'] or websocket.scheme != 'ws' or websocket.hostname != '127.0.0.1' or websocket.port != cdp['port'] or websocket.username or websocket.password or not websocket.path.startswith('/devtools/page/'):
            raise SnapshotError('Renderer target does not match the exact loopback binding.')
        if client_pid is not None and (not target_id or target.get('id') != target_id or websocket.path != '/devtools/page/' + target_id):
            raise SnapshotError('Connected renderer target identity differs from the actual CDP session.')
        after = backend.tree(state['process'])
        owner_after, pair_after = observe_tcp(after)
        if owner_before != owner_after or pair_before != pair_after:
            raise SnapshotError('Listener or established peer changed around target proof.')
        final_tree = backend.tree(state['process'])
        if fetch is None:
            with urlopen(endpoint, timeout=5) as response:
                final_data = response.read(65537)
        else:
            final_data = fetch(endpoint)
        if len(final_data) > 65536:
            raise SnapshotError('Final renderer target response exceeds bound.')
        final_targets = json.loads(final_data)
        keys = ('id', 'type', 'url', 'webSocketDebuggerUrl')
        if not isinstance(final_targets, list) or len(final_targets) != 1 or not isinstance(final_targets[0], dict) or any(final_targets[0].get(key) != target.get(key) for key in keys):
            raise SnapshotError('Renderer target changed around final proof.')
        owner_final, pair_final = observe_tcp(final_tree)
        if owner_final != owner_before or pair_final != pair_before:
            raise SnapshotError('Final listener or established peer changed.')
        if client_pid is not None and backend.proof.identity(client_pid) != client_before:
            raise SnapshotError('Connected client identity changed around target proof.')
        if backend.proof.api.observe(server_handle, owner_before, server_before['parentPid']) != held_server_before:
            raise SnapshotError('Listener process changed around held-handle proof.')
        if backend.proof.api.observe(root_handle, held_root['pid'], held_root['parentPid']) != held_root:
            raise SnapshotError('Root identity changed around held-handle proof.')
        inventories = [{row['pid']: row for row in tree} for tree in (before, after, final_tree)]
        if any(len(inventory) != len(tree) for inventory, tree in zip(inventories, (before, after, final_tree))):
            raise SnapshotError('Duplicate process identity in target proof.')
        for pid in {pid for inventory in inventories for pid in inventory}:
            records = [inventory[pid] for inventory in inventories if pid in inventory]
            if any(record != records[0] for record in records[1:]):
                raise SnapshotError('Shared process identity changed around target proof.')
        for pid, expected in ((held_root['pid'], held_root), (owner_before, held_server_before)):
            if any(inventory.get(pid) != expected for inventory in inventories):
                raise SnapshotError('Required process identity missing around target proof.')
        if any(inventory != inventories[0] for inventory in inventories[1:]):
            raise DescendantMembershipChanged({'before': before, 'after': after, 'final': final_tree, 'targetBefore': {key: target.get(key) for key in keys}, 'targetAfter': {key: final_targets[0].get(key) for key in keys}, 'listenerOwnerPid': owner_before, 'peerBefore': pair_before, 'peerAfter': pair_after, 'peerFinal': pair_final, 'root': held_root, 'listener': held_server_before, 'client': client_before})
        return {'ok': True, 'client_ok': True, 'backend': 'native-v1', 'listenerOwnerPid': owner_after, 'listenerAddress': address, 'targetCount': 1, 'targetId': target.get('id'), 'exactUrl': cdp['expectedUrl'], 'nativeProcesses': final_tree, 'clientIdentity': client_before, 'establishedPeerPair': pair_after}
    finally:
        client_handles.close()


def supplemental_precision_bridge(lifecycle, receipt_path, api=None, filtered_identity=None):
    """Bind an immutable legacy receipt to a separate native identity proof.

    No tolerance is applied and no legacy bytes or validation are changed.
    The original filtered CIM identity must match exactly while the native
    root handle stays open across both native observations and tree proof.
    """
    original_bytes = Path(receipt_path).read_bytes()
    state = json.loads(original_bytes)
    original = state['process']
    lifecycle._validate_process_identity(original)
    native = api or Native()
    filtered_identity = filtered_identity or lifecycle._process_identity
    with native.handle(original['pid']) as handle:
        rows = native.inventory()
        if original['pid'] not in rows:
            raise SnapshotError('Bridge root is absent from inventory.')
        before = native.observe(handle, original['pid'], rows[original['pid']])
        observed_cim = filtered_identity(original['pid'])
        if not lifecycle._same_process(original, observed_cim) or original['parentPid'] != observed_cim['parentPid']:
            raise SnapshotError('Original filtered identity does not match receipt.')
        if before['parentPid'] != original['parentPid'] or before['executablePath'] != original['executablePath']:
            raise SnapshotError('Native root parent or image differs from original receipt.')
        # The precision difference is recorded, never used as acceptance logic.
        tree = Proof(lifecycle, native).tree(before)
        after = native.observe(handle, original['pid'], before['parentPid'])
        if not lifecycle._same_process(before, after):
            raise SnapshotError('Native root changed during precision bridge.')
        if Path(receipt_path).read_bytes() != original_bytes:
            raise SnapshotError('Original receipt changed during precision bridge.')
        return {
            'version': 1, 'kind': 'supplemental-native-precision-bridge',
            'originalReceiptSha256': hashlib.sha256(original_bytes).hexdigest(),
            'originalIdentity': original, 'filteredCimIdentity': observed_cim,
            'nativeIdentity': before, 'nativeAfterIdentity': after,
            'nativeProcesses': tree, 'originalReceiptUnchanged': True,
            'precisionDifferenceTicks': lifecycle._creation_ticks(before['creationDate']) - lifecycle._creation_ticks(original['creationDate']),
            'legacyExactCompatibility': lifecycle._same_process(original, before),
        }
