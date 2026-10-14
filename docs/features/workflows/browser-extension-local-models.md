# Browser extension local models

The Models tab of the [Browser extension workspace](browser-extension-workspace.md) (Alt+8) connects the extension to a model server running on the same computer, in the style of Ollama. It lists and manages installed models and lets you chat with one, with each reply streamed in as it is written and shown as readable rich text. It does not use the paired desktop, and nothing in it is sent to any other computer.

## Connecting and permission

The extension asks for no host access when it is installed. The manifest lists `http://127.0.0.1/*` only under `optional_host_permissions`, and the page policy allows connections to `http://127.0.0.1:*` in addition to the public catalogue hosts the Dim sum tab already names. Choosing Connect asks the browser for that one permission, in direct response to the click. If the permission is refused, a message says so, the port and the earlier state stay as they were, and no request is made.

The Port field takes a whole number from 1024 to 65535 and defaults to 11434. Anything else is refused before the permission prompt appears. The address is always built as `http://127.0.0.1:` followed by the port, so the extension cannot be pointed at another host, another scheme or a path. Requests do not follow redirects, send no cookies or credentials and send no referrer.

After the permission is granted, the tab reads the server version, the installed models and the models currently loaded in memory. If the server cannot be reached, the tab says that the server is not running on that port and asks you to start it. Refresh reads the same three things again. Nothing is polled in the background.

## Installed models, pull and delete

Each installed model is listed with its size, and the ones the server reports as loaded are marked running. Model tags follow the same rules as the desktop application: letters, digits, dots, hyphens, underscores and slashes with at most one colon and tag, no consecutive dots or slashes, at most 200 characters, and no cloud models. A tag that breaks the rules is refused before anything is sent, and cloud entries in a server reply are left out of the list.

Pull takes a model tag and shows a progress bar from the completed and total byte counts the server reports, or an indeterminate bar while the server has not given a total. Cancel stops the download at once. The server may keep the parts it already has, so a later pull can continue. Only one pull runs at a time.

Delete asks first. A dialog names the exact tag, and Cancel is the default action, marked to receive focus when the dialog opens. Nothing is deleted until Delete model is chosen in that dialog, and the list is read again afterwards.

## Chat

Pick an installed model, write a message and choose Send. The whole conversation so far goes to the server with each new message, and the reply streams in piece by piece. Stop ends a reply early and keeps the part that arrived. If a reply fails before anything arrives, the message you wrote is put back in the field. A conversation holds at most 128 messages and a message at most 65,536 characters; a reply that reaches that length is stopped.

The conversation exists only in memory on that page. It is never written to browser storage, never exported and is gone when the page closes. Clear conversation empties it sooner. The only thing the Models tab stores is the choice of the open tab, as with every other tab.

## Rich text and copy

Replies are shown as paragraphs, headings, bullet and numbered lists, inline code, fenced code blocks, bold, italics and links. They are never built from markup strings. The response is first parsed into a plain token tree, and the page creates each element itself and sets its text, so HTML, script tags and event attributes in a reply appear as ordinary text. Only `http` and `https` addresses become links, and addresses with embedded credentials do not. Links open in a new tab with no opener and no referrer. Addresses with any other scheme, such as script or data addresses, stay plain text. A code fence that has not been closed yet, as happens while a reply is streaming, is shown as code to the end of the text.

Every model reply has Copy response, which copies the reply as the plain text the model wrote, and every code block has Copy code, which copies only that block. A short status line confirms the copy without interrupting anything. If the browser refuses clipboard access, the line says that nothing was copied.

Panels and messages use the same fade-in as the rest of the workspace. Browsers that ask for reduced motion, and the reduced stimulus setting, turn the motion off. Every label is available in English, Cantonese or both, and follows the language chosen for the workspace.

## Failure modes

- The server is not running, is on another port or the permission was refused: the tab says so and keeps the buttons that need a connection disabled.
- The server answers with an error status, an unexpected shape, a malformed line or a line over 1 MiB: the request ends with a plain message, and the partial reply stays visible.
- A stream ends before the server reports it is finished: the tab reports that the stream ended early rather than showing a finished reply.
- A pull or chat takes longer than its time limit, one hour for a pull and ten minutes for a chat, or the response grows past 16 MiB: the request is stopped.

## Security notes

The permission is narrow, optional and requested only when asked for, but any program on the same computer can listen on a loopback port, so the extension trusts whatever answers on the port you choose. Replies are treated as untrusted text and are never run or interpreted as markup. The server's own error text is not shown, only a fixed message. Pulling a model downloads large files chosen by the server, so a tag should be one you recognise.

## Verification

This feature was verified with automated tests and a fake in-process server. The tests cover the endpoint and port rules, model tag validation, request field checks, split-line streaming, size limits, cancellation, time limits, error statuses, early stream ends, the permission refusal path, the rich text parser, the safe link rules, the copy actions and the packaging policy. It has not been checked against a real installed Ollama, a real browser permission prompt or a real clipboard, so behaviours that depend on them, including the origin settings of a particular Ollama installation, remain unverified.
