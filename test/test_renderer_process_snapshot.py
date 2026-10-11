"""Identity serialization regression without browser launch or process mutation."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('snapshot_lifecycle', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
lifecycle = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = lifecycle
spec.loader.exec_module(lifecycle)
source = ast.parse((ROOT / 'scripts/test-renderer-browser-cli.py').read_text(encoding='utf-8'))
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'recorded_tree_absent')
namespace = {'module': lifecycle}
exec(compile(ast.Module(body=[function], type_ignores=[]), '<snapshot-function>', 'exec'), namespace)
absent = namespace['recorded_tree_absent']
identity = {'pid': 77, 'parentPid': 1, 'creationDate': '2026-10-09T12:00:00.1234567Z', 'executablePath': 'C:/owned/app.exe'}


class SnapshotTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Requires actual Windows PowerShell serialization')
    def test_actual_powershell_serialization_matches_protocol(self):
        script = next(node.value for node in ast.walk(function) if isinstance(node, ast.Constant) and isinstance(node.value, str) and 'Get-CimInstance' in node.value)
        # Supply a deterministic CIM-shaped record while executing the actual
        # production projection and JSON serializer in Windows PowerShell.
        fixture = "function Get-CimInstance { [pscustomobject]@{ ProcessId=77; ParentProcessId=1; CreationDate=[datetime]::Parse('2026-10-09T12:00:00.1234567Z', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind); ExecutablePath='C:/owned/app.exe' } }\n"
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', fixture + script], capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW, check=True)
        snapshot = json.loads(result.stdout)
        self.assertEqual(snapshot, [identity])
        lifecycle._validate_process_identity(snapshot[0])
        with patch.object(lifecycle, '_powershell_json', return_value=snapshot):
            self.assertFalse(absent([identity]))

    def test_wrong_format_missing_parent_and_mismatches_are_rejected(self):
        for changed in [{'creationDate': '10/09/2026 12:00:00'}, {'creationDate': '2026-10-09T12:00:00.1234568Z'}, {'executablePath': 'C:/other/app.exe'}, {'parentPid': None}]:
            current = {**identity, **changed}
            with self.subTest(changed=changed), patch.object(lifecycle, '_powershell_json', return_value=[current]):
                with self.assertRaises(lifecycle.ClientFailure):
                    absent([identity])

    def test_absence_and_unknown_snapshot_remain_distinct(self):
        with patch.object(lifecycle, '_powershell_json', return_value=[]):
            self.assertTrue(absent([identity]))
        with patch.object(lifecycle, '_powershell_json', return_value={}):
            with self.assertRaises(lifecycle.ClientFailure):
                absent([identity])


if __name__ == '__main__':
    unittest.main()
