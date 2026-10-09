# History and Recycle Bin

New format 2 vaults store separately encrypted fixed-size chunks. The default physical chunk size is 10 MiB and the maximum is 90,000,000 bytes, including encryption framing. The last chunk may be shorter. A normal edit reuses unchanged ciphertext; explicit re-split changes existing chunk boundaries without losing history.

## Versions

A file receives a recoverable version after 30 seconds without changes, or through **Save version now**. Versions remain retained forever by default. A configurable history period filters the restore list; it does not silently erase underlying history. Restoring an earlier version makes that content current as a new version and preserves the replaced version.

## Deletion recovery

Deleting through Explorer or the application removes the item from the active drive and records an encrypted recoverable deletion. Recycle Bin supports file and folder restore, selection, bulk restore and search. Restoring into an occupied location preserves both copies.

**Empty Recycle Bin removes entries from the bin, but their versions remain recoverable through History.** It does not promise permanent erasure or complete storage reclamation. Permanent history purge is outside this preview.

## Offline and compatibility

Content downloads on demand; explicit pins keep selected data offline. Pending edits remain protected. Restoring unavailable history needs a source connection and must not report success without its authenticated content.

Existing format 1 vaults are not automatically converted. The explicit copy-upgrade flow writes a separate format 2 vault, verifies it and preserves the original.

## Verification status

Focused engine and interface tests exist. Integrated transport, real built-interface behavior and the final installed lifecycle must be verified against the exact release bytes before the preview is called complete. Historical captures do not prove these new surfaces.

## 廣東話

新格式用獨立加密分塊，預設每塊最多 10 MiB，實體上限連加密資料係 90,000,000 bytes。一般修改只重寫改咗嘅分塊。檔案停止修改 30 秒後會儲存版本，亦可以手動儲存；預設一直保留歷史。

刪除嘅檔案同資料夾會入資源回收筒，可以搜尋同批量還原。還原位置有人用緊，就保留兩份。清空回收筒只移走筒內項目，歷史仍然可以救返，唔代表永久刪除或者即刻騰晒空間。

舊格式唔會偷偷轉換。明確選擇升級先會建立另一份、驗證內容，再使用新副本，原本資料保留。新版畫面同安裝流程仍然要用實際製成品驗證，唔可以靠舊圖片當收據。
