"""Partial launch recovery admission rejects unrelated or changed executions."""
import copy
import json
from pathlib import Path
import subprocess
import os
import tempfile
import unittest
from types import SimpleNamespace

from test_renderer_process_snapshot import load, lifecycle, Fake, ROOT, native

recovery = load('recovery_test', ROOT / 'scripts/supplemental-renderer-recovery.py')


class Binding:
    def __init__(self, command):
        self.value, self.calls = command, 0
        self.owner, self.change = 77, False
    def command(self, handle):
        self.calls += 1
        return self.value + (' changed' if self.change and self.calls > 1 else '')
    def window(self, desktop, hwnd):
        if desktop != 'owned-desktop' or hwnd != 123:
            raise recovery.Error('Desktop or HWND differs')
        return {'hwnd': hwnd, 'pid': self.owner, 'threadId': 9}


class Tests(unittest.TestCase):
    def test_stdlib_and_uv_configuration_require_actual_base_identity(self):
        root = self.base
        launcher = root / 'isolated' / 'Scripts' / 'python.exe'
        base = root / 'runtime' / 'python.exe'
        base.parent.mkdir(parents=True); base.write_bytes(b'fixture')
        values = {'home':str(base.parent),'include-system-site-packages':'false','executable':str(base)}
        self.assertEqual(recovery.configured_base_interpreter(values,launcher,str(base),str(launcher)),base)
        uv = {key:value for key,value in values.items() if key != 'executable'}
        uv.update(implementation='CPython',uv='0.12.23')
        self.assertEqual(recovery.configured_base_interpreter(uv,launcher,str(base),str(launcher)),base)
        for invalid in [{**uv,'home':'relative'},{**uv,'implementation':'Other'},{**uv,'include-system-site-packages':'true'},{**uv,'uv':''},{**values,'executable':str(root/'wrong.exe')}]:
            with self.assertRaises(recovery.Error):
                recovery.configured_base_interpreter(invalid,launcher,str(base),str(launcher))
        with self.assertRaises(recovery.Error):
            recovery.configured_base_interpreter(uv,launcher,str(root/'unrelated.exe'),str(launcher))

    def test_gui_launcher_requires_exact_gui_base(self):
        root = self.base
        launcher = root / 'isolated' / 'Scripts' / 'pythonw.exe'
        base = root / 'runtime' / 'pythonw.exe'
        base.parent.mkdir(parents=True); base.write_bytes(b'fixture')
        values = {'home': str(base.parent), 'include-system-site-packages': 'false', 'implementation': 'CPython', 'uv': 'fixture'}
        self.assertEqual(recovery.configured_base_interpreter(values, launcher, str(base), str(launcher)), base)
        with self.assertRaises(recovery.Error):
            recovery.configured_base_interpreter(values, launcher, str(base.with_name('python.exe')), str(launcher))

    def test_declared_console_base_cannot_be_substituted_for_gui_base(self):
        launcher = self.base / 'isolated/Scripts/pythonw.exe'
        base = self.base / 'runtime/pythonw.exe'
        base.parent.mkdir(parents=True); base.write_bytes(b'fixture')
        values = {'home':str(base.parent),'include-system-site-packages':'false','executable':str(base.with_name('python.exe'))}
        with self.assertRaises(recovery.Error):
            recovery.configured_base_interpreter(values,launcher,str(base),str(launcher))

    def test_runtime_launcher_and_missing_base_are_rejected(self):
        launcher = self.base / 'isolated/Scripts/python.exe'
        base = self.base / 'runtime/python.exe'
        base.parent.mkdir(parents=True); base.write_bytes(b'fixture')
        values = {'home':str(base.parent),'include-system-site-packages':'false','implementation':'CPython','uv':'fixture'}
        with self.assertRaises(recovery.Error):
            recovery.configured_base_interpreter(values,launcher,str(base),str(base))
        base.unlink()
        with self.assertRaises(recovery.Error):
            recovery.configured_base_interpreter(values,launcher,str(base),str(launcher))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        exe = self.base / 'MaterialFileEncryptor.exe'
        asar = self.base / 'resources/app.asar'
        host = self.base / 'resources/native/MaterialFileEncryptor.Host.exe'
        files = {'executable': exe, 'asar': asar, 'nativeHost': host}
        for p in files.values():
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'fixed packaged bytes')
        target = {'sourceCommit': 'a' * 40, 'version': '1.148.1', 'files': {k: str(p) for k, p in files.items()}, 'hashes': {k: recovery.digest(p) for k, p in files.items()}, 'expectedUrl': (asar / 'src/renderer/index.html').as_uri()}
        profile = self.base / 'run/profile'
        profile.mkdir(parents=True)
        original = {'verifierSourceCommit': '42ac12712b3aa8fd49765adcf14399c0cbee1e63', 'target': target, 'runnerAttempted': True, 'connectionOwned': False}
        originals = {}
        for key, value in [('prepared', original), ('failure', original), ('outcome', {'launchAttempted': True, 'stateAvailable': False, 'runRoot': str(profile.parent), 'closure': {'resourcesAbsent': False}})]:
            p = self.base / (key + '.json')
            p.write_text(json.dumps(value))
            originals[key] = {'path': str(p), 'sha256': recovery.digest(p)}
        self.root = {'pid': 77, 'parentPid': 1, 'creationDate': '2026-10-09T12:00:00.1234567Z', 'executablePath': str(exe)}
        self.request = {'version': 1, 'kind': 'supplemental-partial-launch-recovery', 'verifierSourceCommit': 'b' * 40, 'root': self.root, 'desktop': 'owned-desktop', 'hwnd': 123, 'profile': str(profile), 'port': 9222, 'target': target, 'originals': originals}
        self.api = Fake(rows={77: 1}, observations={77: self.root})
        self.proof = recovery.snapshot.Proof(lifecycle, self.api)
        self.binding = Binding(subprocess.list2cmdline([str(exe), '--desktop-check', '--verification-profile=' + str(profile), '--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1']))
        self.receipt = self.base / 'supplemental.json'
    def backend(self, request=None):
        return recovery.Recovery(lifecycle, request or self.request, self.receipt, proof=self.proof, binding=self.binding, source='b' * 40)
    def run_tcp(self, *args, **kwargs):
        return SimpleNamespace(stdout='TCP 127.0.0.1:9222 0.0.0.0:0 LISTENING 77\n')
    def fetch(self, url):
        return json.dumps([{'id': 'page1', 'type': 'page', 'url': self.request['target']['expectedUrl'], 'webSocketDebuggerUrl': 'ws://127.0.0.1:9222/devtools/page/page1'}]).encode()
    def test_preparation_is_exclusive_separate_and_never_closure(self):
        result = self.backend().prepare(run=self.run_tcp, fetch=self.fetch)
        self.assertFalse(result['originalResourcesAbsent'])
        self.assertFalse(result['pageActionsAllowed'])
        self.assertFalse(result['connectionOwned'])
        self.assertTrue(result['before']['observedAt'].endswith('Z'))
        self.assertEqual(result['targetProof']['listenerOwnerPid'], 77)
        self.assertFalse(Path(str(self.receipt) + '.native-v1.json').exists())
        recovery.Recovery.from_receipt(lifecycle, self.receipt, proof=self.proof, binding=self.binding, source='b' * 40)
        with self.assertRaises(FileExistsError):
            self.backend().prepare(run=self.run_tcp, fetch=self.fetch)
    def test_wrong_identity_profile_desktop_hash_source_and_original_binding(self):
        variants = []
        for key, value in [('desktop', 'other'), ('profile', str(self.base / 'other')), ('verifierSourceCommit', 'c' * 40)]:
            r = copy.deepcopy(self.request); r[key] = value; variants.append(r)
        for key, value in [('pid', 999), ('creationDate', '2026-10-09T12:00:00.1234568Z')]:
            r = copy.deepcopy(self.request); r['root'][key] = value; variants.append(r)
        r = copy.deepcopy(self.request); r['target']['hashes']['asar'] = '0' * 64; variants.append(r)
        r = copy.deepcopy(self.request); r['target']['sourceCommit'] = 'd' * 40; variants.append(r)
        r = copy.deepcopy(self.request); del r['originals']['failure']; variants.append(r)
        for r in variants:
            with self.subTest(request=r), self.assertRaises((recovery.Error, native.SnapshotError)):
                self.backend(r).prepare(run=self.run_tcp, fetch=self.fetch)
        self.assertFalse(self.receipt.exists())
    def test_changed_bytes_command_unknown_and_wrong_window_owner_reject(self):
        b = self.backend()
        p = Path(self.request['target']['files']['asar']); p.write_bytes(b'changed')
        with self.assertRaises(recovery.Error): b.observe()
        p.write_bytes(b'fixed packaged bytes')
        self.binding.change = True
        with self.assertRaises((recovery.Error, native.SnapshotError)): self.backend().observe()
        self.binding.change = False; self.binding.owner = 999
        with self.assertRaises(recovery.Error): self.backend().observe()
        self.binding.owner = 77; self.api.unknown = True
        with self.assertRaises(native.SnapshotError): self.backend().observe()
    def test_listener_swap_during_fetch_never_publishes_receipt(self):
        owner = [77]
        def run(*args, **kwargs):
            return SimpleNamespace(stdout=f'TCP 127.0.0.1:9222 0.0.0.0:0 LISTENING {owner[0]}\n')
        def fetch(url):
            owner[0] = 999
            return self.fetch(url)
        with self.assertRaises(recovery.Error): self.backend().prepare(run=run, fetch=fetch)
        self.assertFalse(self.receipt.exists())
    def test_original_bytes_changed_after_admission_reject(self):
        self.backend().prepare(run=self.run_tcp, fetch=self.fetch)
        Path(self.request['originals']['outcome']['path']).write_text('{}')
        with self.assertRaises(recovery.Error):
            recovery.Recovery.from_receipt(lifecycle, self.receipt, proof=self.proof, binding=self.binding, source='b' * 40)
    def test_closure_requires_process_port_and_exact_desktop_absence(self):
        b = self.backend(); admitted = b.prepare(run=self.run_tcp, fetch=self.fetch)
        tree = admitted['after']['nativeProcesses']
        no_ports = lambda *a, **k: SimpleNamespace(stdout='')
        missing = lambda name: (None, 2)
        self.assertFalse(b.confirm_exit(tree, timeout=0, run=no_ports, desktop_observer=missing)['resourcesAbsent'])
        self.api.observations = {}; self.api.rows = {}
        self.assertTrue(b.confirm_exit(tree, timeout=0, run=no_ports, desktop_observer=missing)['resourcesAbsent'])
        for desktop in [lambda name: (123, None), lambda name: (None, 5)]:
            self.assertFalse(b.confirm_exit(tree, timeout=0, run=no_ports, desktop_observer=desktop)['resourcesAbsent'])
        self.assertFalse(b.confirm_exit(tree, timeout=0, run=self.run_tcp, desktop_observer=missing)['resourcesAbsent'])
        with self.assertRaises(lifecycle.ClientFailure):
            b.confirm_exit([{**tree[0], 'pid': 999}], timeout=0, run=no_ports, desktop_observer=missing)
    @unittest.skipUnless(os.name == 'nt', 'Native command observation requires Windows')
    def test_actual_held_self_command_bookends(self):
        api = recovery.snapshot.Native()
        with api.handle(os.getpid()) as handle:
            parent = api.inventory()[os.getpid()]
            before = api.observe(handle, os.getpid(), parent)
            binding = recovery.NativeBinding()
            command = binding.command(handle)
            self.assertIn('python', command.lower())
            self.assertEqual(binding.command(handle), command)
            self.assertEqual(api.observe(handle, os.getpid(), parent), before)
    def test_exact_client_direct_and_single_launcher_routes(self):
        node = {**self.root, 'pid': 80, 'parentPid': 1, 'executablePath': 'C:/node.exe', 'creationDate': '2026-10-09T12:00:00.1234560Z'}
        launcher = {**self.root, 'pid': 79, 'parentPid': 80, 'executablePath': 'C:/venv/python.exe', 'creationDate': '2026-10-09T12:00:00.1234561Z'}
        own = {**self.root, 'pid': 77, 'parentPid': 79, 'executablePath': 'C:/base/python.exe'}
        configuration = {'selfPid':77,'base':own['executablePath'],'launcher':launcher['executablePath'],'node':node['executablePath'],'command':'exact adapter invocation','baseCommand':'exact adapter invocation','files':{'fixed':'hash'}}
        observations = {77:own,79:launcher,80:node}
        api = Fake(rows={77:79,79:80,80:1}, observations=observations)
        class Commands:
            def command(self, handle): return 'node invocation' if handle == 80 else configuration['command']
        binding = Commands()
        with recovery.owning_client(80,api=api,binding=binding,configuration=configuration) as (client,chain):
            self.assertEqual(client['clientIdentity'],node); self.assertEqual(len(chain),3)
        with recovery.owning_client(80,client,api=api,binding=binding,configuration=configuration): pass
        for field,value in [('executablePath','C:/unrelated.exe'),('creationDate','2026-10-09T12:00:00.1234569Z')]:
            bad = {**observations,79:{**launcher,field:value}}
            with self.assertRaises(recovery.Error), recovery.owning_client(80,client,api=Fake(rows=api.rows,observations=bad),binding=binding,configuration=configuration): pass
        class WrongCommand(Commands):
            def command(self,handle): return 'unrelated command' if handle==79 else super().command(handle)
        with self.assertRaises(recovery.Error), recovery.owning_client(80,client,api=api,binding=WrongCommand(),configuration=configuration): pass
        with self.assertRaises(recovery.Error) as captured:
            with recovery.owning_client(80,client,api=api,binding=WrongCommand(),configuration=configuration): pass
        self.assertEqual(captured.exception.launcherDiagnostic['actualCommand'], 'unrelated command')
        self.assertTrue(captured.exception.launcherDiagnostic['imageMatches'])
        self.assertFalse(captured.exception.launcherDiagnostic['commandMatches'])
        changed={**client,'clientIdentity':{**node,'creationDate':'2026-10-09T12:00:00.1234559Z'}}
        with self.assertRaises(recovery.Error), recovery.owning_client(80,changed,api=api,binding=binding,configuration=configuration): pass
        own_direct={**own,'parentPid':80}
        with recovery.owning_client(80,api=Fake(rows={77:80,80:1},observations={77:own_direct,80:node}),binding=binding,configuration=configuration) as (_,chain): self.assertEqual(len(chain),2)
        with self.assertRaises(recovery.Error), recovery.owning_client(999,api=api,binding=binding,configuration=configuration): pass
        redirected = {**configuration, 'baseCommand':'"C:/base/python.exe" exact arguments'}
        class RedirectedCommand(Commands):
            def command(self,handle): return redirected['baseCommand'] if handle==77 else super().command(handle)
        with recovery.owning_client(80,api=api,binding=RedirectedCommand(),configuration=redirected): pass
        with self.assertRaises(recovery.Error), recovery.owning_client(80,api=api,binding=binding,configuration=redirected): pass
        for pid,command in [(77,configuration['command']),(77,redirected['baseCommand']+' extra'),(79,redirected['baseCommand']),(79,configuration['command']+' extra')]:
            class AlteredCommand(RedirectedCommand):
                def command(self,handle): return command if handle==pid else super().command(handle)
            with self.assertRaises(recovery.Error), recovery.owning_client(80,api=api,binding=AlteredCommand(),configuration=redirected): pass
        missing = {key:value for key,value in redirected.items() if key!='baseCommand'}
        with self.assertRaises(KeyError), recovery.owning_client(80,api=api,binding=binding,configuration=missing): pass


if __name__ == '__main__':
    unittest.main()
