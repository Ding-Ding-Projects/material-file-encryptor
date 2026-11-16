/**
 * Whether a registered destination should be open in the workspace strip.
 *
 * A destination that is already open stays open. Otherwise it opens by default exactly once: when it has never been
 * offered to this person (first install, or a destination added by an update) and the person has not closed it.
 * A saved state from before offers were recorded has no offered list and keeps the earlier behaviour for callers
 * that pass such a plain object.
 */
export function shouldOpenRegisteredView(state,id) {
  if ((state.tabs ?? []).some(tab => tab.id === id)) return true;
  if (!Array.isArray(state.offeredTabIds)) return false;
  if (state.offeredTabIds.includes(id)) return false;
  return !(state.closedTabIds ?? []).includes(id) && !(state.closedTabs ?? []).some(tab => tab.id === id);
}

/**
 * Applies the default-open policy to a batch of destinations, then records them as offered.
 * The tab that was active stays active. Returns the ids that were opened.
 *   model    the surface model;  views  [{id, label}];  labelFor(view)  the canonical English label.
 */
export function offerRegisteredViews(model, views, labelFor = view => String(view.label?.en ?? view.label ?? view.id)) {
  const active = model.getState().activeTabId, opened = [];
  for (const view of views) {
    if (!shouldOpenRegisteredView(model.getState(), view.id)) continue;
    const wasOpen = model.getState().tabs.some(tab => tab.id === view.id);
    if (model.openTab({ id: view.id, label: labelFor(view) }) && !wasOpen) opened.push(view.id);
  }
  model.markTabsOffered(views.map(view => view.id));
  model.activateTab(active);
  return opened;
}
