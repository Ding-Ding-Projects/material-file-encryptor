"""Non-launch coverage for the observer's installed input contract."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
import tempfile

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

observer = load('stdin_observer', ROOT / 'scripts/renderer-launch-observer.py')
class InputContractTests(unittest.TestCase):
    def test_handwritten_launch_inventory_rejects_missing_and_changed_resolvers(self):
        names=['renderer-launch-observer.mjs','renderer-launch-observer.py','renderer-native-path.mjs','renderer-native-path.py','supplemental-renderer-recovery.py','renderer-process-snapshot.py']
        with tempfile.TemporaryDirectory(prefix='mfe-observer-inventory-') as directory:
            root=Path(directory)
            for name in names:
                (root/name).write_bytes((ROOT/'scripts'/name).read_bytes() if name=='renderer-launch-observer.py' else b'synthetic verifier bytes')
            copied=load('copied_inventory_observer',root/'renderer-launch-observer.py')
            hashes={str(root/name):copied.digest(root/name) for name in names}
            copied.validate_verifier_inventory({'verifierHashes':hashes})
            for name in ['renderer-native-path.mjs','renderer-native-path.py']:
                missing=dict(hashes);del missing[str(root/name)]
                with self.assertRaisesRegex(RuntimeError,'inventory differs'):
                    copied.validate_verifier_inventory({'verifierHashes':missing})
                original=(root/name).read_bytes();(root/name).write_bytes(b'changed synthetic verifier')
                with self.assertRaisesRegex(RuntimeError,'inventory differs'):
                    copied.validate_verifier_inventory({'verifierHashes':hashes})
                (root/name).write_bytes(original)
    def test_real_installed_reader_and_restore(self):
        installed = Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py'
        if not installed.is_file():
            self.skipTest('Installed lifecycle reader unavailable')
        life = load('stdin_installed_lifecycle', installed)
        original = sys.stdin
        request = {'executable': 'synthetic executable', 'arguments': ['non-ASCII: 測試']}
        class Fixture:
            def _parser(self):
                return self
            def parse_args(self, args):
                assert args == ['launch', '--state', 'synthetic-state']
                assert isinstance(sys.stdin, io.TextIOWrapper)
                assert sys.stdin.isatty() is False
                return args
            def _cmd_launch(self, args):
                return life._read_json_source(None)
        self.assertEqual(observer.launch_with_input(Fixture(), request, 'synthetic-state'), request)
        self.assertIs(sys.stdin, original)

    def test_exception_restores_original_input_without_tool_calls(self):
        original = sys.stdin
        class Fixture:
            def _parser(self):
                assert sys.stdin.isatty() is False
                raise RuntimeError('Synthetic parser rejection')
            def _cmd_launch(self, args):
                raise AssertionError('Launch must not be called')
        with self.assertRaisesRegex(RuntimeError, 'Synthetic parser rejection'):
            observer.launch_with_input(Fixture(), {}, 'synthetic-state')
        self.assertIs(sys.stdin, original)

if __name__ == '__main__':
    unittest.main()
