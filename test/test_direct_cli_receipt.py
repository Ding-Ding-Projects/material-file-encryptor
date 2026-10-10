"""Transport projection tests without installed helpers, desktop or network access."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('direct_receipt', Path(__file__).resolve().parents[1] / 'scripts/direct-cli-receipt.py')
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)


class ReceiptTransport(unittest.TestCase):
    def test_noninteractive_provenance_calls_have_empty_stdin_and_original_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            scripts = root / '.venv' / 'Scripts'
            scripts.mkdir(parents=True)
            cli = scripts / 'lowlevel-computer-use-cheap.exe'
            python = scripts / 'python.exe'
            base = root / 'base-python.exe'
            dll = root / 'python313.dll'
            package = root / 'src' / 'lowlevel_computer_use_mcp'
            package.mkdir(parents=True)
            for file in [cli, python, base, dll, package / 'server.py', package / 'winio.py']:
                file.write_bytes(b'bounded fixture')
            calls = []
            def run(argv, **kwargs):
                calls.append((argv, kwargs))
                self.assertIs(kwargs['stdin'], adapter.subprocess.DEVNULL)
                if argv[0] == str(python):
                    self.assertEqual(argv[1], '-c')
                    self.assertEqual(kwargs['timeout'], 15)
                    return SimpleNamespace(returncode=0, stdout=json.dumps({'package': str(package), 'baseExecutable': str(base), 'runtimeDll': str(dll)}))
                self.assertEqual(kwargs['timeout'], 10)
                return SimpleNamespace(returncode=0, stdout='https://github.com/Ding-Ding-Projects/lowlevel-computer-use-mcp.git' if 'remote' in argv else 'a' * 40)
            with mock.patch.object(adapter.subprocess, 'run', side_effect=run):
                proof = adapter.direct_provenance(cli)
            self.assertEqual(len(calls), 3)
            self.assertEqual(proof['sourceCommit'], 'a' * 40)
            self.assertEqual(proof['python'], adapter.file_binding(python))
            self.assertEqual({Path(item['path']).name for item in proof['files']}, {'server.py', 'winio.py'})

    def fixture(self):
        writes = []
        def require(value, label):
            if not isinstance(value, dict): raise ValueError('Object required')
            return value
        def endpoint(value):
            if not value.startswith('http://127.0.0.1:'): raise ValueError('Non-loopback endpoint')
        lifecycle = SimpleNamespace(_require_object=require, _validate_endpoint=endpoint, _atomic_write_json=lambda path, state: writes.append(json.loads(json.dumps(state))))
        return lifecycle, writes

    def test_direct_write_omits_endpoint_and_read_retains_all_state_fields_for_validator(self):
        lifecycle, writes = self.fixture(); binding = {'version': 1, 'cli': {'sha256': 'a' * 64}}
        adapter.install_receipt_transport(lifecycle, cli='owned-cli', provenance=lambda _: binding)
        original = {'version': 1, 'endpoint': adapter.COMPATIBILITY_ENDPOINT, 'process': {'pid': 7}, 'unexpected': True}
        lifecycle._atomic_write_json('unused', original)
        self.assertNotIn('endpoint', writes[0]); self.assertEqual(writes[0]['transport'], 'direct-cheap-cli')
        self.assertEqual(lifecycle._require_object(writes[0], 'Lifecycle state'), original)
        self.assertEqual(lifecycle._require_object({'unrelated': True}, 'Other object'), {'unrelated': True})
        self.assertIn('endpoint', original)  # Caller state remains an in-memory projection.

    def test_direct_contamination_missing_and_stale_provenance_are_rejected(self):
        lifecycle, writes = self.fixture(); binding = {'version': 1, 'sha256': 'a' * 64}
        adapter.install_receipt_transport(lifecycle, cli='owned-cli', provenance=lambda _: binding.copy())
        valid = {'version': 1, 'transport': adapter.DIRECT_TRANSPORT, 'transportProvenance': binding.copy()}
        for change in [{'endpoint': adapter.COMPATIBILITY_ENDPOINT}, {'transport': 'persistent-http-adapter'}, {'transportProvenance': {}}, {'transportProvenance': None}]:
            with self.assertRaises(ValueError): lifecycle._require_object({**valid, **change}, 'Lifecycle state')
        for missing in ['transport', 'transportProvenance']:
            state = dict(valid); del state[missing]
            with self.assertRaises(ValueError): lifecycle._require_object(state, 'Lifecycle state')
        binding['sha256'] = 'b' * 64
        with self.assertRaises(ValueError): lifecycle._require_object(valid, 'Lifecycle state')
        with self.assertRaises(ValueError): lifecycle._atomic_write_json('unused', {'endpoint': adapter.COMPATIBILITY_ENDPOINT})
        self.assertEqual(writes, [])

    def test_http_keeps_real_endpoint_and_rejects_direct_or_changed_transport(self):
        lifecycle, writes = self.fixture(); endpoint = 'http://127.0.0.1:9999/mcp'
        adapter.install_receipt_transport(lifecycle, endpoint=endpoint)
        state = {'endpoint': endpoint, 'process': {'pid': 7}}
        self.assertIs(lifecycle._require_object(state, 'Lifecycle state'), state)
        lifecycle._atomic_write_json('unused', state); self.assertEqual(writes, [state])
        for change in [{'transport': 'direct-cheap-cli'}, {'transportProvenance': {}}, {'endpoint': adapter.COMPATIBILITY_ENDPOINT}]:
            with self.assertRaises(ValueError): lifecycle._require_object({**state, **change}, 'Lifecycle state')
            with self.assertRaises(ValueError): lifecycle._atomic_write_json('unused', {**state, **change})

    def test_transport_selection_and_invalid_in_memory_direct_states_fail_closed(self):
        for options in [{}, {'cli': 'owned', 'endpoint': 'http://127.0.0.1:9999/mcp'}]:
            lifecycle, _ = self.fixture()
            with self.assertRaises(ValueError): adapter.install_receipt_transport(lifecycle, **options)
        lifecycle, writes = self.fixture(); adapter.install_receipt_transport(lifecycle, cli='owned', provenance=lambda _: {})
        for state in [{}, {'endpoint': 'http://127.0.0.1:9999/mcp'}, {'endpoint': adapter.COMPATIBILITY_ENDPOINT, 'transport': adapter.DIRECT_TRANSPORT}]:
            with self.assertRaises(ValueError): lifecycle._atomic_write_json('unused', state)
        self.assertEqual(writes, [])

    @unittest.skipUnless(os.environ.get('MFE_TEST_LIFECYCLE_HELPER'), 'Installed-helper checks await explicit synchronized helper selection')
    def test_unchanged_installed_validator_still_rejects_identity_and_unknown_fields(self):
        helper = Path(os.environ['MFE_TEST_LIFECYCLE_HELPER'])
        helper_spec = importlib.util.spec_from_file_location('receipt_test_lifecycle', helper)
        lifecycle = importlib.util.module_from_spec(helper_spec); sys.modules[helper_spec.name] = lifecycle; helper_spec.loader.exec_module(lifecycle)
        binding = {'version': 1, 'cli': {'sha256': 'a' * 64}}
        adapter.install_receipt_transport(lifecycle, cli='owned', provenance=lambda _: binding)
        with tempfile.TemporaryDirectory() as folder:
            state_path = Path(folder) / 'lifecycle.json'
            original = {'version': 1, 'endpoint': adapter.COMPATIBILITY_ENDPOINT, 'desktop': 'owned-test', 'pid': 7,
                        'process': {'pid': 7, 'parentPid': 1, 'creationDate': '2026-10-10T00:00:00.0000000Z', 'executablePath': str(Path(sys.executable).resolve())},
                        'hwnd': None, 'created': True, 'cleaned': False, 'runRoot': folder, 'outputRoot': str(Path(folder) / 'output'), 'cdp': None}
            lifecycle._atomic_write_json(state_path, original)
            self.assertEqual(lifecycle._read_state(str(state_path))[1], original)
            saved = json.loads(state_path.read_text())
            for change in [{'endpoint': adapter.COMPATIBILITY_ENDPOINT}, {'unexpected': True}, {'pid': 8}, {'hwnd': -1}]:
                state_path.write_text(json.dumps({**saved, **change}))
                with self.assertRaises((ValueError, lifecycle.ClientFailure)): lifecycle._read_state(str(state_path))
            state_path.write_text(json.dumps(saved))
            result = lifecycle._read_state(str(state_path))[1]; result['cleaned'] = True
            lifecycle._atomic_write_json(state_path, result)
            self.assertNotIn('endpoint', json.loads(state_path.read_text()))
            self.assertTrue(lifecycle._read_state(str(state_path))[1]['cleaned'])


if __name__ == '__main__': unittest.main()
