# 精簡媒體執行環境建置

呢個建置以納入版本控制嘅 FFmpeg 9.0.2 設定同 zlib 1.3.2，取代功能廣泛嘅第三方二進位檔。佢係獨立候選執行環境，現有媒體二進位檔嘅雜湊同測試結果唔可以套用落呢個候選版本。

## 來源驗證

指定官方 FFmpeg tarball 嘅 SHA-256 係 `8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`。其獨立簽署已按公開發行金鑰指紋 `FCF986EA15E6E293A5644F10B4322F04D67658D8` 驗證。[官方發行頁](https://ffmpeg.org/download.html) 說明簽署驗證程序。

指定 zlib 1.3.2 tarball 嘅 SHA-256 係 `bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16`，由 [zlib 下載頁](https://zlib.net/) 公佈。分發候選版本時，必須一併提供兩個未經改動嘅來源封存檔、本配方、聲明、設定同候選二進位檔雜湊。

## 現有工具鏈

檢查過嘅主機已有 GCC 13.2.0（MinGW-W64 x86_64-ucrt-posix-seh, r8）、GNU Make 4.4.1、Git Bash 同 GPG。冇下載編譯器或者工具鏈安裝程式。配方需要明確指定呢啲現有工具嘅絕對路徑，同獨立建置目錄：

```text
node scripts/converter-minimal-runtime.mjs <build-directory> <bash.exe> <gcc-directory> <mingw32-make.exe>
```

腳本只下載兩個已固定雜湊嘅來源封存檔，執行 configure 之前先驗證兩者雜湊，再用 zlib 提供嘅 `win32/Makefile.gcc` 建置靜態目標，然後設定同建置 FFmpeg、FFprobe。腳本會匯出精確 configure 參數清單，由 `test/converter-minimal-recipe.test.js` 檢查。本機紀錄保存最終執行檔雜湊。建置限制為兩個編譯工作，同父程序 30 分鐘期限。

## 預期能力

網絡、自動外部依賴探索、裝置同所有未選取元件都停用，只啟用 `file` 同 `pipe` 協定。PNG／JPEG、PCM WAV、FLAC、AAC 同 MPEG-4 使用原生編解碼器。MP3 要求作業系統嘅 `mp3_mf` 編碼器；佢喺 AppContainer 入面係咪可用同點樣運作，仍然需要執行時檢查。呢個候選版本用原生 MPEG-4 取代 H.264，整合之前必須有對應編碼披露同輸出驗證。

冇要求 GPL 或 nonfree configure 旗標。zlib 係唯一額外選用嘅來源元件。Windows UCRT、Media Foundation 同 D3D11 都係作業系統介面；即使冇選擇硬件編碼器，Media Foundation 實作仍然需要 D3D11。工具鏈同其執行環境授權由分發者另外記錄，本配方唔會將佢哋重新稱為 FFmpeg 原始碼。

## 驗收狀態

來源驗證、修正設定、編譯同六個隔離格式轉換，都已喺建置主機通過。輸出探測、完整解碼同取消亦通過。資訊清單記錄候選版本嘅精確雜湊同來源套件。整合負責人審閱同發佈係另外兩回事。建置產生咗上游編譯器警告，唔會聲稱零警告或者重建逐位元組相同。

最後建置用兩個低於正常優先級嘅編譯工作。兩個執行檔都只匯入作業系統 DLL。分發內容包括 MinGW-w64 同 GCC Runtime Library Exception 靜態執行環境聲明，以及 FFmpeg 同 zlib 聲明。冇連結外部 GPL 編碼器函式庫。對應來源封存檔包括已啟用元件清單。

使用者應下載已審閱、固定雜湊嘅元件套件，而唔係喺每部機重新編譯。由來源重建需要指定嘅編譯器、Make 同 Bash。來源同二進位封存檔同應用程式發行版分開；整合發佈必須保留兩者，並逐一驗證雜湊。
