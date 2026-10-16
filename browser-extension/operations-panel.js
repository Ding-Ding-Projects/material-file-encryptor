// The Status section's operations area: procedures, interrupted operations and
// Status Hub enrollment. Nothing here sends anything until the person chooses a
// button, and everything it shows is a fixed word or a count.
import {readOperations, interrupted, planResume, resumeOperation, discardOperation, discardAll} from './operation-journal.js';
import {procedureList} from './procedures.js';
import {buildReport, enrollmentFromReply, shownEnrollment} from './status-client.js';

const KIND_NAMES = {
  export: ['Changelog export', '更新記錄匯出'],
  'converter-enqueue': ['File conversion request', '檔案轉換要求'],
  'school-mode-set': ['School mode change', '學校模式更改'],
  'element-lock-set': ['Tab lock change', '分頁鎖更改'],
};
const STEP_NAMES = {build: ['Check the export', '核對匯出內容'], save: ['Save the file', '儲存檔案'], request: ['Send the request to the desktop', '傳送要求到桌面']};
const STATE_NAMES = {pending: ['not started', '未開始'], started: ['started, result unknown', '已開始，結果不明'], done: ['finished', '已完成']};
const ENROLLMENT_NAMES = {
  'not-enrolled': ['Not enrolled', '未登記'],
  pending: ['Enrollment pending on the desktop', '桌面登記等待中'],
  enrolled: ['Enrolled as an independent status client', '已登記為獨立狀態用戶端'],
  unavailable: ['Unavailable: the desktop has no status feature to enroll with', '未可用：桌面冇可登記嘅狀態功能'],
};

/**
 * deps: {root, document?, storage, label(node,pair), getConnection(), getBinding(), getOwner(),
 *   getProcedureState(), getReportInput(), send(message), resume: {kind: run(stepId, op)}, verify(kind), now()}
 */
