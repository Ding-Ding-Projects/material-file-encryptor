"""Fake-client routing checks, with no desktop or network access."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('adapter', Path(__file__).resolve().parents[1] / 'scripts/local-headless-desktop-check-cli.py')
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)


class TransportRouting(unittest.TestCase):
    def fixture(self):
        calls = []
        class Failure(Exception):
            def __init__(self, code, message): self.code = code; super().__init__(message)
        class Client:
            def list_tools(self): calls.append(('catalog',)); return [{'name': 'screenshot'}]
            def call_tool(self, name, params):
                calls.append(('tool', name, params))
                return {'client_ok': name != 'failed', 'ok': name != 'failed'}
        def validate(endpoint):
            calls.append(('validate', endpoint))
            if not endpoint.startswith('http://127.0.0.1:'):
                raise Failure('NON_LOOPBACK_ENDPOINT', 'Rejected')
        def original(endpoint, timeout):
            validate(endpoint); calls.append(('native-connect', endpoint, timeout)); return Client()
        return SimpleNamespace(_connect=original, _validate_endpoint=validate, ClientFailure=Failure), calls, Client

    def test_persistent_calls_keep_original_connector_without_recursion(self):
        lifecycle, calls, _ = self.fixture(); failures = []
        def forbidden(timeout): raise AssertionError('CLI must not run')
        endpoint = 'http://127.0.0.1:8765/mcp'
        connect = adapter.configure_transport(lifecycle, endpoint, forbidden, failures)
        for action in ['launch_on_headless_desktop', 'list_headless_windows', 'screenshot', 'win_send_keys', 'close_headless_desktop', 'failed']:
            client = lifecycle._connect(endpoint, 20)
            self.assertEqual(client.list_tools(), [{'name': 'screenshot'}])
            client.call_tool(action, {'owned': True})
        self.assertIs(connect, lifecycle._connect)
        self.assertEqual(len([call for call in calls if call[0] == 'native-connect']), 6)
        self.assertEqual(len(failures), 1)
        with self.assertRaises(lifecycle.ClientFailure): connect('http://127.0.0.1:9999/mcp', 20)
        with self.assertRaises(lifecycle.ClientFailure): connect('https://unrelated.example/mcp', 20)
        self.assertEqual(len([call for call in calls if call[0] == 'native-connect']), 6)

    def test_direct_mode_uses_only_direct_factory(self):
        lifecycle, calls, client_type = self.fixture(); direct = []
        connect = adapter.configure_transport(lifecycle, None, lambda timeout: (direct.append(timeout), client_type())[1], [])
        connect('http://127.0.0.1:8765/mcp', 12).call_tool('screenshot', {'owned': True})
        self.assertEqual(direct, [12]); self.assertFalse(any(call[0] == 'native-connect' for call in calls))

    def test_invalid_configured_endpoint_never_installs_override(self):
        lifecycle, _, _ = self.fixture(); original = lifecycle._connect
        with self.assertRaises(lifecycle.ClientFailure): adapter.configure_transport(lifecycle, 'https://unrelated.example/mcp', None, [])
        self.assertIs(lifecycle._connect, original)


if __name__ == '__main__': unittest.main()
