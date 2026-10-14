const MODES = new Set(['en', 'yue', 'bilingual']);
const ACTIONS = Object.freeze({
  'focus-authenticator': Object.freeze({
    title: ['Open authenticator', '開啟驗證器'],
    message: ['Bring the authenticator forward on this computer?', '喺呢部電腦帶出驗證器？'],
    target: ['The authenticator view of this desktop window', '呢個桌面視窗嘅驗證器檢視'],
    effect: ['The desktop window comes forward and the authenticator view opens. No code, account name or secret is sent to the browser.', '桌面視窗會移到前面並開啟驗證器檢視。唔會將驗證碼、帳戶名稱或任何秘密傳俾瀏覽器。'],
    approve: ['Open authenticator', '開啟驗證器'],
  }),
});
const REJECT = ['Reject', '拒絕'];
const pick = (pair, mode) => mode === 'yue' ? pair[1] : mode === 'bilingual' ? `${pair[0]} · ${pair[1]}` : pair[0];

/** Builds the localized prompt options. Reject is both the default and the Escape button. */
export function confirmationOptions({origin, action, language}) {
  const mode = MODES.has(language) ? language : 'en';
  const spec = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!spec || typeof origin !== 'string') throw Error('Unsupported confirmation.');
  const labels = mode === 'yue' ? ['來源', '操作', '目標'] : mode === 'bilingual' ? ['Origin · 來源', 'Action · 操作', 'Target · 目標'] : ['Origin', 'Action', 'Target'];
  const separator = mode === 'yue' ? '：' : ': ';
  const lines = [`${labels[0]}${separator}${origin}`, `${labels[1]}${separator}${pick(spec.title, mode)}`, `${labels[2]}${separator}${pick(spec.target, mode)}`, '', pick(spec.effect, mode)];
  return {type: 'question', buttons: [pick(REJECT, mode), pick(spec.approve, mode)], defaultId: 0, cancelId: 0, title: pick(spec.title, mode), message: pick(spec.message, mode), detail: lines.join('\n')};
}

/** The prompt is a main-owned modal window, so the browser and the application
 * renderer can never answer it. It resolves true only for the explicit approve
 * button; Escape, closing, an abort, an error or a missing window all mean false. */
export function createBrowserConfirmPrompt({showMessageBox, getWindow, getLanguage = async () => 'en'} = {}) {
  if (typeof showMessageBox !== 'function' || typeof getWindow !== 'function') throw Error('Invalid confirmation prompt configuration.');
  return {
    async confirm({origin, action, signal} = {}) {
      const parent = getWindow();
      if (!parent || (typeof parent.isDestroyed === 'function' && parent.isDestroyed()) || signal?.aborted) return false;
      let timer;
      const language = await Promise.race([Promise.resolve().then(getLanguage).catch(() => 'en'), new Promise(resolve => { timer = setTimeout(() => resolve('en'), 1000); })]).finally(() => clearTimeout(timer));
      if (signal?.aborted) return false;
      try {
        const options = {...confirmationOptions({origin, action, language}), signal};
        const answer = await showMessageBox(parent, options);
        return answer?.response === 1 && signal?.aborted !== true;
      } catch { return false; }
    },
  };
}
