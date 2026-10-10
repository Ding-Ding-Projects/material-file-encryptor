"""Project transport projection around the unchanged installed state validator."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

COMPATIBILITY_ENDPOINT = 'http://127.0.0.1:8765/mcp'
DIRECT_TRANSPORT = 'direct-cheap-cli'


def file_binding(value):
    path = Path(value)
    if not path.is_absolute() or path.resolve(strict=True) != path or not path.is_file() or path.is_symlink():
        raise ValueError('Unresolved transport file')
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def direct_provenance(cli):
    cli = Path(cli).resolve(strict=True)
    if cli.name != 'lowlevel-computer-use-cheap.exe' or cli.parent.name != 'Scripts' or cli.parent.parent.name != '.venv':
        raise ValueError('Unsupported direct CLI layout')
    root = cli.parents[2]
    python = cli.with_name('python.exe')
    result = subprocess.run([str(python), '-c', 'import importlib.util,json,sys; print(json.dumps({"package":importlib.util.find_spec("lowlevel_computer_use_mcp").submodule_search_locations[0],"baseExecutable":sys._base_executable,"runtimeDll":str(__import__("pathlib").Path(sys.base_prefix)/("python"+str(sys.version_info.major)+str(sys.version_info.minor)+".dll"))}))'], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=15, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode != 0:
        raise ValueError('Direct runtime source discovery failed')
    discovery = json.loads(result.stdout)
    package = Path(discovery['package']).resolve(strict=True)
    if package != root / 'src' / 'lowlevel_computer_use_mcp':
        raise ValueError('Direct runtime source differs from sibling checkout')
    origin = subprocess.run(['git', '-C', str(root), 'remote', 'get-url', 'origin'], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if origin.returncode != 0 or origin.stdout.strip() not in {
        'https://github.com/Ding-Ding-Projects/lowlevel-computer-use-mcp.git',
        'https://github.com/Ding-Ding-Projects/lowlevel-computer-use-mcp',
        'git@github.com:Ding-Ding-Projects/lowlevel-computer-use-mcp.git',
    }:
        raise ValueError('Direct sibling source origin is not canonical')
    source = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    commit = source.stdout.strip()
    if source.returncode != 0 or not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Direct source identity unavailable')
    files = sorted([*package.rglob('*.py'), *package.rglob('*.dll')])
    if package / 'server.py' not in files or package / 'winio.py' not in files:
        raise ValueError('Direct source inventory incomplete')
    return {'version': 1, 'cli': file_binding(cli), 'python': file_binding(python),
            'basePython': file_binding(Path(discovery['baseExecutable']).resolve(strict=True)),
            'pythonDll': file_binding(Path(discovery['runtimeDll']).resolve(strict=True)),
            'sourceCommit': commit, 'sourceRoot': str(root), 'files': [file_binding(p) for p in files]}


def install_receipt_transport(lifecycle, *, endpoint=None, cli=None, provenance=direct_provenance):
    if bool(endpoint) == bool(cli):
        raise ValueError('Select exactly one transport')
    if endpoint:
        lifecycle._validate_endpoint(endpoint)
    binding = provenance(cli) if cli else None
    def verify():
        if cli and provenance(cli) != binding:
            raise ValueError('Direct transport changed during operation')
        return binding
    original_object = lifecycle._require_object
    original_write = lifecycle._atomic_write_json

    def project(value, label):
        state = original_object(value, label)
        if label != 'Lifecycle state':
            return state
        if endpoint:
            if 'transport' in state or 'transportProvenance' in state or state.get('endpoint') != endpoint:
                raise ValueError('Mixed or changed HTTP transport')
            return state
        if state.get('transport') != DIRECT_TRANSPORT or 'endpoint' in state or state.get('transportProvenance') != verify():
            raise ValueError('Mixed or stale direct transport provenance')
        projected = dict(state)
        del projected['transport']
        del projected['transportProvenance']
        projected['endpoint'] = COMPATIBILITY_ENDPOINT
        return projected

    def write(path, state):
        if endpoint:
            if 'transport' in state or 'transportProvenance' in state or state.get('endpoint') != endpoint:
                raise ValueError('Mixed or changed HTTP transport')
            return original_write(path, state)
        if state.get('endpoint') != COMPATIBILITY_ENDPOINT or 'transport' in state or 'transportProvenance' in state:
            raise ValueError('Unexpected direct compatibility state')
        saved = dict(state)
        del saved['endpoint']
        saved.update(transport=DIRECT_TRANSPORT, transportProvenance=verify())
        return original_write(path, saved)

    lifecycle._require_object = project
    lifecycle._atomic_write_json = write
    return verify
