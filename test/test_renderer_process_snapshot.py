"""Native identity and absence checks without browser mutation."""
import importlib.util
from contextlib import contextmanager
import os
from pathlib import Path
import subprocess
import sys
import unittest
import tempfile
import json
import hashlib
import argparse
import socket
import threading
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


lifecycle = load('snapshot_lifecycle', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
native = load('native_snapshot', ROOT / 'scripts/renderer-process-snapshot.py')
identity = {'pid': 77, 'parentPid': 1, 'creationDate': '2026-10-09T12:00:00.1234567Z', 'executablePath': 'C:/owned/app.exe'}
child = {**identity, 'pid': 78, 'parentPid': 77, 'creationDate': '2026-10-09T12:00:00.1234568Z'}


class Fake:
    def __init__(self, rows=None, observations=None):
        self.rows = rows if rows is not None else {77: 1, 78: 77}
        self.observations = observations if observations is not None else {77: identity, 78: child}
        self.calls = 0
        self.change_inventory = self.change_identity = self.unknown = False
        self.stopped = False
        self.closed = []

    @contextmanager
    def handle(self, pid):
        if self.unknown:
            raise native.SnapshotError('Access denied')
        try:
            yield pid if pid in self.observations else None
        finally:
            self.closed.append(pid)

    def inventory(self):
        self.calls += 1
        return {**self.rows, **({79: 77} if self.change_inventory and self.calls > 1 else {})}

    def exited(self, handle):
        return self.stopped

    def observe(self, handle, pid, parent, allow_exited=False):
        if handle is None:
            raise native.SnapshotError('Process disappeared')
        value = {**self.observations[pid], 'parentPid': parent}
        if self.change_identity and self.calls > 1:
            value['creationDate'] = '2026-10-09T12:00:00.1234569Z'
        return value


class SnapshotTests(unittest.TestCase):
    def test_backend_marker_mismatch_missing_and_old_receipts_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lifecycle.json'
            local = load('marker_lifecycle', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
            backend = native.RendererNativeBackend(local, path, 'a' * 40, local.__file__, fresh_launch=True, api=Fake())
            state = {'process': identity}
            backend.launch_identity = identity
            backend.write(path, state)
            marker = native.marker_path(path)
            saved = marker.read_bytes()
            backend.verify(state)
            for field, value in [('backend', 'cim'), ('sourceCommit', 'b' * 40), ('helperSha256', '0' * 64), ('rootIdentity', child)]:
                changed = json.loads(saved)
                changed[field] = value
                marker.write_text(json.dumps(changed))
                with self.subTest(field=field), self.assertRaises(native.SnapshotError):
                    backend.verify(state)
            marker.write_bytes(saved)
            with self.assertRaises(native.SnapshotError):
                native.RendererNativeBackend(local, path, 'a' * 40, local.__file__, fresh_launch=True, api=Fake())
            marker.unlink()
            with self.assertRaises(FileNotFoundError):
                backend.verify(state)

    @unittest.skipUnless(os.name == 'nt', 'Requires actual Windows native process and listener APIs')
    def test_fresh_backend_production_launch_and_owned_listener_seams(self):
        local = load('fresh_lifecycle', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / 'lifecycle.json'
            with socket.socket() as reservation:
                reservation.bind(('127.0.0.1', 0))
                port = reservation.getsockname()[1]
            expected_url = 'http://127.0.0.1:49151/'
            child_code = '''import http.server,json,sys,threading
port=int(sys.argv[1])
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  body=json.dumps([{'type':'page','url':'http://127.0.0.1:49151/','webSocketDebuggerUrl':'ws://127.0.0.1:'+str(port)+'/devtools/page/fixture'}]).encode()
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=http.server.HTTPServer(('127.0.0.1',port),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
print('ready',flush=True)
sys.stdin.buffer.read(1)
server.shutdown();server.server_close()
'''
            request = root / 'request.json'
            request.write_text(json.dumps({'desktop':'fixture-native-owned','executable':sys.executable,'arguments':['-c','exec('+repr(child_code)+')',str(port)],'runRoot':str(root),'outputRoot':str(root / 'out'),'cdp':{'port':port,'expectedUrl':expected_url}}))
            # Simulate only Lowlevel launch transport. The launched child,
            # installed production handler, native identities, listener and
            # HTTP response are real; this does not prove hidden GUI launch.
            process = None
            class Transport:
                def call_tool(self, name, params):
                    nonlocal process
                    if name == 'list_headless_windows':
                        return {'client_ok':False,'error':"OpenDesktopW('fixture-native-owned') failed (GetLastError=2:"}
                    if name != 'launch_on_headless_desktop':
                        raise AssertionError('Unexpected transport operation')
                    process = subprocess.Popen(params['command'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
                    ready = []
                    worker = threading.Thread(target=lambda: ready.append(process.stdout.readline()), daemon=True)
                    worker.start();worker.join(timeout=5)
                    if ready != [b'ready\r\n'] and ready != [b'ready\n']:
                        raise AssertionError('Owned listener fixture did not become ready')
                    return {'client_ok':True,'pid':process.pid}
            local._connect = lambda endpoint, timeout: Transport()
            backend = native.RendererNativeBackend(local,state_path,'a'*40,local.__file__,fresh_launch=True).install()
            try:
                result = local._cmd_launch(argparse.Namespace(input=str(request),state=str(state_path),overwrite_state=False,url='http://127.0.0.1:49152/mcp',timeout=5))
                self.assertTrue(result['client_ok'])
                _, state = local._read_state(state_path)
                self.assertEqual(state['process'], backend.proof.identity(process.pid))
                self.assertFalse(local._recorded_tree_absent([state['process']]))
                target = native.prove_renderer_target(backend)
                self.assertEqual(target['listenerOwnerPid'], process.pid)
                self.assertEqual(target['exactUrl'], expected_url)
                bad_run = lambda *args, **kwargs: SimpleNamespace(stdout=f'TCP 127.0.0.1:{port} 0.0.0.0:0 LISTENING 1')
                with self.assertRaises(native.SnapshotError):
                    native.prove_renderer_target(backend,run=bad_run)
                with self.assertRaises(native.SnapshotError):
                    native.prove_renderer_target(backend,fetch=lambda endpoint:b'[]')
                # A separate invocation reads the exact provenance sidecar.
                reread = load('fresh_second_lifecycle', Path(local.__file__))
                second = native.RendererNativeBackend(reread,state_path,'a'*40,reread.__file__).install()
                self.assertEqual(reread._read_state(state_path)[1]['process'],state['process'])
                self.assertEqual(second.tree(state['process'])[0],state['process'])
            finally:
                if process:
                    process.stdin.close()
                    self.assertEqual(process.wait(timeout=10),0)
                    process.stdout.close();process._handle.Close()

    def test_precision_bridge_preserves_original_and_records_both_identities(self):
        precise = {**identity, 'creationDate': '2026-10-09T12:00:00.1234568Z'}
        api = Fake(observations={77: precise, 78: {**child, 'creationDate': '2026-10-09T12:00:00.1234569Z'}})
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'lifecycle.json'
            original = json.dumps({'process': identity}).encode()
            receipt.write_bytes(original)
            bridge = native.supplemental_precision_bridge(lifecycle, receipt, api, lambda pid: identity)
            self.assertEqual(receipt.read_bytes(), original)
            self.assertEqual(bridge['originalReceiptSha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual(bridge['precisionDifferenceTicks'], 1)
            self.assertFalse(bridge['legacyExactCompatibility'])
            self.assertEqual(bridge['nativeIdentity'], precise)
            for changed in [{**identity, 'creationDate': precise['creationDate']}, {**identity, 'parentPid': 2}]:
                with self.subTest(changed=changed), self.assertRaises(native.SnapshotError):
                    native.supplemental_precision_bridge(lifecycle, receipt, api, lambda pid: changed)
            changed_api = Fake(observations={77: precise, 78: {**child, 'creationDate': '2026-10-09T12:00:00.1234569Z'}})
            changed_api.change_identity = True
            with self.assertRaises((native.SnapshotError, lifecycle.ClientFailure)):
                native.supplemental_precision_bridge(lifecycle, receipt, changed_api, lambda pid: identity)

    def test_tree_keeps_protocol_and_closes_handles(self):
        api = Fake()
        self.assertEqual(native.Proof(lifecycle, api).tree(identity), [identity, child])
        self.assertEqual(set(api.closed), {77, 78})

    def test_races_and_unknown_remain_unverified(self):
        for flag in ['change_inventory', 'change_identity', 'unknown']:
            api = Fake()
            setattr(api, flag, True)
            with self.subTest(flag=flag), self.assertRaises(native.SnapshotError):
                native.Proof(lifecycle, api).tree(identity)
        api = Fake()
        api.unknown = True
        with self.assertRaises(native.SnapshotError):
            native.Proof(lifecycle, api).absent([identity])

    def test_invalid_parent_order_wrong_format_and_missing_child(self):
        for changed in [{**child, 'creationDate': '2026-10-09T12:00:00.1234566Z'}, {**child, 'creationDate': '10/09/2026 12:00:00'}]:
            with self.subTest(changed=changed), self.assertRaises(lifecycle.ClientFailure):
                native.Proof(lifecycle, Fake(observations={77: identity, 78: changed})).tree(identity)
        with self.assertRaises(native.SnapshotError):
            native.Proof(lifecycle, Fake(observations={77: identity})).tree(identity)

    def test_absence_requires_inventory_and_handle_agreement(self):
        self.assertTrue(native.Proof(lifecycle, Fake({}, {})).absent([identity]))
        self.assertFalse(native.Proof(lifecycle, Fake()).absent([identity]))
        for api in [Fake({}, {77: identity}), Fake({77: 1}, {}), Fake({77: 1}, {77: {**identity, 'executablePath': 'C:/other.exe'}})]:
            with self.subTest(api=api), self.assertRaises(native.SnapshotError):
                native.Proof(lifecycle, api).absent([identity])

    def test_signalled_exact_identity_is_distinct_from_pid_absence(self):
        api = Fake({}, {77: identity})
        api.stopped = True
        proof = native.Proof(lifecycle, api)
        self.assertTrue(proof.absent([identity]))
        self.assertEqual(proof.last_absence['exitedObjectCount'], 1)
        self.assertEqual(proof.last_absence['pidAbsentCount'], 0)
        self.assertEqual(proof.last_absence['recordedExecutionVerdicts'][0]['verdict'], 'exited-object-observed')
        api.stopped = False
        with self.assertRaises(native.SnapshotError):
            proof.absent([identity])
        self.assertIsNone(proof.last_absence)

    @unittest.skipUnless(os.name == 'nt', 'Requires actual Windows native APIs')
    def test_native_self_and_owned_child(self):
        api = native.Native()
        rows = api.inventory()
        with api.handle(os.getpid()) as handle:
            root = api.observe(handle, os.getpid(), rows[os.getpid()])
        lifecycle._validate_process_identity(root)
        with subprocess.Popen([sys.executable, '-c', 'import sys; sys.stdin.buffer.read(1)'], stdin=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW) as process:
            try:
                proof = native.Proof(lifecycle, api)
                child_root = proof.identity(process.pid)
                self.assertEqual(child_root['parentPid'], root['pid'])
                tree = proof.tree(child_root)
                self.assertIn(process.pid, [item['pid'] for item in tree])
                recorded = [item for item in tree if item['pid'] == process.pid]
                self.assertFalse(proof.absent(recorded))
            finally:
                # Explicit EOF lets only this owned fixture finish itself.
                process.stdin.close()
                self.assertEqual(process.wait(timeout=10), 0)
            # Windows may keep an exited process object accessible while this
            # test owns Popen's original handle. Missing image proof stays
            # unknown; release only that completed child's local handle.
            try:
                exited = proof.absent(recorded)
            except native.SnapshotError:
                self.assertIsNone(proof.last_absence)
            else:
                self.assertTrue(exited)
                self.assertTrue(proof.last_absence['recordedProcessesExited'])
            process._handle.Close()
        try:
            result = proof.absent(recorded)
        except native.SnapshotError as error:
            self.assertEqual(str(error), 'Process executable identity is unavailable.')
            self.assertIsNone(proof.last_absence)
        else:
            self.assertTrue(result)
            self.assertTrue(proof.last_absence['recordedProcessesExited'])

    @unittest.skipUnless(os.name == 'nt', 'Requires actual Windows PowerShell serialization')
    def test_filetime_matches_powershell_seven_fraction_utc(self):
        ticks = 134044848001234567
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', f"[datetime]::FromFileTimeUtc({ticks}).ToString('o', [Globalization.CultureInfo]::InvariantCulture)"], capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW, check=True)
        self.assertEqual(native.creation_date(ticks), result.stdout.strip())


if __name__ == '__main__':
    unittest.main()
