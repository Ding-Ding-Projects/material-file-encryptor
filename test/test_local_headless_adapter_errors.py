"""Offline CLI error-boundary regressions with a fake lifecycle helper."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
class AdapterErrors(unittest.TestCase):
    def test_prepare_exit_and_cleanup_preserve_exact_sanitized_failure(self):
        for command, phase in [('prepare-exit','tree'), ('cleanup','tree'), ('cleanup','handler'), ('preflight','main')]:
            with self.subTest(command=command, phase=phase), tempfile.TemporaryDirectory() as scratch:
                root = Path(scratch)
                helper = root / 'helper.py'
                helper.write_text("""from pathlib import Path
import os
class ClientFailure(Exception):
 def __init__(self, code, message): self.code=code; super().__init__(message)
def _read_state(path): return Path(path), {'process':{}, 'cleaned':False, 'desktop':'owned'}
def _process_tree(identity):
 if os.environ['ADAPTER_MOCK_PHASE']=='tree': raise ClientFailure('UNPROVEN_PROCESS_ANCESTRY', 'private-path raw diagnostic')
 return [{}]
def _validate_process_tree(root, processes): pass
def _recorded_tree_absent(processes): raise RuntimeError('Absence must not run')
def main(): raise ClientFailure('UNPROVEN_PROCESS_ANCESTRY', 'private-path raw diagnostic')
def _parser():
 import argparse
 parser=argparse.ArgumentParser(); parser.add_argument('command'); parser.add_argument('--state'); return parser
def _cmd_cleanup(args): raise ClientFailure('UNPROVEN_PROCESS_ANCESTRY', 'private-path raw diagnostic')
""")
                cli = root / 'cli'; cli.touch()
                arguments = [command, str(root / 'state.json')] if command == 'prepare-exit' else [command, '--state', str(root / 'state.json')]
                result = subprocess.run([sys.executable, '-B', os.environ.get('MFE_ADAPTER_TEST_SCRIPT', str(ROOT / 'scripts/local-headless-desktop-check-cli.py')), *arguments], capture_output=True, text=True, env={**os.environ, 'MFE_LOWLEVEL_CLIENT':str(helper), 'MFE_LOWLEVEL_CLI':str(cli), 'ADAPTER_MOCK_PHASE':phase})
                self.assertNotEqual(result.returncode, 0)
                payload = json.loads(result.stdout)
                self.assertEqual(payload['code'], 'UNPROVEN_PROCESS_ANCESTRY')
                self.assertFalse(payload['client_ok'])
                self.assertEqual(result.stderr, '')
                self.assertNotIn('private-path', result.stdout)
                self.assertNotIn(scratch, result.stdout)

if __name__ == '__main__': unittest.main()
