# 完整本機內置字型

來源清單固定官方完整 Noto Sans 標準及斜體可變字型（2.008 版），以及完整
Noto Sans CJK HK 可變字型（2.004 版）。香港字型唔係區域子集檔案。
呢啲係刻意固定嘅版本，唔代表最新發行。

`src/shared/fonts/manifest.js` 記錄不可變上游修訂、可信下載網址、確實位元組
數量、SHA-256、已解析軸及命名實例。兩份官方 SIL Open Font License 1.1
授權都會下載、驗證雜湊，並同未修改字型一齊分發。來源係官方
[Noto 字型分發](https://github.com/notofonts/noto-fonts/tree/ffebf8c1ee449e544955a7e813c54f9b73848eac)
及 [Noto CJK Sans 2.004 分發](https://github.com/notofonts/noto-cjk/tree/523d033d6cb47f4a80c58a35753646f5c3608a78)。

## 暫存及接駁

執行 `node scripts/stage-bundled-fonts.mjs`，或者呼叫 `stageBundledFonts` 並提供
輸出與快取目錄、取消訊號及進度回呼。下載沿用項目固定來源快取模式，串流
寫入有大小上限、逾時及確實雜湊驗證。完整暫存目錄會先驗證，之後先原子
發布。錯誤或取消唔會發布該目錄。現有相符目錄會先驗證再重用，內容衝突
會拒絕，唔支援連結暫存路徑。

回傳 `rendererDirectory` 及 `siteDirectory` 各自包括本機 `fonts.css`、三個完整
字型及兩份授權。將整個目錄複製到各產品封裝或本機資產目錄，再載入 CSS。
CSS 只用相對資產網址，執行時冇字型網絡要求，亦冇字形子集化。
`bundledFontDescriptors` 要求同源目錄網址，接駁端提供已驗證資產存在之前
會標示無法使用。暫存只代表 `staged-awaiting-renderer-validation`，唔係畫面證據。

獨立 CSS 別名會區分標準、斜體及香港字型，原有家族與樣式中繼資料另行
保留。外觀接駁必須明確對應別名及樣式，先可以套用可變軸。現有選擇器會
刻意拒絕未對應嘅斜體或 Thin 樣式，唔可以偷偷改叫 Regular 就當選取成功。

## 證據及待辦

作者快取保留真正已驗證官方檔案。兩份本機暫存目錄已經由該快取產生，
期間停用下載，之後驗證全部字型、授權位元組及 CSS。測試會拒絕不完整或
錯誤雜湊、取消及無關網絡來源。產生位元組只放喺忽略嘅 `font-assets/` 及
`.cache/`，唔會提交普通版本控制或標準 Git LFS。呢個單位未建立受支援雲端
傳輸發布路線，亦冇聲稱已發布。

建置、封裝、網站掛鈎、描述資料轉交、確實字型對應及真正畫面驗收仍待
接駁。冇安裝系統字型、操作產品 GUI 或進行大型建置。
