/**
 * The in-tab unlock card. It collects only a credential; the folders, drive letter and drive name come from the
 * session's saved configuration, and the actual unlock goes through the same host call as the unlock dialog.
 */
export function unlockReadiness({storageDir, mode, password, keyFilePath}) {
  if (!storageDir) return 'storage';
  if (mode === 'keyFile') return keyFilePath ? 'ready' : 'key';
  return password ? 'ready' : 'password';
}

const MESSAGES = {
  storage: 'Choose the encrypted storage folder first, then unlock.',
  password: 'Enter your password.',
  key: 'Choose a key file.'
};

export function mountUnlockCard({doc = document, translate, hooks}) {
  const $ = id => doc.getElementById(id);
  const t = source => translate(source);
  const form = $('unlock-card');
  if (!form) return {update() {}, destroy() {}};
  const disposers = [];
  const listen = (target, type, handler) => { target.addEventListener(type, handler); disposers.push(() => target.removeEventListener(type, handler)); };
  let state = null, working = false;
  const mode = () => [...form.querySelectorAll('[name=unlock-mode]')].find(radio => radio.checked)?.value === 'keyFile' ? 'keyFile' : 'password';
  const error = message => {
    const node = $('unlock-error');
    node.textContent = message ? t(message) : '';
    node.hidden = !message;
    form.dataset.state = message ? 'failed' : working ? 'working' : 'locked';
  };
  function render() {
    const configured = Boolean(state?.storageDir);
    $('unlock-credentials').hidden = !configured;
    $('unlock-submit').hidden = !configured;
    const keyMode = mode() === 'keyFile';
    $('unlock-password-fields').hidden = keyMode;
    $('unlock-key-fields').hidden = !keyMode;
    const name = state?.driveName;
    $('unlock-card-title').textContent = name ? t('{name} is locked').replace('{name}', name) : t('This drive is locked');
    $('unlock-card-subtitle').textContent = configured ? t('Unlock to mount it in File Explorer.') : t('Choose the encrypted storage folder first, then unlock.');
    // A busy flag is checked again on submit; disabling on it here left the button stale after a lock finished.
    const disabled = working || !state;
    for (const id of ['unlock-submit', 'unlock-choose-key']) $(id).disabled = disabled;
    for (const id of ['unlock-password', 'unlock-key-path', 'unlock-auto']) $(id).disabled = working;
    form.dataset.state = working ? 'working' : $('unlock-error').hidden ? 'locked' : 'failed';
    form.setAttribute('aria-busy', String(working));
  }
  for (const radio of form.querySelectorAll('[name=unlock-mode]')) listen(radio, 'change', () => { error(''); render(); });
  listen($('unlock-choose-key'), 'click', async () => {
    try { const path = await hooks.chooseKeyFile(); if (path) $('unlock-key-path').value = path; } catch (failure) { error(String(failure?.message || failure)); }
  });
  listen(form, 'submit', async event => {
    event.preventDefault();
    if (working || hooks.isBusy()) return;
    const credentials = {mode: mode(), password: $('unlock-password').value, keyFilePath: $('unlock-key-path').value.trim(), autoUnlock: Boolean($('unlock-auto').checked)};
    const readiness = unlockReadiness({storageDir: state?.storageDir, ...credentials});
    if (readiness !== 'ready') { error(MESSAGES[readiness]); (readiness === 'key' ? $('unlock-key-path') : $('unlock-password')).focus(); return; }
    working = true; error(''); render();
    try {
      const outcome = await hooks.unlock(credentials);
      if (outcome?.ok) { $('unlock-password').value = ''; $('unlock-key-path').value = ''; $('unlock-auto').checked = false; }
      else { error(outcome?.error || 'The drive could not be unlocked.'); $('unlock-password').select?.(); }
    } finally { working = false; render(); }
  });
  render();
  return {
    update(next) { state = next; if (!state || state.locked !== true) { $('unlock-password').value = ''; } render(); },
    destroy() { for (const dispose of disposers.splice(0)) dispose(); }
  };
}
