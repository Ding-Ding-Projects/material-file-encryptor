/** Handles the window close request (title-bar button, Alt+F4, or a WM_CLOSE message).
 *
 * The desktop normally keeps running in the tray, so a plain close hides the window. When a managed Minecraft server is starting
 * or running, hiding silently would leave the person with no sign that the request was received and no way to stop the server
 * short of the tray menu, so the close is answered with an explicit choice instead. Every path ends in one of: the window
 * hidden, the quit flow started, or a visible choice the person made to leave the window open. A close is never swallowed. */
export function createWindowCloseHandler({isShuttingDown, isTestMode, liveServers, hideWindow, askChoice, quit}) {
  let prompting = false;
  const live = () => { try { const rows = liveServers(); return Array.isArray(rows) ? rows : []; } catch { return []; } };
  return function onClose(event) {
    if (isShuttingDown() || isTestMode()) return;
    event.preventDefault();
    const servers = live();
    if (servers.length === 0) { hideWindow(); return; }
    // A second close while the choice is on screen needs no second dialog; the first one is still waiting for an answer.
    if (prompting) return;
    prompting = true;
    Promise.resolve()
      .then(() => askChoice(servers))
      .then(choice => { if (choice === 'quit') return quit(); if (choice === 'hide') hideWindow(); return undefined; })
      .catch(() => { try { hideWindow(); } catch { /* the window may already be gone */ } })
      .finally(() => { prompting = false; });
  };
}

/** Maps the dialog button index to a close decision. Anything unexpected is treated as the safe, visible "stay open". */
export function closeChoiceFromResponse(response) {
  return response === 0 ? 'hide' : response === 1 ? 'quit' : 'cancel';
}
