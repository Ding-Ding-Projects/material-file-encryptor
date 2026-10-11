# 更新面板

`src/renderer/features/updates/index.js` 匯出 `mountUpdates(root, options)` 同別名 `mount`。佢用共用介面基礎登記 `mfe-updates-panel`，並渲染 Material 按鈕同進度指示器。請掛載喺既有應用程式工作區內。

```js
const updates = mountUpdates(root, {
  translate: canonicalTranslate,
  language,
  services: {
    request: (action, payload) => window.drive.featureRequest('updates', action, payload),
    subscribe: callback => window.drive.onFeatureEvent('updates', callback),
  },
});
updates.setLanguage(nextLanguage);
```

請求限於 `status`、`check`、`download` 同 `install`，每個都使用空負載。掛載時只請求 `status`。只有使用者按「Restart to install」後先請求安裝。原生控制器仍負責最終確認、進行中工作租約、套件驗證同重新啟動行為。

`subscribe` 可直接提供狀態快照，或用 `{snapshot}` 包裝。面板顯示控制器嘅 checking、available、downloading、ready、deferred、failed、unavailable、current、confirming、installing 同 restart-requested 狀態。未知狀態顯示不可用。快照可含 `currentVersion`、`update.version`、`update.sourceCommit`、`unsigned`、`update.unsigned`、`reason` 同比例 `progress`。冇實測進度時，下載指示器使用不確定模式。唔聲稱支援回復舊版本。

請求待處理、控制器忙碌、狀態唔係 `ready`、`desktopAvailable` 或 `canInstall` 為 false，或者 `busy`／`activeWork` 為 true 時，安裝會停用。瀏覽器介面須用旗標或不可用狀態如實回報無法安裝，絕不可轉送唔受支援嘅安裝請求。

「Later」只將本機顯示改成延期，唔發出安裝或網絡請求。已備妥套件會保留，之後仍可明確安裝。套件改變或收到非 ready 快照會清除此本機選擇；唔代表主程式自動檢查排程已改變。

傳回控制器提供 `refresh()`、`setLanguage(language)`、`refreshLabels()` 同 `destroy()`。支援語言值為 `en`、`yue` 同 `bilingual`；所提供標準翻譯器優先。語言更新保留狀態，唔提交請求。銷毀會取消訂閱同丟棄較遲回應。

聚焦可執行 DOM 固定資料測試涵蓋動作派發、本機延期、瀏覽器／忙碌限制、未知進度、本地化、防重複同銷毀。呢啲唔構成原生安裝器、真實瀏覽器、鍵盤焦點、螢幕閱讀器或渲染版面證據；以上仍屬整合驗證工作。
