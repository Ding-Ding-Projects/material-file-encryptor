/** Release a page only after its navigation can no longer be cancelled. */
export function onPageDiscard(target, cleanup) {
  let active = true;
  const discard = () => {
    if (!active) return;
    active = false;
    cleanup();
  };
  target.addEventListener('unload', discard, { once: true });
  return () => {
    active = false;
    target.removeEventListener('unload', discard);
  };
}
