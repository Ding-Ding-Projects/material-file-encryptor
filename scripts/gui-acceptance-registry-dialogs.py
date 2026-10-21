"""Receipt-bound background dialog inspection and reviewed input, never foreground input."""
import ctypes
from ctypes import wintypes as W
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(request):
    if os.name != 'nt':
        raise ValueError('Native dialog input requires Windows')
    if request.get('phase') not in ('inspect', 'apply') or request.get('kind') not in ('folder', 'conflict'):
        raise ValueError('Unsupported dialog operation')
    root = Path(request['runRoot'])
    receipt = Path(request['statePath'])
    if root.resolve(strict=True) != root or receipt.parent != root:
        raise ValueError('Unresolved lifecycle root')
    helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
    cli = Path(os.environ['MFE_LOWLEVEL_CLI'])
    if os.environ.get('MFE_LOWLEVEL_URL'):
        raise ValueError('Direct dialog route does not mix transports')
    lifecycle = load('dialog_lifecycle', helper)
    scripts = Path(__file__).resolve().parent
    transport = load('dialog_transport', scripts / 'direct-cli-receipt.py')
    verify_transport = transport.install_receipt_transport(lifecycle, cli=cli)
    snapshot = load('dialog_snapshot', scripts / 'renderer-process-snapshot.py')
    backend = snapshot.RendererNativeBackend(lifecycle, receipt, request['verifierSourceCommit'], helper).install()
    _, state = backend.read(receipt)
    if state['runRoot'] != str(root) or state.get('cleaned') or not state.get('created'):
        raise ValueError('Inactive lifecycle')
    if state['desktop'].lower() in ('default', 'winlogon', 'disconnect'):
        raise ValueError('Visible or system desktop is prohibited')
    if hashlib.sha256(Path(state['process']['executablePath']).read_bytes()).hexdigest() != request['executableSha256']:
        raise ValueError('Executable binding changed')

    def call(name, params):
        verify_transport()
        result = subprocess.run([str(cli), name, '--json', json.dumps(params)], capture_output=True, text=True,
                                timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
        if len(result.stdout) > 4 * 1024 * 1024:
            raise ValueError('Dialog tool output exceeds bound')
        value = json.loads(result.stdout)
        if result.returncode != 0 or value.get('ok') is not True or value.get('timed_out'):
            raise ValueError('Background dialog operation was not confirmed')
        return value

    user = ctypes.WinDLL('user32', use_last_error=True)
    user.GetWindow.argtypes = [W.HWND, W.UINT]
    user.GetWindow.restype = W.HWND
    user.IsChild.argtypes = [W.HWND, W.HWND]
    user.IsChild.restype = W.BOOL
    user.IsWindowEnabled.argtypes = [W.HWND]
    user.IsWindowEnabled.restype = W.BOOL
    user.GetClientRect.argtypes = [W.HWND, ctypes.POINTER(W.RECT)]
    user.GetClientRect.restype = W.BOOL

    def observe():
        _, current = backend.read(receipt)
        if current['process'] != state['process'] or current['desktop'] != state['desktop'] or current.get('cleaned'):
            raise ValueError('Lifecycle identity changed')
        tree = backend.tree(state['process'])
        windows = call('list_headless_windows', {'name': state['desktop']})
        rows = lifecycle._windows_with_process_ids(windows.get('windows', []), state['desktop'])
        by_pid = {item['pid']: item for item in tree}
        candidates = []
        for item in rows:
            hwnd = item.get('handle')
            if item.get('process_id') not in by_pid or hwnd == state.get('hwnd'):
                continue
            if item.get('class') != ('#32770' if request['kind'] == 'folder' else 'Chrome_WidgetWin_1'):
                continue
            if item.get('width', 0) <= 0 or item.get('height', 0) <= 0:
                continue
            if int(user.GetWindow(hwnd, 4) or 0) != state.get('hwnd'):
                continue
            owner = backend.identity(item['process_id'])
            if owner != by_pid[item['process_id']]:
                raise ValueError('Modal process identity changed')
            children = call('list_child_windows', {'hwnd': hwnd}).get('children')
            if not isinstance(children, list) or len(children) > 4096:
                raise ValueError('Invalid child-control inventory')
            candidates.append({'hwnd': hwnd, 'process': owner, 'desktop': state['desktop'],
                               'ownerHwnd': state['hwnd'], 'class': item['class'], 'title': item['title'],
                               'children': children})
        if len(candidates) > 1:
            raise ValueError('Ambiguous owned modal windows')
        return candidates[0] if candidates else None

    observed = observe()
    if request['phase'] == 'inspect':
        deadline = time.monotonic() + (0 if request.get('allowClosed') else 10)
        while observed is None and time.monotonic() < deadline:
            time.sleep(.15)
            observed = observe()
        if observed is None:
            if not request.get('allowClosed'):
                raise ValueError('Owned modal did not appear')
            return {'ok': True, 'closed': True}
        folder = root / 'registry-dialog-evidence'
        folder.mkdir(exist_ok=True)
        lifecycle._reject_link_components(folder)
        image = folder / (uuid.uuid4().hex + '.png')
        result = call('screenshot', {'hwnd': observed['hwnd'], 'client_only': True, 'output_path': str(image)})
        if result.get('rendered_ok') is not True or result.get('width', 0) <= 0 or result.get('height', 0) <= 0:
            raise ValueError('Native modal pixels unavailable')
        after = observe()
        if after != observed:
            raise ValueError('Modal changed during inspection')
        digest = hashlib.sha256(image.read_bytes()).hexdigest()
        return {'ok': True, 'closed': False, 'observation': observed, 'image': str(image), 'imageSha256': digest,
                'width': result['width'], 'height': result['height'], 'inspected': False}

    expected = request['review']['observation']
    if observed != expected:
        raise ValueError('Reviewed modal or controls changed before input')
    image = Path(request['review']['image'])
    lifecycle._reject_link_components(image)
    if image.parent != root / 'registry-dialog-evidence' or hashlib.sha256(image.read_bytes()).hexdigest() != request['review']['imageSha256']:
        raise ValueError('Reviewed pixels changed')
    action = request['action']
    hwnd = observed['hwnd']
    # Hold the exact process identity across input. Re-enumerate the named
    # desktop immediately before dispatch, not a cached HWND from inspection.
    with backend.proof.api.handle(observed['process']['pid']) as handle:
        if backend.proof.api.observe(handle, observed['process']['pid'], observed['process']['parentPid']) != observed['process'] or observe() != observed:
            raise ValueError('Input ownership changed')
        if action.get('kind') == 'folder-text' and request['kind'] == 'folder':
            child = [row for row in observed['children'] if row.get('handle') == action.get('hwnd') and row.get('class') == 'Edit' and row.get('visible')]
            if len(child) != 1 or not user.IsChild(hwnd, action['hwnd']) or not user.IsWindowEnabled(action['hwnd']):
                raise ValueError('Reviewed editable folder control unavailable')
            destination = Path(request['parent'])
            lifecycle._reject_link_components(destination)
            if destination.resolve(strict=True) != destination or not destination.is_dir():
                raise ValueError('Owned restore parent unavailable')
            call('win_set_control_text', {'hwnd': action['hwnd'], 'text': str(destination)})
        elif action.get('kind') == 'click':
            x, y = action.get('x'), action.get('y')
            bounds = W.RECT()
            if not user.GetClientRect(hwnd, ctypes.byref(bounds)) or type(x) is not int or type(y) is not int or not (0 <= x < bounds.right and 0 <= y < bounds.bottom):
                raise ValueError('Reviewed click lies outside modal client area')
            call('mouse_click', {'hwnd': hwnd, 'x': x, 'y': y, 'button': 'left', 'clicks': 1})
        else:
            raise ValueError('Unsupported reviewed dialog action')
        if backend.proof.api.observe(handle, observed['process']['pid'], observed['process']['parentPid']) != observed['process']:
            raise ValueError('Process identity changed during input')
    return {'ok': True, 'applied': True, 'hwnd': hwnd, 'processId': observed['process']['pid'], 'desktop': state['desktop']}


if __name__ == '__main__':
    try:
        payload = sys.stdin.read(4 * 1024 * 1024 + 1)
        if len(payload) > 4 * 1024 * 1024:
            raise ValueError('Request exceeds bound')
        print(json.dumps(run(json.loads(payload))))
    except Exception:
        print(json.dumps({'ok': False, 'code': 'REGISTRY_DIALOG_OPERATION_UNVERIFIED'}))
        sys.exit(1)
