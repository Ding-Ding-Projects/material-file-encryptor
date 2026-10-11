import test from 'node:test';
import assert from 'node:assert/strict';

// Only the DOM base is stubbed: translation executes the production class method.
const originalHTMLElement = globalThis.HTMLElement;
globalThis.HTMLElement = class {
  attachShadow() { this.shadowRoot = {}; }
};
const { SurfaceElement, localized } = await import('../src/shared/surface/registry.js');
if (originalHTMLElement === undefined) delete globalThis.HTMLElement;
else globalThis.HTMLElement = originalHTMLElement;

test('surface elements translate through their local localization binding', () => {
  const surface = new SurfaceElement();
  for (const [language, expected] of [
    ['en', 'Files'],
    ['yue', '檔案'],
    ['bilingual', 'Files · 檔案'],
  ]) {
    surface.language = language;
    assert.equal(surface.t('Files', '檔案'), expected);
  }
});

test('registry keeps the localization export and fallback behavior', () => {
  assert.equal(localized({ en: 'Files' }, 'yue'), 'Files');
  const surface = new SurfaceElement();
  surface.language = 'bilingual';
  assert.equal(surface.t('Same', 'Same'), 'Same');
  assert.equal(surface.t('Files'), 'Files');
});
