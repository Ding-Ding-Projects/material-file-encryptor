# 已審閱精簡媒體元件

## 本機驗收

由來源建置嘅元件已通過真實 AppContainer 轉換、輸出探測，同 PNG、JPEG、WAV、FLAC、MP3、MP4 完整解碼。取消已通過。整條管線期限嘅回歸測試會終止當前階段，並阻止後續階段。原生命令設定仍然固定，會拒絕任意參數。

已接受執行環境嘅精確雜湊：

- `ffmpeg.exe`：`3afaeabe603e0a869f782621b8ef3877c98db8832dac756fd4518af9cfc2b8a3`
- `ffprobe.exe`：`6f02e4e18eb928ff48d8fdad2840d8419a1868931cbdf0da6d1da8f8a59987a4`

執行檔匯入表只有作業系統 DLL。兩個執行檔都冇包含建置使用者嘅絕對路徑，內嵌設定使用相對 zlib 路徑。來源用現有 GCC 13.2.0 工具鏈同 GNU Make 4.4.1 編譯，兩個編譯工作採用低於正常優先級。冇安裝新工具鏈。

## 供整合負責人審閱嘅檔案

| 檔案 | 位元組 | SHA-256 |
| --- | ---: | --- |
| `ffmpeg-9.0.2-minimal-v1-win64.zip` | 19533797 | `da315b36eaae5f0aeee512fea6f0c920c25e13d80c9d77a9db23ed626e30eddd` |
| `ffmpeg-9.0.2-minimal-corresponding-source.zip` | 13594970 | `7f6e1fe23c78ba7d3419adf31be83f53229bc7a93c6e0cdd74a43af02a850e75` |
| 內部執行環境 `manifest.json` | 見清單 | `995e6efd01e257486139be36889033029983486844cf627510120a57770124e8` |

外層封存檔有十個檔案：兩個執行檔、五個授權／聲明檔、README、資訊清單，同完整來源封存檔。每個外層檔案都已解壓並按 [精確元件清單](minimal-component-release.json) 驗證。十一個來源清單成員亦已逐一解壓同驗證。來源封存檔包含原始 FFmpeg／zlib 封存檔、精確建置輔助程式同來源資訊清單、已啟用元件設定同聲明。唔會將所需來源下載延後，當成已提供分發來源套件。

來源建置連結 zlib，同使用作業系統 Media Foundation／D3D11 介面，冇啟用 GPL／nonfree 編碼器。來源封存檔保留完整原始授權檔；元件亦包括 LGPLv2.1、GPLv3、GCC Runtime Library Exception 同 MinGW-w64 執行環境聲明。之前對 Gyan 來源完整性嘅審閱只適用於之前嘅二進位檔，唔適用於呢個新成品。

## 發佈同全新機器啟動

已審閱元件發佈於 [ffmpeg-runtime-9.0.2.1](https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/ffmpeg-runtime-9.0.2.1)，屬正常、非預覽發行，唔會取代最新應用程式發行版。標籤解析到整合提交 `92d082797c63dc8b9928ef51badb645bab3bc9ac`。六個下載檔案全部同本機發佈來源吻合，包括兩個封存檔、三個中繼資料清單同內置目錄圖片。元件凍結資訊清單記錄建置當時嘅發佈狀態；本文章記錄之後嘅發佈。

發佈之後呼叫：

```text
node scripts/converter-minimal-component.mjs <immutable-GitHub-release-asset-URL> <resources/converter/minimal-media>
```

輔助程式只下載固定嘅 19.5 MB 封存檔，解壓前檢查完整 SHA-256，驗證十個檔案嘅雜湊同長度，再回傳 `profile`、`ffmpegPath`、`ffmpegSha256`、`ffprobePath` 同 `ffprobeSha256`。將呢個物件以 `mediaRuntime` 傳畀現有提供者。快取吻合必須十個檔案全部有效。呢條路徑唔需要編譯器，轉換時亦冇網絡操作。

使用呢個元件嘅發行版，會以本輔助程式取代 Gyan 下載程式。唔好發佈估出嚟嘅 URL，亦唔好靜靜地退回 Gyan。之前執行環境可以保留作本機比較測試，但唔可以混入本元件套件。

## 由來源重建

使用提供嘅 [精簡建置配方](minimal-runtime.md)。重建需要現有 Git Bash、GCC 13.2.0 MinGW-w64 同 GNU Make 4.4.1。配方包含精確設定，只下載固定雜湊嘅來源同聲明，預設用兩個低於正常優先級嘅工作。上游來源編譯警告已保留；唔會聲稱零警告或者逐位元組相同重建。新建二進位檔有自己嘅驗收範圍，必須重新記錄資訊清單雜湊同執行 AppContainer 檢查。

元件啟動程式會拒絕目的地同現有父目錄嘅重新解析點，保留無效現有目的地，並喺解壓前驗證 ZIP 成員名稱、長度、本機標頭一致性同連結屬性。解壓期限係 30 秒。檔案先複製到新同層暫存目錄，驗證後先重新命名到尚未存在嘅目的地。複製錯誤保留原始診斷，並移除未完成暫存。呢個機制保護可信建置目錄；如果無關程序可以同時重新命名父目錄，就超出本輔助程式權限。本次啟動強化冇改動封存檔位元組。
