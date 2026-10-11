"""Durable launch phase checks without invoking a GUI tool."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import contextmanager
from test_renderer_process_snapshot import load, ROOT

observer=load('launch_observer_test',ROOT/'scripts/renderer-launch-observer.py')

class Tests(unittest.TestCase):
    def test_phase_chain_is_exclusive_and_preserves_unknown_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            intent=Path(directory)/'000-intent.json';intent.write_text('{}')
            journal=observer.Journal(intent);first=journal.write('observer-bound',fixtureOnly=True)
            self.assertEqual(first['previousSha256'],hashlib.sha256(intent.read_bytes()).hexdigest())
            journal.terminal({'client_ok':False,'processLaunchOutcome':'unknown'})
            terminal=json.loads((Path(directory)/'terminal.json').read_bytes());self.assertFalse(terminal['client_ok']);self.assertEqual(terminal['processLaunchOutcome'],'unknown')
            with self.assertRaises(FileExistsError):journal.terminal({'client_ok':True})
    def test_wrong_worker_binding_stops_before_installed_tool_import(self):
        with tempfile.TemporaryDirectory() as directory:
            intent=Path(directory)/'000-intent.json';intent.write_text(json.dumps({'kind':'renderer-launch-observation','workerSha256':'0'*64}))
            observer.run(intent)
            terminal=json.loads((Path(directory)/'terminal.json').read_bytes());self.assertFalse(terminal['client_ok']);self.assertIn('source binding',terminal['error'])
            self.assertEqual(len(list(Path(directory).glob('*tool*'))),0)
    def test_actual_worker_source_validation_precedes_every_tool_phase(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);adapter=root/'adapter.py';adapter.write_text('fixture adapter')
            intent=root/'000-intent.json';intent.write_text(json.dumps({'kind':'renderer-launch-observation','workerSha256':observer.digest(observer.__file__),'adapterPath':str(adapter),'adapterSha256':'0'*64}))
            with patch.object(observer,'load',side_effect=AssertionError('No module or tool may be reached')):
                observer.run(intent)
            terminal=json.loads((root/'terminal.json').read_bytes());self.assertFalse(terminal['client_ok']);self.assertIn('source binding',terminal['error'])
            self.assertEqual(len(list(root.glob('*tool*'))),0)

if __name__=='__main__':unittest.main()
