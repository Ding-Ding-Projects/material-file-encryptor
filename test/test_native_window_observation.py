"""Offline rejection tests. These do not claim native window evidence."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import contextlib
import io
import json
import threading

spec = importlib.util.spec_from_file_location('observer', Path(__file__).resolve().parents[1] / 'scripts/native-window-observation.py')
observer = importlib.util.module_from_spec(spec); spec.loader.exec_module(observer)


class NativeObservation(unittest.TestCase):
    def test_failure_projection_is_fixed_and_preserves_rejection(self):
        class ClientFailure(RuntimeError):
            def __init__(self, code):
                self.code = code
                super().__init__('hostile credential path argument environment')
        context = observer.DiagnosticContext()
        context.lifecycle_failure = ClientFailure
        for stage in observer.DIAGNOSTIC_STAGES:
            context.at(stage)
            for code in observer.INTERNAL_CODES:
                result = observer.failure_payload(observer.ObservationFailure(code), context)
                self.assertEqual(result['diagnosticStage'], stage)
                self.assertEqual(result['diagnosticCode'], code)
                self.assertFalse(result['ok'])
                self.assertFalse(result['client_ok'])
                self.assertEqual(result['code'], 'NATIVE_OBSERVATION_FAILED')
                self.assertEqual(result['stage'], 'native-observation')
                self.assertEqual(set(result), {'ok', 'client_ok', 'code', 'stage', 'diagnosticStage', 'diagnosticCode'})
        for code in observer.LIFECYCLE_CODES:
            self.assertEqual(observer.failure_payload(ClientFailure(code), context)['diagnosticCode'], code)
        class Impostor(ClientFailure): pass
        for error in (ClientFailure('hostile'), Impostor('PROCESS_NOT_FOUND'), ValueError('WINDOW_OWNER_CHANGED hostile'), RuntimeError('hostile')):
            result = observer.failure_payload(error, context)
            self.assertEqual(result['diagnosticCode'], 'UNEXPECTED_EXCEPTION')
            self.assertNotIn('hostile', json.dumps(result))
        context.closure_code = 'hostile private detail'
        self.assertNotIn('diagnosticClosureCode', observer.failure_payload(RuntimeError('hostile'), context))
        with self.assertRaises(ValueError): context.at('hostile')
        with self.assertRaises(ValueError): observer.ObservationFailure('hostile')
        output = io.StringIO()
        def rejected(ctx):
            ctx.at('before-tree')
            raise ClientFailure('INVALID_PROCESS_TREE')
        with contextlib.redirect_stdout(output):
            self.assertEqual(observer.run(rejected), 1)
        result = json.loads(output.getvalue())
        self.assertFalse(result['ok'])
        self.assertEqual(result['diagnosticStage'], 'before-tree')
        self.assertNotIn('hostile', output.getvalue())
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(observer.run(lambda ctx: {'notSerializable': object()}), 1)
        self.assertEqual(json.loads(output.getvalue())['code'], 'NATIVE_OBSERVATION_FAILED')

    def test_native_geometry_stages_and_restoration_are_strict(self):
        class User:
            def __init__(self, fail): self.fail = fail; self.calls = 0
            def SetThreadDpiAwarenessContext(self, value):
                self.calls += 1
                return 0 if self.fail == ('enter' if self.calls == 1 else 'restore') else 17
            def GetClientRect(self, hwnd, rect):
                if self.fail == 'rect': return 0
                rect._obj.right = 100; rect._obj.bottom = 80
                return 1
            def GetWindowRect(self, hwnd, rect): return 1
            def GetDpiForWindow(self, hwnd):
                if self.fail == 'query': raise RuntimeError('hostile private detail')
                return 0 if self.fail == 'validate' else 96
            def GetWindowDpiAwarenessContext(self, hwnd): return 17
            def GetAwarenessFromDpiAwarenessContext(self, value): return 2
        for failure, stage, code, calls in (
            ('enter', 'native-dpi-enter', 'NATIVE_DPI_CONTEXT_UNAVAILABLE', 1),
            ('rect', 'native-geometry', 'NATIVE_GEOMETRY_UNAVAILABLE', 2),
            ('query', 'native-dpi-query', 'UNEXPECTED_EXCEPTION', 2),
            ('validate', 'native-geometry-validation', 'NATIVE_GEOMETRY_UNAVAILABLE', 2),
            ('restore', 'native-dpi-restore', 'NATIVE_DPI_CONTEXT_RESTORE_FAILED', 2)):
            context = observer.DiagnosticContext()
            native = observer.Native.__new__(observer.Native)
            native.context = context; native.user = User(failure)
            with self.assertRaises(Exception) as caught: native.geometry(123)
            result = observer.failure_payload(caught.exception, context)
            self.assertEqual(result['diagnosticStage'], stage)
            self.assertEqual(result['diagnosticCode'], code)
            self.assertFalse(result['ok'])
            self.assertEqual(native.user.calls, calls)
            self.assertNotIn('hostile', json.dumps(result))
        native.user = User(None)
        self.assertEqual(native.geometry(123)['dpi'], 96)
        self.assertEqual(native.user.calls, 2)

    def test_native_desktop_adapter_requests_only_read_enumerate_rights(self):
        calls = []
        class User:
            def OpenDesktopW(self, name, flags, inherit, rights):
                calls.append((name, flags, inherit, rights)); return 17
            def CloseDesktop(self, handle): calls.append(('close', handle)); return 1
        api = observer.DesktopNative.__new__(observer.DesktopNative); api.user = User()
        self.assertEqual(api.open('owned'), 17)
        self.assertTrue(api.close(17))
        self.assertEqual(calls, [('owned', 0, False, 0x41), ('close', 17)])

    def test_exact_desktop_worker_preserves_caller_and_handle_lifetime(self):
        self.run_desktop_fixture()

    def test_desktop_attachment_rejections_never_observe_or_search(self):
        for mode, code in [('open', 'NATIVE_DESKTOP_OPEN_FAILED'), ('wrong-open', 'NATIVE_DESKTOP_MISMATCH'), ('attach', 'NATIVE_DESKTOP_ATTACH_FAILED'), ('wrong-attached', 'NATIVE_DESKTOP_MISMATCH')]:
            with self.subTest(mode=mode): self.run_desktop_fixture(mode, code)
        self.run_desktop_fixture('invalid-name', 'NATIVE_DESKTOP_MISMATCH')

    def test_desktop_close_failures_preserve_primary_and_secondary_codes(self):
        self.run_desktop_fixture('close', 'NATIVE_DESKTOP_CLOSE_FAILED')
        self.run_desktop_fixture('close-throws', 'NATIVE_DESKTOP_CLOSE_FAILED')
        self.run_desktop_fixture('primary-close', 'WINDOW_OWNER_UNAVAILABLE')
        self.run_desktop_fixture('primary-close-throws', 'WINDOW_OWNER_UNAVAILABLE')
        self.run_desktop_fixture('caller-changed', 'NATIVE_CALLER_DESKTOP_CHANGED')
        self.run_desktop_fixture('identity-changed', 'WINDOW_OWNER_CHANGED')
        self.run_desktop_fixture('hash-changed', 'WINDOW_OWNER_CHANGED')

    def test_desktop_worker_timeout_never_closes_a_live_worker_handle(self):
        self.run_desktop_fixture('timeout', 'NATIVE_DESKTOP_WORKER_TIMEOUT')

    def run_desktop_fixture(self, mode='', expected_code=None):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / 'fixture.bin'; executable.write_bytes(b'fixture')
            identity = {'pid': 7, 'parentPid': 1, 'creationDate': '2026-10-09T00:00:00.0000000Z', 'executablePath': str(executable)}
            state = {'process': identity, 'desktop': 'owned', 'hwnd': 123}
            if mode == 'invalid-name': state['desktop'] = 'other\\desktop'
            context = observer.DiagnosticContext()
            events = []; threads = []; local = threading.local(); main = threading.get_ident()
            class Lifecycle:
                def _process_tree(self, root):
                    self_assert_worker(); return [identity.copy()]
                def _process_identity(self, pid): return identity.copy()
                def _same_process(self, expected, current): return expected == current
            def self_assert_worker():
                self.assertNotEqual(threading.get_ident(), main)
                self.assertEqual(getattr(local, 'desktop', 1), 2)
            class Desktop:
                reads = 0
                def current(inner):
                    if threading.get_ident() == main:
                        inner.reads += 1
                        return 9 if mode == 'caller-changed' and inner.reads > 1 else 1
                    return getattr(local, 'desktop', 1)
                def name(inner, handle):
                    return 'wrong' if (mode == 'wrong-open' or mode == 'wrong-attached' and getattr(local, 'desktop', 1) == 2) else 'owned'
                def open(inner, name):
                    self.assertNotEqual(threading.get_ident(), main)
                    self.assertEqual(name, 'owned'); events.append('open')
                    return 0 if mode == 'open' else 2
                def attach(inner, handle):
                    self.assertNotEqual(threading.get_ident(), main)
                    self.assertEqual(handle, 2); events.append('attach')
                    local.desktop = 2
                    return mode != 'attach'
                def close(inner, handle):
                    self.assertEqual(threading.get_ident(), main)
                    self.assertEqual(handle, 2)
                    self.assertFalse(threads[0].is_alive())
                    self.assertEqual(events[-1], 'worker-exited'); events.append('close')
                    if mode.endswith('throws'): raise RuntimeError('hostile private path credential')
                    return 'close' not in mode
            class Native:
                def __init__(inner, ctx): self_assert_worker()
                def owner(inner, hwnd):
                    self_assert_worker(); self.assertEqual(hwnd, 123)
                    if mode.startswith('primary'): raise observer.ObservationFailure('WINDOW_OWNER_UNAVAILABLE')
                    return 7
                def geometry(inner, hwnd):
                    self_assert_worker()
                    if mode == 'identity-changed': identity['creationDate'] = '2026-10-09T00:00:01.0000000Z'
                    if mode == 'hash-changed': executable.write_bytes(b'changed')
                    return {'clientRect': {'width': 100, 'height': 80}, 'dpi': 96}
            def thread_factory(*, target, daemon):
                self.assertTrue(daemon)
                def wrapped():
                    try: target()
                    finally: events.append('worker-exited')
                thread = threading.Thread(target=wrapped, daemon=daemon); threads.append(thread)
                if mode == 'timeout':
                    class Hung:
                        def start(inner): thread.start(); thread.join()
                        def join(inner, timeout): self.assertEqual(timeout, 60)
                        def is_alive(inner): return True
                    return Hung()
                return thread
            if expected_code:
                with self.assertRaises(Exception) as caught:
                    observer.observe_on_desktop(Lifecycle(), state, context, Desktop(), Native, thread_factory)
                projected = observer.failure_payload(caught.exception, context)
                self.assertEqual(projected['diagnosticCode'], expected_code)
                self.assertFalse(projected['ok']); self.assertFalse(projected['client_ok'])
                self.assertNotIn('hostile', json.dumps(projected))
                if 'close' in mode:
                    self.assertEqual(projected['diagnosticClosureCode'], 'DESKTOP_HANDLE_CLOSE_FAILED')
                if mode.startswith('primary'):
                    self.assertEqual(projected['diagnosticStage'], 'before-owner')
                if mode == 'timeout':
                    self.assertNotIn('close', events)
                    self.assertEqual(projected['diagnosticClosureCode'], 'DESKTOP_HANDLE_CLOSE_DEFERRED')
                if mode == 'invalid-name': self.assertEqual(events, [])
                elif mode == 'open': self.assertNotIn('close', events)
                elif mode != 'timeout': self.assertEqual(events[-1], 'close')
                if mode in ('wrong-open', 'open'): self.assertNotIn('attach', events)
            else:
                result = observer.observe_on_desktop(Lifecycle(), state, context, Desktop(), Native, thread_factory)
                self.assertTrue(result['ok'])
                self.assertEqual(result['desktopObservation'], {'callerDesktopUnchanged': True, 'desktopHandleClosed': True})
                self.assertEqual(events, ['open', 'attach', 'worker-exited', 'close'])
                self.assertEqual(context.closure_code, 'DESKTOP_HANDLE_CLOSED')
            self.assertEqual(getattr(local, 'desktop', 1), 1)

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
