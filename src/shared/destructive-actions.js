// Registry of every destructive action in the desktop application, the browser extension and the documentation site.
//
// A destructive action deletes, empties, overwrites, resets, revokes, disconnects, stops, restarts, uninstalls,
// installs over existing files, or otherwise changes stored data or a running service in a way the user cannot
// simply undo. Every such action must pass the two-key super confirmation before it acts.
//
// Rules the audit (scripts/audit-destructive-actions.mjs) enforces against this file:
//   - every entry whose route is 'super-confirmation' must be referenced in its source file by a literal
//     `destructiveId: '<id>'` option or by `confirmDestructiveAction(<host>, '<id>', ...)`, and its `invokes`
//     token must still exist in that file;
//   - every destructive-looking handler or request name found in the source must appear in an entry's `invokes`
//     list, or in EXEMPT_ACTIONS with a written reason.
//
// Copy is bilingual and fixed. Playfulness settings never rewrite a safety fact.

export const CONFIRMATION_ROUTES = Object.freeze({
  superConfirmation: 'super-confirmation',
  nativeBoundary: 'native-consent-boundary'
});

const entry = (id, surfaces, file, invokes, title, affected, route = CONFIRMATION_ROUTES.superConfirmation) => Object.freeze({
  id, surfaces: Object.freeze([...surfaces]), file, invokes: Object.freeze([...invokes]), title: Object.freeze([...title]), affected: Object.freeze([...affected]), route
});

const D = ['desktop'];
const DS = ['desktop', 'site'];
const E = ['extension'];
const S = ['site'];

