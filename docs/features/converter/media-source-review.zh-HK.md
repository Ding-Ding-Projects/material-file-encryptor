# FFmpeg 9.0.2 對應原始碼審查

## 結論

**未完整。根據目前收集到嘅資料，唔好將選用嘅 Gyan 媒體執行環境放入公開發佈版本。** 呢個係技術證據結論，唔係對發佈者嘅指控。六個媒體轉接器仍然已實作並喺本機驗證；排除佢哋嘅執行環境會令呢啲轉接器無法使用，而且必須喺發佈範圍入面披露。

機器可讀嘅[清單](media-source-inventory.json)記錄咗準確已接受封存檔內 README 列出嘅 55 個已啟用外部元件或硬件介面。當中記錄咗 37 個已報告版本字串，同 18 個缺少嘅版本字串。版本字串唔係原始碼封存檔雜湊、修補清單或者建置步驟。冇任何元件項目被標記為原始碼完整。

## 準確審查對象

- 封存檔 SHA-256：`60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`。
- ffmpeg.exe SHA-256：`3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec`。
- ffprobe.exe SHA-256：`f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52`。
- 發佈者 README SHA-256：`0342de6bb39dd421cbec2c00d89ad274b640d75ad3f2cab09ffd647ce2d8f949`。
- 報告嘅編譯器：GCC 16.2.0、Rev3、MSYS2 專案。
- 上游 FFmpeg 修訂版本解析為 `946fcce07b6dcd0331c8cc609192aeff5e1924f8`。

準確二進位檔嘅設定儲存喺清單入面。佢啟用 GPL/version3/靜態連結同好多外部元件。限制應用程式嘅指令設定檔，並唔會移除已經連結入呢個二進位檔嘅程式碼。

## 第一手來源調查

[發佈者建置頁面](https://www.gyan.dev/ffmpeg/builds/)列出 essentials 元件，並描述靜態 GPLv3 建置。[9.0.2 發佈版本](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2)有六個資產：essentials 7z/ZIP、full 7z/ZIP 同 full-shared 7z/ZIP。冇一個被標明為對應原始碼封存檔。佢嘅內文只提供 FFmpeg 修訂版本連結。

發佈者支援儲存庫嘅遞迴樹只有 `.github/FUNDING.yml` 同 `README.md`；冇任何建置腳本。一則[發佈者關於建置環境嘅留言](https://github.com/GyanD/codexffmpeg/issues/91#issuecomment-1474806731)描述 MSYS2/MinGW64 同 GCC。另一則[發佈者留言向用戶推薦 media-autobuild_suite](https://github.com/GyanD/codexffmpeg/issues/119#issuecomment-2028846467)。兩則都冇指出呢個已接受 9.0.2 對象嘅準確腳本修訂版本、設定、元件原始碼或者修補。目前建置頁面嘅工具鏈說明寫 UCRT64；所以較舊嘅一般留言只保留作歷史背景，唔當作準確建置步驟。

[FFmpeg 法律頁面](https://ffmpeg.org/legal.html)討論原始碼提供、設定同外部函式庫授權。單靠一條 FFmpeg 連結，無法確立一個連結咗額外元件嘅靜態執行檔嘅原始碼完整範圍。呢份審查唔會建立書面要約，亦唔聲稱滿足任何要約途徑。

## 缺少嘅證據

呢次收集入面，每個元件仍然缺少經驗證、相符嘅原始碼封存檔雜湊同準確建置步驟。特別係：

- README 冇報告 bzlib、gmp、gnutls、iconv、libfontconfig、libxml2、lzma 同 zlib 嘅版本。
- 佢亦冇列出 cuda、cuda_llvm、cuvid、d3d11va、d3d12va、dxva2、libmfx、mediafoundation、nvdec 同 nvenc 嘅版本。當中包括平台介面；係咪適用例外需要明確審查，唔可以靜靜雞喺清單刪走。
- 其餘 37 個元件嘅已報告版本，並唔能夠確立本機修補、建置設定、產生出嚟嘅檔案或者遞移原始碼完整範圍。
- 喺已審查嘅官方頁面、發佈資產或支援儲存庫，都搵唔到準確嘅 9.0.2 發佈者建置步驟或者完整對應原始碼套件。

冇產生、下載或者標記任何聲稱完整嘅原始碼封存檔為可發佈。下載無關嘅最新上游版本只會造出一個證據錯誤嘅封存檔，並唔會解決呢啲缺口。

## 具體發佈選擇

1. 取得並驗證發佈者嘅準確原始碼完整範圍，包括建置腳本、修補、設定、所有需要連結元件嘅原始碼同適當聲明。記錄每個不可變原始碼識別碼同 SHA-256，驗證封存檔內容，並將任何發佈資產分拆至 1.5 GB 以下。
2. 用完全釘選並已封存嘅原始碼輸入建置一個新嘅最小執行環境，然後針對佢新嘅二進位雜湊重新執行來源證明同 AppContainer 媒體檢查。咁會產生一個唔同嘅已接受對象，唔可以憑名稱繼承 Gyan 二進位檔嘅驗證。
3. 明確喺今次發佈排除選用媒體執行環境。上層打包程式必須略過媒體目錄同 `mediaRuntime` 綁定，喺目錄保留停用原因，並披露 PNG/JPEG/WAV/FLAC/MP3/MP4 轉換喺該發佈版本不可用。清單嘅 `release` 物件係呢個選擇嘅審查建議，唔係對目前套件嘅修改。

## 重現

執行 `node scripts/converter-media-source-inventory.mjs <verified-runtime-directory> <output-json>`。收集器會先檢查兩個執行檔雜湊，然後先執行有界嘅 `-version` 檢查。佢會解析發佈者 README，將缺少嘅證據保留為 null，並且永遠唔會推斷一條修訂版本連結就等於完整原始碼。
