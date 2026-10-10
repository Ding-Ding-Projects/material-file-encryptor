"""Read-only, bounded enumeration of an already mounted verification root."""
import ctypes
import json
import os
import re
import sys
from ctypes import wintypes as w


def empty_verdict(before, after, reopened, status, byte_count):
    """Only the documented initial empty statuses with stable identity qualify."""
    return (before == after == reopened and before.get('directory') is True
            and before.get('filesystem') == 'MaterialVault'
            and before.get('volumeSerial') == before.get('handleVolumeSerial')
            and status in (0xC000000F, 0x80000006) and byte_count == 0)


def observe(root):
    if sys.platform != 'win32':
        raise RuntimeError('UNSUPPORTED_PLATFORM')
    k = ctypes.WinDLL('kernel32', use_last_error=True)
    n = ctypes.WinDLL('ntdll')
    H, D = w.HANDLE, w.DWORD
    k.CreateFileW.argtypes = [w.LPCWSTR, D, D, ctypes.c_void_p, D, D, H]
    k.CreateFileW.restype = H
    k.CloseHandle.argtypes = [H]
    k.CloseHandle.restype = w.BOOL
    k.CreateEventW.argtypes = [ctypes.c_void_p, w.BOOL, w.BOOL, w.LPCWSTR]
    k.CreateEventW.restype = H
    k.WaitForSingleObject.argtypes = [H, D]
    k.WaitForSingleObject.restype = D
    k.CancelIoEx.argtypes = [H, ctypes.c_void_p]
    k.CancelIoEx.restype = w.BOOL

    class StatusUnion(ctypes.Union):
        _fields_ = [('Status', ctypes.c_int32), ('Pointer', ctypes.c_void_p)]

    class IoStatus(ctypes.Structure):
        _fields_ = [('u', StatusUnion), ('Information', ctypes.c_size_t)]

    class FileInfo(ctypes.Structure):
        _fields_ = [('attributes', D), ('creation', w.FILETIME), ('access', w.FILETIME),
                    ('write', w.FILETIME), ('serial', D), ('sizeHigh', D), ('sizeLow', D),
                    ('links', D), ('indexHigh', D), ('indexLow', D)]

    k.GetFileInformationByHandle.argtypes = [H, ctypes.POINTER(FileInfo)]
    k.GetFileInformationByHandle.restype = w.BOOL
    k.GetVolumeInformationByHandleW.argtypes = [H, w.LPWSTR, D, ctypes.POINTER(D), ctypes.POINTER(D), ctypes.POINTER(D), w.LPWSTR, D]
    k.GetVolumeInformationByHandleW.restype = w.BOOL
    n.NtQueryDirectoryFile.argtypes = [H, H, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(IoStatus), ctypes.c_void_p, D, ctypes.c_int, ctypes.c_ubyte, ctypes.c_void_p, ctypes.c_ubyte]
    n.NtQueryDirectoryFile.restype = ctypes.c_int32

    def open_root():
        handle = k.CreateFileW(root, 0x100081, 7, None, 3, 0x42000000, None)
        if handle == ctypes.c_void_p(-1).value:
            raise RuntimeError('ROOT_OPEN_FAILED')
        return handle

    def identity(handle):
        info = FileInfo()
        if not k.GetFileInformationByHandle(handle, ctypes.byref(info)):
            raise RuntimeError('ROOT_IDENTITY_UNAVAILABLE')
        serial, maximum, flags = D(), D(), D()
        label, filesystem = ctypes.create_unicode_buffer(261), ctypes.create_unicode_buffer(261)
        if not k.GetVolumeInformationByHandleW(handle, label, 261, ctypes.byref(serial), ctypes.byref(maximum), ctypes.byref(flags), filesystem, 261):
            raise RuntimeError('VOLUME_IDENTITY_UNAVAILABLE')
        return {'directory': bool(info.attributes & 16), 'attributes': int(info.attributes),
                'handleVolumeSerial': str(info.serial), 'volumeSerial': str(serial.value),
                'fileIndex': str((info.indexHigh << 32) | info.indexLow),
                'filesystem': filesystem.value, 'label': label.value}

    handle, event, reopened = None, None, None
    try:
        handle = open_root()
        before = identity(handle)
        if not before['directory']:
            raise RuntimeError('ROOT_NOT_DIRECTORY')
        event = k.CreateEventW(None, True, False, None)
        if not event:
            raise RuntimeError('QUERY_EVENT_UNAVAILABLE')
        ios, buffer = IoStatus(), ctypes.create_string_buffer(8192)
        initial = n.NtQueryDirectoryFile(handle, event, None, None, ctypes.byref(ios), buffer, len(buffer), 1, 0, None, 1)
        status = initial
        if initial == 0x103:
            if k.WaitForSingleObject(event, 5000) != 0:
                k.CancelIoEx(handle, None)
                if k.WaitForSingleObject(event, 5000) != 0:
                    # Keep all outstanding I/O buffers alive until process teardown.
                    os._exit(3)
                raise RuntimeError('QUERY_TIMEOUT')
            status = ios.u.Status
        status &= 0xFFFFFFFF
        after = identity(handle)
        reopened = open_root()
        current = identity(reopened)
        count = int(ios.Information)
        return {'version': 1, 'root': root, 'before': before, 'after': after, 'reopened': current,
                'initialNtStatus': '0x%08X' % (initial & 0xFFFFFFFF),
                'completedNtStatus': '0x%08X' % status, 'returnedBytes': count,
                'empty': empty_verdict(before, after, current, status, count)}
    finally:
        if reopened:
            k.CloseHandle(reopened)
        if event:
            k.CloseHandle(event)
        if handle:
            k.CloseHandle(handle)


def main():
    request = json.loads(sys.stdin.read(4097))
    if set(request) != {'root'} or not re.fullmatch(r'[D-Z]:\\', request['root']):
        raise RuntimeError('INVALID_ROOT')
    print(json.dumps(observe(request['root'])))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'version': 1, 'empty': False, 'code': 'NATIVE_EMPTY_ROOT_PROOF_FAILED'}))
        sys.exit(1)
