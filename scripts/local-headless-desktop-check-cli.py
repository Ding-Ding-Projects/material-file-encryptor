"""Use the installed lifecycle safety checks with the documented direct tool CLI."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

helper = Path(os.environ['MFE_LOWLEVEL_CLIENT'])
cli = Path(os.environ['MFE_LOWLEVEL_CLI'])
if not helper.is_file() or not cli.is_file():
    raise SystemExit('Installed lifecycle helper and direct CLI are required.')
spec = importlib.util.spec_from_file_location('installed_lifecycle', helper)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class DirectClient:
    def __init__(self, timeout):
        self.timeout = timeout
    def list_tools(self):
        result = subprocess.run([str(cli), '--help'], capture_output=True, text=True, timeout=self.timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode != 0:
            raise module.ClientFailure('CLI_CATALOG_FAILED', 'Direct tool catalog was unavailable.')
        return [{'name': name} for name in re.findall(r'^  ([a-z][a-z_]+)$', result.stdout, re.M)]
    def call_tool(self, name, params):
        result = subprocess.run([str(cli), name, '--json', json.dumps(params)], capture_output=True, text=True, timeout=self.timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            payload = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise module.ClientFailure('CLI_INVALID_RESULT', 'Direct tool did not return JSON.')
        if not isinstance(payload, dict):
            raise module.ClientFailure('CLI_INVALID_RESULT', 'Direct tool result must be an object.')
        payload['client_ok'] = result.returncode == 0 and payload.get('ok') is True and payload.get('timed_out') is not True and payload.get('returncode', 0) == 0
        return payload

# Retain the installed versioned state, creation-time checks, process-tree checks,
# window ownership checks and teardown. Only tool transport changes.
module._connect = lambda endpoint, timeout: DirectClient(timeout)
raise SystemExit(module.main())
