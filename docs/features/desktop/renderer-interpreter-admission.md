# Renderer interpreter command admission

The hidden renderer verifier binds the exact running Python interpreter, its optional virtual-environment launcher, and the owning Node process before admitting a browser connection. Interpreter image paths, creation ordering, isolated environment metadata, executable hashes, and held process handles remain required.

Supported CPython redirectors expose two exact native command forms: the original launcher invocation, or an always-quoted base-interpreter path followed by the original argument list. The default configuration constructs both complete strings from the verified interpreter paths and actual verifier arguments. No substring matching, argument normalization, alternate quoting, or image-only acceptance is used. An intermediate launcher must still expose the original launcher invocation exactly.

The selected form is recorded as `interpreterCommandForm` in the client binding. Later admission against that binding rejects a form change. Complete held commands are retained in the ancestry evidence and observed again after the protected operation. Existing injected configurations that supply only `baseCommand` remain limited to that exact command.

## Verification and limitations

The focused recovery suite passes 17 tests. Its new default-configuration regression covers both console and GUI interpreter names, paths containing spaces, direct and intermediate-launcher ancestry, both supported command forms, and rejection of a changed interpreter, script, intent path, extra argument, quoting boundary, intermediate command, or previously bound form. Changing the redirected candidate back to the original launcher command makes both new interpreter subcases fail; restoring the implementation passes.

The motivating source-renderer attempt stopped before the observer binding and installed-tool phases. It created no target launch receipt. Those original journals remain evidence of rejected admission, not browser or packaged application acceptance. A passing unit suite does not establish that the renderer interaction, native ownership lifecycle, or packaged acceptance has passed. A separately reviewed, source-bound runtime run remains necessary.

## 廣東話

隱藏渲染器驗證會先核對實際 Python 執行檔、可選虛擬環境啟動器，以及所屬 Node 程序。執行檔路徑、建立時間次序、隔離環境設定、檔案雜湊同已持有嘅程序控制代碼，全部仍然要逐項符合。

支援嘅 CPython 轉向器有兩種完整命令格式：保留原啟動命令，或者用加引號嘅基礎解譯器路徑，加返原有參數。驗證器只接受由已核實路徑同實際參數產生嘅兩個完整字串，唔會用部分比對、參數正規化或者單憑執行檔相同就放行。中間啟動器仍然必須完全符合原命令。

選中格式會記錄喺 `interpreterCommandForm`。後續驗證唔接受格式轉換；操作後亦會重新核對持有嘅完整命令同程序身分。原本只指定單一命令嘅測試設定，仍然只接受嗰一個命令。

17 項針對性測試通過；刻意還原舊候選命令後，控制台同 GUI 兩個新增情況都失敗，恢復修正後再通過。原先執行喺瀏覽器啟動之前已停止，保留紀錄唔代表互動、原生生命週期或者封裝驗收通過。仍然需要獨立審核後再執行綁定來源嘅實際驗證。
