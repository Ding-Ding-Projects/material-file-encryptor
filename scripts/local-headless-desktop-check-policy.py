"""Narrow acceptance rule for desktops automatically destroyed after owned exit."""
import re

def automatically_closed(result, desktop, processes, recorded_tree_absent):
    if not isinstance(result, dict) or result.get('client_ok') is True or result.get('windows'):
        return False
    if not isinstance(processes, list) or not processes or any(not isinstance(item, dict) or not isinstance(item.get('pid'), int) or not item.get('creationDate') for item in processes):
        return False
    error = result.get('error')
    pattern = r"^OpenDesktopW\('" + re.escape(desktop) + r"'\) failed \(GetLastError=2(?:: [^\r\n]*)?\)$"
    if not isinstance(error, str) or not re.fullmatch(pattern, error):
        return False
    return recorded_tree_absent(processes) is True
