"""Offline installer transport checks, without installing or launching processes."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('installer_adapter', Path(__file__).resolve().parents[1] / 'scripts/local-installer-process.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class InstallerTransportTests(unittest.TestCase):
    def lifecycle(self):
        endpoint = 'http://127.0.0.1:8765/mcp'
        client = mock.Mock()
        client.call_tool.return_value = {'client_ok': True, 'ok': True}
        def validate(value):
            if value != endpoint:
                raise ValueError('INVALID_ENDPOINT')
        lifecycle = SimpleNamespace(_validate_endpoint=mock.Mock(side_effect=validate), _connect=mock.Mock(return_value=client))
        return lifecycle, client, endpoint

    def test_persistent_route_reuses_one_client_without_cli(self):
        lifecycle, client, endpoint = self.lifecycle()
        with mock.patch.object(adapter.subprocess, 'run') as direct:
            call, route = adapter.select_transport(lifecycle, endpoint, None)
            for action in ['launch_on_headless_desktop', 'list_headless_windows', 'close_headless_desktop']:
                self.assertTrue(call(action, {'name': 'owned-fixture'})['client_ok'])
            direct.assert_not_called()
        lifecycle._validate_endpoint.assert_called_once_with(endpoint)
        lifecycle._connect.assert_called_once_with(endpoint, 30)
        self.assertEqual(route, 'persistent-loopback-mcp')
        self.assertEqual(client.call_tool.call_count, 3)

    def test_invalid_endpoint_never_falls_back_or_connects(self):
        lifecycle, _, _ = self.lifecycle()
        cli = mock.Mock()
        for endpoint in ['', 'https://unrelated.example/mcp', 'http://user:password@127.0.0.1/mcp', 'file:///synthetic', 'http://127.0.0.1/mcp#fragment']:
            with self.subTest(endpoint=endpoint), mock.patch.object(adapter.subprocess, 'run') as direct, self.assertRaises(ValueError):
                adapter.select_transport(lifecycle, endpoint, cli)
            direct.assert_not_called()
        lifecycle._connect.assert_not_called()
        cli.is_file.assert_not_called()

    def test_direct_fallback_preserves_result_validation(self):
        lifecycle, _, _ = self.lifecycle()
        cli = mock.Mock()
        cli.is_file.return_value = True
        for result, expected in [(SimpleNamespace(stdout='{"ok":true}', returncode=0), True),
                                 (SimpleNamespace(stdout='{"ok":true}', returncode=1), False),
                                 (SimpleNamespace(stdout='{"ok":true,"timed_out":true}', returncode=0), False),
                                 (SimpleNamespace(stdout='{"ok":false}', returncode=0), False)]:
            with self.subTest(expected=expected), mock.patch.object(adapter.subprocess, 'run', return_value=result) as direct, mock.patch.object(adapter.subprocess, 'CREATE_NO_WINDOW', 0, create=True):
                call, route = adapter.select_transport(lifecycle, None, cli)
                self.assertEqual(call('list_headless_windows', {'name': 'owned-fixture'})['client_ok'], expected)
                self.assertEqual(direct.call_args.kwargs['timeout'], 30)
            self.assertEqual(route, 'direct-cli')
        lifecycle._connect.assert_not_called()
        lifecycle._validate_endpoint.assert_not_called()

    def test_missing_direct_cli_rejects_before_any_action(self):
        lifecycle, _, _ = self.lifecycle()
        for cli in [None, SimpleNamespace(is_file=lambda: False)]:
            with self.subTest(cli=cli), self.assertRaises(RuntimeError):
                adapter.select_transport(lifecycle, None, cli)
        lifecycle._connect.assert_not_called()

    def test_run_selects_endpoint_without_requiring_cli_before_launch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            executable = root / 'MaterialFileEncryptor-Setup.exe'
            executable.write_bytes(b'synthetic fixture')
            helper = root / 'lifecycle.py'
            helper.write_text('pass', encoding='utf-8')
            request = {'executable': str(executable), 'arguments': ['--silent'], 'seconds': 10, 'receipt': str(root / 'receipt.json')}
            environment = {key: value for key, value in os.environ.items() if key not in {'MFE_LOWLEVEL_URL', 'MFE_LOWLEVEL_CLI', 'MFE_LOWLEVEL_CLIENT'}}
            environment.update(MFE_LOWLEVEL_URL='http://127.0.0.1:8765/mcp', MFE_LOWLEVEL_CLIENT=str(helper))
            with mock.patch.dict(adapter.os.environ, environment, clear=True), mock.patch.object(adapter, 'select_transport', side_effect=RuntimeError('STOP_BEFORE_LAUNCH')) as select, mock.patch.object(adapter.subprocess, 'Popen') as launch, self.assertRaisesRegex(RuntimeError, 'STOP_BEFORE_LAUNCH'):
                adapter.run(request)
            self.assertEqual(select.call_args.args[1:], ('http://127.0.0.1:8765/mcp', None))
            launch.assert_not_called()
            self.assertEqual(list(root.glob('installer-run-*')), [])

    def test_worker_retains_handle_and_bounded_exit_without_termination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ack = root / 'ack'
            ack.touch()
            request_path = root / 'request.json'
            request = {'executable': 'synthetic-setup.exe', 'arguments': ['--silent'], 'seconds': 10, 'workerResult': str(root / 'operation.json'), 'ack': str(ack)}
            request_path.write_text(json.dumps(request), encoding='utf-8')
            child = mock.Mock(pid=42, _handle=123)
            child.wait.return_value = 0
            with mock.patch.object(adapter.subprocess, 'Popen', return_value=child) as launch, mock.patch.object(adapter, 'process_times', return_value=456) as times, mock.patch.object(adapter, 'write_json') as write:
                adapter.worker(request_path)
            launch.assert_called_once_with(['synthetic-setup.exe', '--silent'], stdout=adapter.subprocess.DEVNULL, stderr=adapter.subprocess.DEVNULL)
            times.assert_called_once_with(123)
            child.wait.assert_called_once_with(timeout=10)
            child.kill.assert_not_called()
            child.terminate.assert_not_called()
            self.assertEqual(write.call_args_list[0].args[1]['process'], {'pid': 42, 'creationFileTime': 456, 'executablePath': 'synthetic-setup.exe'})
            self.assertEqual(write.call_args_list[1].args[1]['exitCode'], 0)


if __name__ == '__main__':
    unittest.main()
