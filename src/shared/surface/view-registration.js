/** Registering an available destination must not undo a persisted tab closure. */
export function shouldOpenRegisteredView(state,id) {
  return !(state.closedTabIds??state.closedTabs.map(tab=>tab.id)).includes(id);
}