export const DESTRUCTIVE_ACTIONS = Object.freeze([
  // ---- Desktop: drive and files -------------------------------------------------------------------------------
  entry('desktop.force-lock', D, 'src/renderer/app.js', ['forceLock'], ['Force lock the drive', '強制鎖定磁碟'], ['The drive unmounts at once. Open files may lose unsaved changes.', '磁碟會即時卸載，未儲存嘅更改可能會遺失。']),
  entry('desktop.empty-recycle-bin', D, 'src/renderer/app.js', ['emptyRecycleBin'], ['Empty the Recycle Bin', '清空資源回收筒'], ['Every deleted entry in the Recycle Bin is permanently removed.', '資源回收筒入面所有已刪除項目會永久移除。']),
  entry('desktop.restore-version', DS, 'src/renderer/app.js', ['restoreVersion'], ['Restore an older version', '還原舊版本'], ['The chosen version becomes the current content of the file.', '揀咗嘅版本會變成檔案嘅目前內容。']),
  entry('desktop.release-offline-copy', D, 'src/renderer/app.js', ['releaseOffline'], ['Remove the offline copy', '移除離線副本'], ['The unneeded encrypted cache for this file is deleted from this device.', '呢個檔案用唔著嘅加密快取會由本機刪除。']),
  entry('desktop.resplit-files', D, 'src/renderer/app.js', ['resplitAll'], ['Re-split every file', '重新分割所有檔案'], ['Replacement encrypted parts are written for every file using the current part size.', '會用目前嘅分段大小為所有檔案寫入新嘅加密分段。']),
  entry('desktop.forget-saved-credential', D, 'src/renderer/app.js', ['setAutoUnlock'], ['Turn off automatic unlock', '關閉自動解鎖'], ['The protected drive key saved on this device is forgotten.', '儲存喺本機嘅受保護磁碟金鑰會被忘記。']),
  entry('desktop.pack-storage', D, 'src/renderer/app.js', ['startPacking'], ['Pack encrypted storage', '整合加密儲存'], ['Encrypted storage parts are rewritten with the chosen part size.', '加密儲存分段會按揀選嘅大小重寫。']),
  entry('desktop.replace-converter-output', DS, 'src/renderer/app.js', ['confirmOverwrite'], ['Replace the output file', '取代輸出檔案'], ['The selected output file is overwritten. Source files stay unchanged.', '揀選嘅輸出檔案會被覆寫，來源檔案保持不變。']),
  entry('desktop.install-update', D, 'src/renderer/app.js', ['updates'], ['Install the update and restart', '安裝更新並重新啟動'], ['Installed application files are replaced and the application restarts.', '已安裝嘅程式檔案會被取代，程式會重新啟動。']),
  entry('desktop.sign-out-account', DS, 'src/shared/surface/publication-panel.js', ['signOutAccount'], ['Sign out the selected account', '登出揀選嘅帳戶'], ['The saved sign-in for this account is removed from this device.', '呢個帳戶儲存咗嘅登入會由本機移除。']),
  entry('desktop.discard-unsaved-text', DS, 'src/shared/surface/workflow-tools.js', ['discard'], ['Discard unsaved text', '捨棄未儲存嘅文字'], ['Unsaved text in the editor is lost.', '編輯器入面未儲存嘅文字會遺失。']),
  // ---- Desktop: local models ---------------------------------------------------------------------------------
  entry('desktop.ollama-delete-model', DS, 'src/renderer/features/ollama/index.js', ['deleteModel'], ['Delete the installed model', '刪除已安裝嘅模型'], ['The installed model files are removed from this device.', '已安裝嘅模型檔案會由本機移除。']),
  entry('desktop.ollama-delete-session', DS, 'src/renderer/features/ollama/index.js', ['deleteSession'], ['Delete the saved chat session', '刪除已儲存嘅對話'], ['Every message in the session is permanently removed.', '呢個對話入面所有訊息會永久移除。']),
  entry('desktop.ollama-stop-runtime', D, 'src/renderer/features/ollama/index.js', ['runtimeStop'], ['Stop the local model runtime', '停止本機模型執行環境'], ['The managed runtime stops and running chats end.', '受管理嘅執行環境會停止，進行中嘅對話會結束。']),
  // ---- Desktop: game servers ---------------------------------------------------------------------------------
  entry('desktop.server-stop', D, 'src/renderer/features/server-manager/targets-panel.js', ['stopServer'], ['Stop the server', '停止伺服器'], ['Players are disconnected and the server process ends.', '玩家會斷線，伺服器程序會結束。']),
  entry('desktop.server-restart', D, 'src/renderer/features/server-manager/targets-panel.js', ['restartServer'], ['Restart the server', '重新啟動伺服器'], ['Players are disconnected while the server stops and starts again.', '伺服器停止同再啟動期間，玩家會斷線。']),
  entry('desktop.server-change-setting', D, 'src/renderer/features/server-manager/targets-panel.js', ['changeServerSetting'], ['Change a server setting', '更改伺服器設定'], ['The server configuration file is overwritten with the new value.', '伺服器設定檔會被新數值覆寫。']),
  entry('desktop.server-install-plugin', D, 'src/renderer/features/server-manager/targets-panel.js', ['installExtension'], ['Install a server plugin', '安裝伺服器外掛'], ['Plugin files are written into the server folder and can replace existing files.', '外掛檔案會寫入伺服器資料夾，可能取代現有檔案。']),
  // ---- Desktop and site: local access ------------------------------------------------------------------------
  entry('desktop.access-remove-lock', DS, 'src/renderer/features/access/index.js', ['controller.remove'], ['Remove the lock', '移除鎖定'], ['The lock on this element is removed.', '呢個元素嘅鎖定會被移除。']),
  entry('desktop.access-remove-authenticators', DS, 'src/renderer/features/access/index.js', ['removeAuthenticators'], ['Remove authenticators', '移除驗證器'], ['The selected authenticators are deleted from the local profile.', '揀選嘅驗證器會由本機設定檔刪除。']),
  entry('desktop.access-remove-ticket', DS, 'src/renderer/features/access/index.js', ['tickets.splice'], ['Remove a local ticket', '移除本機個案'], ['The ticket is deleted from this device.', '呢個個案會由本機刪除。']),
  entry('desktop.access-remove-selected-tickets', DS, 'src/renderer/features/access/index.js', ['selectedTickets'], ['Remove selected local tickets', '移除揀選嘅本機個案'], ['Every selected ticket is deleted from this device.', '所有揀選嘅個案會由本機刪除。']),
  entry('desktop.access-history-retention', DS, 'src/renderer/features/access/history-view.js', ['historyRetention'], ['Change history retention', '更改記錄保留期'], ['Entries older than the new period can be removed.', '比新保留期舊嘅項目可能會被移除。']),
  entry('desktop.access-history-prune', DS, 'src/renderer/features/access/history-view.js', ['historyPrune'], ['Prune expired history', '清理過期記錄'], ['Expired history entries are permanently removed.', '過期嘅記錄項目會永久移除。']),
  entry('desktop.access-history-restore', DS, 'src/renderer/features/access/history-view.js', ['historyRestore'], ['Restore a history record', '還原記錄項目'], ['Live local records are replaced by the chosen history record.', '現有本機記錄會被揀選嘅記錄項目取代。']),
  // ---- Desktop and site: personalization ---------------------------------------------------------------------
  entry('desktop.reset-settings', DS, 'src/renderer/features/personalization/index.js', ['resetSettings'], ['Reset preferences', '重設偏好設定'], ['All local appearance, language, attention and schedule preferences return to their defaults.', '所有本機外觀、語言、專注同排程偏好會恢復預設值。']),
  entry('desktop.import-settings', DS, 'src/renderer/features/personalization/index.js', ['importSettings'], ['Import settings over the current ones', '匯入設定覆蓋目前設定'], ['Current local preferences are replaced by the imported file.', '目前嘅本機偏好會被匯入檔案取代。']),
  entry('desktop.reset-display-name', DS, 'src/renderer/features/personalization/index.js', ['resetName'], ['Reset the display name', '重設顯示名稱'], ['The custom display name returns to the original name.', '自訂嘅顯示名稱會恢復原本名稱。']),
  entry('desktop.remove-schedule', DS, 'src/renderer/features/personalization/index.js', ['schedules.filter'], ['Remove a schedule rule', '移除排程規則'], ['The schedule rule is deleted.', '呢條排程規則會被刪除。']),
  entry('desktop.clear-schedule-credential', D, 'src/renderer/features/personalization/index.js', ['clearScheduleCredential'], ['Clear a schedule credential', '清除排程憑證'], ['The protected credential for this schedule source is deleted.', '呢個排程來源嘅受保護憑證會被刪除。']),
  entry('desktop.remove-local-snapshot', DS, 'src/renderer/features/personalization/index.js', ['removeSnapshot'], ['Remove a local snapshot', '移除本機快照'], ['The snapshot bytes are removed from this device.', '快照資料會由本機移除。']),
  entry('desktop.history-prune', DS, 'src/renderer/features/personalization/history.js', ['manager.prune'], ['Prune expired local history', '清理過期本機記錄'], ['Entries older than the selected retention period are removed.', '比揀選保留期舊嘅項目會被移除。']),
  entry('desktop.history-restore', DS, 'src/renderer/features/personalization/history.js', ['restore'], ['Restore a history entry', '還原記錄項目'], ['Current preferences are replaced by the chosen history entry.', '目前偏好會被揀選嘅記錄項目取代。']),
  entry('desktop.reset-appearance', DS, 'src/renderer/features/personalization/appearance.js', ['defaultAppearance'], ['Reset all appearance', '重設所有外觀'], ['Every saved appearance edit returns to the default style.', '所有已儲存嘅外觀編輯會恢復預設樣式。']),
  entry('desktop.import-appearance', DS, 'src/renderer/features/personalization/appearance.js', ['validateAppearance'], ['Import appearance over the current one', '匯入外觀覆蓋目前外觀'], ['The current appearance is replaced by the imported file.', '目前外觀會被匯入檔案取代。']),
  entry('desktop.reset-logo', DS, 'src/renderer/features/personalization/logo.js', ['reset'], ['Reset the logo', '重設標誌'], ['The custom logo is removed and the original logo returns.', '自訂標誌會被移除，原本標誌會恢復。']),

  // ---- Browser extension -------------------------------------------------------------------------------------
  entry('extension.reset-settings', E, 'browser-extension/options.js', ['confirmReset'], ['Reset browser settings', '重設瀏覽器設定'], ['Language, theme, playfulness, emoji, product name and accent return to their defaults.', '語言、主題、趣味程度、表情符號、產品名稱同強調色會恢復預設值。']),
  entry('extension.clear-history', E, 'browser-extension/options.js', ['clearHistory'], ['Clear history', '清除記錄'], ['The list of recent setting changes is removed. Current settings stay as they are.', '最近設定改動嘅清單會被移除，目前設定保持不變。']),
  entry('extension.delete-notes', E, 'browser-extension/options.js', ['deleteNotes'], ['Delete notes', '刪除筆記'], ['The selected notes are deleted from this browser.', '揀選嘅筆記會由呢個瀏覽器刪除。']),
  entry('extension.delete-ticket', E, 'browser-extension/options.js', ['deleteTicket'], ['Delete a ticket', '刪除個案'], ['The ticket is deleted from this browser.', '呢個個案會由呢個瀏覽器刪除。']),
  entry('extension.delete-model', E, 'browser-extension/options.js', ['modelCall'], ['Delete a local model', '刪除本機模型'], ['The model files are removed from the paired desktop.', '模型檔案會由已配對嘅桌面程式移除。']),
  entry('extension.clear-chat', E, 'browser-extension/options.js', ['chat-clear'], ['Clear the conversation', '清除對話'], ['Every message in this conversation is removed from this page.', '呢個對話入面所有訊息會由本頁移除。']),
  entry('extension.clear-wording', E, 'browser-extension/options.js', ['clearVocabulary'], ['Clear wording', '清除用詞'], ['The saved wording file is removed and the original wording returns.', '儲存咗嘅用詞檔會被移除，原本用詞會恢復。']),
  entry('extension.import-wording', E, 'browser-extension/options.js', ['saveVocabulary'], ['Import wording over the saved wording', '匯入用詞覆蓋已儲存用詞'], ['The saved wording is replaced by the imported file.', '已儲存嘅用詞會被匯入檔案取代。']),
  entry('extension.remove-logo', E, 'browser-extension/options.js', ['logo-reset'], ['Remove the logo', '移除標誌'], ['The local logo is removed from this browser.', '本機標誌會由呢個瀏覽器移除。']),
  entry('extension.discard-recording', E, 'browser-extension/options.js', ['recording-discard'], ['Discard the recording', '捨棄錄影'], ['The unsaved recording is deleted.', '未儲存嘅錄影會被刪除。']),
  entry('extension.disconnect', E, 'browser-extension/options.js', ['observe'], ['Disconnect from the desktop', '同桌面程式中斷連線'], ['The pairing is revoked. Pair again to use native actions.', '配對會被撤銷，需要重新配對先可以使用原生操作。']),
  entry('extension.popup-disconnect', E, 'browser-extension/popup.js', ['disconnect'], ['Disconnect from the desktop', '同桌面程式中斷連線'], ['The pairing is revoked. Pair again to use native actions.', '配對會被撤銷，需要重新配對先可以使用原生操作。']),
  entry('extension.cancel-editor-request', E, 'browser-extension/options.js', ['editor-cancel'], ['Cancel the request and disconnect', '取消要求並中斷連線'], ['The pending editor request is dropped and the pairing is revoked.', '等待緊嘅編輯器要求會被放棄，配對會被撤銷。']),
  entry('extension.converter-disconnect', E, 'browser-extension/converter.js', ['disconnect'], ['Stop waiting and disconnect', '停止等候並中斷連線'], ['The pairing is revoked. Jobs already accepted stay on the desktop.', '配對會被撤銷，已接受嘅工作會留喺桌面程式。']),
  entry('extension.server-stop', E, 'browser-extension/servers.js', ['stop'], ['Stop the server', '停止伺服器'], ['Players are disconnected and the server process ends.', '玩家會斷線，伺服器程序會結束。']),
  entry('extension.server-restart', E, 'browser-extension/servers.js', ['restart'], ['Restart the server', '重新啟動伺服器'], ['Players are disconnected while the server stops and starts again.', '伺服器停止同再啟動期間，玩家會斷線。']),
  entry('extension.server-change-setting', E, 'browser-extension/servers.js', ['change-setting'], ['Change a server setting', '更改伺服器設定'], ['The server configuration file is overwritten with the new value.', '伺服器設定檔會被新數值覆寫。']),
  entry('extension.server-install-plugin', E, 'browser-extension/servers.js', ['install-plugin'], ['Install a server plugin', '安裝伺服器外掛'], ['Plugin files are written into the server folder and can replace existing files.', '外掛檔案會寫入伺服器資料夾，可能取代現有檔案。']),
  entry('extension.discard-operation', E, 'browser-extension/operations-panel.js', ['discardOperation'], ['Discard a saved operation', '捨棄已儲存嘅操作'], ['The saved operation is deleted. Nothing was sent or changed.', '已儲存嘅操作會被刪除，之前冇傳送或更改任何嘢。']),
  entry('extension.discard-all-operations', E, 'browser-extension/operations-panel.js', ['discardAll'], ['Discard all saved operations', '捨棄所有已儲存嘅操作'], ['Every saved operation is deleted. Nothing was sent or changed.', '所有已儲存嘅操作都會被刪除，之前冇傳送或更改任何嘢。']),

  // ---- Documentation site ------------------------------------------------------------------------------------
  entry('site.clear-vocabulary', S, 'docs/site/site.js', ['clearPrivateVocabulary'], ['Clear personal wording', '清除個人用詞'], ['The stored wording file is removed from this browser and the original wording returns.', '儲存咗嘅用詞檔會由呢個瀏覽器移除，原本用詞會恢復。']),
  entry('site.clear-workspace-vocabulary', S, 'docs/site/workspace.js', ['private-wording'], ['Clear private wording', '清除私人用詞'], ['The stored private wording is removed from this browser and the original wording returns.', '儲存咗嘅私人用詞會由呢個瀏覽器移除，原本用詞會恢復。']),
  entry('site.reset-visitor-records', S, 'docs/site/visitor-access.js', ['resetOwned'], ['Reset visitor records', '重設訪客記錄'], ['The local visitor profile, locks and history are deleted from this browser.', '本機訪客設定檔、鎖定同記錄會由呢個瀏覽器刪除。'])
]);

