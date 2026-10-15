// Progress and publication notes. The extension composes and sanitizes a note, shows the result and sends the
// confirmed request to the paired desktop through the native messaging channel. It never contacts a forge itself:
// the desktop asks its user again in a native prompt and reports a fixed state word. src/shared/publication-request.js
// holds the desktop copy of the sanitizer and validator; a test compares the two on shared vectors.

export const DESTINATIONS = Object.freeze(['discussion-comment', 'project-item-status', 'publication-draft']);
export const PROJECT_STATUSES = Object.freeze(['todo', 'in-progress', 'done']);
export const RESULT_STATES = Object.freeze(['approved', 'rejected', 'busy', 'unavailable']);
export const LIMITS = Object.freeze({note: 2000, links: 5, link: 500});
export const REQUEST_TIMEOUT_MS = 45000;

const PATH_MARK = '[local path]', SECRET_MARK = '[secret removed]', EMAIL_MARK = '[email removed]', USER_MARK = '[user removed]';
const SECRET_KEY = 'pass(?:word|wd|phrase)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|cookie';
const QUERY_KEY = SECRET_KEY + '|auth|session|signature|sig|key|code|jwt';
const RULES = [
  // Credentials inside a URL, then well-known token shapes, then labelled secrets, then long opaque strings.
  ['secrets', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/giu, SECRET_MARK + '@'],
  ['secrets', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/gu, SECRET_MARK],
  ['secrets', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu, 'Bearer ' + SECRET_MARK],
  ['secrets', new RegExp('\\b(' + SECRET_KEY + ')(\\s*[:=]\\s*)(?!(?:(?:Bearer|Basic)\\s+)?\\[secret removed\\])(?:(?:Bearer|Basic)\\s+)?(?:"[^"\\n]*"|\'[^\'\\n]*\'|[^\\s,;&]+)', 'giu'), '$1$2' + SECRET_MARK],
  ['secrets', /\b(?=[A-Za-z0-9+/_=-]*[A-Za-z])(?=[A-Za-z0-9+/_=-]*\d)[A-Za-z0-9+/_=-]{32,}\b/gu, SECRET_MARK],
  ['emails', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/gu, EMAIL_MARK],
  ['paths', /\bfile:\/\/\/?[^\s"'<>)\]]+/giu, PATH_MARK],
  ['paths', /\\\\[A-Za-z0-9._$-]+\\[^\s"'<>|)\]]+/gu, PATH_MARK],
  ['paths', /\b[A-Za-z]:[\\/][^\s"'<>|:*?)\]]*/gu, PATH_MARK],
  ['paths', /%(?:USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|TEMP)%[\\/][^\s"'<>|)\]]*/giu, PATH_MARK],
  ['paths', /(?<![A-Za-z0-9_.:/-])(?:~\/[^\s"'<>|)\]]*|\/(?:home|Users|root|mnt|var|tmp|etc|opt|private)(?:\/[^\s"'<>|)\]]*)?)/gu, PATH_MARK],
  ['users', /\b(user(?:name)?|login)(\s*[:=]\s*)(?!\[user removed\])[^\s,;]+/giu, '$1$2' + USER_MARK],
];

/** Removes local paths, user names, email addresses and token-like strings. `wording` is the person's own wording
 * list ([original, replacement] pairs); a replacement is turned back into its original so private wording does not
 * reach a publication. The result is idempotent: sanitizing it again changes nothing. */
export function sanitizeNote(input, {wording = []} = {}) {
  const redactions = {paths: 0, emails: 0, secrets: 0, users: 0, wording: 0, truncated: false};
  let text = typeof input === 'string' ? input : '';
  text = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
  for (const [original, replacement] of Array.isArray(wording) ? wording : []) {
    if (typeof original !== 'string' || typeof replacement !== 'string' || !replacement || original === replacement) continue;
    const parts = text.split(replacement);
    if (parts.length > 1) { redactions.wording += parts.length - 1; text = parts.join(original); }
  }
  for (const [kind, pattern, mark] of RULES) text = text.replace(pattern, (match, ...groups) => { redactions[kind]++; return mark.replace(/\$(\d)/g, (_, n) => typeof groups[n - 1] === 'string' ? groups[n - 1] : ''); });
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > LIMITS.note) { text = text.slice(0, LIMITS.note).trimEnd(); redactions.truncated = true; }
  return {text, redactions};
}

const SECRET_QUERY = new RegExp('^(?:' + QUERY_KEY + ')$', 'iu');
/** An evidence link must be an https address with a public-looking host, no credentials and no secret-like query. */
export function validateLink(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.link || /[\s\u0000-\u001f\u007f-\u009f]/u.test(value)) return {error: 'invalid'};
  let url;
  try { url = new URL(value); } catch { return {error: 'invalid'}; }
  if (url.protocol !== 'https:') return {error: 'https'};
  if (url.username || url.password) return {error: 'credentials'};
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return {error: 'host'};
  for (const key of url.searchParams.keys()) if (SECRET_QUERY.test(key)) return {error: 'secret'};
  if (sanitizeNote(url.href).redactions.secrets > 0) return {error: 'secret'};
  return {url: url.href};
}

/** Parses one link per line. Returns normalized links plus the first problem, so the form can say which line to fix. */
export function parseLinks(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > LIMITS.links) return {links: [], error: 'count'};
  const links = [];
  for (const [index, line] of lines.entries()) {
    const result = validateLink(line);
    if (result.error) return {links: [], error: result.error, line: index + 1};
    if (!links.includes(result.url)) links.push(result.url);
  }
  return {links};
}

/** Builds the exact request the desktop receives. Nothing but sanitized text and checked links is included. */
export function buildRequest({destination, note, links, projectStatus = null, wording = []} = {}) {
  if (!DESTINATIONS.includes(destination)) return {error: 'destination'};
  const clean = sanitizeNote(note, {wording});
  if (!clean.text) return {error: 'note'};
  const parsed = typeof links === 'string' ? parseLinks(links) : {links: Array.isArray(links) ? links : []};
  if (parsed.error) return {error: 'links', detail: parsed};
  if (destination === 'project-item-status' && !PROJECT_STATUSES.includes(projectStatus)) return {error: 'status'};
  const request = {destination, note: clean.text, links: parsed.links, projectStatus: destination === 'project-item-status' ? projectStatus : null};
  const checked = validateRequest(request);
  return checked.ok ? {request, redactions: clean.redactions} : {error: 'invalid'};
}

const KEYS = 'destination,links,note,projectStatus';
/** Strict shape check used before sending and again in the service worker. A note that would still be changed by the
 * sanitizer is refused, so an unsanitized note can never be sent. */
export function validateRequest(request) {
  const fail = reason => ({ok: false, reason});
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.getPrototypeOf(request) !== Object.prototype || Object.keys(request).sort().join(',') !== KEYS) return fail('shape');
  if (!DESTINATIONS.includes(request.destination)) return fail('destination');
  if (typeof request.note !== 'string' || !request.note || request.note.length > LIMITS.note) return fail('note');
  if (sanitizeNote(request.note).text !== request.note) return fail('unsanitized');
  if (!Array.isArray(request.links) || request.links.length > LIMITS.links) return fail('links');
  for (const link of request.links) { const result = validateLink(link); if (result.error || result.url !== link) return fail('links'); }
  if (new Set(request.links).size !== request.links.length) return fail('links');
  if (request.destination === 'project-item-status' ? !PROJECT_STATUSES.includes(request.projectStatus) : request.projectStatus !== null) return fail('status');
  return {ok: true};
}

// ---- Copy ------------------------------------------------------------------------------------------------------
export const COPY = {
  heading: ['Progress and publication', '進度同發佈'],
  help: ['Write a progress note, check the sanitized preview and send it to the paired desktop. This page never contacts a forge: the desktop asks you again in a native prompt and reports the result, or says plainly that it cannot publish.', '寫一則進度備註，檢查已清理嘅預覽，再傳送去已配對嘅桌面。呢頁永遠唔會直接連去代碼平台：桌面會喺原生提示再問你一次，並回報結果，或者清楚講明做唔到發佈。'],
  destination: ['Destination', '目的地'],
  destinations: {
    'discussion-comment': ['Discussion comment', '討論留言'],
    'project-item-status': ['Project item status', '專案項目狀態'],
    'publication-draft': ['Publication draft', '發佈草稿'],
  },
  destinationHelp: {
    'discussion-comment': ['Adds the note and evidence links as one comment in the existing scoped discussion.', '將備註同證據連結當作一則留言，加入現有嘅範圍討論。'],
    'project-item-status': ['Sets the status of the owned task item in a linked project. This needs host permission; without it the desktop reports Unavailable.', '更新已連結專案入面自己任務項目嘅狀態。需要主機權限；冇權限時桌面會顯示「不可用」。'],
    'publication-draft': ['Prepares a publication draft for review on the desktop. Nothing is published from the browser.', '喺桌面準備發佈草稿俾你檢閱。瀏覽器唔會發佈任何嘢。'],
  },
  projectStatus: ['Item status', '項目狀態'],
  projectStatuses: {todo: ['To do', '待辦'], 'in-progress': ['In progress', '進行中'], done: ['Done', '完成']},
  note: ['Progress note', '進度備註'],
  links: ['Evidence links (one https address per line)', '證據連結（每行一個 https 地址）'],
  previewHeading: ['Sanitized preview', '已清理預覽'],
  previewEmpty: ['Write a note to see exactly what would be sent.', '寫低備註就會見到會傳送啲乜。'],
  previewLinks: ['Evidence links', '證據連結'],
  previewNone: ['None', '冇'],
  redactionsNone: ['Nothing needed to be removed.', '冇嘢需要移除。'],
  redactionsSome: (r) => [`Removed from the preview: ${r.paths} paths, ${r.users} user names, ${r.emails} email addresses, ${r.secrets} secret-like strings, ${r.wording} personal wording replacements${r.truncated ? '; the note was shortened to 2000 characters' : ''}.`, `預覽已移除：${r.paths} 個路徑、${r.users} 個用戶名稱、${r.emails} 個電郵地址、${r.secrets} 個似秘密嘅字串、${r.wording} 個個人用詞替換${r.truncated ? '；備註已縮短至 2000 字元' : ''}。`],
  reviewed: ['I reviewed the sanitized preview and the destination', '我已檢查已清理預覽同目的地'],
  send: ['Send to desktop for approval', '傳送去桌面等待批准'],
  reset: ['Clear form', '清除表單'],
  linkProblems: {
    count: ['Use at most 5 evidence links.', '證據連結最多 5 個。'],
    https: ['Evidence links must start with https://.', '證據連結必須以 https:// 開頭。'],
    credentials: ['An evidence link must not contain a user name or password.', '證據連結唔可以包含用戶名稱或密碼。'],
    host: ['An evidence link needs a public host name, not a local or numeric address.', '證據連結需要公開主機名稱，唔可以係本機或數字地址。'],
    secret: ['An evidence link looks like it carries a secret in its address.', '證據連結嘅地址似乎帶有秘密。'],
    invalid: ['An evidence link is not a valid address.', '有證據連結唔係有效地址。'],
  },
  problems: {
    note: ['Write a progress note first.', '請先寫進度備註。'],
    status: ['Choose an item status.', '請揀項目狀態。'],
    invalid: ['The request could not be prepared. Check the note and links.', '未能準備要求，請檢查備註同連結。'],
  },
  states: {
    idle: ['Nothing has been sent.', '未傳送任何嘢。'],
    pending: ['Pending: waiting for your approval on the desktop. It is withdrawn after 30 seconds.', '待處理：等緊你喺桌面批准，30 秒後會撤回。'],
    approved: ['Approved: the desktop accepted the request.', '已批准：桌面已接受要求。'],
    rejected: ['Rejected: the request was declined on the desktop. Nothing was published.', '已拒絕：桌面拒絕咗要求，冇發佈任何嘢。'],
    busy: ['Busy: the desktop is already showing another prompt. Try again in a moment.', '忙碌：桌面已經顯示緊另一個提示，請稍後再試。'],
    unavailable: ['Unavailable: the desktop cannot do this now (locked, no window, no publishing route or no host permission). Nothing was published.', '不可用：桌面而家做唔到（已鎖定、冇視窗、冇發佈途徑或冇主機權限），冇發佈任何嘢。'],
    unpaired: ['Pair the browser with the desktop first, on the Connection section.', '請先喺「連線」部分將瀏覽器配對到桌面。'],
    expired: ['Expired: no answer arrived in time or the connection ended. Nothing was published; send again if you still want to.', '已逾時：未能及時收到回覆或者連線已結束，冇發佈任何嘢；如仍需要請再傳送。'],
  },
};

const text = (pair, language) => language === 'yue' ? pair[1] : language === 'bilingual' ? pair.join(' · ') : pair[0];

/** Mounts the section. `send` is chrome.runtime.sendMessage; `getLanguage` returns en, yue or bilingual. */
export function mountPublishing(root, {send, getLanguage = () => 'en', getWording = () => [], setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout, timeoutMs = REQUEST_TIMEOUT_MS} = {}) {
  const doc = root.ownerDocument;
  let state = 'idle', generation = 0, timer = null;
  const t = pair => text(pair, getLanguage());
  const el = (tag, id) => { const node = doc.createElement(tag); if (id) { node.id = id; node.className = id; } return node; };
  const heading = el('h3', 'publishing-heading'), help = el('p', 'publishing-help');
  const destination = el('md-outlined-select', 'publishing-destination');
  const options = DESTINATIONS.map(value => { const option = el('md-select-option'); option.value = value; const headline = el('div'); headline.slot = 'headline'; option.append(headline); destination.append(option); return {option, headline, value}; });
  destination.value = DESTINATIONS[0];
  const destinationHelp = el('p', 'publishing-destination-help');
  const status = el('md-outlined-select', 'publishing-project-status');
  const statusOptions = PROJECT_STATUSES.map(value => { const option = el('md-select-option'); option.value = value; const headline = el('div'); headline.slot = 'headline'; option.append(headline); status.append(option); return {headline, value}; });
  status.value = 'in-progress'; status.hidden = true;
  const note = el('md-outlined-text-field', 'publishing-note'); note.type = 'textarea'; note.rows = 5; note.setAttribute('maxlength', String(LIMITS.note * 2));
  const linksField = el('md-outlined-text-field', 'publishing-links'); linksField.type = 'textarea'; linksField.rows = 3;
  const linkError = el('p', 'publishing-link-error'); linkError.setAttribute('role', 'alert');
  const preview = el('section', 'publishing-preview'); preview.setAttribute('aria-labelledby', 'publishing-preview-heading');
  const previewHeading = el('h4', 'publishing-preview-heading'), previewBody = el('pre', 'publishing-preview-body'), previewLinks = el('p', 'publishing-preview-links'), redactionLine = el('p', 'publishing-redactions');
  const previewInner = el('div', 'publishing-preview-inner'); previewInner.append(previewHeading, previewBody, previewLinks, redactionLine); preview.append(previewInner);
  const reviewedLabel = el('label', 'publishing-reviewed-label'), reviewed = el('md-checkbox', 'publishing-reviewed'), reviewedText = el('span');
  reviewedLabel.append(reviewed, reviewedText);
  const sendButton = el('md-filled-button', 'publishing-send'), resetButton = el('md-outlined-button', 'publishing-reset');
  const outcome = el('p', 'publishing-state'); outcome.setAttribute('role', 'status'); outcome.setAttribute('aria-live', 'polite');
  const actions = el('div', 'publishing-actions'); actions.append(sendButton, resetButton);
  root.append(heading, help, destination, destinationHelp, status, note, linksField, linkError, preview, reviewedLabel, actions, outcome);

  const current = () => buildRequest({destination: destination.value, note: note.value, links: linksField.value, projectStatus: status.value, wording: getWording()});
  function stopTimer() { if (timer !== null) { clearTimer(timer); timer = null; } }
  function render() {
    heading.textContent = t(COPY.heading); help.textContent = t(COPY.help);
    destination.label = t(COPY.destination); note.label = t(COPY.note); linksField.label = t(COPY.links); status.label = t(COPY.projectStatus);
    for (const row of options) row.headline.textContent = t(COPY.destinations[row.value]);
    for (const row of statusOptions) row.headline.textContent = t(COPY.projectStatuses[row.value]);
    destinationHelp.textContent = t(COPY.destinationHelp[destination.value] || COPY.destinationHelp[DESTINATIONS[0]]);
    status.hidden = destination.value !== 'project-item-status';
    const hasNote = Boolean(String(note.value || '').trim());
    const built = hasNote ? current() : null;
    const parsed = parseLinks(linksField.value);
    linkError.textContent = parsed.error ? t(COPY.linkProblems[parsed.error] || COPY.linkProblems.invalid) + (parsed.line ? ` (${parsed.line})` : '') : '';
    previewHeading.textContent = t(COPY.previewHeading);
    const clean = hasNote ? sanitizeNote(note.value, {wording: getWording()}) : null;
    previewBody.textContent = clean?.text || t(COPY.previewEmpty);
    previewLinks.textContent = t(COPY.previewLinks) + ': ' + (parsed.links.length ? parsed.links.join('  ') : t(COPY.previewNone));
    const r = clean?.redactions;
    redactionLine.textContent = !r ? '' : (r.paths + r.users + r.emails + r.secrets + r.wording === 0 && !r.truncated) ? t(COPY.redactionsNone) : t(COPY.redactionsSome(r));
    // The preview area enters and leaves with a state attribute so CSS can animate it (and skip the animation under reduced motion).
    preview.dataset.state = hasNote ? 'shown' : 'hidden'; preview.setAttribute('aria-hidden', String(!hasNote));
    reviewedText.textContent = t(COPY.reviewed); sendButton.textContent = t(COPY.send); resetButton.textContent = t(COPY.reset);
    const pending = state === 'pending';
    reviewed.disabled = pending; note.disabled = pending; linksField.disabled = pending; destination.disabled = pending; status.disabled = pending;
    sendButton.disabled = pending || !built?.request || reviewed.checked !== true;
    resetButton.disabled = pending;
    outcome.dataset.state = state; outcome.textContent = t(COPY.states[state] || COPY.states.idle);
  }
  function touch() { if (state !== 'pending') { state = 'idle'; } render(); }
  for (const field of [destination, status, note, linksField]) { field.addEventListener('input', touch); field.addEventListener('change', touch); }
  reviewed.addEventListener('change', render);
  resetButton.addEventListener('click', () => { if (state === 'pending') return; note.value = ''; linksField.value = ''; reviewed.checked = false; state = 'idle'; render(); });
  sendButton.addEventListener('click', async () => {
    if (state === 'pending' || reviewed.checked !== true) return;
    const built = current();
    if (!built.request) { outcome.textContent = t(built.error === 'links' ? COPY.linkProblems[built.detail?.error] || COPY.linkProblems.invalid : COPY.problems[built.error] || COPY.problems.invalid); return; }
    const own = ++generation; state = 'pending'; render();
    // The service worker cannot be reached forever: stop waiting a little after the desktop's own 30 second withdrawal.
    timer = setTimer(() => { if (generation === own && state === 'pending') { generation++; state = 'expired'; render(); } }, timeoutMs);
    let answer;
    try { answer = await send({type: 'publish-progress-request', request: built.request}); } catch { answer = {error: true}; }
    if (generation !== own || state !== 'pending') return;
    stopTimer();
    reviewed.checked = false;
    state = answer?.paired === false ? 'unpaired' : answer && answer.schemaVersion === 1 && RESULT_STATES.includes(answer.state) ? answer.state : 'expired';
    render();
  });
  render();
  return {
    refreshLabels: render,
    /** The desktop connection ended or the page is leaving: a pending request is no longer answerable. */
    disconnect() { if (state === 'pending') { generation++; stopTimer(); state = 'expired'; render(); } },
    get state() { return state; },
  };
}
