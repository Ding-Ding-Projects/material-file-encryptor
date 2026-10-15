// Reusable, documented operation and verification procedures for the extension.
// Each procedure lists its steps and says truthfully whether it can be carried
// out right now, from the current pairing, records and build provenance. A
// procedure is guidance: listing one never starts anything.

export const PROCEDURE_IDS = Object.freeze(['pair', 'refresh', 'convert', 'export', 'recover', 'verify-build']);

const PROCEDURES = {
  pair: {
    title: ['Pair this browser with the desktop', '將瀏覽器配對到桌面'],
    steps: [
      ['Open and unlock the desktop app.', '開啟並解鎖桌面程式。'],
      ['Open Connection, type or scan the pairing code shown on the desktop, then choose Pair.', '開啟「連線」，輸入或掃描桌面顯示嘅配對碼，然後撳「配對」。'],
      ['Approve the pairing on the desktop.', '喺桌面批准配對。'],
      ['Confirm that Connection reports a paired browser.', '確認「連線」顯示瀏覽器已配對。'],
    ],
    check: s => s.paired ? [false, ['Already paired. Disconnect first to pair again.', '已經配對，要再配對請先中斷連線。']] : [true, null],
  },
  refresh: {
    title: ['Refresh the desktop status', '重新整理桌面狀態'],
    steps: [
      ['Pair the browser first.', '先配對瀏覽器。'],
      ['Open Status and choose Refresh desktop status.', '開啟「狀態」，撳「重新整理桌面狀態」。'],
      ['Read the lock state, desktop version and update phase. Nothing is shown for file names or paths.', '讀取鎖定狀態、桌面版本同更新階段，唔會顯示檔案名或路徑。'],
    ],
    check: s => s.paired ? [true, null] : [false, ['Needs a paired browser.', '需要已配對嘅瀏覽器。']],
  },
  convert: {
    title: ['Convert a file through the desktop', '透過桌面轉換檔案'],
    steps: [
      ['Pair the browser first.', '先配對瀏覽器。'],
      ['Open Connection and choose the source on the desktop.', '開啟「連線」，喺桌面揀來源。'],
      ['Load the verified formats and pick one that fits the source.', '載入已驗證格式，揀一個適合來源嘅。'],
      ['Choose the output and confirm on the desktop. The job is recorded so an interruption can be resumed or checked.', '喺桌面揀輸出同確認。工作會被記錄，中斷後可以恢復或檢查。'],
      ['Refresh the jobs to read the real progress.', '重新讀取工作，睇實際進度。'],
    ],
    check: s => s.paired ? [true, null] : [false, ['Needs a paired browser.', '需要已配對嘅瀏覽器。']],
  },
  export: {
    title: ['Export the changelog', '匯出更新記錄'],
    steps: [
      ['Open Changelog and filter it if needed.', '開啟「更新記錄」，需要時先篩選。'],
      ['Choose an export format and review the checked preview.', '揀匯出格式，檢視已核對嘅預覽。'],
      ['Save the file. Personal wording is never part of an export.', '儲存檔案。匯出內容絕不包括個人用詞。'],
    ],
    check: s => s.changelogEntries > 0 ? [true, null] : [false, ['No changelog entries are bundled.', '冇內置更新記錄。']],
  },
  recover: {
    title: ['Recover an interrupted operation', '恢復中斷嘅操作'],
    steps: [
      ['Open Status and read the interrupted operations.', '開啟「狀態」，閱讀中斷嘅操作。'],
      ['Resume it. Finished steps are skipped and a step whose result is unknown is checked, never repeated.', '恢復操作。已完成嘅步驟會略過，結果不明嘅步驟只會檢查，唔會重做。'],
      ['If the build changed since it started, discard it and start again.', '如果版本自開始後已更改，請捨棄並重新開始。'],
    ],
    check: s => s.interrupted > 0 ? [true, null] : [false, ['Nothing was interrupted.', '冇中斷嘅操作。']],
  },
  'verify-build': {
    title: ['Verify the staged build', '核對暫存版本'],
    steps: [
      ['Open Status and read the source commit and staging time.', '開啟「狀態」，閱讀來源提交同暫存時間。'],
      ['Compare the source commit with the repository checkout it was staged from.', '將來源提交同暫存時所用嘅儲存庫比對。'],
      ['Treat staging as a record only. It does not prove signing, installation or runtime behaviour.', '暫存只是記錄，並唔證明簽署、安裝或執行表現。'],
    ],
    check: s => !s.provenance?.sourceCommit ? [false, ['Build source provenance is unavailable.', '版本來源記錄未可用。']]
      : s.provenance.sourceModified === false ? [true, null]
        : [true, ['Available, but the build had uncommitted changes, so a commit comparison will not match.', '可用，但呢個版本有未提交改動，所以提交比對唔會吻合。']],
  },
};

/** The procedures with their availability for the given state. */
export function procedureList(state) {
  return PROCEDURE_IDS.map(id => {
    const spec = PROCEDURES[id], [available, note] = spec.check(state || {});
    return {id, title: spec.title, steps: spec.steps, available, note};
  });
}