export function mountOperations(root, deps) {
  const doc = deps.document || root.ownerDocument;
  let enrollment = 'not-enrolled', enrolling = false, notice = null;
  /** Discarding a saved operation asks the host for the two-key super confirmation first. Without a host it never runs. */
  const ask = (id, run) => { if (typeof deps.confirm === 'function') deps.confirm(id, run); };
  const el = (tag, className) => { const node = doc.createElement(tag); if (className) node.className = className; return node; };
  const heading = pair => { const node = el('h3'); deps.label(node, pair); return node; };
  const text = (tag, pair, className) => { const node = el(tag, className); deps.label(node, pair); return node; };

  function renderProcedures() {
    const section = el('section');
    section.append(heading(['Procedures', '操作程序']), text('p', ['Reusable steps for common operations. Each one says whether it can be carried out right now; listing a procedure starts nothing.', '常用操作嘅可重用步驟。每項都會講明而家做唔做得到，列出程序唔會開始任何嘢。']));
    for (const procedure of procedureList(deps.getProcedureState())) {
      const article = el('article', 'ops-card');
      article.setAttribute('data-guidance', '');
      article.setAttribute('data-available', String(procedure.available));
      const steps = el('ol');
      for (const step of procedure.steps) steps.append(text('li', step));
      article.append(text('h4', procedure.title), text('p', procedure.available ? ['Available now', '而家可用'] : ['Unavailable now', '而家未可用'], 'ops-chip'));
      if (procedure.note) article.append(text('p', procedure.note));
      article.append(steps);
      section.append(article);
    }
    return section;
  }

  function renderInterrupted() {
    const section = el('section'), pending = interrupted(deps.storage, {owner: deps.getOwner(), now: deps.now()});
    section.append(heading(['Interrupted operations', '中斷嘅操作']));
    section.append(text('p', ['Operations that stopped part-way are kept as a short record of fixed words, with no file contents, paths or codes. Resume skips finished steps and never repeats a step whose result is unknown.', '中途停咗嘅操作會保留為只含固定字詞嘅短記錄，唔包括檔案內容、路徑或代碼。恢復會略過已完成嘅步驟，亦唔會重做結果不明嘅步驟。']));
    const status = text('p', notice || (pending.length ? [pending.length + ' interrupted.', pending.length + ' 項中斷。'] : ['Nothing was interrupted.', '冇中斷嘅操作。']));
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    section.append(status);
    for (const op of pending) {
      const plan = planResume(op, deps.getBinding()), article = el('article', 'ops-card');
      article.dataset.operation = op.id;
      const steps = el('ol');
      for (const step of op.steps) steps.append(text('li', [STEP_NAMES[step.id]?.[0] + ': ' + STATE_NAMES[step.state][0], STEP_NAMES[step.id]?.[1] + '：' + STATE_NAMES[step.state][1]]));
      article.append(text('h4', KIND_NAMES[op.kind]), steps);
      if (!plan.ok) article.append(text('p', ['Started by a different build, so it cannot be resumed. Discard it and start again.', '由另一個版本開始，所以唔可以恢復。請捨棄並重新開始。']));
      const resume = el('md-outlined-button'), discard = el('md-text-button');
      deps.label(resume, ['Resume', '恢復']);
      deps.label(discard, ['Discard', '捨棄']);
      resume.disabled = !plan.ok;
      resume.addEventListener('click', () => void onResume(op));
      discard.addEventListener('click', () => ask('extension.discard-operation', () => { discardOperation(deps.storage, op.id); notice = ['Discarded. Nothing was sent or changed.', '已捨棄，冇傳送或更改任何嘢。']; refresh(); }));
      article.append(resume, discard);
      section.append(article);
    }
    if (pending.length > 1) {
      const all = el('md-text-button');
      deps.label(all, ['Discard all', '全部捨棄']);
      all.addEventListener('click', () => ask('extension.discard-all-operations', () => { discardAll(deps.storage); notice = ['Discarded. Nothing was sent or changed.', '已捨棄，冇傳送或更改任何嘢。']; refresh(); }));
      section.append(all);
    }
    return section;
  }

  async function onResume(op) {
    const run = deps.resume?.[op.kind] || (async () => {});
    const result = await resumeOperation(deps.storage, op.id, {binding: deps.getBinding(), owner: deps.getOwner(), run, now: deps.now()});
    if (!result.ok) notice = result.reason === 'binding-changed' ? ['This build differs from the one that started it, so it was not resumed.', '呢個版本同開始嗰個唔同，所以冇恢復。'] : ['The operation could not be resumed. It was kept so you can retry or discard it.', '操作未能恢復，已保留以便重試或捨棄。'];
    else if (result.unconfirmed.length) { notice = ['Not repeated. The desktop may already have acted, so check it. Completed steps were skipped.', '冇重做。桌面可能已經處理，請檢查。已完成嘅步驟已略過。']; void deps.verify?.(op.kind); }
    else notice = ['Resumed. Finished steps were skipped.', '已恢復，已完成嘅步驟已略過。'];
    refresh();
  }

  async function enroll() {
    if (deps.getConnection() !== true || enrolling) return;
    enrolling = true; refresh();
    try {
      const report = buildReport(deps.getReportInput());
      const reply = await deps.send({type: 'status-client-enroll', report});
      enrollment = reply?.error || reply?.paired === false ? 'unavailable' : enrollmentFromReply({type: 'status-client', schemaVersion: reply?.schemaVersion, state: reply?.state});
    } catch { enrollment = 'unavailable'; }
    enrolling = false; refresh();
  }

  function renderHub() {
    const section = el('section'), connection = deps.getConnection(), shown = shownEnrollment(connection, enrollment);
    section.append(heading(['Status Hub enrollment', '狀態中心登記']));
    section.append(text('p', ['After pairing, this extension can enroll with the desktop as an independent status client. The report holds only the extension version, that it is paired, the last refresh time to the minute and four counts. It holds no content, names or links.', '配對後，呢個擴充功能可以向桌面登記為獨立狀態用戶端。報告只包括擴充功能版本、已配對、最後重新整理時間（去到分鐘）同四個數量，唔包括內容、名稱或連結。']));
    const status = text('p', enrolling ? ['Asking the desktop…', '向桌面查詢緊…'] : ENROLLMENT_NAMES[shown]);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.id = 'hub-enrollment-state';
    const button = el('md-outlined-button');
    deps.label(button, ['Enroll and report status', '登記並報告狀態']);
    button.disabled = connection !== true || enrolling;
    button.addEventListener('click', () => void enroll());
    section.append(status, button);
    return section;
  }

  function refresh() {
    root.replaceChildren(renderProcedures(), renderInterrupted(), renderHub());
  }
  refresh();
  return {refresh, enrollmentState: () => shownEnrollment(deps.getConnection(), enrollment), interruptedCount: () => interrupted(deps.storage, {owner: deps.getOwner(), now: deps.now()}).length, operationCount: () => readOperations(deps.storage).length};
}
