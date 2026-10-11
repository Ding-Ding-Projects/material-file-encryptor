/** Only destinations already saved as open belong in the workspace strip. */
export function shouldOpenRegisteredView(state,id) {
  return (state.tabs ?? []).some(tab => tab.id === id);
}
