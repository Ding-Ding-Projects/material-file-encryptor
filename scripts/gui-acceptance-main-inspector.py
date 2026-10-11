"""Read-only admission of the exact owned packaged main inspector."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from contextlib import ExitStack
from urllib.request import urlopen
from urllib.parse import urlparse

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

def select_listener(stdout, port, root_pid, client_pid=None):
    address = f'127.0.0.1:{port}'
    rows = [line.split() for line in stdout.splitlines()]
    rows = [row for row in rows if len(row) == 5 and row[0] == 'TCP']
    listeners = [row for row in rows if row[1].endswith(':' + str(port)) and row[3] == 'LISTENING']
    if len(listeners) != 1 or listeners[0][1] != address or int(listeners[0][4]) != root_pid:
        raise ValueError('Inspector listener is not the exact main root on loopback.')
    if client_pid is None:
        return None
    clients = [row for row in rows if row[1].startswith('127.0.0.1:') and row[2] == address and row[3] == 'ESTABLISHED' and int(row[4]) == client_pid]
    if len(clients) != 1:
        raise ValueError('Inspector client lacks one exact established peer.')
    peers = [row for row in rows if row[1] == address and row[2] == clients[0][1] and row[3] == 'ESTABLISHED' and int(row[4]) == root_pid]
    if len(peers) != 1:
        raise ValueError('Inspector peer is not owned by the main root.')
    return {'clientAddress': clients[0][1], 'serverAddress': address, 'clientPid': client_pid, 'serverPid': root_pid}

def validate_target(targets, port, target_id=None):
    if not isinstance(targets, list) or len(targets) != 1:
        raise ValueError('Inspector must expose exactly one node target.')
    target = targets[0]
    if target.get('type') != 'node' or not re.fullmatch(r'[A-Za-z0-9._-]{1,128}', target.get('id', '')):
        raise ValueError('Inspector node target identity is invalid.')
    if target_id is not None and target['id'] != target_id:
        raise ValueError('Inspector target changed.')
    ws = urlparse(target.get('webSocketDebuggerUrl', ''))
    if ws.scheme != 'ws' or ws.hostname != '127.0.0.1' or ws.port != port or ws.username or ws.password or ws.path != '/' + target['id'] or ws.query or ws.fragment:
        raise ValueError('Inspector websocket is not the exact loopback target.')
    return {'id': target['id'], 'type': target['type'], 'webSocketDebuggerUrl': target['webSocketDebuggerUrl']}

def validate_request(request):
    required = {'receipt', 'port', 'verifierSourceCommit', 'executableSha256'}
    if not required <= set(request) or set(request) - required - {'clientPid', 'clientBinding', 'targetId'}:
        raise ValueError('Exact main inspector proof schema is required.')
    if type(request['port']) is not int or not 1024 <= request['port'] <= 65535:
        raise ValueError('Inspector port is invalid.')
    optional = {'clientPid', 'clientBinding', 'targetId'}
    present = optional.intersection(request)
    if present and present != optional:
        raise ValueError('Connected proof requires complete client and target binding.')
    if not re.fullmatch(r'[a-f0-9]{64}', request['executableSha256']):
        raise ValueError('Executable hash is invalid.')

def prove(request):
    validate_request(request)
    helper = os.environ['MFE_LOWLEVEL_CLIENT']
    lifecycle = load('inspector_lifecycle', helper)
    scripts = Path(__file__).resolve().parent
    snapshot = load('inspector_snapshot', scripts / 'renderer-process-snapshot.py')
    recovery = load('inspector_recovery', scripts / 'supplemental-renderer-recovery.py')
    backend = snapshot.RendererNativeBackend(lifecycle, request['receipt'], request['verifierSourceCommit'], helper).install()
    _, state = backend.read(backend.path)
    root = state['process']
    if hashlib.sha256(Path(root['executablePath']).read_bytes()).hexdigest() != request['executableSha256']:
        raise ValueError('Main executable bytes changed.')
    with ExitStack() as held:
        handle = held.enter_context(backend.proof.api.handle(root['pid']))
        if backend.proof.api.observe(handle, root['pid'], root['parentPid']) != root:
            raise ValueError('Main root identity changed.')
        client = request.get('clientPid')
        if client is not None:
            binding, _ = held.enter_context(recovery.owning_client(client, request.get('clientBinding')))
            if binding != request.get('clientBinding'):
                raise ValueError('Main inspector client binding changed.')
        before = backend.tree(root)
        def tcp():
            output = subprocess.run(['netstat.exe', '-ano', '-p', 'tcp'], capture_output=True, text=True, timeout=10, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
            if len(output) > 2097152:
                raise ValueError('TCP inventory exceeds bound.')
            return select_listener(output, request['port'], root['pid'], client)
        peer = tcp()
        def target():
            with urlopen(f"http://127.0.0.1:{request['port']}/json/list", timeout=5) as response:
                data = response.read(65537)
            if len(data) > 65536:
                raise ValueError('Inspector inventory exceeds bound.')
            return validate_target(json.loads(data), request['port'], request.get('targetId'))
        first = target()
        after = backend.tree(root)
        if sorted(before, key=lambda row: row['pid']) != sorted(after, key=lambda row: row['pid']) or tcp() != peer or target() != first:
            raise ValueError('Main inspector ownership changed around admission.')
        if backend.proof.api.observe(handle, root['pid'], root['parentPid']) != root:
            raise ValueError('Main root identity changed around admission.')
    return {'ok': True, 'client_ok': True, 'scope': 'packaged-main-inspector', 'root': root, 'target': first, 'peer': peer, 'nativeProcesses': after}

if __name__ == '__main__':
    try:
        print(json.dumps(prove(json.load(sys.stdin))))
    except Exception as error:
        print(json.dumps({'ok': False, 'client_ok': False, 'code': 'PROCESS_PROOF_FAILED' if str(error) == 'Process ancestry changed during inventory.' else 'MAIN_INSPECTOR_ADMISSION_FAILED', 'error': str(error)}))
        sys.exit(1)
