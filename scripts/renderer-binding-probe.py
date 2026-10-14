"""Observe only this quiet interpreter's binding, never launch a target."""
import json
import os
import sys
from pathlib import Path
import importlib.util

source = Path(__file__).with_name('supplemental-renderer-recovery.py')
spec = importlib.util.spec_from_file_location('binding_probe_recovery', source)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
output = Path(os.environ['MFE_BINDING_PROBE_OUTPUT'])
try:
    # Match the production observer's explicit GUI role. Console probes retain
    # the ordinary strict configuration, including no console/GUI substitution.
    role = 'gui-observer' if Path(sys.executable).name.lower() == 'pythonw.exe' else None
    with recovery.owning_client(int(sys.argv[1]), interpreter_role=role) as (binding, chain):
        result = {'ok': True, 'targetLaunchAttempted': False, 'binding': binding, 'chain': chain}
except recovery.Error as error:
    result = {'ok': False, 'targetLaunchAttempted': False, 'error': str(error),
              **({'executionDiagnostic': error.executionDiagnostic} if hasattr(error, 'executionDiagnostic') else {}),
              **({'launcherDiagnostic': error.launcherDiagnostic} if hasattr(error, 'launcherDiagnostic') else {})}
with output.open('x', encoding='utf8') as stream:
    json.dump(result, stream, indent=2)
