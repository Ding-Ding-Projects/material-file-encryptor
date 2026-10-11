# 已審閱 Windows 執行檔來源

`src/main/ollama-provenance.js` 常數量度自官方 [Ollama v0.40.2 發行版](https://github.com/ollama/ollama/releases/tag/v0.40.2)，發佈時間為 2026-10-08 16:53:47 UTC。發行 API 回報 draft 同 prerelease 旗標都係 false。檢查期間冇執行、安裝或者啟動任何下載執行檔。

[Windows AMD64 封存檔](https://github.com/ollama/ollama/releases/download/v0.40.2/ollama-windows-amd64.zip) 包含 1,468,085,195 位元組。量度 SHA-256 係 `e29ad1d5063dd4b54b2492d9b00adab2cff9621bfa654b6c92aa8d6f1fdfe7fc`，同發行資產摘要及官方 [校驗檔](https://github.com/ollama/ollama/releases/download/v0.40.2/sha256sum.txt) 一致。

只解壓精確根目錄成員 `ollama.exe`。讀取器要求恰好一個相符成員、唔係目錄或符號連結、未壓縮上限 1 GiB，同精確串流位元組數；冇解壓其他成員。執行檔包含 27,854,728 位元組，SHA-256 為 `9eaec399fd941073f8ddfbd56e0447f77fca5c006b26b8b1874a7fb12719b2a0`。

唯讀 Windows `Get-AuthenticodeSignature` 對呢啲解壓內容回傳 `Valid` 同 `Signature verified.`。精確 subject 係：

```text
CN=Ollama Inc., O=Ollama Inc., L=Toronto, S=Ontario, C=CA, SERIALNUMBER=2713355, OID.2.5.4.15=Private Organization, OID.1.3.6.1.4.1.311.60.2.1.2=Ontario, OID.1.3.6.1.4.1.311.60.2.1.3=CA
```

憑證 thumbprint 係 `716CD3BC8C02361431A18F56F98C72DE88066103`。觀察有效期由 2026-02-12 00:00:00 UTC 至 2029-02-13 23:59:59 UTC。規則固定 subject 同 thumbprint，主程序仍要求驗證當時簽署有效。未來憑證更換需要重新審閱來源。呢項證據描述被檢查發行版，唔代表每個名為 Ollama 嘅二進位檔。

將 `REVIEWED_OLLAMA_MANIFESTS` 以 `reviewedManifests`，同 `OLLAMA_PUBLISHER_POLICIES` 以 `publisherPolicies` 傳畀 `createNativeOllamaHost`。如果發佈者信任唔適用，執行檔雜湊路徑仍然需要明確原生確認。常數唔會下載或啟動。合成測試驗證結構相容性同不可變性，唔能代替呢度記錄嘅真實封存檔檢查。
