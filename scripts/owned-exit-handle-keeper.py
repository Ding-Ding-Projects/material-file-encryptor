"""Prospective process-handle retention around the original graceful-exit verifier."""
import argparse
import contextlib
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import stat
import sys
import threading
import time
import traceback

STAGES = {'initialization', 'input-validation', 'helper-import', 'transport-validation', 'lifecycle-validation', 'receipt-validation', 'construction', 'full-tree-before', 'cim-before', 'handle-acquisition', 'native-pid', 'cim-after', 'full-tree-after', 'protocol-wait', 'confirm-invoke', 'confirm-validation', 'release-validation', 'handle-release'}


def private_failure(error, stage):
    """Retain bounded diagnostics without exception messages or identity payloads."""
    known = {'owned-exit-handle-keeper.py', 'lowlevel_mcp_client.py', 'direct-cli-receipt.py', 'local-headless-desktop-check-policy.py'}
    sites = []
    for frame in traceback.extract_tb(error.__traceback__)[-8:]:
        name = Path(frame.filename).name
        sites.append({'module': name if name in known else 'external',
                      'function': frame.name if re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,79}', frame.name) else 'unknown',
                      'line': frame.lineno if type(frame.lineno) is int and 1 <= frame.lineno <= 1000000 else 0})
    name = type(error).__name__
    return {'stage': stage if stage in STAGES else 'initialization',
            'exceptionType': name if re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,79}', name) else 'Exception', 'callsites': sites}