/**
 * Names that look destructive but are not. Every entry carries the reason, so a reviewer can disagree with it.
 * The audit refuses a destructive-looking name that is neither registered nor listed here.
 */
export const EXEMPT_ACTIONS = Object.freeze({
  cancel: 'Cancels an in-flight transient job or closes a dialog. Committed data is never removed.',
  cancelOperation: 'Cancels an in-flight transient operation. Committed data is never removed.',
  cancelDownload: 'Cancels a queued download. Nothing stored is removed.',
  cancelBrowserProposal: 'Dismisses an unaccepted proposal. Nothing stored is removed.',
  cancelPublication: 'Cancels an unfinished publication review. Nothing is published or removed.',
  cancelServer: 'Cancels a preparation that has not become a server. Prepared files are retained for recovery.',
  cancelRuntime: 'Cancels a runtime preparation. Retained files are kept for explicit recovery.',
  cancelFontMetadata: 'Cancels a font scan. Nothing stored is removed.',
  cancelled: 'A state name, not an action.',
  canceled: 'A state name, not an action.',
  cancelling: 'A state name, not an action.',
  stopped: 'A state name, not an action.',
  restore: 'Restoring deleted entries only brings data back and never removes data.',
  restoreDeleted: 'Restoring deleted entries only brings data back and never removes data.',
  removeFromCart: 'Edits a download wish list that has not started and holds no stored data.',
  clear: 'Clears a transient field, search box, draft input or the temporary on-screen pairing code. No stored data is removed.',
  clearScheduleCredential: 'Registered separately as desktop.clear-schedule-credential.',
  resetAxes: 'Resets font axes in an unsaved editor draft.',
  renameSession: 'Renames a saved chat session and removes nothing.',
  copyModel: 'Creates a copy and removes nothing.',
  stopCamera: 'Stops the camera used for scanning a registration code. Nothing stored is removed.',
  narrationStop: 'Stops reading aloud. Nothing stored is removed.',
  stopRecording: 'Ends a recording so it can be reviewed. The recording is kept until discarded.',
  chatStop: 'Stops a streaming reply. The messages stay.',
  runtimeInstallCancel: 'Cancels a runtime download. Retained files are kept for explicit recovery.',
  resetEnglish: 'Resets one playfulness slider to its default. Nothing else is touched and it is set again in one gesture.',
  resetCantonese: 'Resets one playfulness slider to its default. Nothing else is touched and it is set again in one gesture.',
  accentReset: 'Returns one accent colour picker to its default and loses no other data.',
  attentionReset: 'Turns off optional attention modes. No data is removed.',
  resetForm: 'Clears an unsaved publishing request form before anything is sent.',
  hidePairingCode: 'Hides the one-time pairing code on screen. Existing pairings are untouched.',
  unmount: 'Locks the drive normally with open files flushed. The abrupt variant is registered as desktop.force-lock.'
});

/** Browser-native consent prompts and the quit dialog are the user's own consent to a request from outside or a choice already made. */
export const NATIVE_BOUNDARIES = Object.freeze([
  Object.freeze({id: 'native.browser-pairing', file: 'src/main/browser-native-host.js', reason: 'The pairing and Confirm prompts are the desktop owner consenting to a request that came from the browser, so they stay native.'}),
  Object.freeze({id: 'native.quit-dialog', file: 'src/main/main.js', reason: 'Stopping servers while the application quits is part of the quit dialog the user already chose.'})
]);

const byId = new Map(DESTRUCTIVE_ACTIONS.map(item => [item.id, item]));

export function destructiveAction(id) {
  return byId.get(id) ?? null;
}

export function destructiveActionIds() {
  return DESTRUCTIVE_ACTIONS.map(item => item.id);
}

/** Pick the registered wording for a language mode: 'en', 'yue' or 'bilingual'. */
export function localizedPair(pair, language = 'en') {
  if (language === 'yue') return pair[1];
  if (language === 'bilingual') return `${pair[0]} · ${pair[1]}`;
  return pair[0];
}
