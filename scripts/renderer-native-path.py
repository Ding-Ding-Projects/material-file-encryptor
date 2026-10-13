"""Resolve one executable through held native file identities before launch."""
import ctypes
from ctypes import wintypes as W
import hashlib
import json
import os
from pathlib import Path
import sys


class INFO(ctypes.Structure):
    _fields_ = [('attributes', W.DWORD), ('created', W.FILETIME), ('accessed', W.FILETIME),
                ('written', W.FILETIME), ('volume', W.DWORD), ('sizeHigh', W.DWORD),
                ('sizeLow', W.DWORD), ('links', W.DWORD), ('indexHigh', W.DWORD), ('indexLow', W.DWORD)]


def resolve(requested):
    if os.name != 'nt' or not Path(requested).is_absolute():
        raise RuntimeError('Native absolute executable path required.')
    api = ctypes.WinDLL('kernel32', use_last_error=True)
    api.CreateFileW.argtypes = [W.LPCWSTR, W.DWORD, W.DWORD, ctypes.c_void_p, W.DWORD, W.DWORD, W.HANDLE]
    api.CreateFileW.restype = W.HANDLE
    api.GetFinalPathNameByHandleW.argtypes = [W.HANDLE, W.LPWSTR, W.DWORD, W.DWORD]
    api.GetFinalPathNameByHandleW.restype = W.DWORD
    api.GetFileInformationByHandle.argtypes = [W.HANDLE, ctypes.POINTER(INFO)]
    api.CloseHandle.argtypes = [W.HANDLE]
    handles = []
    def opened(value):
        handle = api.CreateFileW(value, 0x80, 7, None, 3, 0, None)
        if handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        handles.append(handle)
        return handle
    def identity(handle):
        value = INFO()
        if not api.GetFileInformationByHandle(handle, ctypes.byref(value)):
            raise ctypes.WinError(ctypes.get_last_error())
        if value.attributes & (0x10 | 0x400):
            raise RuntimeError('Executable directory or reparse handle rejected.')
        return {'volume': value.volume, 'indexHigh': value.indexHigh, 'indexLow': value.indexLow,
                'sizeHigh': value.sizeHigh, 'sizeLow': value.sizeLow,
                'writtenHigh': value.written.dwHighDateTime, 'writtenLow': value.written.dwLowDateTime}
    try:
        handle = opened(requested)
        before = identity(handle)
        buffer = ctypes.create_unicode_buffer(32768)
        count = api.GetFinalPathNameByHandleW(handle, buffer, len(buffer), 0)
        if not 0 < count < len(buffer) or not buffer.value.startswith('\\\\?\\') or buffer.value.startswith('\\\\?\\UNC\\'):
            raise RuntimeError('Bounded local final executable path unavailable.')
        final = buffer.value[4:]
        final_handle = opened(final)
        if identity(final_handle) != before:
            raise RuntimeError('Final executable names a different native file.')
        digest = hashlib.sha256()
        with open(final, 'rb') as stream:
            for chunk in iter(lambda: stream.read(1048576), b''):
                digest.update(chunk)
        if identity(handle) != before or identity(final_handle) != before:
            raise RuntimeError('Executable changed during native resolution.')
        return {'version': 1, 'requestedPath': requested, 'finalPath': final,
                'sha256': digest.hexdigest(), 'fileIdentity': before, 'finalIdentity': identity(final_handle)}
    finally:
        for handle in reversed(handles):
            if not api.CloseHandle(handle):
                raise ctypes.WinError(ctypes.get_last_error())


if __name__ == '__main__':
    print(json.dumps(resolve(sys.argv[1])))
