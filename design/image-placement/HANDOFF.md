# Image placement integration handoff

Baseline: `9fa84a9d6ee7fed62cceeb8bb7660fe8e78f6cc9`. This unit is not wired into the appearance editor. No rendered acceptance is claimed.

## Parent-owned caller integration

`appearance.js` remains owned by the motion integration lane and is unchanged here. After that lane is preserved, import `mountImageTransformInspector` and replace only its legacy image-transform fieldset. Resolve the selected layer through the existing `currentFontLayer()` helper (or a renamed equivalent with identical captured target/state/group/index semantics). Never retain `selected` across persistence rollback.

```js
const host = doc.createElement('section');
content.append(host);
workbenches.push(mountImageTransformInspector(host, {
  getCurrent: () => currentFontLayer().imageTransform,
  disabled: () => {
    try { return disposed || panel.hidden || currentFontLayer().locked; }
    catch { return true; }
  },
  getLanguage: services.getLanguage,
  translate: t,
  services,
  mutate: value => {
    const layer = currentFontLayer();
    if (layer.locked || !layer.imageSource) return false;
    const candidate = structuredClone(layer);
    candidate.imageTransform = validateImageTransform(value);
    validatedLayer(candidate);
    return mutate(() => {
      const current = currentFontLayer();
      if (current.locked || !current.imageSource) throw Error('Image placement is unavailable.');
      current.imageTransform = structuredClone(candidate.imageTransform);
    }, false);
  },
  reset: () => {
    const current = currentFontLayer();
    if (current.locked || !current.imageSource) return false;
    return mutate(() => currentFontLayer().imageTransform = defaultImageTransform(), false);
  }
}));
```

Pass the effective preference language, not only `documentElement.lang`, so bilingual mode remains distinguishable. Remount with the normal editor render when language changes. Preserve existing image operation cancellation and lifetime. Retain the original persistence/history contract; the inspector requires exact `true` confirmation.

## Acceptance still required

Add actual mounted appearance integration checks for storage rollback/retry, current layer replacement, lock changes, original history counts and language remount. Then build through root entrypoints and inspect genuine package-bound captures at supported sizes/scales/languages/themes. No source-only result proves those pixels. Complete image editing, safe areas, general formats and pixel-complete history/export remain unfinished.
