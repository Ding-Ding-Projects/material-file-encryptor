"""Offline retention protocol checks using the real ancestry and identity comparators."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import queue
import sys
import subprocess
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


root = Path(__file__).resolve().parents[1]
tool = load('handle_keeper_test', root / 'scripts/owned-exit-handle-keeper.py')
policy = load('keeper_policy_test', root / 'scripts/local-headless-desktop-check-policy.py')
lifecycle = load('keeper_identity_test', Path.home() / '.agents/skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py')
parent = {'pid': 77, 'parentPid': 1, 'creationDate': '2026-10-09T12:00:00.0000000Z', 'executablePath': 'C:/owned/app.exe'}
child = {'pid': 78, 'parentPid': 77, 'creationDate': '2026-10-09T12:00:00.0000001Z', 'executablePath': 'C:/owned/child.exe'}


class Native:
    def __init__(self):
        self.opened, self.closed = [], []
        self.fail_pid = None
        self.wrong_pid = False
        self.fail_close = False

    def open(self, pid):
        if pid == self.fail_pid:
            raise tool.KeeperFailure('HANDLE_ACQUISITION_FAILED')
        self.opened.append(pid)
        return pid

    def pid(self, handle):
        return handle + 1 if self.wrong_pid else handle

    def close(self, handle):
        self.closed.append(handle)
        return not self.fail_close


class KeeperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.state = self.directory / 'lifecycle.json'
        self.proof = self.directory / 'exit-processes.json'
        self.input = self.directory / 'input.py'
        self.input.write_text('original')
        self.saved = {'created': True, 'cleaned': False, 'process': parent}
        self.state.write_text(json.dumps(self.saved))
        self.proof.write_text(json.dumps({'root': parent, 'processes': [parent, child]}))
        self.native = Native()
        self.live = [parent, child]
        self.absent = True
        self.confirm_result = {'ok': True, 'client_ok': True, 'gracefulExit': True, 'recordedProcessesAbsent': True, 'desktopClosed': True}
        self.confirm_calls = 0
        self.patches = [patch.object(lifecycle, '_read_state', side_effect=lambda path: (Path(path), json.loads(Path(path).read_text()))),
                        patch.object(lifecycle, '_process_tree', side_effect=lambda process: self.live),
                        patch.object(lifecycle, '_process_identity', side_effect=lambda pid: next(item for item in self.live if item['pid'] == pid)),
                        patch.object(lifecycle, '_recorded_tree_absent', side_effect=lambda processes: self.absent)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        self.keeper = tool.Keeper(lifecycle, policy, self.native, self.state, self.proof,
                                  {str(self.input): tool.digest(self.input)}, lambda: None, self.confirm)

    def confirm(self, timeout):
        self.assertEqual(self.native.closed, [])
        self.assertEqual(len(self.keeper.handles), 2)
        self.confirm_calls += 1
        state = dict(self.saved)
        state['cleaned'] = True
        self.state.write_text(json.dumps(state))
        return self.confirm_result

    def run_protocol(self, commands, deadline=None):
        messages = queue.Queue()
        for command in commands:
            messages.put(command)
        emitted = []
        try:
            tool.serve(self.keeper, messages, deadline or time.monotonic() + 1, emitted.append)
        finally:
            if self.keeper.handles:
                self.keeper.release()
        return emitted

    def test_complete_protocol_retains_both_until_original_confirmation(self):
        result = self.run_protocol([{'command': 'confirm'}, {'command': 'release'}])
        self.assertEqual([item['code'] for item in result], ['HANDLES_READY', 'ORIGINAL_CONFIRM_VERIFIED', 'HANDLES_RELEASED'])
        self.assertEqual(self.native.closed, [77, 78])
        self.assertEqual(self.confirm_calls, 1)

    def test_partial_acquisition_never_ready_and_releases_earlier_handles(self):
        self.native.fail_pid = 78
        with self.assertRaisesRegex(tool.KeeperFailure, 'HANDLE_ACQUISITION_FAILED'):
            self.keeper.acquire()
        self.assertEqual(self.native.closed, [77])
        self.assertFalse(any(item['event'] == 'ready' for item in self.keeper.events))

    def test_native_pid_race_rejected(self):
        self.native.wrong_pid = True
        with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_IDENTITY_CHANGED'):
            self.keeper.acquire()
        self.assertEqual(self.native.closed, [77])

    def test_cim_bookend_race_rejected_without_normalization(self):
        calls = 0
        def identity(pid):
            nonlocal calls
            calls += 1
            return parent if calls == 1 else dict(parent, executablePath='C:/different/app.exe')
        with patch.object(lifecycle, '_process_identity', side_effect=identity):
            with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_IDENTITY_CHANGED'):
                self.keeper.acquire()
        self.assertEqual(self.native.closed, [77])

    def test_extra_identity_rejected(self):
        self.live = [parent, child, dict(child, pid=79)]
        with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_TREE_CHANGED'):
            self.keeper.acquire()
        self.assertEqual(self.native.opened, [])

    def test_missing_identity_rejected(self):
        self.live = [parent]
        with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_TREE_CHANGED'):
            self.keeper.acquire()

    def test_second_full_tree_revalidation_detects_new_child(self):
        with patch.object(lifecycle, '_process_tree', side_effect=[[parent, child], [parent, child, dict(child, pid=79)]]):
            with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_TREE_CHANGED'):
                self.keeper.acquire()
        self.assertEqual(self.native.closed, [77, 78])

    def test_helper_or_script_change_rejected(self):
        self.input.write_text('changed')
        with self.assertRaisesRegex(tool.KeeperFailure, 'INPUT_BINDING_CHANGED'):
            self.keeper.acquire()

    def test_original_proof_change_rejected(self):
        self.proof.write_text('{}')
        with self.assertRaisesRegex(tool.KeeperFailure, 'EXIT_PROOF_CHANGED'):
            self.keeper.acquire()

    def test_lifecycle_change_rejected(self):
        self.state.write_text('{}')
        with self.assertRaisesRegex(tool.KeeperFailure, 'LIFECYCLE_CHANGED'):
            self.keeper.acquire()

    def test_initial_child_predates_parent_still_rejected(self):
        self.proof.write_text(json.dumps({'root': parent, 'processes': [parent, dict(child, creationDate='2026-10-09T11:59:59.0000000Z')]}))
        self.keeper.proof_hash = tool.digest(self.proof)
        self.keeper.proof_bytes = self.proof.read_bytes()
        self.keeper.proof = json.loads(self.proof.read_text())
        with self.assertRaises(lifecycle.ClientFailure) as caught:
            self.keeper.acquire()
        self.assertEqual(caught.exception.code, 'UNPROVEN_PROCESS_ANCESTRY')
        self.assertEqual(caught.exception.rejected_edge['reasonCode'], 'CHILD_PREDATES_PARENT')
        self.assertEqual(self.native.opened, [])

    def test_confirm_requires_true_original_absence(self):
        self.absent = False
        with self.assertRaisesRegex(tool.KeeperFailure, 'ORIGINAL_CONFIRM_NOT_VERIFIED'):
            self.run_protocol([{'command': 'confirm'}])
        self.assertEqual(self.native.closed, [77, 78])

    def test_original_confirm_failed_result_rejected(self):
        self.confirm_result['client_ok'] = False
        with self.assertRaisesRegex(tool.KeeperFailure, 'ORIGINAL_CONFIRM_NOT_VERIFIED'):
            self.run_protocol([{'command': 'confirm'}])

    def test_caller_success_cannot_substitute_for_confirm(self):
        with self.assertRaisesRegex(tool.KeeperFailure, 'INVALID_COMMAND_ORDER'):
            self.run_protocol([{'command': 'release', 'ok': True}])
        self.assertEqual(self.confirm_calls, 0)

    def test_release_before_confirm_rejected(self):
        with self.assertRaisesRegex(tool.KeeperFailure, 'INVALID_COMMAND_ORDER'):
            self.run_protocol([{'command': 'release'}])

    def test_timeout_releases_handles(self):
        with self.assertRaisesRegex(tool.KeeperFailure, 'KEEPER_TIMEOUT'):
            self.run_protocol([], time.monotonic() + .001)
        self.assertEqual(self.native.closed, [77, 78])

    def test_eof_releases_handles(self):
        with self.assertRaisesRegex(tool.KeeperFailure, 'KEEPER_EOF'):
            self.run_protocol([None])
        self.assertEqual(self.native.closed, [77, 78])

    def test_failed_release_is_not_accepted(self):
        self.keeper.acquire()
        self.native.fail_close = True
        with self.assertRaisesRegex(tool.KeeperFailure, 'HANDLE_RELEASE_FAILED'):
            self.keeper.release()
        self.assertEqual(len(self.keeper.handles), 2)
        self.native.fail_close = False
        self.keeper.release()

    def test_final_state_permits_only_cleaned_transition(self):
        self.keeper.acquire()
        self.saved['unrelated'] = True
        with self.assertRaisesRegex(tool.KeeperFailure, 'LIFECYCLE_CHANGED'):
            self.keeper.confirm(1)
        self.keeper.release()

    def test_expired_acquisition_deadline_never_opens(self):
        self.keeper.deadline = time.monotonic() - 1
        with self.assertRaisesRegex(tool.KeeperFailure, 'KEEPER_TIMEOUT'):
            self.keeper.acquire()
        self.assertEqual(self.native.opened, [])

    def test_actual_confirm_subprocess_receives_original_command(self):
        adapter = self.directory / 'adapter.py'
        adapter.write_text('import json,sys\nassert sys.argv[1:] == ["confirm-exit", '+repr(str(self.state))+']\nprint(json.dumps({"ok": True, "client_ok": True, "recordedProcessesAbsent": True, "desktopClosed": True}))')
        self.assertTrue(tool.original_confirm(sys.executable, adapter, self.state, 2)['recordedProcessesAbsent'])

    def test_actual_confirm_nonzero_rejected_even_with_success_json(self):
        adapter = self.directory / 'adapter.py'
        adapter.write_text('print(\'{"ok":true,"client_ok":true,"recordedProcessesAbsent":true,"desktopClosed":true}\')\nraise SystemExit(1)')
        with self.assertRaisesRegex(tool.KeeperFailure, 'ORIGINAL_CONFIRM_FAILED'):
            tool.original_confirm(sys.executable, adapter, self.state, 2)

    def test_live_query_failure_releases_partial_handles(self):
        with patch.object(lifecycle, '_process_identity', side_effect=[parent, parent, lifecycle.ClientFailure('PROCESS_PROOF_FAILED', 'private sentinel')]):
            with self.assertRaises(lifecycle.ClientFailure):
                self.keeper.acquire()
        self.assertEqual(self.native.closed, [77])

    def test_input_change_after_ready_rejected_before_original_confirm(self):
        self.keeper.acquire()
        self.input.write_text('changed')
        with self.assertRaisesRegex(tool.KeeperFailure, 'INPUT_BINDING_CHANGED'):
            self.keeper.confirm(1)
        self.assertEqual(self.confirm_calls, 0)
        self.keeper.release()

    def test_absence_required_again_at_release(self):
        self.keeper.acquire()
        self.keeper.confirm(1)
        self.absent = False
        messages = queue.Queue()
        messages.put({'command': 'release'})
        with patch.object(self.keeper, 'acquire'):
            with self.assertRaisesRegex(tool.KeeperFailure, 'RECORDED_PROCESSES_PRESENT'):
                tool.serve(self.keeper, messages, time.monotonic() + 1, lambda item: None)
        self.keeper.release()

    def test_graceful_flag_required(self):
        del self.confirm_result['gracefulExit']
        with self.assertRaisesRegex(tool.KeeperFailure, 'ORIGINAL_CONFIRM_NOT_VERIFIED'):
            self.run_protocol([{'command': 'confirm'}])

    def test_extra_proof_fields_rejected(self):
        proof = json.loads(self.proof.read_text())
        proof['extra'] = 'hostile sentinel'
        self.proof.write_text(json.dumps(proof))
        with self.assertRaisesRegex(tool.KeeperFailure, 'INVALID_EXIT_PROOF'):
            tool.Keeper(lifecycle, policy, self.native, self.state, self.proof, {}, lambda: None, self.confirm)

    def execute_main(self, commands, failed_release=False, receipt_name='exit-handle-keeper.json'):
        helper = self.directory / 'helper.py'
        helper.write_text('# private sentinel')
        receipt = self.directory / receipt_name
        state = dict(self.saved, runRoot=str(self.directory), outputRoot=str(self.directory / 'output'))
        self.state.write_text(json.dumps(state))
        python = Path(sys.executable)
        fake_transport = SimpleNamespace(file_binding=lambda p: None, install_receipt_transport=lambda *a, **k: lambda: {'python': {'path': str(python), 'sha256': tool.digest(python)}})
        original_load = tool.load
        def imported(name, path):
            if name == 'keeper_transport': return fake_transport
            if name == 'keeper_lifecycle': return lifecycle
            return original_load(name, path)
        def confirmed(*args):
            self.assertEqual(self.native.closed, [])
            state['cleaned'] = True
            self.state.write_text(json.dumps(state))
            return self.confirm_result
        source = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        arguments = ['keeper', '--state', str(self.state), '--helper-sha256', tool.digest(helper), '--script-sha256', tool.digest(root / 'scripts/owned-exit-handle-keeper.py'), '--source-commit', source, '--receipt', str(receipt), '--timeout', '2']
        output = io.StringIO()
        self.native.fail_close = failed_release
        with patch.object(sys, 'argv', arguments), patch.object(sys, 'stdin', io.StringIO(commands)), contextlib.redirect_stdout(output), patch.dict(tool.os.environ, {'MFE_LOWLEVEL_CLIENT': str(helper), 'MFE_LOWLEVEL_CLI': 'private sentinel', 'MFE_LOWLEVEL_URL': ''}, clear=False), patch.object(tool, 'load', side_effect=imported), patch.object(tool, 'NativeHandles', return_value=self.native), patch.object(tool, 'original_confirm', side_effect=confirmed), patch.object(lifecycle, '_checked_private_path', side_effect=lambda p, **kw: p, create=True), patch.object(lifecycle, '_reject_link_components'), patch.object(lifecycle, '_pinned_private_directories', side_effect=lambda *a: contextlib.nullcontext(), create=True):
            status = tool.main()
        public = output.getvalue()
        self.assertNotIn(str(self.directory), public)
        self.assertNotIn('private sentinel', public)
        self.assertNotIn('executablePath', public)
        return status, public, json.loads(receipt.read_text())

    def test_main_protocol_writes_exclusive_private_receipt(self):
        status, public, receipt = self.execute_main('{"command":"confirm"}\n{"command":"release"}\n')
        self.assertEqual(status, 0)
        self.assertTrue(receipt['accepted'])
        self.assertEqual(receipt['unreleasedCount'], 0)
        self.assertEqual(receipt['proofSha256'], tool.digest(self.proof))
        self.assertIn('HANDLES_RELEASED', public)

    def test_main_eof_is_nonacceptance_with_closed_handles(self):
        status, public, receipt = self.execute_main('')
        self.assertEqual(status, 1)
        self.assertFalse(receipt['accepted'])
        self.assertEqual(receipt['code'], 'KEEPER_EOF')
        self.assertEqual(self.native.closed, [77, 78])

    def test_main_failed_release_remains_red_and_neutral(self):
        status, public, receipt = self.execute_main('{"command":"confirm"}\n{"command":"release"}\n', failed_release=True)
        self.assertEqual(status, 1)
        self.assertFalse(receipt['accepted'])
        self.assertEqual(receipt['unreleasedCount'], 2)
        self.assertIn('HANDLE_RELEASE_FAILED', public)

    def test_digest_parse_swap_cannot_acquire_different_disk_proof(self):
        original_bytes = self.proof.read_bytes()
        alternate = dict(child, pid=79)
        replacement = {'root': parent, 'processes': [parent, alternate]}
        original_digest = tool.digest
        swapped = False
        def racing_digest(path):
            nonlocal swapped
            value = original_digest(path)
            if Path(path) == self.proof and not swapped:
                swapped = True
                self.proof.write_text(json.dumps(replacement))
            return value
        with patch.object(tool, 'digest', side_effect=racing_digest):
            keeper = tool.Keeper(lifecycle, policy, self.native, self.state, self.proof,
                                 {str(self.input): original_digest(self.input)}, lambda: None, self.confirm)
        self.proof.write_bytes(original_bytes)
        self.live = [parent, alternate]
        with self.assertRaisesRegex(tool.KeeperFailure, 'PROCESS_TREE_CHANGED'):
            keeper.acquire()
        self.assertEqual(self.native.opened, [])

    def test_hard_linked_proof_rejected(self):
        linked = self.directory / 'linked.json'
        tool.os.link(self.proof, linked)
        with self.assertRaisesRegex(tool.KeeperFailure, 'UNSAFE_EXIT_INPUT'):
            tool.Keeper(lifecycle, policy, self.native, self.state, self.proof, {}, lambda: None, self.confirm)

    def test_private_diagnostic_retains_stage_type_without_message(self):
        with patch.object(self.native, 'open', side_effect=TimeoutError('private sentinel C:/private/identity')):
            status, public, receipt = self.execute_main('')
        self.assertEqual(status, 1)
        self.assertEqual(receipt['failure']['stage'], 'handle-acquisition')
        self.assertEqual(receipt['failure']['exceptionType'], 'TimeoutError')
        self.assertTrue(receipt['failure']['callsites'])
        self.assertLessEqual(len(receipt['failure']['callsites']), 8)
        self.assertNotIn('private sentinel', json.dumps(receipt['failure']))
        self.assertNotIn('C:/private', json.dumps(receipt['failure']))
        self.assertEqual(set(json.loads(public.strip())), {'ok', 'code', 'heldCount'})

    def test_versioned_attempt_preserves_failed_original_receipt(self):
        status, _, _ = self.execute_main('')
        self.assertEqual(status, 1)
        original = (self.directory / 'exit-handle-keeper.json').read_bytes()
        name = 'exit-handle-keeper-' + 'a' * 32 + '.json'
        self.native = Native()
        status, _, receipt = self.execute_main('{"command":"confirm"}\n{"command":"release"}\n', receipt_name=name)
        self.assertEqual(status, 0)
        self.assertTrue(receipt['accepted'])
        self.assertEqual((self.directory / 'exit-handle-keeper.json').read_bytes(), original)

    def test_default_receipt_existing_remains_immutable(self):
        self.execute_main('')
        original = (self.directory / 'exit-handle-keeper.json').read_bytes()
        status, public, _ = self.execute_main('')
        self.assertEqual(status, 1)
        self.assertIn('INVALID_RECEIPT_DESTINATION', public)
        self.assertEqual((self.directory / 'exit-handle-keeper.json').read_bytes(), original)

    def test_private_diagnostic_bounds_hostile_names(self):
        hostile = type('C:/private/sentinel', (Exception,), {})
        try:
            raise hostile('identity payload')
        except Exception as error:
            result = tool.private_failure(error, 'C:/private/stage')
        self.assertEqual(result['stage'], 'initialization')
        self.assertEqual(result['exceptionType'], 'Exception')
        self.assertNotIn('identity payload', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
