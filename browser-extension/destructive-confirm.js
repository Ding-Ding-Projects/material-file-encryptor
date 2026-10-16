// Bilingual copy for every destructive action in the browser extension.
//
// The extension ships as a standalone bundle and cannot import the shared registry in src/shared/destructive-actions.js, so
// this table repeats the extension entries. scripts/audit-destructive-actions.mjs fails when the two drift apart.
// Copy is fixed: playfulness settings never rewrite a safety fact.

export const EXTENSION_DESTRUCTIVE = Object.freeze({
  "extension.reset-settings": Object.freeze({title: ["Reset browser settings","重設瀏覽器設定"], affected: ["Language, theme, playfulness, emoji, product name and accent return to their defaults.","語言、主題、趣味程度、表情符號、產品名稱同強調色會恢復預設值。"]}),
  "extension.clear-history": Object.freeze({title: ["Clear history","清除記錄"], affected: ["The list of recent setting changes is removed. Current settings stay as they are.","最近設定改動嘅清單會被移除，目前設定保持不變。"]}),
  "extension.delete-notes": Object.freeze({title: ["Delete notes","刪除筆記"], affected: ["The selected notes are deleted from this browser.","揀選嘅筆記會由呢個瀏覽器刪除。"]}),
  "extension.delete-ticket": Object.freeze({title: ["Delete a ticket","刪除個案"], affected: ["The ticket is deleted from this browser.","呢個個案會由呢個瀏覽器刪除。"]}),
  "extension.delete-model": Object.freeze({title: ["Delete a local model","刪除本機模型"], affected: ["The model files are removed from the paired desktop.","模型檔案會由已配對嘅桌面程式移除。"]}),
  "extension.clear-chat": Object.freeze({title: ["Clear the conversation","清除對話"], affected: ["Every message in this conversation is removed from this page.","呢個對話入面所有訊息會由本頁移除。"]}),
  "extension.clear-wording": Object.freeze({title: ["Clear wording","清除用詞"], affected: ["The saved wording file is removed and the original wording returns.","儲存咗嘅用詞檔會被移除，原本用詞會恢復。"]}),
  "extension.import-wording": Object.freeze({title: ["Import wording over the saved wording","匯入用詞覆蓋已儲存用詞"], affected: ["The saved wording is replaced by the imported file.","已儲存嘅用詞會被匯入檔案取代。"]}),
  "extension.remove-logo": Object.freeze({title: ["Remove the logo","移除標誌"], affected: ["The local logo is removed from this browser.","本機標誌會由呢個瀏覽器移除。"]}),
  "extension.discard-recording": Object.freeze({title: ["Discard the recording","捨棄錄影"], affected: ["The unsaved recording is deleted.","未儲存嘅錄影會被刪除。"]}),
  "extension.disconnect": Object.freeze({title: ["Disconnect from the desktop","同桌面程式中斷連線"], affected: ["The pairing is revoked. Pair again to use native actions.","配對會被撤銷，需要重新配對先可以使用原生操作。"]}),
  "extension.popup-disconnect": Object.freeze({title: ["Disconnect from the desktop","同桌面程式中斷連線"], affected: ["The pairing is revoked. Pair again to use native actions.","配對會被撤銷，需要重新配對先可以使用原生操作。"]}),
  "extension.cancel-editor-request": Object.freeze({title: ["Cancel the request and disconnect","取消要求並中斷連線"], affected: ["The pending editor request is dropped and the pairing is revoked.","等待緊嘅編輯器要求會被放棄，配對會被撤銷。"]}),
  "extension.converter-disconnect": Object.freeze({title: ["Stop waiting and disconnect","停止等候並中斷連線"], affected: ["The pairing is revoked. Jobs already accepted stay on the desktop.","配對會被撤銷，已接受嘅工作會留喺桌面程式。"]}),
  "extension.server-stop": Object.freeze({title: ["Stop the server","停止伺服器"], affected: ["Players are disconnected and the server process ends.","玩家會斷線，伺服器程序會結束。"]}),
  "extension.server-restart": Object.freeze({title: ["Restart the server","重新啟動伺服器"], affected: ["Players are disconnected while the server stops and starts again.","伺服器停止同再啟動期間，玩家會斷線。"]}),
  "extension.server-change-setting": Object.freeze({title: ["Change a server setting","更改伺服器設定"], affected: ["The server configuration file is overwritten with the new value.","伺服器設定檔會被新數值覆寫。"]}),
  "extension.server-install-plugin": Object.freeze({title: ["Install a server plugin","安裝伺服器外掛"], affected: ["Plugin files are written into the server folder and can replace existing files.","外掛檔案會寫入伺服器資料夾，可能取代現有檔案。"]}),
  "extension.discard-operation": Object.freeze({title: ["Discard a saved operation","捨棄已儲存嘅操作"], affected: ["The saved operation is deleted. Nothing was sent or changed.","已儲存嘅操作會被刪除，之前冇傳送或更改任何嘢。"]}),
  "extension.discard-all-operations": Object.freeze({title: ["Discard all saved operations","捨棄所有已儲存嘅操作"], affected: ["Every saved operation is deleted. Nothing was sent or changed.","所有已儲存嘅操作都會被刪除，之前冇傳送或更改任何嘢。"]}),
});

export function extensionDestructive(id) {
  const entry = Object.hasOwn(EXTENSION_DESTRUCTIVE, id) ? EXTENSION_DESTRUCTIVE[id] : null;
  if (!entry) throw new Error('Unregistered destructive action: ' + String(id));
  return entry;
}

/** The confirmation description: the registered consequence, or the registered consequence followed by the exact data it touches. */
export function destructiveDescription(id, detail) {
  const entry = extensionDestructive(id);
  return detail ? [entry.affected[0] + ' ' + detail[0], entry.affected[1] + ' ' + detail[1]] : entry.affected;
}
