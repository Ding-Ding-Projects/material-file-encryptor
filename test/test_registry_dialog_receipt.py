"""Actual installed receipt-reader contracts, with no GUI or native input."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import sys
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
HELPER = Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py'


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


observer = load('receipt_observer', SCRIPTS / 'native-window-observation.py')
dialogs = load('receipt_dialogs', SCRIPTS / 'gui-acceptance-registry-dialogs.py')
snapshot = load('receipt_snapshot', SCRIPTS / 'renderer-process-snapshot.py')
transport = load('receipt_transport', SCRIPTS / 'direct-cli-receipt.py')


@unittest.skipUnless(HELPER.is_file(), 'Installed lifecycle reader required for actual schema coverage')
class ProducerReceiptTests(unittest.TestCase):
    def exercise(self, dialog=False, direct=False):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve(); output = root / 'output'; output.mkdir()
            receipt = root / 'lifecycle.json'
            lifecycle = load('exact_installed_reader', HELPER)
            identity = {'pid': 7, 'parentPid': 1, 'creationDate': '2026-10-09T00:00:00.0000001Z', 'executablePath': str(root / 'synthetic.exe')}
            # Exact installed _cmd_launch schema used by the real direct wrapper.
            state = {'version': 1, 'endpoint': lifecycle.DEFAULT_ENDPOINT, 'desktop': 'MFE-owned-synthetic', 'pid': 7,
                'process': identity, 'hwnd': 123, 'created': True, 'cleaned': False, 'runRoot': str(root),
                'outputRoot': str(output), 'cdp': {'port': 54321, 'expectedUrl': 'file:///synthetic/app.html'}}
            binding = {'unitTestTransport': True}
            if direct:
                del state['endpoint']
                state.update(transport=transport.DIRECT_TRANSPORT, transportProvenance=binding)
            receipt.write_text(json.dumps(state))
            original = receipt.read_bytes()
            adapter = SimpleNamespace(direct_provenance=lambda _: dict(binding),
                install_receipt_transport=lambda module, **options: transport.install_receipt_transport(module, **options, provenance=lambda _: dict(binding)))
            environment = {'MFE_RENDERER_PROCESS_BACKEND': 'native-v1', 'MFE_RENDERER_SOURCE_COMMIT': 'a' * 40, 'MFE_LOWLEVEL_CLI': 'synthetic-cli'}
            with patch.object(snapshot, 'Native', return_value=object()):
                if dialog:
                    reader = dialogs.prepare_dialog_backend(lifecycle, adapter, snapshot, observer,
                        {'statePath': str(receipt), 'verifierSourceCommit': 'a' * 40}, HELPER, 'synthetic-cli')
                else:
                    reader = observer.configure_receipt_reader(lifecycle, adapter, {'receipt': str(receipt), 'helper': str(HELPER)}, observer.DiagnosticContext(), environment, snapshot)
            backend = reader['backend']
            self.assertEqual(reader['route'], 'existing-receipt-transport' if direct else 'native-v1-endpoint-shaped')
            # Unmarked legacy data cannot become a native receipt merely from shape.
            with self.assertRaises(lifecycle.ClientFailure): lifecycle._read_state(receipt)
            marker = {**backend.binding, 'rootIdentity': identity}; backend.marker.write_text(json.dumps(marker))
            accepted = lifecycle._read_state(receipt)[1]
            self.assertEqual(accepted['process'], identity)
            self.assertEqual(accepted['endpoint'], lifecycle.DEFAULT_ENDPOINT)
            self.assertEqual(receipt.read_bytes(), original, 'Reader must never rewrite the original receipt')
            for changed in ({'sourceCommit': 'b' * 40}, {'rootIdentity': {**identity, 'creationDate': '2026-10-09T00:00:00.0000002Z'}}):
                backend.marker.write_text(json.dumps({**marker, **changed}))
                with self.assertRaises(lifecycle.ClientFailure): lifecycle._read_state(receipt)
            backend.marker.write_text(json.dumps(marker)); lifecycle._read_state(receipt)
            binding['changed'] = True
            with self.assertRaises(ValueError): reader['verifyTransport']()
            self.assertEqual(receipt.read_bytes(), original)

    def test_observer_reads_endpoint_shaped_native_producer_without_projection(self):
        self.exercise()

    def test_dialog_uses_same_actual_endpoint_shaped_reader_and_native_sidecar(self):
        self.exercise(dialog=True)

    def test_existing_direct_provenance_projection_remains_required(self):
        self.exercise(direct=True)

    def test_old_projection_rejects_endpoint_shape_and_mixed_shape_never_selects_native_route(self):
        with tempfile.TemporaryDirectory() as temporary:
            receipt = Path(temporary).resolve() / 'lifecycle.json'
            receipt.write_text(json.dumps({'version': 1, 'endpoint': 'http://127.0.0.1:8765/mcp', 'transport': transport.DIRECT_TRANSPORT}))
            lifecycle = load('mixed_installed_reader', HELPER)
            transport.install_receipt_transport(lifecycle, cli='synthetic', provenance=lambda _: {})
            with self.assertRaises(ValueError): lifecycle._read_state(receipt)
            selected = []
            adapter = SimpleNamespace(install_receipt_transport=lambda *_args, **_kwargs: selected.append('existing'), direct_provenance=lambda _: self.fail('Mixed receipt selected native route'))
            class Backend:
                def __init__(self, *_): pass
                def install(self): return self
            observer.configure_receipt_reader(load('mixed_shape_reader', HELPER), adapter, {'receipt': str(receipt), 'helper': str(HELPER)}, observer.DiagnosticContext(),
                {'MFE_RENDERER_PROCESS_BACKEND': 'native-v1', 'MFE_RENDERER_SOURCE_COMMIT': 'a' * 40, 'MFE_LOWLEVEL_CLI': 'synthetic'}, SimpleNamespace(RendererNativeBackend=Backend))
            self.assertEqual(selected, ['existing'])


if __name__ == '__main__': unittest.main()