class KeeperFailure(Exception):
    def __init__(self, code):
        self.code = code


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bound_bytes(path):
    path = Path(path)
    before = path.lstat()
    if path.resolve(strict=True) != path or not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or getattr(before, 'st_file_attributes', 0) & 0x400 or before.st_size > 65536:
        raise KeeperFailure('UNSAFE_EXIT_INPUT')
    raw = path.read_bytes()
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or len(raw) != before.st_size:
        raise KeeperFailure('EXIT_INPUT_CHANGED')
    return raw


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def original_confirm(python, adapter, state_path, timeout):
    result = subprocess.run([str(python), str(adapter), 'confirm-exit', str(state_path)], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode != 0 or len(result.stdout) > 65536:
        raise KeeperFailure('ORIGINAL_CONFIRM_FAILED')
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise KeeperFailure('ORIGINAL_CONFIRM_FAILED')
    return value


class NativeHandles:
    RIGHTS = 0x1000 | 0x100000

    def __init__(self):
        if os.name != 'nt':
            raise KeeperFailure('UNSUPPORTED_HOST')
        from ctypes import wintypes
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        self.api.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        self.api.OpenProcess.restype = wintypes.HANDLE
        self.api.GetProcessId.argtypes = [wintypes.HANDLE]
        self.api.GetProcessId.restype = wintypes.DWORD
        self.api.CloseHandle.argtypes = [wintypes.HANDLE]
        self.api.CloseHandle.restype = wintypes.BOOL

    def open(self, pid):
        handle = self.api.OpenProcess(self.RIGHTS, False, pid)
        if not handle:
            raise KeeperFailure('HANDLE_ACQUISITION_FAILED')
        return handle

    def pid(self, handle):
        return self.api.GetProcessId(handle)

    def close(self, handle):
        return bool(self.api.CloseHandle(handle))


class Keeper:
    def __init__(self, lifecycle, policy, native, state_path, proof_path, bindings, verify_transport, confirm, deadline=None):
        self.lifecycle, self.policy, self.native = lifecycle, policy, native
        self.state_path, self.proof_path = Path(state_path), Path(proof_path)
        self.bindings, self.verify_transport, self.confirm_command = bindings, verify_transport, confirm
        self.handles = []
        self.confirmed = False
        self.events = []
        self.stage = 'construction'
        self.deadline = deadline
        self.state_bytes = bound_bytes(self.state_path)
        self.proof_bytes = bound_bytes(self.proof_path)
        self.original_state = json.loads(self.state_bytes)
        self.state_hash = hashlib.sha256(self.state_bytes).hexdigest()
        self.proof_hash = hashlib.sha256(self.proof_bytes).hexdigest()
        self.proof = json.loads(self.proof_bytes)
        if not isinstance(self.proof, dict) or set(self.proof) != {'root', 'processes'}:
            raise KeeperFailure('INVALID_EXIT_PROOF')

    def unchanged(self, final=False):
        if self.deadline is not None and time.monotonic() >= self.deadline:
            raise KeeperFailure('KEEPER_TIMEOUT')
        if any(digest(path) != sha for path, sha in self.bindings.items()):
            raise KeeperFailure('INPUT_BINDING_CHANGED')
        if bound_bytes(self.proof_path) != self.proof_bytes:
            raise KeeperFailure('EXIT_PROOF_CHANGED')
        self.verify_transport()
        state_bytes = bound_bytes(self.state_path)
        _, state = self.lifecycle._read_state(str(self.state_path))
        if bound_bytes(self.state_path) != state_bytes or bound_bytes(self.proof_path) != self.proof_bytes:
            raise KeeperFailure('EXIT_INPUT_CHANGED')
        raw = json.loads(state_bytes)
        if final:
            expected = dict(self.original_state)
            expected['cleaned'] = True
            if raw != expected:
                raise KeeperFailure('LIFECYCLE_CHANGED')
        elif state_bytes != self.state_bytes:
            raise KeeperFailure('LIFECYCLE_CHANGED')
        self.policy.validate_exit_proof(self.lifecycle, state, self.proof)
        return state

    def exact_tree(self, state):
        current = self.lifecycle._process_tree(state['process'])
        expected = self.proof['processes']
        if len(current) != len(expected):
            raise KeeperFailure('PROCESS_TREE_CHANGED')
        by_pid = {item['pid']: item for item in current}
        if len(by_pid) != len(current) or any(item['pid'] not in by_pid or not self.lifecycle._same_process(item, by_pid[item['pid']]) for item in expected):
            raise KeeperFailure('PROCESS_TREE_CHANGED')

    def acquire(self):
        self.stage = 'input-validation'
        state = self.unchanged()
        if state['cleaned'] is not False or state['created'] is not True:
            raise KeeperFailure('LIFECYCLE_NOT_ACTIVE')
        self.stage = 'full-tree-before'
        self.exact_tree(state)
        try:
            for expected in self.proof['processes']:
                if self.deadline is not None and time.monotonic() >= self.deadline:
                    raise KeeperFailure('KEEPER_TIMEOUT')
                self.stage = 'cim-before'
                if not self.lifecycle._same_process(expected, self.lifecycle._process_identity(expected['pid'])):
                    raise KeeperFailure('PROCESS_IDENTITY_CHANGED')
                self.stage = 'handle-acquisition'
                handle = self.native.open(expected['pid'])
                self.handles.append(handle)
                self.stage = 'native-pid'
                if self.native.pid(handle) != expected['pid']:
                    raise KeeperFailure('PROCESS_IDENTITY_CHANGED')
                self.stage = 'cim-after'
                if not self.lifecycle._same_process(expected, self.lifecycle._process_identity(expected['pid'])):
                    raise KeeperFailure('PROCESS_IDENTITY_CHANGED')
            self.stage = 'input-validation'
            state = self.unchanged()
            self.stage = 'full-tree-after'
            self.exact_tree(state)
            self.events.append({'event': 'ready', 'atUtc': utc(), 'count': len(self.handles)})
        except BaseException:
            self.release()
            raise

    def confirm(self, timeout):
        if self.confirmed or not self.handles:
            raise KeeperFailure('INVALID_COMMAND_ORDER')
        self.stage = 'input-validation'
        self.unchanged()
        self.stage = 'confirm-invoke'
        result = self.confirm_command(timeout)
        self.stage = 'confirm-validation'
        self.unchanged(final=True)
        if result.get('ok') is not True or result.get('client_ok') is not True or result.get('gracefulExit') is not True or result.get('recordedProcessesAbsent') is not True or result.get('desktopClosed') is not True or self.lifecycle._recorded_tree_absent(self.proof['processes']) is not True:
            raise KeeperFailure('ORIGINAL_CONFIRM_NOT_VERIFIED')
        self.confirmed = True
        self.events.append({'event': 'confirmed', 'atUtc': utc(), 'count': len(self.handles)})

    def release(self):
        failed = []
        for handle in self.handles:
            try:
                if not self.native.close(handle):
                    failed.append(handle)
            except Exception:
                failed.append(handle)
        self.handles = failed
        if failed:
            raise KeeperFailure('HANDLE_RELEASE_FAILED')
        self.events.append({'event': 'released', 'atUtc': utc(), 'count': 0})


def utc():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def serve(keeper, messages, deadline, emit):
    keeper.acquire()
    emit({'ok': True, 'code': 'HANDLES_READY', 'heldCount': len(keeper.handles)})
    while True:
        keeper.stage = 'protocol-wait'
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise KeeperFailure('KEEPER_TIMEOUT')
        try:
            command = messages.get(timeout=remaining)
        except queue.Empty:
            raise KeeperFailure('KEEPER_TIMEOUT')
        if command is None:
            raise KeeperFailure('KEEPER_EOF')
        if command == {'command': 'confirm'}:
            keeper.confirm(min(30, remaining))
            emit({'ok': True, 'code': 'ORIGINAL_CONFIRM_VERIFIED', 'heldCount': len(keeper.handles)})
        elif command == {'command': 'release'} and keeper.confirmed:
            keeper.stage = 'release-validation'
            keeper.unchanged(final=True)
            if keeper.lifecycle._recorded_tree_absent(keeper.proof['processes']) is not True:
                raise KeeperFailure('RECORDED_PROCESSES_PRESENT')
            keeper.stage = 'handle-release'
            keeper.release()
            emit({'ok': True, 'code': 'HANDLES_RELEASED', 'heldCount': 0})
            return
        else:
            raise KeeperFailure('INVALID_COMMAND_ORDER')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    parser.add_argument('--helper-sha256', required=True)
    parser.add_argument('--script-sha256', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--timeout', type=int, default=90)
    args = parser.parse_args()
    keeper = None
    pins = contextlib.ExitStack()
    receipt = {'schemaVersion': 1, 'startedAtUtc': utc(), 'accepted': False}
    code = 'KEEPER_FAILED'
    stage = 'initialization'
    try:
        stage = 'input-validation'
        if not 1 <= args.timeout <= 300:
            raise KeeperFailure('INVALID_DEADLINE')
        deadline = time.monotonic() + args.timeout
        helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
        here = Path(__file__).resolve(strict=True)
        transport_path = here.with_name('direct-cli-receipt.py')
        policy_path = here.with_name('local-headless-desktop-check-policy.py')
        adapter = here.with_name('local-headless-desktop-check-cli.py')
        transport = load('keeper_transport', transport_path)
        transport.file_binding(helper)
        transport.file_binding(Path(args.state))
        if digest(helper) != args.helper_sha256 or digest(here) != args.script_sha256:
            raise KeeperFailure('INPUT_BINDING_CHANGED')
        bindings = {str(p): digest(p) for p in (helper, here, transport_path, policy_path, adapter)}
        source = subprocess.run(['git', '-C', str(here.parent.parent), 'rev-parse', 'HEAD'], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if source.returncode or not re.fullmatch('[a-f0-9]{40}', args.source_commit) or source.stdout.strip() != args.source_commit:
            raise KeeperFailure('SOURCE_BINDING_CHANGED')
        receipt['sourceCommit'] = args.source_commit
        stage = 'helper-import'
        lifecycle = load('keeper_lifecycle', helper)
        recorder = getattr(lifecycle, 'install_private_identity_recorder', None)
        if callable(recorder):
            recorder()
        if os.environ.get('MFE_LOWLEVEL_URL') or not os.environ.get('MFE_LOWLEVEL_CLI'):
            raise KeeperFailure('DIRECT_TRANSPORT_REQUIRED')
        stage = 'transport-validation'
        verify = transport.install_receipt_transport(lifecycle, cli=Path(os.environ['MFE_LOWLEVEL_CLI']))
        provenance = verify()
        python = Path(provenance['python']['path'])
        bindings[str(python)] = provenance['python']['sha256']
        def verify_inputs():
            verify()
            current = subprocess.run(['git', '-C', str(here.parent.parent), 'rev-parse', 'HEAD'], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if current.returncode or current.stdout.strip() != args.source_commit:
                raise KeeperFailure('SOURCE_BINDING_CHANGED')
            lifecycle._checked_private_path(Path(args.state))
            lifecycle._checked_private_path(Path(args.state).with_name('exit-processes.json'))
        stage = 'lifecycle-validation'
        state_path, state = lifecycle._read_state(args.state)
        root = lifecycle._checked_private_path(Path(state['runRoot']), directory=True)
        lifecycle._checked_private_path(state_path)
        if state_path.name != 'lifecycle.json' or state_path.parent != root or Path(state['outputRoot']) != root / 'output':
            raise KeeperFailure('INVALID_LIFECYCLE_PATH')
        proof_path = state_path.with_name('exit-processes.json')
        lifecycle._checked_private_path(proof_path)
        # Retain the exact proof file and its directory against writes/renames
        # through acquisition and the original confirmation, without pinning
        # the lifecycle file that the original adapter must update.
        pins.enter_context(lifecycle._pinned_private_directories(root, proof_path))
        stage = 'receipt-validation'
        requested_receipt = Path(args.receipt)
        lifecycle._reject_link_components(requested_receipt)
        if requested_receipt.parent != state_path.parent or not re.fullmatch(r'exit-handle-keeper(?:-[a-f0-9]{32})?\.json', requested_receipt.name) or requested_receipt.exists():
            raise KeeperFailure('INVALID_RECEIPT_DESTINATION')
        receipt_path = requested_receipt
        policy = load('keeper_policy', policy_path)
        def confirm(timeout):
            return original_confirm(python, adapter, state_path, timeout)
        stage = 'construction'
        keeper = Keeper(lifecycle, policy, NativeHandles(), state_path, proof_path, bindings, verify_inputs, confirm, deadline)
        receipt.update(bindings=bindings, lifecyclePath=str(state_path), lifecycleSha256=keeper.state_hash, proofPath=str(proof_path), proofSha256=keeper.proof_hash, processes=keeper.proof['processes'])
        messages = queue.Queue()
        def reader():
            while True:
                line = sys.stdin.readline(4097)
                if not line:
                    messages.put(None)
                    return
                try:
                    messages.put(json.loads(line) if len(line) <= 4096 else {})
                except ValueError:
                    messages.put({})
        threading.Thread(target=reader, daemon=True).start()
        serve(keeper, messages, deadline, lambda value: print(json.dumps(value), flush=True))
        receipt['accepted'] = True
        code = 'HANDLES_RELEASED'
    except BaseException as error:
        failure_stage = 'handle-release' if getattr(error, 'code', None) == 'HANDLE_RELEASE_FAILED' else (keeper.stage if keeper else stage)
        receipt['failure'] = private_failure(error, failure_stage)
        code = error.code if isinstance(error, KeeperFailure) else getattr(error, 'code', 'KEEPER_FAILED')
        code = code if isinstance(code, str) and re.fullmatch('[A-Z][A-Z0-9_]{0,79}', code) else 'KEEPER_FAILED'
        print(json.dumps({'ok': False, 'code': code, 'heldCount': len(keeper.handles) if keeper else 0}), flush=True)
    finally:
        if keeper:
            try:
                if keeper.handles:
                    keeper.release()
            except Exception as error:
                code = 'HANDLE_RELEASE_FAILED'
                receipt['releaseFailure'] = private_failure(error, 'handle-release')
                receipt['accepted'] = False
                print(json.dumps({'ok': False, 'code': code, 'heldCount': len(keeper.handles)}), flush=True)
            receipt.update(events=keeper.events, unreleasedCount=len(keeper.handles))
            try:
                receipt['finalLifecycleSha256'] = digest(keeper.state_path)
            except Exception:
                receipt['accepted'] = False
                code = 'FINAL_BINDING_UNAVAILABLE'
        receipt.update(completedAtUtc=utc(), code=code)
        if 'receipt_path' in locals():
            try:
                with lifecycle._pinned_private_directories(root, state_path):
                    encoded = json.dumps(receipt, indent=2, allow_nan=False).encode('utf-8')
                    if len(encoded) > 1048576:
                        raise KeeperFailure('PRIVATE_RECEIPT_TOO_LARGE')
                    descriptor = os.open(receipt_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0), 0o600)
                    with os.fdopen(descriptor, 'wb') as output:
                        output.write(encoded)
                        output.flush()
                        os.fsync(output.fileno())
                    lifecycle._checked_private_path(receipt_path)
                    if receipt_path.read_bytes() != encoded:
                        raise KeeperFailure('PRIVATE_RECEIPT_READBACK_FAILED')
            except Exception:
                receipt['accepted'] = False
                print(json.dumps({'ok': False, 'code': 'PRIVATE_RECEIPT_FAILED'}), flush=True)
        pins.close()
    return 0 if receipt['accepted'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
