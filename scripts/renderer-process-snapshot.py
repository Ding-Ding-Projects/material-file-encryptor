"""Read-only Windows process proof for renderer fixture lifecycle verification."""
import ctypes
from ctypes import wintypes as W
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
import os
import hashlib
import json
from pathlib import Path


class SnapshotError(RuntimeError):
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

    def observe(self, handle, pid, parent, allow_exited=False):
        if handle is None:
            raise SnapshotError('Selected process disappeared during proof.')
        if self.exited(handle) and not allow_exited:
            raise SnapshotError('Selected process is not proven running.')
        created, exited, kernel, user = (W.FILETIME() for _ in range(4))
        if not self.k.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(kernel), ctypes.byref(user)):
            raise SnapshotError('Process creation time is unavailable.')
        path, length = ctypes.create_unicode_buffer(32768), W.DWORD(32768)
        if not self.k.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(length)) or not path.value:
            raise SnapshotError('Process executable identity is unavailable.')
        if self.exited(handle) and not allow_exited:
            raise SnapshotError('Process exited during identity observation.')
        return {'pid': pid, 'parentPid': parent, 'creationDate': creation_date((created.dwHighDateTime << 32) | created.dwLowDateTime), 'executablePath': path.value}


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

    def tree(self, root):
        self.lifecycle._validate_process_identity(root)
        with ExitStack() as stack:
            root_handle = stack.enter_context(self.api.handle(root['pid']))
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
                current = self.api.observe(handle, pid, rows.get(pid, expected['parentPid']), allow_exited=True)
                if not self.lifecycle._same_process(expected, current) or current['parentPid'] != expected['parentPid']:
                    raise SnapshotError('Recorded process identity changed.')
                if not exited:
                    present = True
                verdicts.append({'pid': pid, 'verdict': 'exited-object-observed' if exited else 'execution-present'})
        self.last_absence = {
            'recordedProcessesExited': not present,
            'recordedExecutionVerdicts': verdicts,
            'exitedObjectCount': sum(item['verdict'] == 'exited-object-observed' for item in verdicts),
            'pidAbsentCount': sum(item['verdict'] == 'pid-absent' for item in verdicts),
            'legacyAbsenceMeaning': 'No recorded execution remains; exited kernel objects may still exist.',
        }
        return not present


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
