import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('main_inspector', Path(__file__).resolve().parents[1] / 'scripts/gui-acceptance-main-inspector.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InspectorAdmission(unittest.TestCase):
    def test_connected_binding_is_complete(self):
        request = {'receipt': 'owned', 'port': 54321, 'verifierSourceCommit': 'a' * 40, 'executableSha256': 'b' * 64}
        module.validate_request(request)
        for key in ('clientPid', 'clientBinding', 'targetId'):
            with self.assertRaises(ValueError): module.validate_request({**request, key: 'partial'})

    def test_listener_requires_exact_loopback_main_and_client_pair(self):
        rows = 'TCP 127.0.0.1:54321 0.0.0.0:0 LISTENING 10\nTCP 127.0.0.1:54322 127.0.0.1:54321 ESTABLISHED 20\nTCP 127.0.0.1:54321 127.0.0.1:54322 ESTABLISHED 10'
        self.assertEqual(module.select_listener(rows, 54321, 10, 20)['serverPid'], 10)
        for changed in [rows.replace('127.0.0.1:54321 0.0.0.0:0', '0.0.0.0:54321 0.0.0.0:0'), rows.replace('LISTENING 10', 'LISTENING 11'), rows.replace('ESTABLISHED 20', 'ESTABLISHED 21')]:
            with self.assertRaises(ValueError): module.select_listener(changed, 54321, 10, 20)
    def test_sole_node_target_is_not_a_renderer_or_other_port(self):
        target = {'type': 'node', 'id': 'owned-id', 'webSocketDebuggerUrl': 'ws://127.0.0.1:54321/owned-id'}
        self.assertEqual(module.validate_target([target], 54321)['id'], 'owned-id')
        for changed in [[], [target, target], [{**target, 'type': 'page'}], [{**target, 'webSocketDebuggerUrl': 'ws://127.0.0.1:54322/owned-id'}]]:
            with self.assertRaises(ValueError): module.validate_target(changed, 54321)
        with self.assertRaises(ValueError): module.validate_target([target], 54321, 'different')

if __name__ == '__main__': unittest.main()
