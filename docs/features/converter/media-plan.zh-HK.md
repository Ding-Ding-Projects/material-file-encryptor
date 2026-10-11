# 離線圖片、音訊同影片轉換

轉換器實作六個固定操作：PNG、JPEG、WAV（16-bit PCM）、FLAC、MP3（192 kbps）同 MP4（H.264 CRF 23 配 AAC 128 kbps）。除非選用套件內執行環境通過執行檔雜湊核對，以及真實 AppContainer 來源探測、轉換、輸出探測同完整解碼啟動檢查，否則媒體功能保持停用。唔會從 PATH 尋找執行檔，亦唔會喺轉換期間下載。

## 已接受執行環境同來源記錄

FFmpeg 9.0.2 固定使用 Gyan 發佈嘅 essentials 封存檔。Gyan 係 [FFmpeg 官方下載頁](https://ffmpeg.org/download.html) 連結嘅 Windows 二進位提供者。[發佈者頁面](https://www.gyan.dev/ffmpeg/builds/) 列明來源修訂 `946fcce07b`、版本 9.0.2 同 GPLv3 授權。解壓前會核對 [已公佈封存檔校驗值](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip.sha256)。二進位檔 **冇 Authenticode 簽署**。接受依據係明確審閱過嘅發佈者、HTTPS 同固定封存檔／執行檔雜湊，唔代表有上游二進位簽署或者可重現建置。

| 檔案 | SHA-256 |
| --- | --- |
| ffmpeg-9.0.2-essentials_build.zip | `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba` |
| ffmpeg.exe | `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec` |
| ffprobe.exe | `f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52` |

呢個 GPLv3 專案包括分發內容嘅 LICENSE 同 README。發行套件亦必須履行 FFmpeg 同所連結元件嘅對應來源分發義務。提供者來源修訂本身唔係完整對應來源套件。本實作唔會聲稱呢項發行義務已經完成。

## 主建置整合

喺現有根目錄建置執行 `node scripts/converter-media-runtime.mjs <resources/converter/media>`。輔助程式使用有限制嘅建置時下載，驗證封存檔同兩個執行檔，只複製 `ffmpeg.exe`、`ffprobe.exe`、`LICENSE`、`README.txt` 同 `manifest.json`。回傳物件包含 `version`、`ffmpegPath`、`ffmpegSha256`、`ffprobePath` 同 `ffprobeSha256`。最終綁定使用套件相對路徑，應按實際資源目錄解析，唔好將建置機器路徑寫入公開資訊清單。

將四個執行檔欄位以 `mediaRuntime` 傳畀 `createWindowsSandboxProvider`，並提供現有啟動器同 Node 欄位。將新 `media.mjs` 放喺 `windows-sandbox.mjs` 旁邊；佢喺可信主程序執行，唔會複製入 Node 工作者內容。用 `MediaCommand.cs` 重建原生啟動器。整合負責人管理根建置腳本、應用服務綁定同發行合規；轉換器冇另一個應用入口。

選用媒體執行環境缺失或無效，只會停用媒體轉換器。現有 PDF、ZIP 同資料轉換器保留自己正常、獨立驗證嘅隔離路徑。公開目錄會列出明確啟動驗證原因。

## 執行同驗證

主程序只接受六個已註冊操作識別碼。原生啟動器選擇固定命令、固定暫存檔名同精確暫存執行檔名稱。佢保留零能力 AppContainer、單程序 job、256 MiB 記憶體上限、30 秒總轉換期限加每項操作 30 秒原生期限、取消訊號、已驗證 nonce／結果雜湊，同設定檔清理。協定限於 `file,pipe`；使用者參數、任意路徑同建立程序都不可用。

每次轉換都有四個隔離操作：探測來源、編碼、探測輸出、解碼輸出。主程序拒絕額外串流、未支援圖片 demuxer、動畫、旋轉中繼資料、尺寸／配置改變、錯誤輸出編碼同長度偏差。圖片最多 8 百萬像素，每邊最多 4096 像素。音訊接受一至兩聲道、8 至 48 kHz，最多 10 分鐘。影片接受偶數尺寸，最多 1920 × 1080、60 秒。輸入同媒體輸出各自最多 64 MiB。抽樣記錄／輸出儲存限制補充 job 嘅硬性記憶體同程序限制，唔係檔案系統配額。

來源檢查會喺提交前顯示真實探測中繼資料。每個轉換器都要求明確確認移除中繼資料同編碼損失。JPEG 會丟棄透明度；WAV 降至 16-bit PCM；MP3 同 H.264／AAC 都有損。唔會靜靜地要求縮放、旋轉、取樣率轉換或者聲道重混。佇列保留來源雜湊、現有覆寫確認，同完整輸出嘅原子發佈。階段之間取消會阻止下一階段同發佈。取消正在進行嘅媒體預覽亦納入結束屏障。

## 驗證

`test/converter-media.test.js` 檢查中繼資料限制、編碼／配置比較同執行環境不可用目錄。`test/converter-media-windows.test.js` 使用 `CONVERTER_MEDIA_TEST_ROOT` 指向包含兩個已驗證二進位檔嘅目錄，產生可丟棄合成測試資料，經真實提供者執行六個操作，並檢查取消。原生 `media-command.tests.ps1` 檢查固定命令同紀錄合約；`media-smoke.ps1` 執行真實 AppContainer 媒體同被拒絕嘅外部參照。唔需要使用者媒體或者可見桌面。

額外格式、任意 FFmpeg 參數、硬件編碼器、串流、字幕、動畫圖片、縮放同編輯，都超出本實作範圍。佢哋保持未實作，唔會當成已完成轉換器宣傳。

## 精簡來源建置候選版本

選用 `minimal-v1` 設定使用 Media Foundation MP3 192 kbps，同原生 MPEG-4 品質 3 配 AAC 128 kbps，保留六個轉換器識別碼。MP3 要求 32、44.1 或 48 kHz，唔會暗中重新取樣。媒體轉換器啟用前，會用真實隔離 MP3 啟動轉換檢查作業系統編碼器係咪可用。來源探測、轉換、輸出探測同解碼共用 30 秒預算；取消會通知正在執行嘅原生 job，並等佢清理完成。

來源固定版本同當前候選驗收見 [精簡執行環境配方](minimal-runtime.md)。來源建置候選必須使用自己資訊清單嘅雜湊，唔可以繼承之前 Gyan 二進位檔嘅驗收。
