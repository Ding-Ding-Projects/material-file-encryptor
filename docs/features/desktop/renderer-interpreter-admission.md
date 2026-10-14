# Renderer interpreter command admission

The hidden renderer verifier binds the exact running Python interpreter, its optional virtual-environment launcher, and the owning Node process before admitting a browser connection. Interpreter image paths, creation ordering, isolated environment metadata, executable hashes, and held process handles remain required.

Supported CPython redirectors expose two exact native command forms: the original launcher invocation, or an always-quoted base-interpreter path followed by the original argument list. The default configuration constructs both complete strings from the verified interpreter paths and actual verifier arguments. No substring matching, argument normalization, alternate quoting, or image-only acceptance is used. An intermediate launcher must still expose the original launcher invocation exactly.

The selected form is recorded as `interpreterCommandForm` in the client binding. Later admission against that binding rejects a form change. Complete held commands are retained in the ancestry evidence and observed again after the protected operation. Existing injected configurations that supply only `baseCommand` remain limited to that exact command.

## Verification and limitations

The focused recovery suite passes 17 tests. Its new default-configuration regression covers both console and GUI interpreter names, paths containing spaces, direct and intermediate-launcher ancestry, both supported command forms, and rejection of a changed interpreter, script, intent path, extra argument, quoting boundary, intermediate command, or previously bound form. Changing the redirected candidate back to the original launcher command makes both new interpreter subcases fail; restoring the implementation passes.

The motivating source-renderer attempt stopped before the observer binding and installed-tool phases. It created no target launch receipt. Those original journals remain evidence of rejected admission, not browser or packaged application acceptance. A passing unit suite does not establish that the renderer interaction, native ownership lifecycle, or packaged acceptance has passed. A separately reviewed, source-bound runtime run remains necessary.
