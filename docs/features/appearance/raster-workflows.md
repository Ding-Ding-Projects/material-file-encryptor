# Raster groups and local appearance revisions

## Current implementation

**Rasterize group** composites a group's bounded source layers into an independent 512 × 512 PNG surface. Nested groups composite separately before their opacity and blend mode apply to the parent. Supported content is static HEX background fills, normalized PNG images, rectangle/ellipse/polygon/path masks, ordered canvas filter effects, and the existing affine transforms. Unsupported typography, channel gains, color-range selections and other CSS properties are rejected for rasterization. They remain available through the existing live CSS editor. The prior valid model remains active after a processing failure.

**Embed immutable source** retains a deeply frozen snapshot of the source layer tree. Outer transforms and mesh parameters remain separate. **Restore embedded source** regenerates from that original tree; **Detach embedded copy** creates editable source children without changing the original snapshot in older revisions. The format is this application's bounded layer schema, not a general Photoshop or SVG document importer.

**Triangle mesh warp** exposes a 3 × 3 point grid with numeric X/Y controls. Each of four cells is split into two triangles. Canvas affine mapping renders each triangle independently. Repeated changes regenerate from the embedded original instead of repeatedly deforming a previous result. Points are bounded to −100–200 percent; collapsed triangles are rejected. This is a two-dimensional piecewise-affine warp, with possible sampling seams, not a three-dimensional deformation model.

Named-color entry accepts the 148 CSS names and `transparent`, case insensitively, alongside existing numeric spaces. The reverse readout includes every exact alias only when its alpha also matches. Colors outside the supported sRGB gamut are rejected rather than silently clipped.

## Processing boundary

`mountAppearanceEditor` accepts `normalizeImage({dataUrl})`, an optional host callback for desktop isolation. Input PNG bytes are bounded and inspected before this call. The returned static PNG is checked again for signature, dimensions, byte length and matching metadata. The callback must reject unavailable isolation rather than decode the original in the renderer.

Without that callback, one dedicated module worker performs each normalization/compositing operation using `createImageBitmap` and `OffscreenCanvas`. It has no DOM access, removes its ambient network APIs, and is terminated after ten seconds, on cancellation, on success or on failure. Input remains capped at 4 MiB, 4096 pixels per side and eight million pixels. Composites are capped at 1024 pixels per side, 128 layers and four nested levels; the UI uses 512 pixels. Normalized output is capped at 1 MiB. Closing or destroying the editor aborts active worker jobs. Late results cannot replace a newer edit.

Worker isolation is not a separate operating-system process or a hard process-memory quota. Native decoder security still depends on Chromium. Packaged AppContainer host-callback verification and genuine rendered-image inspection remain required before making a stronger isolation claim. PNG header inspection is not CRC validation; successful decoder normalization supplies a fresh PNG.

Each editor admits one active image operation, including custom host callbacks. The worker module separately admits at most one active worker in its renderer realm. Excess calls are rejected as busy immediately; no background queue grows behind the UI. Closing the editor aborts the active signal. Canvas backing stores are reset after each layer, child composite, unwarped source, and final output, with a final sweep on failure. These bounds do not include undocumented browser decoder allocations.

## Durable local revisions

Every successful appearance save appends a separate revision record to local storage before notifying the host or applying the new appearance. An ordered index links each revision to its predecessor. Existing records are never rewritten. The revision panel reloads these records and restores a selected snapshot as a new revision. Image bytes are recursively omitted, including embedded sources, so restoring a revision cannot restore local pixels. The UI discloses this limitation.

The local journal is redacted browser storage, not an encrypted archive or a Git repository. The existing password-protected host history remains separate. It is capped at 2000 records and 2 MiB per revision; reaching a bound rejects a new save. No silent pruning occurs. Failed journal writes restore the previous model and undo/redo stacks. If storage also rejects rollback, the editor reports recovery required and blocks further saves; `getPersistenceStatus()` exposes that state. Export the current style and reload before editing again.

Undo and redo together are capped at 16 MiB of UTF-8 snapshot data in addition to the existing entry-count cap. Oldest snapshots are evicted while retaining the nearest bounded revision. Models themselves are limited to 8 MiB of UTF-8 JSON. Revision reads are paginated to at most twenty records and 8 MiB per page. A failed index publication removes only that operation's newly created record; removal failure reports recovery required. Existing revisions and unrelated storage keys are not deleted.

## Verification status

Focused tests cover mesh geometry and degenerate rejection, worker cancellation and termination, invalid source output, host-callback precedence, immutable embedded snapshots, nested surface composition, path-clip preservation, append-only persistence and failure rollback. These are source/component tests. The new controls still require a package-bound interaction and pixel capture; previous package screenshots do not prove this source.

## 廣東話說明

「將群組轉成點陣預覽」會將支援嘅靜態填色、PNG 圖像、幾何遮罩、效果同變形合成獨立畫面。巢狀群組先各自合成，再套用透明度同混合模式。唔支援嘅文字或通道操作會明確拒絕，唔會靜靜地忽略。

「嵌入不可變更嘅來源」保留原始圖層快照。網格扭曲每次都由原始來源重新產生，唔會反覆扭曲上一次結果。三角網格係二維近似，可能有取樣接縫，唔係三維編輯器。

桌面主程式可以提供隔離解碼回呼。瀏覽器備用路徑使用獨立 worker，設有十秒時限、取消同輸入輸出限制，但唔等於獨立作業系統程序。實際安裝版本嘅隔離同像素效果仍然需要另外驗證。

本機外觀版本會逐項新增，唔會改寫舊記錄。還原會建立新版本。圖像像素唔會寫入版本記錄，所以版本還原唔能夠取回圖像。呢個係經刪除圖像資料嘅本機儲存，唔係加密備份或 Git 歷史。容量滿咗會拒絕新儲存；回復失敗會要求先匯出樣式再重新載入。
