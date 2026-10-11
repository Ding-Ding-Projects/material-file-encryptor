# 有權限排程來源

`src/main/schedule-source.js` 公開 `createScheduleSource({ credentials, lookup, request, authorizeCredentialMutation })`。網絡工作只屬於主程序。渲染程序唔應收到呢個物件，亦唔應直接存取憑證方法。

## 來源格式同結果

```js
await adapter.fetch({ type: 'api', url: 'https://example.org/settings' }, { id: rule.id });
await adapter.fetch({ type: 'home-assistant', url: 'https://ha.example.org',
  entityId: 'binary_sensor.work' }, { id: rule.id });
```

API 回傳 JSON，必須恰好包含 `version: 1` 同 `settings`。只接受語言、主題、密度、種子顏色、字型家族／縮放／粗幼、動態效果、顯示名稱、emoji 同兩個趣味程度欄位。範圍同共用設定合約一致。轉接器回傳已驗證設定、新檢查時間，同包含來源主機及不透明來源身分嘅來源記錄，唔包含 URL 路徑或查詢。

Home Assistant 使用 `/api/states/<entityId>`，只允許 `binary_sensor` 同 `input_boolean`，要求回應 `entity_id` 相符，只接受 `on` 或 `off`。結果包含 `state`、`active`、時間同有上限來源記錄；其他實體屬性會丟棄。呼叫者喺 `on` 時套用規則值；`off` 保留本機基礎設定或其他相符規則。網絡錯誤必須保留基礎設定。

目前編輯器嘅 `entity` 欄位亦接受為 `entityId` 別名。兩者同時提供而值唔同會被拒絕。API 來源嘅空白 entity 文字冇影響，非空白 API entity 會被拒絕。

## 憑證同原生邊界

憑證鍵係 `schedule:<rule id>`。現有受保護儲存必須喺內部容許此前綴，同時喺所有渲染程序可讀憑證路徑排除佢。`credentials.get()` 只喺讀取器內提供 `{token, origin}`。`registerToken(id, token, nativeContext)` 同 `deleteToken(id, nativeContext)` 需要主程序嘅 `authorizeCredentialMutation` 回呼。註冊原生上下文亦包含已批准 `source` 設定。整合者必須將授權綁定到已驗證原生呼叫者同私人憑證輸入控制，而唔係渲染程序提供嘅布林值。憑證綁定來源 origin，防止修改 URL 後將佢轉送去另一部伺服器。未綁定舊字串憑證會被拒絕，必須原生重新註冊。呢啲方法只回傳識別碼同結果，冇方法回傳憑證。

共用解析器目前呼叫 `fetchSource(source)`。整合包裝器亦必須透過 `fetch(source, {id: rule.id})` 或允許嘅來源 `id` 欄位，提供穩定規則識別碼。結果保留共用解析器現有 version／settings 同 on／off 格式。

## 傳輸保護

正式來源需要 HTTPS。重新導向、URL 憑證、似憑證嘅查詢欄位、fragment、壓縮回應同非 JSON 內容類型都會被拒絕。預設連接埠係 443、8123 同 8443。私人、回送、鏈路本機、多播、文件示例同特殊用途地址都會被拒絕，包括 IPv4-mapped IPv6。每個 DNS 答案都必須批准，並透過連線自訂 lookup 回呼固定其中一個已驗證地址。TLS 仍然驗證原始主機名稱，啟用憑證驗證並停用連線重用。

明確 `allowLoopbackDevelopment` 選項只容許字面值 `127.0.0.1` 或 `[::1]`，喺受限開發連接埠使用 HTTP。唔容許 `localhost`、其他數字寫法、其他回送地址、私人區域網絡主機，或者解析到回送地址嘅名稱。正式預設保持停用。

限制：URL 2,048 字元、UTF-8 JSON 32 KiB、深度 6、每物件 128 欄、總共 5 秒、四個並行請求，同 100 個排程識別碼。重複 JSON 鍵同不安全鍵都會被拒絕。每條規則每 30 秒最多嘗試更新一次；重疊相同請求共用一個操作。錯誤唔包含回應內容、憑證或者路徑，亦冇自動重試迴圈。

## 驗證同責任

`node --test test/schedule-source.test.js` 使用合成 DNS 同 HTTP 傳輸，測試地址固定、混合私人／公開答案、URL 拒絕、精確回送選用、重新導向／內容／結構上限、Home Assistant 憑證、原生修改授權、更新節流同逾時。唔會連接使用者端點。整合者負責 IPC 授權、受保護儲存鍵規則同解析器整合；本模組唔修改呢啲檔案或者排程時間語義。
