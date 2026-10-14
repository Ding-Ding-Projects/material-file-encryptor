# Browser-initiated external editor

After pairing, refresh Connection to discover whether the installed desktop host supports the external-editor workflow. **Choose file and editor on desktop** starts one bounded native request. The desktop first asks whether to proceed, opens native file and editor pickers, and then shows the selected paths in a final launch confirmation. Cancelling any choice launches nothing.

The browser never supplies a path, document identifier, executable, arguments or credentials. Only the desktop selections are used. The existing editor service accepts supported Microsoft-signed editor executables, verifies their bytes again before launch, and invokes them without a shell. The browser receives only `opened` or `cancelled`, never selected paths or file contents. `opened` means the process emitted its spawn event; it does not prove an editor round trip or a saved document.

The request has a two-minute deadline. **Cancel request and disconnect** revokes the browser connection. Locking the drive, replacing the pair, disconnecting or closing the host also invalidates the operation. Admission is checked before and after asynchronous choices and immediately before spawning the editor. A native picker may remain open after cancellation; its eventual result cannot launch anything, and another editor request is refused while it remains outstanding. An editor already launched after confirmation is not closed by browser cancellation.

## Verification and limits

`test/extension-editor-workflow.test.js` checks the typed request allowlist, pair replacement, revocation, deadlines, native selection and confirmation, and cancellation during signature verification before spawn. `test/extension-editor-transport.test.js` exercises framed native requests and the extension background relay, including extra-field rejection and suppression of native path-bearing responses.

These checks use deterministic native-process and picker fixtures. Actual signed extension installation, native dialogs, editor launch, return and save acceptance remain unverified. No conversion, model management or School mode capability is advertised by this workflow.

Native confirmations and pickers use the validated extension language (English, Cantonese or bilingual). Keyboard focus moves to cancellation while waiting, and returns to the launch or refresh control after completion or cancellation.
