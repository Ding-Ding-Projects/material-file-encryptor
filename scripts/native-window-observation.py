"""Read-only native client geometry with receipt-bound process bookends."""
import ctypes
from ctypes import wintypes
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from datetime import datetime, timezone


def observe(lifecycle, state, hwnd, api):
    def owner():
        tree = lifecycle._process_tree(state['process'])
        pid = api.owner(hwnd)
        matches = [item for item in tree if item['pid'] == pid]
        if len(matches) != 1:
            raise ValueError('WINDOW_OWNER_UNPROVEN')
        current = lifecycle._process_identity(pid)
        if not lifecycle._same_process(matches[0], current):
            raise ValueError('WINDOW_OWNER_CHANGED')
        return current
    before = owner()
    before_hash = hashlib.sha256(Path(before['executablePath']).read_bytes()).hexdigest()
    geometry = api.geometry(hwnd)
    after = owner()
    after_hash = hashlib.sha256(Path(after['executablePath']).read_bytes()).hexdigest()
    if before != after or before_hash != after_hash:
        raise ValueError('WINDOW_OWNER_CHANGED')
    return {'ok': True, 'client_ok': True, 'version': 1, 'hwnd': hwnd,
            'desktop': state['desktop'], 'process': after, 'processSha256': after_hash,
            'observedAt': datetime.now(timezone.utc).isoformat(), **geometry,
            'physicalScaleMatrixVerified': False}


class Native:
    def __init__(self):
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
            raise ValueError('WINDOW_OWNER_UNAVAILABLE')
        return pid.value
    def geometry(self, hwnd):
        # Only this observer thread changes awareness. No display setting changes.
        previous = self.user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
        if not previous:
            raise ValueError('NATIVE_DPI_CONTEXT_UNAVAILABLE')
        try:
            client, outer = wintypes.RECT(), wintypes.RECT()
            if not self.user.GetClientRect(hwnd, ctypes.byref(client)) or not self.user.GetWindowRect(hwnd, ctypes.byref(outer)):
                raise ValueError('NATIVE_GEOMETRY_UNAVAILABLE')
            dpi = self.user.GetDpiForWindow(hwnd)
            awareness = self.user.GetAwarenessFromDpiAwarenessContext(self.user.GetWindowDpiAwarenessContext(hwnd))
            if dpi <= 0 or awareness not in (0, 1, 2) or client.right <= client.left or client.bottom <= client.top:
                raise ValueError('NATIVE_GEOMETRY_UNAVAILABLE')
            rect = lambda r: {'left': r.left, 'top': r.top, 'width': r.right-r.left, 'height': r.bottom-r.top}
            return {'clientRect': rect(client), 'windowRect': rect(outer), 'dpi': dpi,
                    'windowDpiAwareness': awareness, 'observerDpiAwareness': 'per-monitor-v2',
                    'scaleKind': 'current-window-effective-dpi', 'scale': dpi / 96}
        finally:
            if not self.user.SetThreadDpiAwarenessContext(previous):
                raise ValueError('NATIVE_DPI_CONTEXT_RESTORE_FAILED')


def main():
    request = json.load(sys.stdin)
    spec = importlib.util.spec_from_file_location('native_lifecycle', request['helper'])
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    _, state = module._read_state(request['receipt'])
    if state.get('cleaned') or not state.get('created') or not state.get('hwnd'):
        raise ValueError('NATIVE_STATE_UNAVAILABLE')
    return observe(module, state, state['hwnd'], Native())


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception:
        # No raw native output, paths or process details cross the failure boundary.
        print(json.dumps({'ok': False, 'client_ok': False, 'code': 'NATIVE_OBSERVATION_FAILED', 'stage': 'native-observation'}))
        sys.exit(1)
