"""Offline rejection tests. These do not claim native window evidence."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('observer', Path(__file__).resolve().parents[1] / 'scripts/native-window-observation.py')
observer = importlib.util.module_from_spec(spec); spec.loader.exec_module(observer)


class NativeObservation(unittest.TestCase):
    def test_bookends_reject_changed_identity_and_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / 'fixture.bin'; executable.write_bytes(b'fixture')
            identity = {'pid': 7, 'parentPid': 1, 'creationDate': '2026-10-09T00:00:00.0000000Z', 'executablePath': str(executable)}
            class Lifecycle:
                def _process_tree(self, root): return [identity.copy()]
                def _process_identity(self, pid): return identity.copy()
                def _same_process(self, expected, current): return expected == current
            class API:
                def owner(self, hwnd): return 7
                def geometry(self, hwnd): return {'clientRect': {'width': 100, 'height': 80}, 'dpi': 96}
            state = {'process': identity.copy(), 'desktop': 'owned'}
            self.assertEqual(observer.observe(Lifecycle(), state, 123, API())['physicalScaleMatrixVerified'], False)
            class Changed(API):
                def geometry(self, hwnd):
                    identity['creationDate'] = '2026-10-09T00:00:01.0000000Z'
                    return super().geometry(hwnd)
            with self.assertRaisesRegex(ValueError, 'WINDOW_OWNER_CHANGED'):
                observer.observe(Lifecycle(), state, 123, Changed())
            class Replaced(API):
                def geometry(self, hwnd):
                    executable.write_bytes(b'changed')
                    return super().geometry(hwnd)
            with self.assertRaisesRegex(ValueError, 'WINDOW_OWNER_CHANGED'):
                observer.observe(Lifecycle(), state, 123, Replaced())
            class Unrelated(API):
                def owner(self, hwnd): return 8
            with self.assertRaisesRegex(ValueError, 'WINDOW_OWNER_UNPROVEN'):
                observer.observe(Lifecycle(), state, 123, Unrelated())
            class Unproven(Lifecycle):
                def _process_tree(self, root): raise ValueError('ANCESTRY_REJECTED')
            with self.assertRaisesRegex(ValueError, 'ANCESTRY_REJECTED'):
                observer.observe(Unproven(), state, 123, API())


if __name__ == '__main__': unittest.main()
