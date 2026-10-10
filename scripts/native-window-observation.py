"""Read-only native client geometry with receipt-bound process bookends."""
import ctypes
from ctypes import wintypes
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone


DIAGNOSTIC_STAGES = frozenset(('request', 'lifecycle-import', 'adapter-import', 'transport', 'state-read', 'state-validation', 'native-import', 'before-tree', 'before-owner', 'before-identity', 'before-hash', 'native-dpi-enter', 'native-geometry', 'native-dpi-query', 'native-geometry-validation', 'native-dpi-restore', 'after-tree', 'after-owner', 'after-identity', 'after-hash', 'bookend-validation'))
INTERNAL_CODES = frozenset(('WINDOW_OWNER_UNPROVEN', 'WINDOW_OWNER_CHANGED', 'WINDOW_OWNER_UNAVAILABLE', 'NATIVE_DPI_CONTEXT_UNAVAILABLE', 'NATIVE_GEOMETRY_UNAVAILABLE', 'NATIVE_DPI_CONTEXT_RESTORE_FAILED', 'NATIVE_STATE_UNAVAILABLE', 'MIXED_TRANSPORT'))
LIFECYCLE_CODES = frozenset(('UNSAFE_PATH', 'STATE_TOO_LARGE', 'INVALID_STATE', 'UNSUPPORTED_PLATFORM', 'PROCESS_NOT_FOUND', 'PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED', 'INVALID_PROCESS_IDENTITY', 'INVALID_PROCESS_TREE', 'TRANSPORT_ERROR', 'INVALID_RESPONSE', 'INVALID_ENDPOINT', 'NON_LOOPBACK_ENDPOINT', 'UNSAFE_ENDPOINT'))
DIAGNOSTIC_CODES = INTERNAL_CODES | LIFECYCLE_CODES | frozenset(('UNEXPECTED_EXCEPTION',))


class ObservationFailure(ValueError):
    def __init__(self, code):
        if code not in INTERNAL_CODES:
            raise ValueError('Invalid diagnostic code')
        super().__init__(code)
        self.code = code


class DiagnosticContext:
    def __init__(self):
        self.stage = 'request'
        self.lifecycle_failure = None

    def at(self, stage):
        if stage not in DIAGNOSTIC_STAGES:
            raise ValueError('Invalid diagnostic stage')
        self.stage = stage


def failure_payload(error, context):
    code = 'UNEXPECTED_EXCEPTION'
    if type(error) is ObservationFailure:
        code = error.code
    elif context.lifecycle_failure is not None and type(error) is context.lifecycle_failure:
        candidate = error.code
        if isinstance(candidate, str) and candidate in LIFECYCLE_CODES:
            code = candidate
    return {'ok': False, 'client_ok': False, 'code': 'NATIVE_OBSERVATION_FAILED',
            'stage': 'native-observation', 'diagnosticStage': context.stage if context.stage in DIAGNOSTIC_STAGES else 'request',
            'diagnosticCode': code if code in DIAGNOSTIC_CODES else 'UNEXPECTED_EXCEPTION'}


def observe(lifecycle, state, hwnd, api, context=None):
    context = context or DiagnosticContext()
    def owner(bookend):
        context.at(bookend + '-tree')
        tree = lifecycle._process_tree(state['process'])
        context.at(bookend + '-owner')
        pid = api.owner(hwnd)
        matches = [item for item in tree if item['pid'] == pid]
        if len(matches) != 1:
            raise ObservationFailure('WINDOW_OWNER_UNPROVEN')
        context.at(bookend + '-identity')
        current = lifecycle._process_identity(pid)
        if not lifecycle._same_process(matches[0], current):
            raise ObservationFailure('WINDOW_OWNER_CHANGED')
        return current
    before = owner('before')
    context.at('before-hash')
    before_hash = hashlib.sha256(Path(before['executablePath']).read_bytes()).hexdigest()
    context.at('native-geometry')
    geometry = api.geometry(hwnd)
    after = owner('after')
    context.at('after-hash')
    after_hash = hashlib.sha256(Path(after['executablePath']).read_bytes()).hexdigest()
    context.at('bookend-validation')
    if before != after or before_hash != after_hash:
        raise ObservationFailure('WINDOW_OWNER_CHANGED')
    return {'ok': True, 'client_ok': True, 'version': 1, 'hwnd': hwnd,
            'desktop': state['desktop'], 'process': after, 'processSha256': after_hash,
            'observedAt': datetime.now(timezone.utc).isoformat(), **geometry,
            'physicalScaleMatrixVerified': False}


