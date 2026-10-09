"""Narrow acceptance rule for desktops automatically destroyed after owned exit."""
import re

def missing_root_proof_allowed(code):
    return code == 'PROCESS_NOT_FOUND'

def cleanup_absence_recovery_allowed(result):
    return isinstance(result, dict) and result.get('code') in ['UNKNOWN_PROCESS_TREE', 'DESKTOP_NOT_CLOSED', 'PROCESS_NOT_FOUND']

def validate_exit_proof(lifecycle, state, proof):
    if not isinstance(proof, dict) or proof.get('root') != state['process']:
        raise lifecycle.ClientFailure('INVALID_EXIT_PROOF', 'Exit proof belongs to a different launch.')
    lifecycle._validate_process_tree(state['process'], proof.get('processes'))
    return proof['processes']

def automatically_closed(result, desktop, processes, recorded_tree_absent):
    if not isinstance(result, dict) or result.get('client_ok') is True or result.get('windows'):
        return False
    if not isinstance(processes, list) or not processes or any(not isinstance(item, dict) or set(item) != {'pid', 'parentPid', 'creationDate', 'executablePath'} or type(item.get('pid')) is not int or item['pid'] <= 0 or type(item.get('parentPid')) is not int or item['parentPid'] < 0 or not isinstance(item.get('executablePath'), str) or not item['executablePath'].strip() or not isinstance(item.get('creationDate'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z', item['creationDate']) for item in processes):
        return False
    error = result.get('error')
    pattern = r"^OpenDesktopW\('" + re.escape(desktop) + r"'\) failed \(GetLastError=2(?:: [^\r\n]*)?\)$"
    if not isinstance(error, str) or not re.fullmatch(pattern, error):
        return False
    return recorded_tree_absent(processes) is True
