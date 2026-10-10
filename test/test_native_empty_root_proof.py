import importlib.util
from pathlib import Path
import tempfile
import sys
import unittest

spec = importlib.util.spec_from_file_location('empty_root', Path(__file__).resolve().parents[1] / 'scripts/native-empty-root-proof.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeEmptyRootTests(unittest.TestCase):
    def test_exact_empty_status_and_identity(self):
        info = {'directory': True, 'filesystem': 'MaterialVault', 'volumeSerial': 8, 'handleVolumeSerial': 8, 'fileIndex': '123'}
        for status in (0xC000000F, 0x80000006):
            self.assertTrue(module.empty_verdict(info, info, info, status, 0))
        for status in (0, 0xC000003A, 0xC0000022, 0x103):
            self.assertFalse(module.empty_verdict(info, info, info, status, 0))
        self.assertFalse(module.empty_verdict(info, info, info, 0xC000000F, 16))
        self.assertFalse(module.empty_verdict(info, info, dict(info, fileIndex='456'), 0xC000000F, 0))

    @unittest.skipUnless(sys.platform == 'win32', 'Native comparison requires Windows')
    def test_fresh_ordinary_directory_is_observed_but_never_accepted_as_material_vault(self):
        with tempfile.TemporaryDirectory(prefix='mfe-empty-native-') as root:
            self.assertEqual(list(Path(root).iterdir()), [])
            result = module.observe(root)
            self.assertTrue(result['before']['directory'])
            self.assertEqual(result['before'], result['after'])
            self.assertEqual(result['before'], result['reopened'])
            self.assertNotEqual(result['before']['filesystem'], 'MaterialVault')
            self.assertFalse(result['empty'])
            print('Ordinary directory comparison:', result['before']['filesystem'], result['completedNtStatus'], result['returnedBytes'])

    @unittest.skipUnless(sys.platform == 'win32', 'Native observation requires Windows')
    def test_absent_root_and_regular_file_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='mfe-empty-negative-') as root:
            with self.assertRaisesRegex(RuntimeError, 'ROOT_OPEN_FAILED'):
                module.observe(str(Path(root) / 'absent'))
            file = Path(root) / 'ordinary.txt'
            file.write_text('test')
            with self.assertRaisesRegex(RuntimeError, 'ROOT_NOT_DIRECTORY'):
                module.observe(str(file))


if __name__ == '__main__':
    unittest.main()
