"""Offline identity-proof compatibility checks; no native process or desktop calls."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


root = Path(__file__).resolve().parents[1]
policy = load('product_policy', root / 'scripts/local-headless-desktop-check-policy.py')
lifecycle = load('installed_lifecycle_test', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
identity = {'pid': 77, 'parentPid': 1, 'creationDate': '2026-10-09T12:00:00.0000000Z', 'executablePath': 'C:/owned/app.exe'}
child = {'pid': 78, 'parentPid': 77, 'creationDate': '2026-10-09T12:00:00.0000001Z', 'executablePath': 'C:/owned/child.exe'}
missing = {'ok': False, 'client_ok': False, 'error': "OpenDesktopW('owned') failed (GetLastError=2: The system cannot find the file specified.)"}


class PolicyTests(unittest.TestCase):
    def test_only_explicit_missing_root_allows_recorded_proof(self):
        self.assertTrue(policy.missing_root_proof_allowed('PROCESS_NOT_FOUND'))
        for code in ['PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED', 'INVALID_PROCESS_TREE', 'IDENTITY_BOUND_TERMINATION_UNAVAILABLE']:
            self.assertFalse(policy.missing_root_proof_allowed(code))

    def test_termination_unavailable_and_query_errors_cannot_recover_to_success(self):
        for code in ['IDENTITY_BOUND_TERMINATION_UNAVAILABLE', 'PROCESS_PROOF_FAILED', 'PROCESS_IDENTITY_CHANGED', 'INVALID_PROCESS_TREE']:
            self.assertFalse(policy.cleanup_absence_recovery_allowed({'code': code}))
        self.assertTrue(policy.cleanup_absence_recovery_allowed({'code': 'PROCESS_NOT_FOUND'}))

    def test_valid_full_precision_connected_exit_proof(self):
        proof = {'root': identity, 'processes': [identity, child]}
        self.assertEqual(policy.validate_exit_proof(lifecycle, {'process': identity}, proof), proof['processes'])

    def test_stale_ancestry_is_rejected_even_before_absence_queries(self):
        stale = {**child, 'creationDate': '2026-10-09T11:59:59.9999999Z'}
        with self.assertRaises(lifecycle.ClientFailure):
            policy.validate_exit_proof(lifecycle, {'process': identity}, {'root': identity, 'processes': [identity, stale]})

    def test_legacy_locale_time_is_rejected(self):
        legacy = {**identity, 'creationDate': '10/09/2026 12:00:00'}
        with self.assertRaises(lifecycle.ClientFailure):
            policy.validate_exit_proof(lifecycle, {'process': legacy}, {'root': legacy, 'processes': [legacy]})
        self.assertFalse(policy.automatically_closed(missing, 'owned', [legacy], lambda _: True))

    def test_different_saved_root_cannot_authorize_cleanup(self):
        with self.assertRaises(lifecycle.ClientFailure):
            policy.validate_exit_proof(lifecycle, {'process': identity}, {'root': child, 'processes': [child]})

    def test_query_failure_is_not_absence(self):
        with patch.object(lifecycle, '_process_identity', side_effect=lifecycle.ClientFailure('PROCESS_PROOF_FAILED', 'offline query failure')):
            with self.assertRaises(lifecycle.ClientFailure):
                policy.automatically_closed(missing, 'owned', [identity], lifecycle._recorded_tree_absent)

    def test_reused_pid_is_not_absence(self):
        reused = {**identity, 'creationDate': '2026-10-09T12:00:00.0000002Z'}
        with patch.object(lifecycle, '_process_identity', return_value=reused):
            with self.assertRaises(lifecycle.ClientFailure):
                policy.automatically_closed(missing, 'owned', [identity], lifecycle._recorded_tree_absent)

    def test_explicit_missing_pid_proves_absence_without_actions(self):
        with patch.object(lifecycle, '_process_identity', side_effect=lifecycle.ClientFailure('PROCESS_NOT_FOUND', 'offline absent fixture')):
            self.assertTrue(policy.automatically_closed(missing, 'owned', [identity], lifecycle._recorded_tree_absent))


if __name__ == '__main__':
    unittest.main()
