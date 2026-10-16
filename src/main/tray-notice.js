import fs from 'node:fs/promises';

/** The wording of the one-time notice shown the first time the window is closed into the tray. */
const COPY = Object.freeze({
  title: {en: 'Still running in the tray', yue: '仍然喺系統匣運行'},
  body: {
    en: 'Closing the window keeps Material File Encryptor running in the tray. To quit, press Ctrl+Q, choose Quit from the Help menu, or right-click the tray icon and choose Quit.',
    yue: '關閉視窗之後，Material File Encryptor 會繼續喺系統匣運行。要結束，請按 Ctrl+Q、喺「說明」選單揀「結束」，或者喺系統匣圖示按右鍵揀「結束」。'
  }
});

/** Returns the title and message for a language: English, Cantonese, or both joined with a middle dot. */
export function trayNoticeText(language) {
  const pick = key => language === 'yue' ? COPY[key].yue : language === 'bilingual' ? `${COPY[key].en} · ${COPY[key].yue}` : COPY[key].en;
  return {title: pick('title'), content: pick('body')};
}

/**
 * Creates the one-time close-to-tray notice. The notice never blocks: it is a tray balloon, shown at most once per profile.
 * The "shown" marker is written before the balloon is raised, so a crash or a failed balloon never repeats the notice.
 * Any failure is swallowed because a missing hint must never stop the window from hiding.
 */
export function createTrayNotice({markerPath, show, getLanguage = async () => 'en', fileSystem = fs}) {
  let pending = false;
  return {
    async maybeShow() {
      if (pending) return false;
      pending = true;
      try {
        try { await fileSystem.access(markerPath()); return false; } catch { /* not shown yet */ }
        let language = 'en';
        try { const value = await getLanguage(); if (['en', 'yue', 'bilingual'].includes(value)) language = value; } catch { /* default to English */ }
        try { await fileSystem.writeFile(markerPath(), JSON.stringify({shown: true}), {mode: 0o600}); } catch { /* still show it once for this session */ }
        show(trayNoticeText(language));
        return true;
      } catch { return false; } finally { pending = false; }
    }
  };
}
