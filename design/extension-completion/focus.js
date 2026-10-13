// Reference-only redraw focus preservation, independent of production behavior.
export function captureFocusKey(root) {
  let active=root.activeElement;
  while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
  while(active&&active!==root){
    if(active.dataset?.focusKey)return active.dataset.focusKey;
    active=active.parentElement||active.getRootNode?.().host;
  }
  return null;
}

export async function restoreReferenceFocus(root,key,isCurrent=()=>true) {
  if(!key)return 'no-focus-request';
  const target=[...root.querySelectorAll('[data-focus-key]')].find(item=>item.dataset.focusKey===key);
  const destination=target||root.querySelector('h1');
  if(!destination)return 'no-destination';
  // Material components render their focusable internals asynchronously.
  await destination.updateComplete;
  if(!isCurrent()||!destination.isConnected)return 'superseded';
  destination.focus({preventScroll:true});
  return target?'control-restored':'heading-fallback';
}
