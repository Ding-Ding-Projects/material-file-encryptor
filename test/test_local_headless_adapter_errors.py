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
 def __init__(self, code, message): self.code=code; self.reasonCode='CHILD_PREDATES_PARENT'; self.stage='ancestry'; super().__init__(message)
def _validate_endpoint(endpoint): pass
def _require_object(value,label): return value
def _atomic_write_json(path,value): raise RuntimeError('Unexpected write')
def _connect(endpoint, timeout): return object()
def _read_state(path): return Path(path), {'process':{}, 'cleaned':False, 'desktop':'owned', 'endpoint':'http://127.0.0.1:8765/mcp'}
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
                result = subprocess.run([sys.executable, '-B', os.environ.get('MFE_ADAPTER_TEST_SCRIPT', str(ROOT / 'scripts/local-headless-desktop-check-cli.py')), *arguments], capture_output=True, text=True, env={**os.environ, 'MFE_LOWLEVEL_CLIENT':str(helper), 'MFE_LOWLEVEL_CLI':'', 'MFE_LOWLEVEL_URL':'http://127.0.0.1:8765/mcp', 'ADAPTER_MOCK_PHASE':phase})
                self.assertNotEqual(result.returncode, 0)
                payload = json.loads(result.stdout)
                self.assertEqual(payload['code'], 'UNPROVEN_PROCESS_ANCESTRY')
                self.assertFalse(payload['client_ok'])
                self.assertEqual(payload['reasonCode'], 'CHILD_PREDATES_PARENT')
                self.assertEqual(payload['stage'], 'ancestry')
                self.assertEqual(result.stderr, '')
                self.assertNotIn('private-path', result.stdout)
                self.assertNotIn(scratch, result.stdout)

    def test_optional_identity_recorder_and_bounded_counts_on_actual_adapter(self):
        cases = [('old', None), ('new', {'privateEvidenceCount':1,'privateEvidenceUnavailableCount':0}), ('invalid', {'privateEvidenceCount':True,'privateEvidenceUnavailableCount':1000001}), ('negative', {'privateEvidenceCount':-1,'privateEvidenceUnavailableCount':'1'}), ('float', {'privateEvidenceCount':1.5,'privateEvidenceUnavailableCount':None}), ('bounded', {'privateEvidenceCount':1000000,'privateEvidenceUnavailableCount':0})]
        for name, counts in cases:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as scratch:
                root=Path(scratch); helper=root/'helper.py'; marker=root/'installed'
                source='''from pathlib import Path
class ClientFailure(Exception):
 def __init__(self):
  self.code='PROCESS_IDENTITY_CHANGED'; self.stage='owner-revalidation'; self.identity={'raw':'IDENTITY_SENTINEL'}; self.path='PATH_SENTINEL'
  super().__init__('MESSAGE_SENTINEL')
def _connect(endpoint, timeout): raise RuntimeError('Connection must not run')
def _validate_endpoint(endpoint): pass
def _require_object(value,label): return value
def _atomic_write_json(path,value): raise RuntimeError('Write must not run')
def _read_state(path): return Path(path), {'process':{},'cleaned':True,'desktop':'owned','endpoint':'http://127.0.0.1:8765/mcp'}
def _validate_process_tree(root,processes): pass
def _recorded_tree_absent(processes): raise RuntimeError('Absence must not run')
def _cmd_cleanup(args):
 error=ClientFailure()
 COUNTS
 raise error
def _parser():
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('command');parser.add_argument('--state');return parser
'''.replace(' COUNTS',''.join('\n error.'+key+'='+repr(value) for key,value in (counts or {}).items()))
                if name!='old': source+='\ndef install_private_identity_recorder():\n global _read_state\n previous=_read_state\n Path('+repr(str(marker))+').write_text("installed")\n def observed(path):\n  Path('+repr(str(marker))+').write_text("installed-read")\n  return previous(path)\n _read_state=observed\n'
                helper.write_text(source)
                result=subprocess.run([sys.executable,'-B',str(ROOT/'scripts/local-headless-desktop-check-cli.py'),'cleanup','--state',str(root/'state.json')],capture_output=True,text=True,env={**os.environ,'MFE_LOWLEVEL_CLIENT':str(helper),'MFE_LOWLEVEL_CLI':'','MFE_LOWLEVEL_URL':'http://127.0.0.1:8765/mcp'})
                self.assertEqual(result.returncode,1); self.assertEqual(result.stderr,''); payload=json.loads(result.stdout)
                self.assertEqual(payload['code'],'PROCESS_IDENTITY_CHANGED');self.assertFalse(payload['client_ok']);self.assertEqual(marker.exists(),name!='old')
                if name!='old':self.assertEqual(marker.read_text(),'installed-read')
                for sentinel in ['IDENTITY_SENTINEL','PATH_SENTINEL','MESSAGE_SENTINEL',scratch]:self.assertNotIn(sentinel,result.stdout)
                if name in ('new','bounded'):self.assertEqual(payload['privateEvidenceCount'],counts['privateEvidenceCount']);self.assertEqual(payload['privateEvidenceUnavailableCount'],0)
                else:self.assertNotIn('privateEvidenceCount',payload);self.assertNotIn('privateEvidenceUnavailableCount',payload)

    def test_existing_edge_counts_are_not_added_again(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location('adapter_counts',ROOT/'scripts/local-headless-desktop-check-cli.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.private_evidence_counts={'saved':1,'unavailable':0}
        first=module.sanitized_failure('UNPROVEN_PROCESS_ANCESTRY',{'raw':'SENTINEL'})
        second=module.sanitized_failure(first['code'],first)
        self.assertEqual(first,second);self.assertEqual(second['privateEvidenceCount'],1);self.assertNotIn('SENTINEL',json.dumps(second))

if __name__ == '__main__': unittest.main()