class Native:
    def __init__(self, context=None):
        self.context = context or DiagnosticContext()
        self.user = ctypes.WinDLL('user32', use_last_error=True)
        self.user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        self.user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        self.user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        self.user.GetDpiForWindow.argtypes = [wintypes.HWND]
        self.user.GetDpiForWindow.restype = wintypes.UINT
        self.user.GetWindowDpiAwarenessContext.argtypes = [wintypes.HWND]
        self.user.GetWindowDpiAwarenessContext.restype = ctypes.c_void_p
        self.user.GetAwarenessFromDpiAwarenessContext.argtypes = [ctypes.c_void_p]
        self.user.GetAwarenessFromDpiAwarenessContext.restype = ctypes.c_int
        self.user.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
        self.user.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    def owner(self, hwnd):
        pid = wintypes.DWORD()
        if not self.user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid)):
            raise ObservationFailure('WINDOW_OWNER_UNAVAILABLE')
        return pid.value
    def geometry(self, hwnd):
        # Only this observer thread changes awareness. No display setting changes.
        self.context.at('native-dpi-enter')
        previous = self.user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
        if not previous:
            raise ObservationFailure('NATIVE_DPI_CONTEXT_UNAVAILABLE')
        try:
            self.context.at('native-geometry')
            client, outer = wintypes.RECT(), wintypes.RECT()
            if not self.user.GetClientRect(hwnd, ctypes.byref(client)) or not self.user.GetWindowRect(hwnd, ctypes.byref(outer)):
                raise ObservationFailure('NATIVE_GEOMETRY_UNAVAILABLE')
            self.context.at('native-dpi-query')
            dpi = self.user.GetDpiForWindow(hwnd)
            awareness = self.user.GetAwarenessFromDpiAwarenessContext(self.user.GetWindowDpiAwarenessContext(hwnd))
            self.context.at('native-geometry-validation')
            if dpi <= 0 or awareness not in (0, 1, 2) or client.right <= client.left or client.bottom <= client.top:
                raise ObservationFailure('NATIVE_GEOMETRY_UNAVAILABLE')
            rect = lambda r: {'left': r.left, 'top': r.top, 'width': r.right-r.left, 'height': r.bottom-r.top}
            return {'clientRect': rect(client), 'windowRect': rect(outer), 'dpi': dpi,
                    'windowDpiAwareness': awareness, 'observerDpiAwareness': 'per-monitor-v2',
                    'scaleKind': 'current-window-effective-dpi', 'scale': dpi / 96}
        finally:
            pending_stage = self.context.stage
            self.context.at('native-dpi-restore')
            if not self.user.SetThreadDpiAwarenessContext(previous):
                raise ObservationFailure('NATIVE_DPI_CONTEXT_RESTORE_FAILED')
            self.context.at(pending_stage)


def main(context=None):
    context = context or DiagnosticContext()
    context.at('request')
    request = json.load(sys.stdin)
    context.at('lifecycle-import')
    spec = importlib.util.spec_from_file_location('native_lifecycle', request['helper'])
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    context.lifecycle_failure = module.ClientFailure
    context.at('adapter-import')
    adapter_spec = importlib.util.spec_from_file_location('direct_receipt', Path(__file__).with_name('direct-cli-receipt.py'))
    adapter = importlib.util.module_from_spec(adapter_spec); adapter_spec.loader.exec_module(adapter)
    context.at('transport')
    endpoint = os.environ.get('MFE_LOWLEVEL_URL')
    cli = os.environ.get('MFE_LOWLEVEL_CLI')
    if endpoint and cli:
        raise ObservationFailure('MIXED_TRANSPORT')
    if endpoint or cli:
        adapter.install_receipt_transport(module, endpoint=endpoint, cli=cli if not endpoint else None)
    context.at('state-read')
    _, state = module._read_state(request['receipt'])
    context.at('state-validation')
    if state.get('cleaned') or not state.get('created') or not state.get('hwnd'):
        raise ObservationFailure('NATIVE_STATE_UNAVAILABLE')
    context.at('native-import')
    api = Native(context)
    return observe(module, state, state['hwnd'], api, context)


def run(operation=main):
    context = DiagnosticContext()
    try:
        result = operation(context)
        encoded = json.dumps(result)
    except Exception as error:
        # Only fixed categories cross the failure boundary.
        print(json.dumps(failure_payload(error, context)))
        return 1
    print(encoded)
    return 0


if __name__ == '__main__':
    sys.exit(run())
