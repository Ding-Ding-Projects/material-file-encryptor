"""Private edge recording uses filesystem fixtures, never a live process or desktop."""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('edge_adapter', Path(__file__).resolve().parents[1] / 'scripts/local-headless-desktop-check-cli.py')
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)


class PrivateEdge(unittest.TestCase):
    def fixture(self, directory, reason='CHILD_PREDATES_PARENT'):
        root = Path(directory).resolve()
        identity = lambda pid, parent, tick: {'pid': pid, 'parentPid': parent, 'creationDate': '2026-10-09T00:00:00.' + str(tick).zfill(7) + 'Z', 'executablePath': str(root / 'private-app.exe')}
        parent, child = identity(7, 1, 2), identity(8, 7, 1)
        edge = {'reasonCode': reason, 'stage': 'ancestry', 'childIdentity': child, 'claimedParentPid': 7,
                'parentIdentity': parent if reason == 'CHILD_PREDATES_PARENT' else None,
                'parentPresent': reason == 'CHILD_PREDATES_PARENT', 'childCreationTicks': 1,
                'parentCreationTicks': 2 if reason == 'CHILD_PREDATES_PARENT' else None,
                'ordering': reason if reason == 'CHILD_PREDATES_PARENT' else 'PARENT_ABSENT'}
        class Failure(Exception):
            def __init__(self):
                super().__init__('Raw native detail must stay private')
                self.code = 'UNPROVEN_PROCESS_ANCESTRY'; self.reason_code = reason; self.stage = 'ancestry'; self.rejected_edge = edge
        error = Failure()
        state = {'runRoot': str(root), 'outputRoot': str(root / 'output'), 'created': True, 'cleaned': False, 'process': parent}
        state_path = root / 'lifecycle.json'; state_path.write_text(json.dumps(state), encoding='utf-8')
        def read_state(value): return Path(value), json.loads(Path(value).read_text(encoding='utf-8'))
        def validate_identity(value):
            if not isinstance(value, dict) or set(value) != {'pid', 'parentPid', 'creationDate', 'executablePath'}: raise ValueError('Invalid identity')
        def validate(root_identity, tree): raise error
        lifecycle = SimpleNamespace(ClientFailure=Failure, _read_state=read_state, _validate_process_tree=validate,
                                    _validate_process_identity=validate_identity, _creation_ticks=lambda value: int(value[20:27]))
        return lifecycle, error, state_path, state

    def test_exact_edge_is_preserved_before_original_exception_is_consumed(self):
        for reason in ['MISSING_PARENT', 'CHILD_PREDATES_PARENT']:
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as directory:
                lifecycle, error, state_path, state = self.fixture(directory, reason)
                counts = adapter.install_private_edge_recorder(lifecycle)
                lifecycle._read_state(str(state_path))
                for _ in range(2):
                    with self.assertRaises(lifecycle.ClientFailure) as raised:
                        lifecycle._validate_process_tree(state['process'], [])
                    self.assertIs(raised.exception, error)
                records = list(state_path.parent.glob('rejected-edge-*.json'))
                self.assertEqual(len(records), 2); self.assertEqual(counts, {'saved': 2, 'unavailable': 0})
                for file in records:
                    value = json.loads(file.read_text()); self.assertEqual(value['rejectedEdge'], error.rejected_edge)
                    self.assertEqual(value['rootIdentity'], state['process']); self.assertEqual(len(value['lifecycleSha256']), 64)
                with patch.object(adapter, 'private_evidence_counts', counts, create=True):
                    public = json.dumps(adapter.sanitized_failure(error.code, vars(error)))
                    self.assertNotIn('private-app', public); self.assertNotIn('Raw native', public)
                    self.assertNotIn('childIdentity', public); self.assertIn('privateEvidenceCount', public); self.assertIn(reason, public)

    def test_invalid_edge_or_changed_state_retains_same_rejection_without_evidence(self):
        cases = ['unavailable-edge', 'no-context', 'changed-state', 'wrong-root', 'wrong-kind', 'extra-field', 'wrong-ticks', 'wrong-order', 'oversized']
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                lifecycle, error, state_path, state = self.fixture(directory)
                counts = adapter.install_private_edge_recorder(lifecycle)
                if case != 'no-context': lifecycle._read_state(str(state_path))
                root_identity = state['process'].copy()
                if case == 'unavailable-edge': error.rejected_edge = None
                if case == 'changed-state': state_path.write_text(json.dumps({**state, 'cleaned': True}))
                if case == 'wrong-root': root_identity['pid'] = 99
                if case == 'wrong-kind': error.rejected_edge['parentIdentity'] = None
                if case == 'extra-field': error.rejected_edge['secret'] = 'must not persist'
                if case == 'wrong-ticks': error.rejected_edge['childCreationTicks'] = 999
                if case == 'wrong-order': error.rejected_edge['ordering'] = 'PARENT_ABSENT'
                if case == 'oversized': error.rejected_edge['childIdentity']['executablePath'] = 'x' * 65536
                with self.assertRaises(lifecycle.ClientFailure) as raised: lifecycle._validate_process_tree(root_identity, [])
                self.assertIs(raised.exception, error); self.assertEqual(counts, {'saved': 0, 'unavailable': 1})
                self.assertEqual(list(state_path.parent.glob('rejected-edge-*.json')), [])

    def test_exclusive_create_never_overwrites_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            lifecycle, error, state_path, state = self.fixture(directory)
            occupied = state_path.parent / ('rejected-edge-' + 'a' * 32 + '.json'); occupied.write_text('unrelated')
            counts = adapter.install_private_edge_recorder(lifecycle); lifecycle._read_state(str(state_path))
            with patch.object(adapter.uuid, 'uuid4', return_value=SimpleNamespace(hex='a' * 32)):
                with self.assertRaises(lifecycle.ClientFailure): lifecycle._validate_process_tree(state['process'], [])
            self.assertEqual(occupied.read_text(), 'unrelated'); self.assertEqual(counts, {'saved': 0, 'unavailable': 1})

    def test_hard_linked_lifecycle_is_not_an_owned_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            lifecycle, error, state_path, state = self.fixture(directory)
            os.link(state_path, state_path.parent / 'other-owner.json')
            counts = adapter.install_private_edge_recorder(lifecycle); lifecycle._read_state(str(state_path))
            with self.assertRaises(lifecycle.ClientFailure): lifecycle._validate_process_tree(state['process'], [])
            self.assertEqual(counts, {'saved': 0, 'unavailable': 1})
            self.assertEqual(list(state_path.parent.glob('rejected-edge-*.json')), [])

    def test_reparse_component_stops_private_write(self):
        with tempfile.TemporaryDirectory() as directory:
            lifecycle, error, state_path, state = self.fixture(directory)
            counts = adapter.install_private_edge_recorder(lifecycle); lifecycle._read_state(str(state_path))
            original = Path.lstat
            def reparse(value, *args, **kwargs):
                info = original(value, *args, **kwargs)
                if value == state_path.parent: return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400)
                return info
            with patch.object(Path, 'lstat', reparse):
                with self.assertRaises(lifecycle.ClientFailure): lifecycle._validate_process_tree(state['process'], [])
            self.assertEqual(counts, {'saved': 0, 'unavailable': 1}); self.assertEqual(list(state_path.parent.glob('rejected-edge-*.json')), [])


if __name__ == '__main__': unittest.main()
