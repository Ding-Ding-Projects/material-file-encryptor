/** Presentation-only session summaries. Never copy credentials into the selector. */
export function vaultSessionChoices(state, translate = value => value) {
 return (state?.sessions || []).map((session, index) => {
  const status = session.recoveryRequired ? 'Recovery required' : session.operation ? 'Working…' : session.locked ? 'Locked' : session.mounted ? 'Mounted' : 'Unlocked · not mounted';
  const name = session.driveName || `${translate('Vault')} ${index + 1}`;
  const letter = session.driveLetter ? `${String(session.driveLetter).replace(/[:\\]+$/, '')}:` : '';
  return {id: session.sessionId, label: [name, letter, translate(status)].filter(Boolean).join(' · ')};
 });
}
export function vaultSessionAvailability(state, busy = false) {
 const sessions = state?.sessions || [];
 const blocked = busy || !state || Boolean(state.operation);
 const selected = sessions.find(session => session.sessionId === state?.sessionId);
 return {switch: !blocked && sessions.length > 1, add: !blocked,
  remove: !blocked && state?.sessionId !== 'main' && sessions.length > 1 && selected?.locked === true && !selected.mounted && !selected.recoveryRequired && !selected.operation};
}
